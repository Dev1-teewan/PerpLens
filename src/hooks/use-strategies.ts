/**
 * Main strategy hook - thin facade composing specialized hooks
 * Refactored from ~950 lines to use modular loading state machine
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { fetchMultipleDailyCandles } from "@/services/drift-api";
import { transformDriftDataToStrategy } from "@/services/drift-transformer";
import { mockStrategy } from "@/mock-strategy";
import { clearCurrentMonthFundingCache } from "@/services/cache-utils";
import {
  fetchFundingIncremental,
  fetchExtendedTimeframe,
  fetchProbe12Months,
} from "@/services/funding-fetcher";
import { getCacheState, selectDefaultTimeframe } from "@/services/cache-manager";
import { useLoadingState } from "./use-loading-state";
import { usePriceEnrichment } from "./use-price-enrichment";
import {
  getLoadingTimeframes,
  getCurrentlyLoadingTimeframe,
} from "./use-timeframe-buttons";

import type { StrategyResponse } from "@/types/schema";
import type { DriftFundingPaymentRecord, DailyCandleRecord } from "@/services/drift-types";
import { getMarketName } from "@/services/drift-types";
import type { Timeframe, LoadingProgress } from "@/types/loading-types";
import { getTimeframeDays, isExtendedTimeframe, EXTENDED_TIMEFRAMES } from "@/types/loading-types";

// Re-export types for backward compatibility
export type { Timeframe };
export { getTimeframeDays, isExtendedTimeframe };

export interface UseStrategyResult {
  data: StrategyResponse | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadingProgress: LoadingProgress | null;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching: boolean;
  fetchingTimeframe: Timeframe | null;
  availableTimeframes: Set<Timeframe>;
  probeSuggestedTimeframe: Timeframe | null;
  cacheSuggestedDefaultTimeframe: Timeframe | null;
  isInitialFetch: boolean;
  hasCompletedInitialLoad: boolean;
  loadedTimeframes: Set<Timeframe>;
  currentlyLoadingTimeframe: Timeframe | null;
  currentlyLoadingTimeframes: Set<Timeframe>;
  hasComparisonData: boolean;
  disabledTimeframes: Set<Timeframe>;
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
 * Sum funding for records in the previous period
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

/**
 * Get smallest timeframe that covers all records
 */
function getSmallestTimeframeForRecords(records: { ts: number }[]): Timeframe {
  if (records.length === 0) return "30D";
  const now = Date.now() / 1000;
  const oldestTs = Math.min(...records.map((r) => r.ts));
  const daysCovered = (now - oldestTs) / 86400;
  if (daysCovered <= 30) return "30D";
  if (daysCovered <= 90) return "3M";
  if (daysCovered <= 180) return "6M";
  return "1Y";
}

/**
 * Main strategy hook
 */
