import type { DriftFundingPaymentRecord, DailyCandleRecord } from "./drift-types";

/**
 * Cache key generators
 */
export const CACHE_KEYS = {
  fundingMonth: (wallet: string, year: number, month: number) =>
    `drift:funding:${wallet.slice(0, 8)}:${year}-${month.toString().padStart(2, "0")}`,
  candleMonth: (market: string, year: number, month: number) =>
    `drift:candles:${market}:${year}-${month.toString().padStart(2, "0")}`,
};

/**
 * Cached funding month data structure
 */
export interface CachedFundingMonth {
  records: DriftFundingPaymentRecord[];
  fetchedAt: number;
  isComplete: boolean; // false for current month (may have more data coming)
}

/**
 * Cached candle month data structure
 */
export interface CachedCandleMonth {
  records: DailyCandleRecord[];
  fetchedAt: number;
  isComplete: boolean;
}

/**
 * Check if a given year/month is the current month
 */
export function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() + 1 === month;
}

/**
 * Get all months in a date range (inclusive)
 * Returns array of {year, month} objects
 */
export function getMonthsInRange(
  startDate: Date,
  endDate: Date
): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];

  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  const current = new Date(start);
  while (current <= end) {
    months.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1, // 1-indexed
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Cache refresh threshold in milliseconds (5 minutes)
 */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Determine if cached data should be refreshed
 * - Historical months: never refresh (immutable)
 * - Current month: refresh if older than 5 minutes
 */
export function shouldRefreshMonth(
  cached: CachedFundingMonth | CachedCandleMonth | null,
  isCurrent: boolean
): boolean {
  if (!cached) return true;
  if (!isCurrent) return false; // Historical months never need refresh
  return Date.now() - cached.fetchedAt > REFRESH_THRESHOLD_MS;
}

/**
 * Get cached funding month data from localStorage
 */
export function getCachedFundingMonth(
  wallet: string,
  year: number,
  month: number
): CachedFundingMonth | null {
  try {
    const key = CACHE_KEYS.fundingMonth(wallet, year, month);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as CachedFundingMonth;
  } catch (e) {
    console.warn("Failed to read funding cache:", e);
    return null;
  }
}

/**
 * Save funding month data to localStorage
 */
export function setCachedFundingMonth(
  wallet: string,
  year: number,
  month: number,
  records: DriftFundingPaymentRecord[]
): void {
  try {
    const key = CACHE_KEYS.fundingMonth(wallet, year, month);
    const data: CachedFundingMonth = {
      records,
      fetchedAt: Date.now(),
      isComplete: !isCurrentMonth(year, month),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save funding cache:", e);
  }
}

/**
 * Get cached candle month data from localStorage
 */
export function getCachedCandleMonth(
  market: string,
  year: number,
  month: number
): CachedCandleMonth | null {
  try {
    const key = CACHE_KEYS.candleMonth(market, year, month);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as CachedCandleMonth;
  } catch (e) {
    console.warn("Failed to read candle cache:", e);
    return null;
  }
}

/**
 * Save candle month data to localStorage
 */
export function setCachedCandleMonth(
  market: string,
  year: number,
  month: number,
  records: DailyCandleRecord[]
): void {
  try {
    const key = CACHE_KEYS.candleMonth(market, year, month);
    const data: CachedCandleMonth = {
      records,
      fetchedAt: Date.now(),
      isComplete: !isCurrentMonth(year, month),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save candle cache:", e);
  }
}

/**
 * Clear funding cache for a specific wallet's current month only
 */
export function clearCurrentMonthFundingCache(wallet: string): void {
  const now = new Date();
  const key = CACHE_KEYS.fundingMonth(
    wallet,
    now.getFullYear(),
    now.getMonth() + 1
  );
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn("Failed to clear funding cache:", e);
  }
}

/**
 * Clear all funding cache for a wallet
 */
export function clearAllFundingCache(wallet: string): void {
  try {
    const prefix = `drift:funding:${wallet.slice(0, 8)}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
    console.warn("Failed to clear all funding cache:", e);
  }
}

/**
 * Get the date range for a timeframe
 */
export function getTimeframeDateRange(
  days: number
): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return { startDate, endDate };
}

/**
 * Day-level cache index for incremental fetching
 */
export interface CachedDayIndex {
  lastFetchedDate: string; // YYYY-MM-DD - most recent date we have data for
  oldestCachedDate: string; // YYYY-MM-DD - oldest date we have data for
  fetchedAt: number; // Timestamp when this index was last updated
}

const DAY_INDEX_KEY = (wallet: string) => `drift:day-index:${wallet.slice(0, 8)}`;

/**
 * Get the cached day index for a wallet
 */
export function getCachedDayIndex(wallet: string): CachedDayIndex | null {
  try {
    const key = DAY_INDEX_KEY(wallet);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as CachedDayIndex;
  } catch (e) {
    console.warn("Failed to read day index cache:", e);
    return null;
  }
}

/**
 * Save the day index for a wallet
 */
export function setCachedDayIndex(wallet: string, index: CachedDayIndex): void {
  try {
    const key = DAY_INDEX_KEY(wallet);
    localStorage.setItem(key, JSON.stringify(index));
  } catch (e) {
    console.warn("Failed to save day index cache:", e);
  }
}

/**
 * Clear the day index for a wallet
 */
export function clearDayIndex(wallet: string): void {
  try {
    const key = DAY_INDEX_KEY(wallet);
    localStorage.removeItem(key);
  } catch (e) {
    console.warn("Failed to clear day index cache:", e);
  }
}

/**
 * Calculate what date range needs to be fetched based on cache state
 * Returns null if cache is complete for the requested period
 */
export function getMissingDateRange(
  wallet: string,
  requestedDays: number
): { startDate: Date; endDate: Date; needsFetch: "recent" | "historical" | "both" | "none" } {
  const now = new Date();
  const today = formatDateYYYYMMDD(now);
  const requestedStartDate = new Date(now);
  requestedStartDate.setDate(requestedStartDate.getDate() - requestedDays);
  const requestedStart = formatDateYYYYMMDD(requestedStartDate);

  const index = getCachedDayIndex(wallet);

  if (!index) {
    // No cache at all, need to fetch everything
    return {
      startDate: requestedStartDate,
      endDate: now,
      needsFetch: "both",
    };
  }

  // Check if cache is stale (older than 5 minutes for today's data)
  const isStale = Date.now() - index.fetchedAt > 5 * 60 * 1000;
  const hasToday = index.lastFetchedDate === today;
  const hasHistorical = index.oldestCachedDate <= requestedStart;

  if (hasToday && !isStale && hasHistorical) {
    // Cache is complete and fresh
    return {
      startDate: requestedStartDate,
      endDate: now,
      needsFetch: "none",
    };
  }

  if (!hasToday || isStale) {
    if (!hasHistorical) {
      // Need both recent and historical
      return {
        startDate: requestedStartDate,
        endDate: now,
        needsFetch: "both",
      };
    }
    // Only need recent data (from last cached date to now)
    const lastCachedDate = new Date(index.lastFetchedDate);
    return {
      startDate: lastCachedDate,
      endDate: now,
      needsFetch: "recent",
    };
  }

  // Need historical data (from requested start to oldest cached)
  const oldestCached = new Date(index.oldestCachedDate);
  return {
    startDate: requestedStartDate,
    endDate: oldestCached,
    needsFetch: "historical",
  };
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}
