import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  fetchFundingPaymentsExtended,
  fetchFundingPaymentsIncremental,
  fetchFundingPaymentsProbe12Months,
  fetchMultipleMarketPrices,
  fetchMultipleDailyCandles,
  type ExtendedLoadingState,
} from "@/services/drift-api";
import { transformDriftDataToStrategy } from "@/services/drift-transformer";
import { mockStrategy } from "@/mock-strategy";
import type { StrategyResponse, Position } from "@/types/schema";
import type {
  DriftFundingPaymentRecord,
  DailyCandleRecord,
} from "@/services/drift-types";
import { getMarketName } from "@/services/drift-types";
import { clearCurrentMonthFundingCache } from "@/services/cache-utils";

export type Timeframe = "24H" | "7D" | "30D" | "3M" | "6M" | "1Y";

export interface LoadingProgress {
  loadedMonths: number;
  totalMonths: number;
  phase: "cache" | "fetch" | "complete";
}

interface UseStrategyResult {
  data: StrategyResponse | null;
  isLoading: boolean;
  isLoadingMore: boolean; // True when fetching beyond initial 7 days
  loadingProgress: LoadingProgress | null; // Progress for extended timeframes
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching: boolean;
  fetchingTimeframe: Timeframe | null; // Which timeframe is currently being fetched
  availableTimeframes: Set<Timeframe>; // Which timeframes have enough data to display
  probeSuggestedTimeframe: Timeframe | null; // When probe finds data, suggest e.g. 1Y so UI can auto-switch
  isInitialFetch: boolean; // True when fetching 30-day data for a new wallet (disables extended timeframe buttons)
  hasCompletedInitialLoad: boolean; // True once initial loading has ever completed for this wallet (stays true)
  loadedTimeframes: Set<Timeframe>; // Timeframes that have enough data loaded (for progress indicator)
  currentlyLoadingTimeframe: Timeframe | null; // The timeframe currently being loaded (for spinner) - first one if multiple
  currentlyLoadingTimeframes: Set<Timeframe>; // All timeframes currently loading (24H and 7D load together)
  hasComparisonData: boolean; // True when we have enough data for comparison (48h for 24H, 14 days for 7D)
}

// Cache for storing full 30-day records
const recordsCache = new Map<string, DriftFundingPaymentRecord[]>();

// Cache for storing market prices (refreshed periodically)
const pricesCache = new Map<
  string,
  { prices: Map<string, number>; timestamp: number }
>();
const PRICE_CACHE_TTL = 60 * 1000; // 1 minute cache for prices

/**
 * Get timeframe duration in days
 */
export function getTimeframeDays(timeframe: Timeframe): number {
  switch (timeframe) {
    case "24H":
      return 1;
    case "7D":
      return 7;
    case "30D":
      return 30;
    case "3M":
      return 90;
    case "6M":
      return 180;
    case "1Y":
      return 365;
  }
}

/**
 * Check if timeframe requires extended data loading (>30 days)
 */
export function isExtendedTimeframe(timeframe: Timeframe): boolean {
  return timeframe === "3M" || timeframe === "6M" || timeframe === "1Y";
}

/**
 * Given records with timestamps, return the smallest timeframe that covers all data.
 * Used when probe finds history so we can auto-switch to 30D, 3M, 6M, or 1Y as appropriate.
 */
/**
 * Calculate the coverage (oldest timestamp and days covered) for a set of records
 */
function getRecordsCoverage(records: { ts: number }[]): {
  oldestTs: number;
  daysCovered: number;
} {
  if (records.length === 0) {
    return { oldestTs: Date.now() / 1000, daysCovered: 0 };
  }
  const now = Date.now() / 1000;
  const oldestTs = Math.min(...records.map((r) => r.ts));
  const daysCovered = (now - oldestTs) / 86400;
  return { oldestTs, daysCovered };
}

function getSmallestTimeframeForRecords(records: { ts: number }[]): Timeframe {
  if (records.length === 0) return "30D";
  const { daysCovered } = getRecordsCoverage(records);
  if (daysCovered <= 30) return "30D";
  if (daysCovered <= 90) return "3M";
  if (daysCovered <= 180) return "6M";
  return "1Y";
}

/**
 * Enrich positions with current prices and calculate actual ROI/APY
 */
