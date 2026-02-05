/**
 * Hook for price fetching and position enrichment
 * Handles price caching and APY/notional calculations
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchMultipleMarketPrices } from "@/services/drift-api";
import type { Position } from "@/types/schema";
import type { Timeframe } from "@/types/loading-types";
import { getTimeframeDays } from "@/types/loading-types";

// Price cache with TTL
const pricesCache = new Map<
  string,
  { prices: Map<string, number>; timestamp: number }
>();
const PRICE_CACHE_TTL = 60 * 1000; // 1 minute

export interface EnrichedPositionData {
  positions: Position[];
  totalNotional: number;
  apy: number;
}

/**
 * Enrich positions with current prices and calculate ROI/APY
 */
async function enrichPositionsWithPrices(
  positions: Position[],
  timeframe: Timeframe
): Promise<EnrichedPositionData> {
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

  // Calculate APY: ROI * (365 / days_in_timeframe)
  const days = getTimeframeDays(timeframe);
  const totalRoi = totalNotional > 0 ? (totalFunding / totalNotional) * 100 : 0;
  const apy = totalRoi * (365 / days);

  return { positions: enrichedPositions, totalNotional, apy };
}

/**
 * Hook for price enrichment with caching
 */
export function usePriceEnrichment(
  positions: Position[],
  timeframe: Timeframe,
  enabled: boolean = true
): {
  enrichedData: EnrichedPositionData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [enrichedData, setEnrichedData] = useState<EnrichedPositionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetchIdRef = useRef(0);

  const fetchPrices = useCallback(async () => {
    if (!enabled || positions.length === 0) {
      setEnrichedData(null);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await enrichPositionsWithPrices(positions, timeframe);

      // Only update if this is still the latest fetch
      if (fetchId === fetchIdRef.current) {
        setEnrichedData(result);
      }
    } catch (err) {
      if (fetchId === fetchIdRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [positions, timeframe, enabled]);

  // Fetch prices when dependencies change
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const refetch = useCallback(() => {
    // Clear cache for these symbols
    const symbols = positions.map((p) => p.pairName);
    const cacheKey = symbols.sort().join(",");
    pricesCache.delete(cacheKey);
    fetchPrices();
  }, [positions, fetchPrices]);

  return { enrichedData, isLoading, error, refetch };
}

/**
 * Clear all price cache entries
 */
export function clearPriceCache(): void {
  pricesCache.clear();
}

/**
 * Get price from cache if available
 */
export function getCachedPrice(symbol: string): number | null {
  for (const [, { prices, timestamp }] of pricesCache) {
    if (Date.now() - timestamp < PRICE_CACHE_TTL && prices.has(symbol)) {
      return prices.get(symbol)!;
    }
  }
  return null;
}
