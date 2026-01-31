import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { fetchFundingPaymentsProgressive, fetchMultipleMarketPrices } from "@/services/drift-api";
import { transformDriftDataToStrategy } from "@/services/drift-transformer";
import { mockStrategy } from "@/mock-strategy";
import type { StrategyResponse, Position } from "@/types/schema";
import type { DriftFundingPaymentRecord } from "@/services/drift-types";

export type Timeframe = "24H" | "7D" | "30D";

interface UseStrategyResult {
  data: StrategyResponse | null;
  isLoading: boolean;
  isLoadingMore: boolean;  // True when fetching beyond initial 7 days
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching: boolean;
}

// Cache for storing full 30-day records
const recordsCache = new Map<string, DriftFundingPaymentRecord[]>();

// Cache for storing market prices (refreshed periodically)
const pricesCache = new Map<string, { prices: Map<string, number>; timestamp: number }>();
const PRICE_CACHE_TTL = 60 * 1000; // 1 minute cache for prices

/**
 * Get timeframe duration in days
 */
function getTimeframeDays(timeframe: Timeframe): number {
  switch (timeframe) {
    case "24H":
      return 1;
    case "7D":
      return 7;
    case "30D":
      return 30;
  }
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
  let cutoffTs: number;

  switch (timeframe) {
    case "24H":
      cutoffTs = now - (24 * 60 * 60);
      break;
    case "7D":
      cutoffTs = now - (7 * 24 * 60 * 60);
      break;
    case "30D":
    default:
      cutoffTs = now - (30 * 24 * 60 * 60);
      break;
  }

  return records.filter(r => r.ts >= cutoffTs);
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
    endTs = now - (24 * 60 * 60);
    startTs = now - (48 * 60 * 60);
  } else if (timeframe === "7D") {
    endTs = now - (7 * 24 * 60 * 60);
    startTs = now - (14 * 24 * 60 * 60);
  } else {
    return 0;
  }
  return records
    .filter((r) => r.ts >= startTs && r.ts < endTs)
    .reduce((sum, r) => sum + parseFloat(r.fundingPayment), 0);
}

export function useStrategy(walletSubkey: string, timeframe: Timeframe = "7D"): UseStrategyResult {
  const [allRecords, setAllRecords] = useState<DriftFundingPaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);
  const fetchingRef = useRef(false);

  // State for enriched data with prices
  const [enrichedData, setEnrichedData] = useState<{
    positions: Position[];
    totalNotional: number;
    apy: number;
  } | null>(null);

  const fetchData = useCallback(async (isRefetch = false) => {
    if (walletSubkey === "main-account") {
      setAllRecords([]);
      setIsLoading(false);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (isRefetch) {
      setIsRefetching(true);
    } else {
      setIsLoading(true);
    }
    setIsError(false);
    setError(null);

    try {
      await fetchFundingPaymentsProgressive(walletSubkey, {
        initialDays: 7,
        maxDays: 30,
        onInitialLoad: (records) => {
          console.log(`Initial load: ${records.length} records (7 days)`);
          setAllRecords(records);
          setIsLoading(false);
          setIsRefetching(false);
          setIsLoadingMore(true);
          // Cache the records
          recordsCache.set(walletSubkey, records);
        },
        onComplete: (records) => {
          console.log(`Complete: ${records.length} records (30 days)`);
          setAllRecords(records);
          setIsLoadingMore(false);
          // Update cache with full records
          recordsCache.set(walletSubkey, records);
        }
      });
    } catch (err) {
      console.error("Error fetching funding payments:", err);
      setIsError(true);
      setError(err instanceof Error ? err : new Error("Failed to fetch data"));
      setIsLoading(false);
      setIsRefetching(false);
      setIsLoadingMore(false);
    } finally {
      fetchingRef.current = false;
    }
  }, [walletSubkey]);

  // Fetch on mount or wallet change
  useEffect(() => {
    if (!walletSubkey) return;

    if (walletSubkey === "main-account") {
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cached = recordsCache.get(walletSubkey);
    if (cached && cached.length > 0) {
      setAllRecords(cached);
      setIsLoading(false);
      return;
    }

    fetchData();
  }, [walletSubkey, fetchData]);

  const refetch = useCallback(() => {
    // Clear cache for this wallet
    recordsCache.delete(walletSubkey);
    setEnrichedData(null);
    fetchData(true);
  }, [walletSubkey, fetchData]);

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
          const hourPnl = i % 4 === 0 ? 8 + Math.random() * 6 : (Math.random() * 4 - 1);
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
      if (timeframe === "30D") {
        // Slice mock to last 30 days so 30D chart has correct range
        const thirtyDays = mockStrategy.dailyMetrics.slice(0, 30).map((m, i) => ({
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

    return transformDriftDataToStrategy(walletSubkey, filteredRecords, timeframe);
  }, [walletSubkey, timeframe, allRecords]);

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

    console.log("Fetching prices for positions:", positions.map(p => p.pairName));

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

  return {
    data,
    isLoading,
    isLoadingMore,
    isError,
    error,
    refetch,
    isRefetching,
  };
}