async function enrichPositionsWithPrices(
  positions: Position[],
  timeframe: Timeframe
): Promise<{ positions: Position[]; totalNotional: number; apy: number }> {
  if (positions.length === 0) {
    return { positions: [], totalNotional: 0, apy: 0 };
  }

  // Get unique market symbols
  const symbols = positions.map((p) => p.pairName);

  // Check cache
  const cacheKey = symbols.sort().join(",");
  const cached = pricesCache.get(cacheKey);
  const now = Date.now();

  let priceMap: Map<string, number>;

  if (cached && now - cached.timestamp < PRICE_CACHE_TTL) {
    priceMap = cached.prices;
  } else {
    // Fetch fresh prices
    priceMap = await fetchMultipleMarketPrices(symbols);
    pricesCache.set(cacheKey, { prices: priceMap, timestamp: now });
  }

  // Enrich positions with prices and calculate values
  let totalNotional = 0;
  let totalFunding = 0;

  const enrichedPositions = positions.map((pos) => {
    const price = priceMap.get(pos.pairName) || 0;
    const tokenAmount = Math.abs(parseFloat(pos.notionalSize));
    const notionalValue = tokenAmount * price;
    const fundingPnl = parseFloat(pos.fundingEarned);

    totalNotional += notionalValue;
    totalFunding += fundingPnl;

    // Calculate ROI based on actual notional value
    const roi = notionalValue > 0 ? (fundingPnl / notionalValue) * 100 : 0;

    return {
      ...pos,
      currentPrice: price.toFixed(2),
      notionalValue: notionalValue.toFixed(2),
      roi: roi.toFixed(2),
    };
  });

  // Calculate APY: ROI × (365 / days_in_timeframe)
  const days = getTimeframeDays(timeframe);
  const totalRoi = totalNotional > 0 ? (totalFunding / totalNotional) * 100 : 0;
  const apy = totalRoi * (365 / days);

  return { positions: enrichedPositions, totalNotional, apy };
}

/**
 * Filter records by timeframe
 */
function filterRecordsByTimeframe(
  records: DriftFundingPaymentRecord[],
  timeframe: Timeframe
): DriftFundingPaymentRecord[] {
  const now = Math.floor(Date.now() / 1000);
  const days = getTimeframeDays(timeframe);
  const cutoffTs = now - days * 24 * 60 * 60;
  return records.filter((r) => r.ts >= cutoffTs);
}

/**
 * Sum funding for records in the previous period (for vs last period comparison).
 * 24H: previous 24h = records between (now - 48h) and (now - 24h).
 * 7D: previous 7 days = records between (now - 14d) and (now - 7d).
 */
function sumPreviousPeriodFunding(
  records: DriftFundingPaymentRecord[],
  timeframe: Timeframe
): number {
  const now = Math.floor(Date.now() / 1000);
  let startTs: number;
  let endTs: number;
  if (timeframe === "24H") {
    endTs = now - 24 * 60 * 60;
    startTs = now - 48 * 60 * 60;
  } else if (timeframe === "7D") {
    endTs = now - 7 * 24 * 60 * 60;
    startTs = now - 14 * 24 * 60 * 60;
  } else {
    return 0;
  }
  return records
    .filter((r) => r.ts >= startTs && r.ts < endTs)
    .reduce((sum, r) => sum + parseFloat(r.fundingPayment), 0);
}