export function useStrategy(
  walletSubkey: string,
  timeframe: Timeframe = "7D"
): UseStrategyResult {
  // Core state
  const [allRecords, setAllRecords] = useState<DriftFundingPaymentRecord[]>([]);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const [isRefetching] = useState(false); // Refetch state (could use for UI)
  const [probeSuggestedTimeframe, setProbeSuggestedTimeframe] = useState<Timeframe | null>(null);
  const [cacheSuggestedDefaultTimeframe, setCacheSuggestedDefaultTimeframe] = useState<Timeframe | null>(null);
  const [candleData, setCandleData] = useState<Map<string, DailyCandleRecord[]>>(new Map());
  const [fetchedTimeframes, setFetchedTimeframes] = useState<Set<Timeframe>>(new Set());

  // Use loading state machine
  const loadingState = useLoadingState();
  const { state, reset, startFresh, startFromCache, on7DLoaded, on14DMilestone, on30DLoaded, onExtendedLoaded, onProbeComplete, setFetching, setError } = loadingState;

  // Ref to prevent concurrent fetches
  const fetchingRef = useRef(false);
  const prevWalletRef = useRef(walletSubkey);
  const initialFetchDoneRef = useRef(false);
  const currentWalletRef = useRef(walletSubkey);
  const extendedRecordsRef = useRef<Map<Timeframe, DriftFundingPaymentRecord[]>>(new Map());
  const extendedFetchingRef = useRef(false);

  currentWalletRef.current = walletSubkey;

  // Compute base data for positions
  const baseData = useMemo(() => {
    if (walletSubkey === "main-account") {
      return getMockData(timeframe);
    }
    if (allRecords.length === 0) return null;
    const filteredRecords = filterRecordsByTimeframe(allRecords, timeframe);
    if (filteredRecords.length === 0) return null;
    return transformDriftDataToStrategy(walletSubkey, filteredRecords, timeframe, candleData);
  }, [walletSubkey, timeframe, allRecords, candleData]);

  // Price enrichment for non-mock data
  const { enrichedData } = usePriceEnrichment(
    baseData?.positions || [],
    timeframe,
    walletSubkey !== "main-account" && baseData !== null
  );

  // Reset state when wallet changes
  useEffect(() => {
    if (prevWalletRef.current !== walletSubkey) {
      setAllRecords([]);
      setFetchedTimeframes(new Set());
      setCandleData(new Map());
      setProbeSuggestedTimeframe(null);
      setCacheSuggestedDefaultTimeframe(null);
      setLoadingProgress(null);
      initialFetchDoneRef.current = false;
      fetchingRef.current = false;
      extendedFetchingRef.current = false;
      extendedRecordsRef.current.clear();
      reset();
      prevWalletRef.current = walletSubkey;
    }
  }, [walletSubkey, reset]);

  // Main fetch effect
  useEffect(() => {
    if (!walletSubkey || walletSubkey === "main-account") {
      return;
    }

    // For extended timeframes that are already fetched, load from our cache
    if (isExtendedTimeframe(timeframe) && fetchedTimeframes.has(timeframe)) {
      const cachedRecords = extendedRecordsRef.current.get(timeframe);
      if (cachedRecords && cachedRecords.length > 0) {
        console.log(`[Main] Loading cached ${timeframe} records: ${cachedRecords.length}`);
        setAllRecords(cachedRecords);
      }
      return;
    }

    // Do not re-run the initial 30-day fetch when we are already past it
    // (e.g. extended fetch in progress or complete). Otherwise fetchedTimeframes
    // updates from auto-fetch would re-trigger this effect and on30DLoaded would
    // reset the loading state and break the loading icon / 1Y fetch.
    if (
      !isExtendedTimeframe(timeframe) &&
      (state.phase === "30d_loaded" ||
        state.phase === "loading_extended" ||
        state.phase === "complete")
    ) {
      return;
    }

    // Run initial 30-day fetch only once per wallet; prevents repeated 30d milestone
    if (!isExtendedTimeframe(timeframe) && initialFetchDoneRef.current) {
      return;
    }

    // Start fetch if not already in progress
    if (fetchingRef.current) return;

    const cacheState = getCacheState(walletSubkey);
    const useCache = cacheState.hasCache && cacheState.daysCovered >= 7;
    if (useCache) {
      startFromCache(cacheState.daysCovered);
      setCacheSuggestedDefaultTimeframe(selectDefaultTimeframe(cacheState));
    }

    const fetchData = async (fromCache: boolean) => {
      const walletAtFetch = walletSubkey;
      fetchingRef.current = true;
      if (!fromCache) startFresh();

      if (isExtendedTimeframe(timeframe)) {
        // Fetch extended timeframe directly
        await fetchExtendedTimeframe(walletSubkey, timeframe, {
          onRecords: (records) => {
            if (currentWalletRef.current !== walletAtFetch) return;
            setAllRecords(records);
          },
          onProgress: setLoadingProgress,
          onComplete: (records) => {
            if (currentWalletRef.current !== walletAtFetch) return;
            setAllRecords(records);
            setFetchedTimeframes((prev) => new Set([...prev, timeframe]));
            onExtendedLoaded(timeframe);
            setLoadingProgress(null);
          },
          onError: (error) => {
            setError(error);
          },
        });
      } else {
        // Fetch incrementally up to 30 days
        await fetchFundingIncremental(walletSubkey, {
          onMilestone: (milestone) => {
            if (milestone === "7d") on7DLoaded(7);
            if (milestone === "14d") on14DMilestone();
            if (milestone === "30d") on30DLoaded();
          },
          onRecords: (recs) => {
            if (currentWalletRef.current !== walletAtFetch) return;
            setAllRecords(recs);
          },
          onComplete: (recs) => {
            if (currentWalletRef.current !== walletAtFetch) return;
            initialFetchDoneRef.current = true;
            setAllRecords(recs);
            setLoadingProgress(null);

            if (recs.length === 0) {
              on30DLoaded();
              probeFor12Months();
            }
          },
          onError: (error) => {
            setError(error);
          },
          onCacheHit: () => {
            // Cache hit handled by milestone callbacks
          },
        });
      }

      fetchingRef.current = false;
    };

    const probeFor12Months = async (): Promise<void> => {
      setLoadingProgress({ loadedMonths: 0, totalMonths: 12, phase: "fetch" });

      await fetchProbe12Months(walletSubkey, {
        onProgress: (loaded, total) => {
          setLoadingProgress({ loadedMonths: loaded, totalMonths: total, phase: "fetch" });
        },
        onComplete: (records) => {
          if (currentWalletRef.current !== walletSubkey) return;
          if (records.length > 0) {
            setAllRecords(records);
            const suggestedTf = getSmallestTimeframeForRecords(records);
            if (isExtendedTimeframe(suggestedTf)) {
              setFetchedTimeframes((prev) => new Set([...prev, suggestedTf]));
              setProbeSuggestedTimeframe(suggestedTf);
            }
            onProbeComplete();
          } else {
            setError(new Error("No funding history found for this address in the past 12 months."));
          }
          setLoadingProgress(null);
        },
        onError: setError,
      });
    };

    fetchData(useCache);
  }, [walletSubkey, timeframe, fetchedTimeframes, state.phase, startFresh, startFromCache, on7DLoaded, on14DMilestone, on30DLoaded, onExtendedLoaded, onProbeComplete, setError]);

  // Auto-fetch extended timeframes sequentially after 30D
  useEffect(() => {
    // Skip for mock account
    if (walletSubkey === "main-account") return;

    // Only proceed if phase indicates we should fetch extended data
    if (state.phase !== "30d_loaded" && state.phase !== "loading_extended") return;

    // Get next timeframe to fetch
    const nextTimeframe = state.extendedQueue[0];
    if (!nextTimeframe) return;

    // Skip if already fetched or currently fetching
    if (fetchedTimeframes.has(nextTimeframe)) return;
    if (extendedFetchingRef.current) return;

    console.log(`[Auto-fetch] Starting fetch for ${nextTimeframe}, phase: ${state.phase}, queue: ${state.extendedQueue.join(",")}`);

    // Sync loading icon with current extended fetch so spinner shows the right timeframe
    setFetching(nextTimeframe);

    const fetchNext = async () => {
      extendedFetchingRef.current = true;

      try {
        await fetchExtendedTimeframe(walletSubkey, nextTimeframe, {
          onRecords: (recs) => {
            if (currentWalletRef.current !== walletSubkey) return;
            extendedRecordsRef.current.set(nextTimeframe, recs);
            if (timeframe === nextTimeframe) {
              setAllRecords(recs);
            }
          },
          onProgress: setLoadingProgress,
          onComplete: (recs) => {
            if (currentWalletRef.current !== walletSubkey) return;
            console.log(`[Auto-fetch] Completed ${nextTimeframe}, records: ${recs.length}`);
            extendedRecordsRef.current.set(nextTimeframe, recs);
            if (timeframe === nextTimeframe) {
              setAllRecords(recs);
            }
            setFetchedTimeframes((prev) => new Set([...prev, nextTimeframe]));
            setLoadingProgress(null);
          },
          onError: (error) => {
            console.warn(`[Auto-fetch] Failed to fetch ${nextTimeframe}:`, error);
            setError(error);
          },
        });
      } catch (error) {
        console.warn(`[Auto-fetch] Error fetching ${nextTimeframe}:`, error);
        setError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        extendedFetchingRef.current = false;
        onExtendedLoaded(nextTimeframe);
      }
    };

    fetchNext();
  }, [walletSubkey, timeframe, state.phase, state.extendedQueue, fetchedTimeframes, onExtendedLoaded, setFetching, setError]);

  // Fetch candle data for heatmap
  useEffect(() => {
    if (walletSubkey === "main-account" || allRecords.length === 0) {
      setCandleData(new Map());
      return;
    }

    const filteredRecords = filterRecordsByTimeframe(allRecords, timeframe);
    if (filteredRecords.length === 0) {
      setCandleData(new Map());
      return;
    }

    // Build market-month map
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
      if (!months.some((m) => m.year === year && m.month === month)) {
        months.push({ year, month });
      }
    }

    const symbols = [...marketMonths.keys()];
    const days = getTimeframeDays(timeframe);

    let cancelled = false;
    fetchMultipleDailyCandles(symbols, days, marketMonths)
      .then((candles) => {
        if (!cancelled) setCandleData(candles);
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [walletSubkey, allRecords, timeframe]);

  // Refetch function
  const refetch = useCallback(() => {
    if (isExtendedTimeframe(timeframe)) {
      setFetchedTimeframes((prev) => {
        const newSet = new Set(prev);
        newSet.delete(timeframe);
        return newSet;
      });
    }
    clearCurrentMonthFundingCache(walletSubkey);
    setAllRecords([]);
    setCandleData(new Map());
    reset();
  }, [walletSubkey, timeframe, reset]);

  // Compute final data with enrichment
  const data: StrategyResponse | null = useMemo(() => {
    if (!baseData) return null;

    if (walletSubkey === "main-account") {
      return baseData;
    }

    // Add previous period funding
    const previousPeriodFundingPnl =
      timeframe === "24H" || timeframe === "7D"
        ? sumPreviousPeriodFunding(allRecords, timeframe).toFixed(2)
        : null;

    const withPrevious = previousPeriodFundingPnl
      ? { ...baseData, previousPeriodFundingPnl }
      : baseData;

    // Add price enrichment
    if (enrichedData) {
      return {
        ...withPrevious,
        positions: enrichedData.positions,
        activeNotional: enrichedData.totalNotional.toFixed(2),
        currentApy: enrichedData.apy.toFixed(2),
      };
    }

    return withPrevious;
  }, [baseData, walletSubkey, timeframe, allRecords, enrichedData]);

  // Compute derived state for backward compatibility
  const isLoading = state.phase === "loading_7d" || state.phase === "idle";
  const isLoadingMore = state.phase === "7d_loaded" || state.phase === "loading_30d";
  const isInitialFetch = state.phase === "loading_7d";
  const hasCompletedInitialLoad = state.phase !== "idle" && state.phase !== "loading_7d";

  const availableTimeframes = useMemo(() => {
    if (walletSubkey === "main-account") {
      return new Set<Timeframe>(["24H", "7D", "30D", "3M", "6M", "1Y"]);
    }
    const available = new Set<Timeframe>(["24H", "7D"]);
    if (state.daysLoaded >= 30 || state.phase !== "loading_7d") {
      available.add("30D");
    }
    for (const tf of EXTENDED_TIMEFRAMES) {
      if (fetchedTimeframes.has(tf)) {
        available.add(tf);
      }
    }
    return available;
  }, [walletSubkey, state.phase, state.daysLoaded, fetchedTimeframes]);

  const loadedTimeframes = useMemo(() => {
    if (walletSubkey === "main-account") {
      return new Set<Timeframe>(["24H", "7D", "30D", "3M", "6M", "1Y"]);
    }
    const loaded = new Set<Timeframe>();
    if (state.daysLoaded >= 1) loaded.add("24H");
    if (state.daysLoaded >= 7) loaded.add("7D");
    if (state.daysLoaded >= 30) loaded.add("30D");
    for (const tf of EXTENDED_TIMEFRAMES) {
      if (fetchedTimeframes.has(tf)) loaded.add(tf);
    }
    return loaded;
  }, [walletSubkey, state.daysLoaded, fetchedTimeframes]);

  const currentlyLoadingTimeframes = useMemo(() => {
    if (walletSubkey === "main-account") return new Set<Timeframe>();
    return getLoadingTimeframes(state);
  }, [walletSubkey, state]);

  const currentlyLoadingTimeframe = useMemo(() => {
    if (walletSubkey === "main-account") return null;
    return getCurrentlyLoadingTimeframe(state);
  }, [walletSubkey, state]);

  const hasComparisonData = useMemo(() => {
    if (walletSubkey === "main-account") return true;
    if (timeframe === "24H") return state.daysLoaded >= 2;
    if (timeframe === "7D") return state.has14DayMilestone;
    return true;
  }, [walletSubkey, timeframe, state.daysLoaded, state.has14DayMilestone]);

  // Compute disabled timeframes based on loading phase
  const disabledTimeframes = useMemo(() => {
    const disabled = new Set<Timeframe>();
    if (walletSubkey === "main-account") return disabled;

    const { phase } = state;

    // Phase 1: loading_7d - disable 30D and extended
    if (phase === "idle" || phase === "loading_7d") {
      disabled.add("30D");
      disabled.add("3M");
      disabled.add("6M");
      disabled.add("1Y");
    }
    // Phase 2: 7d_loaded - disable extended only
    else if (phase === "7d_loaded" || phase === "loading_30d") {
      disabled.add("3M");
      disabled.add("6M");
      disabled.add("1Y");
    }
    // Phase 3+: 30d_loaded and beyond - nothing disabled

    return disabled;
  }, [walletSubkey, state.phase]);

  // Clear probe suggestion when timeframe matches
  useEffect(() => {
    if (timeframe === probeSuggestedTimeframe) {
      setProbeSuggestedTimeframe(null);
    }
  }, [timeframe, probeSuggestedTimeframe]);

  return {
    data,
    isLoading: walletSubkey !== "main-account" && isLoading,
    isLoadingMore,
    loadingProgress,
    isError: state.error !== null,
    error: state.error,
    refetch,
    isRefetching,
    fetchingTimeframe: state.currentlyFetching,
    availableTimeframes,
    probeSuggestedTimeframe,
    cacheSuggestedDefaultTimeframe,
    isInitialFetch,
    hasCompletedInitialLoad: walletSubkey === "main-account" || hasCompletedInitialLoad,
    loadedTimeframes,
    currentlyLoadingTimeframe,
    currentlyLoadingTimeframes,
    hasComparisonData,
    disabledTimeframes,
  };
}

/**
 * Generate mock data for different timeframes
 */
function getMockData(timeframe: Timeframe): StrategyResponse {
  if (timeframe === "24H") {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    let cum = 0;
    const allHourlyPnl: number[] = [];

    for (let i = 0; i < 48; i++) {
      const hourPnl = i % 4 === 0 ? 8 + Math.random() * 6 : Math.random() * 4 - 1;
      allHourlyPnl.push(hourPnl);
    }

    const thisPeriodSum = allHourlyPnl.slice(0, 24).reduce((a, b) => a + b, 0);
    const previousPeriodSum = allHourlyPnl.slice(24, 48).reduce((a, b) => a + b, 0);

    const hourlyMetrics = Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now);
      d.setHours(d.getHours() - (23 - i), 0, 0, 0);
      const localKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00:00`;
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

  if (timeframe === "7D") {
    const sevenDays = mockStrategy.dailyMetrics.slice(0, 7).map((m, i) => ({ ...m, id: i + 1 }));
    const thisPeriodSum = sevenDays.reduce((s, m) => s + Number(m.dailyPnl), 0);
    const previousSeven = mockStrategy.dailyMetrics.slice(7, 14);
    const previousPeriodSum = previousSeven.reduce((s, m) => s + Number(m.dailyPnl), 0);

    return {
      ...mockStrategy,
      dailyMetrics: sevenDays,
      totalFundingPnl: thisPeriodSum.toFixed(2),
      previousPeriodFundingPnl: previousPeriodSum.toFixed(2),
    };
  }

  if (timeframe === "30D") {
    const thirtyDays = mockStrategy.dailyMetrics.slice(0, 30).map((m, i) => ({ ...m, id: i + 1 }));
    return { ...mockStrategy, dailyMetrics: thirtyDays };
  }

  // Extended timeframes (3M, 6M, 1Y)
  const days = getTimeframeDays(timeframe);
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  let cum = 0;

  const extendedMetrics = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dailyPnl = 15 + Math.random() * 30 - 10;
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