export function useStrategy(
  walletSubkey: string,
  timeframe: Timeframe = "7D"
): UseStrategyResult {
  const [allRecords, setAllRecords] = useState<DriftFundingPaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingProgress, setLoadingProgress] =
    useState<LoadingProgress | null>(null);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);
  const [fetchingTimeframe, setFetchingTimeframe] = useState<Timeframe | null>(
    null
  );
  const fetchingRef = useRef(false);

  // State for enriched data with prices
  const [enrichedData, setEnrichedData] = useState<{
    positions: Position[];
    totalNotional: number;
    apy: number;
  } | null>(null);

  // State for daily candle data (for heatmap tooltips)
  const [candleData, setCandleData] = useState<
    Map<string, DailyCandleRecord[]>
  >(new Map());

  // Track which extended timeframes have been fetched
  const [fetchedTimeframes, setFetchedTimeframes] = useState<Set<Timeframe>>(
    new Set()
  );

  // When 12-month probe finds data, suggest switching to 1Y so UI shows that range
  const [probeSuggestedTimeframe, setProbeSuggestedTimeframe] =
    useState<Timeframe | null>(null);

  // Track if this is an initial fetch for a new wallet (no cached data)
  const [isInitialFetch, setIsInitialFetch] = useState(false);

  // Track if loading has ever completed for this wallet (never reset to false except on wallet change)
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);

  // Compute available timeframes based on loaded data
  const availableTimeframes = useMemo(() => {
    const available = new Set<Timeframe>(["24H", "7D"]);
    // Mock account has data for all timeframes; make all buttons clickable
    if (walletSubkey === "main-account") {
      return new Set<Timeframe>(["24H", "7D", "30D", "3M", "6M", "1Y"]);
    }
    if (allRecords.length > 0) {
      const { daysCovered } = getRecordsCoverage(allRecords);
      if (daysCovered >= 30) available.add("30D");
      if (daysCovered >= 90 || fetchedTimeframes.has("3M")) available.add("3M");
      if (daysCovered >= 180 || fetchedTimeframes.has("6M"))
        available.add("6M");
      if (daysCovered >= 365 || fetchedTimeframes.has("1Y"))
        available.add("1Y");
    }
    return available;
  }, [walletSubkey, allRecords, fetchedTimeframes]);

  // Compute loaded timeframes based on how much data we have (for progress indicator)
  const loadedTimeframes = useMemo(() => {
    const loaded = new Set<Timeframe>();
    if (walletSubkey === "main-account") {
      return new Set<Timeframe>(["24H", "7D", "30D", "3M", "6M", "1Y"]);
    }
    if (allRecords.length > 0) {
      const { daysCovered } = getRecordsCoverage(allRecords);
      if (daysCovered >= 1) loaded.add("24H");
      if (daysCovered >= 7) loaded.add("7D");
      if (daysCovered >= 30) loaded.add("30D");
      // Extended timeframes only count as loaded if explicitly fetched
      if (fetchedTimeframes.has("3M")) loaded.add("3M");
      if (fetchedTimeframes.has("6M")) loaded.add("6M");
      if (fetchedTimeframes.has("1Y")) loaded.add("1Y");
    }
    return loaded;
  }, [walletSubkey, allRecords, fetchedTimeframes]);

  // Determine which timeframes are currently loading (for spinner)
  // Returns array since 24H and 7D load together initially
  const currentlyLoadingTimeframes = useMemo((): Set<Timeframe> => {
    const loading = new Set<Timeframe>();
    if (walletSubkey === "main-account") return loading;

    // During initial load (before 7D), show spinner on both 24H and 7D
    if (isLoading) {
      loading.add("24H");
      loading.add("7D");
      return loading;
    }

    // During 30-day fetch (after 7D loaded), show spinner on 30D
    if (isLoadingMore && !loadedTimeframes.has("30D")) {
      loading.add("30D");
      return loading;
    }

    // For extended timeframe fetch
    if (fetchingTimeframe) {
      loading.add(fetchingTimeframe);
      return loading;
    }

    // After 30D loaded, determine next extended timeframe to fetch
    if (loadedTimeframes.has("30D")) {
      if (!fetchedTimeframes.has("3M")) {
        loading.add("3M");
      } else if (!fetchedTimeframes.has("6M")) {
        loading.add("6M");
      } else if (!fetchedTimeframes.has("1Y")) {
        loading.add("1Y");
      }
    }

    return loading;
  }, [
    walletSubkey,
    isLoading,
    isLoadingMore,
    fetchingTimeframe,
    loadedTimeframes,
    fetchedTimeframes,
  ]);

  // For backward compatibility, also expose single value
  const currentlyLoadingTimeframe = useMemo((): Timeframe | null => {
    const arr = Array.from(currentlyLoadingTimeframes);
    return arr.length > 0 ? arr[0] : null;
  }, [currentlyLoadingTimeframes]);

  // Check if we have enough data for comparison
  // 24H needs 48 hours (2 days), 7D needs 14 days
  const hasComparisonData = useMemo((): boolean => {
    if (walletSubkey === "main-account") return true;
    if (allRecords.length === 0) return false;

    const { daysCovered } = getRecordsCoverage(allRecords);

    // For 24H comparison, need 2 days; for 7D comparison, need 14 days
    if (timeframe === "24H") return daysCovered >= 2;
    if (timeframe === "7D") return daysCovered >= 14;

    return true; // Other timeframes don't show comparison
  }, [walletSubkey, allRecords, timeframe]);

  // Standard fetch for 30 days or less with incremental caching
  const fetchStandardData = useCallback(
    async (isRefetch = false, targetTimeframe: Timeframe = "30D") => {
      if (walletSubkey === "main-account") {
        setAllRecords([]);
        setIsLoading(false);
        setFetchingTimeframe(null);
        return;
      }

      if (fetchingRef.current) return;
      fetchingRef.current = true;

      setFetchingTimeframe(targetTimeframe);

      if (isRefetch) {
        setIsRefetching(true);
      } else {
        setIsLoading(true);
        setIsInitialFetch(true); // Mark as initial fetch for new wallet
      }
      setIsError(false);
      setError(null);
      setLoadingProgress(null);

      try {
        const records = await fetchFundingPaymentsIncremental(
          walletSubkey,
          30,
          {
            onInitialLoad: (records) => {
              console.log(`Initial/cache load: ${records.length} records`);
              setAllRecords(records);
              setIsLoading(false);
              setIsRefetching(false);
              setIsLoadingMore(true);
              recordsCache.set(walletSubkey, records);
            },
            onComplete: (records) => {
              console.log(`Complete: ${records.length} records (30 days)`);
              setAllRecords(records);
              setIsLoadingMore(false);
              setFetchingTimeframe(null);
              setIsInitialFetch(false); // 30-day data complete
              setHasCompletedInitialLoad(true);
              recordsCache.set(walletSubkey, records);
            },
            onCacheHit: () => {
              console.log("Cache hit - using cached data");
              setIsInitialFetch(false); // Cache hit, no initial fetch needed
              setHasCompletedInitialLoad(true);
            },
          }
        );

        if (records.length === 0) {
          setLoadingProgress({
            loadedMonths: 0,
            totalMonths: 12,
            phase: "fetch",
          });
          try {
            const probeRecords = await fetchFundingPaymentsProbe12Months(
              walletSubkey,
              {
                onProgress: (loaded, total) =>
                  setLoadingProgress({
                    loadedMonths: loaded,
                    totalMonths: total,
                    phase: "fetch",
                  }),
              }
            );
            if (probeRecords.length > 0) {
              const suggestedTf = getSmallestTimeframeForRecords(probeRecords);
              setAllRecords(probeRecords);
              recordsCache.set(walletSubkey, probeRecords);
              if (isExtendedTimeframe(suggestedTf)) {
                recordsCache.set(
                  `${walletSubkey}-${suggestedTf}`,
                  probeRecords
                );
              }
              setFetchedTimeframes((prev) => new Set([...prev, suggestedTf]));
              setProbeSuggestedTimeframe(suggestedTf);
            } else {
              setIsError(true);
              setError(
                new Error(
                  "No funding history found for this address in the past 12 months."
                )
              );
            }
          } catch (probeErr) {
            setIsError(true);
            setError(
              probeErr instanceof Error
                ? probeErr
                : new Error("Failed to fetch data")
            );
          } finally {
            setLoadingProgress(null);
          }
          setIsLoading(false);
          setIsLoadingMore(false);
          setFetchingTimeframe(null);
          setIsInitialFetch(false);
          setHasCompletedInitialLoad(true);
        }
      } catch (err) {
        console.error("Error fetching funding payments:", err);
        setIsError(true);
        setError(
          err instanceof Error ? err : new Error("Failed to fetch data")
        );
        setIsLoading(false);
        setIsRefetching(false);
        setIsLoadingMore(false);
        setFetchingTimeframe(null);
        setIsInitialFetch(false);
      } finally {
        fetchingRef.current = false;
      }
    },
    [walletSubkey]
  );

  // Extended fetch for 3M/6M/1Y using monthly endpoint with caching
  const fetchExtendedData = useCallback(
    async (tf: Timeframe, isRefetch = false) => {
      if (walletSubkey === "main-account") {
        setAllRecords([]);
        setIsLoading(false);
        setFetchingTimeframe(null);
        return;
      }

      if (fetchingRef.current) return;
      fetchingRef.current = true;

      const days = getTimeframeDays(tf);
      setFetchingTimeframe(tf);

      if (isRefetch) {
        setIsRefetching(true);
        // Clear current month cache on refetch
        clearCurrentMonthFundingCache(walletSubkey);
      } else {
        setIsLoading(true);
      }
      setIsError(false);
      setError(null);

      try {
        await fetchFundingPaymentsExtended(walletSubkey, days, {
          onProgress: (state: ExtendedLoadingState) => {
            setLoadingProgress({
              loadedMonths: state.loadedMonths,
              totalMonths: state.totalMonths,
              phase: state.phase,
            });
          },
          onInitialLoad: (records) => {
            console.log(`Extended initial load: ${records.length} records`);
            setAllRecords(records);
            setIsLoading(false);
            setIsRefetching(false);
            setIsLoadingMore(true);
          },
          onComplete: (records) => {
            console.log(
              `Extended complete: ${records.length} records (${days} days)`
            );
            setAllRecords(records);
            setIsLoadingMore(false);
            setLoadingProgress(null);
            setFetchingTimeframe(null);
            // Cache the records for this extended timeframe
            recordsCache.set(`${walletSubkey}-${tf}`, records);
            setFetchedTimeframes((prev) => new Set([...prev, tf]));
          },
        });
      } catch (err) {
        console.error("Error fetching extended funding payments:", err);
        setAllRecords([]);
        setIsLoading(false);
        setIsRefetching(false);
        setIsLoadingMore(false);
        setLoadingProgress(null);
        setFetchingTimeframe(null);
      } finally {
        fetchingRef.current = false;
      }
    },
    [walletSubkey]
  );

  // Fetch data based on timeframe
  const fetchData = useCallback(
    async (isRefetch = false) => {
      if (isExtendedTimeframe(timeframe)) {
        await fetchExtendedData(timeframe, isRefetch);
      } else {
        await fetchStandardData(isRefetch);
      }
    },
    [timeframe, fetchExtendedData, fetchStandardData]
  );

  // Reset state when wallet address changes
  const prevWalletRef = useRef(walletSubkey);
  useEffect(() => {
    if (prevWalletRef.current !== walletSubkey) {
      // Wallet changed - reset all state
      setAllRecords([]);
      setFetchedTimeframes(new Set());
      setIsInitialFetch(true);
      setHasCompletedInitialLoad(false);
      setEnrichedData(null);
      setCandleData(new Map());
      setProbeSuggestedTimeframe(null);
      setIsLoading(true);
      setIsLoadingMore(false);
      setLoadingProgress(null);
      setIsError(false);
      setError(null);
      prevWalletRef.current = walletSubkey;
    }
  }, [walletSubkey]);

  // Fetch on mount, wallet change, or timeframe change
  useEffect(() => {
    if (!walletSubkey) return;

    if (walletSubkey === "main-account") {
      setIsLoading(false);
      return;
    }

    // For extended timeframes, check if we've already fetched this timeframe
    if (isExtendedTimeframe(timeframe)) {
      const cacheKey = `${walletSubkey}-${timeframe}`;
      const cached = recordsCache.get(cacheKey);
      if (cached && cached.length > 0 && fetchedTimeframes.has(timeframe)) {
        setAllRecords(cached);
        setIsLoading(false);
        setHasCompletedInitialLoad(true);
        return;
      }
      // Need to fetch extended data
      fetchExtendedData(timeframe);
      return;
    }

    // For standard timeframes, check cache
    const cached = recordsCache.get(walletSubkey);
    if (cached && cached.length > 0) {
      setAllRecords(cached);
      setIsLoading(false);
      setHasCompletedInitialLoad(true);
      const suggestedTf = getSmallestTimeframeForRecords(cached);
      if (isExtendedTimeframe(suggestedTf)) {
        setProbeSuggestedTimeframe(suggestedTf);
      }
      return;
    }

    fetchStandardData();
  }, [
    walletSubkey,
    timeframe,
    fetchExtendedData,
    fetchStandardData,
    fetchedTimeframes,
  ]);

  const refetch = useCallback(() => {
    // Clear cache for this wallet and timeframe
    if (isExtendedTimeframe(timeframe)) {
      recordsCache.delete(`${walletSubkey}-${timeframe}`);
      setFetchedTimeframes((prev) => {
        const newSet = new Set(prev);
        newSet.delete(timeframe);
        return newSet;
      });
    } else {
      recordsCache.delete(walletSubkey);
    }
    setEnrichedData(null);
    setCandleData(new Map());
    fetchData(true);
  }, [walletSubkey, timeframe, fetchData]);

  // Auto-fetch extended timeframes sequentially: 3M → 6M → 1Y after 30D completes
  useEffect(() => {
    if (walletSubkey === "main-account") return;
    if (fetchingRef.current) return;
    if (allRecords.length === 0) return;

    // Check if 30D is loaded
    const { daysCovered } = getRecordsCoverage(allRecords);
    const has30D = daysCovered >= 30;

    if (!has30D) return;

    // Sequential fetch: 3M → 6M → 1Y
    if (!fetchedTimeframes.has("3M")) {
      console.log("30D complete, auto-fetching 3M");
      fetchExtendedData("3M");
    } else if (!fetchedTimeframes.has("6M")) {
      console.log("3M complete, auto-fetching 6M");
      fetchExtendedData("6M");
    } else if (!fetchedTimeframes.has("1Y")) {
      console.log("6M complete, auto-fetching 1Y");
      fetchExtendedData("1Y");
    }
  }, [walletSubkey, allRecords, fetchedTimeframes, fetchExtendedData]);

  // Fetch daily candle data for heatmap tooltips
  useEffect(() => {
    if (walletSubkey === "main-account" || allRecords.length === 0) {
      setCandleData(new Map());
      return;
    }

    // Filter records by current timeframe first
    const filteredRecords = filterRecordsByTimeframe(allRecords, timeframe);
    if (filteredRecords.length === 0) {
      setCandleData(new Map());
      return;
    }

    // Build a map of market symbol -> months with activity
    const marketMonths = new Map<string, { year: number; month: number }[]>();
    for (const record of filteredRecords) {
      const symbol = getMarketName(record.marketIndex);
      const date = new Date(record.ts * 1000);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      if (!marketMonths.has(symbol)) {
        marketMonths.set(symbol, []);
      }

      const months = marketMonths.get(symbol)!;
      // Add month if not already present
      if (!months.some((m) => m.year === year && m.month === month)) {
        months.push({ year, month });
      }
    }

    const marketSymbols = [...marketMonths.keys()];
    const days = getTimeframeDays(timeframe);

    let cancelled = false;

    fetchMultipleDailyCandles(marketSymbols, days, marketMonths)
      .then((candles) => {
        if (!cancelled) {
          setCandleData(candles);
        }
      })
      .catch((err) => {
        console.error("Error fetching candle data:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [walletSubkey, allRecords, timeframe]);

  // Get base strategy data - memoized to prevent unnecessary recalculations
  const baseData = useMemo(() => {
    if (walletSubkey === "main-account") {
      if (timeframe === "24H") {
        // Build 48 hours: first 24 for chart + this period total, next 24 for vs last 24h
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, "0");
        let cum = 0;
        const allHourlyPnl: number[] = [];
        for (let i = 0; i < 48; i++) {
          const hourPnl =
            i % 4 === 0 ? 8 + Math.random() * 6 : Math.random() * 4 - 1;
          allHourlyPnl.push(hourPnl);
        }
        const thisPeriodSum = allHourlyPnl
          .slice(0, 24)
          .reduce((a, b) => a + b, 0);
        const previousPeriodSum = allHourlyPnl
          .slice(24, 48)
          .reduce((a, b) => a + b, 0);
        const hourlyMetrics = Array.from({ length: 24 }, (_, i) => {
          const d = new Date(now);
          d.setHours(d.getHours() - (23 - i), 0, 0, 0);
          const localKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
            d.getDate()
          )}T${pad(d.getHours())}:00:00`;
          cum += allHourlyPnl[i];
          return {
            id: i + 1,
            strategyId: 1,
            date: localKey,
            dailyPnl: allHourlyPnl[i].toFixed(2),
            dailyFunding: allHourlyPnl[i].toFixed(2),
            cumulativePnl: cum.toFixed(2),
          };
        });
        return {
          ...mockStrategy,
          dailyMetrics: hourlyMetrics,
          totalFundingPnl: thisPeriodSum.toFixed(2),
          previousPeriodFundingPnl: previousPeriodSum.toFixed(2),
        };
      }
      if (timeframe === "30D") {
        // Slice mock to last 30 days so 30D chart has correct range
        const thirtyDays = mockStrategy.dailyMetrics
          .slice(0, 30)
          .map((m, i) => ({
            ...m,
            id: i + 1,
          }));
        return { ...mockStrategy, dailyMetrics: thirtyDays };
      }
      if (timeframe === "7D") {
        // Slice mock to last 7 days; compare vs previous 7 days
        const sevenDays = mockStrategy.dailyMetrics.slice(0, 7).map((m, i) => ({
          ...m,
          id: i + 1,
        }));
        const thisPeriodSum = sevenDays.reduce(
          (s, m) => s + Number(m.dailyPnl),
          0
        );
        const previousSeven = mockStrategy.dailyMetrics.slice(7, 14);
        const previousPeriodSum = previousSeven.reduce(
          (s, m) => s + Number(m.dailyPnl),
          0
        );
        return {
          ...mockStrategy,
          dailyMetrics: sevenDays,
          totalFundingPnl: thisPeriodSum.toFixed(2),
          previousPeriodFundingPnl: previousPeriodSum.toFixed(2),
        };
      }
      // For extended timeframes (3M/6M/1Y), generate mock data
      if (isExtendedTimeframe(timeframe)) {
        const days = getTimeframeDays(timeframe);
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, "0");
        let cum = 0;
        const extendedMetrics = Array.from({ length: days }, (_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - (days - 1 - i));
          const dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
            d.getDate()
          )}`;
          const dailyPnl = 15 + Math.random() * 30 - 10; // Random between 5-35
          cum += dailyPnl;
          return {
            id: i + 1,
            strategyId: 1,
            date: dateKey,
            dailyPnl: dailyPnl.toFixed(2),
            dailyFunding: dailyPnl.toFixed(2),
            cumulativePnl: cum.toFixed(2),
          };
        });
        return {
          ...mockStrategy,
          dailyMetrics: extendedMetrics,
          totalFundingPnl: cum.toFixed(2),
        };
      }
      return mockStrategy;
    }

    if (allRecords.length === 0) {
      return null;
    }

    // Filter records by selected timeframe
    const filteredRecords = filterRecordsByTimeframe(allRecords, timeframe);

    if (filteredRecords.length === 0) {
      return null;
    }

    return transformDriftDataToStrategy(
      walletSubkey,
      filteredRecords,
      timeframe,
      candleData
    );
  }, [walletSubkey, timeframe, allRecords, candleData]);

  // Previous period funding for vs last 24h / vs last 7 days (real data only)
  const previousPeriodFundingPnl = useMemo(() => {
    if (walletSubkey === "main-account" || allRecords.length === 0) return null;
    if (timeframe !== "24H" && timeframe !== "7D") return null;
    const sum = sumPreviousPeriodFunding(allRecords, timeframe);
    return sum.toFixed(2);
  }, [walletSubkey, timeframe, allRecords]);

  // Fetch prices and enrich positions whenever baseData changes
  useEffect(() => {
    if (!baseData || walletSubkey === "main-account") {
      setEnrichedData(null);
      return;
    }

    let cancelled = false;
    const positions = baseData.positions;

    console.log(
      "Fetching prices for positions:",
      positions.map((p) => p.pairName)
    );

    async function fetchPrices() {
      try {
        const result = await enrichPositionsWithPrices(positions, timeframe);
        console.log("Enriched positions with prices:", result);
        if (!cancelled) {
          setEnrichedData(result);
        }
      } catch (err) {
        console.error("Error enriching positions with prices:", err);
      }
    }

    fetchPrices();

    return () => {
      cancelled = true;
    };
  }, [baseData, timeframe, walletSubkey]);

  // Merge enriched data into the final response
  const data: StrategyResponse | null = (() => {
    if (!baseData) return null;

    if (walletSubkey === "main-account") {
      return baseData;
    }

    const withPrevious =
      previousPeriodFundingPnl !== null
        ? { ...baseData, previousPeriodFundingPnl }
        : baseData;

    if (enrichedData) {
      return {
        ...withPrevious,
        positions: enrichedData.positions,
        activeNotional: enrichedData.totalNotional.toFixed(2),
        currentApy: enrichedData.apy.toFixed(2),
      };
    }

    return withPrevious;
  })();

  // Clear probe suggestion once user (or we) have switched to that timeframe
  useEffect(() => {
    if (timeframe === probeSuggestedTimeframe) {
      setProbeSuggestedTimeframe(null);
    }
  }, [timeframe, probeSuggestedTimeframe]);

  return {
    data,
    isLoading,
    isLoadingMore,
    loadingProgress,
    isError,
    error,
    refetch,
    isRefetching,
    fetchingTimeframe,
    availableTimeframes,
    probeSuggestedTimeframe,
    isInitialFetch,
    hasCompletedInitialLoad,
    loadedTimeframes,
    currentlyLoadingTimeframe,
    currentlyLoadingTimeframes,
    hasComparisonData,
  };
}
