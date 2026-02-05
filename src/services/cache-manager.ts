/**
 * Unified cache manager for funding payment data
 * Consolidates cache operations with clear API
 */

import type { DriftFundingPaymentRecord } from "./drift-types";
import type { CacheState } from "@/types/loading-types";
import {
  getCachedFundingMonth,
  setCachedFundingMonth,
  getMonthsInRange,
  isCurrentMonth,
  shouldRefreshMonth,
  getCachedDayIndex,
  setCachedDayIndex,
  formatDateYYYYMMDD,
} from "./cache-utils";

/**
 * Deduplicate funding records by txSig and txSigIndex
 */
function deduplicateFundingRecords(
  records: DriftFundingPaymentRecord[]
): DriftFundingPaymentRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.txSig}-${r.txSigIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Get the current cache state for a wallet
 * Returns information about what data is cached
 */
export function getCacheState(wallet: string): CacheState {
  const index = getCachedDayIndex(wallet);

  if (!index) {
    return {
      hasCache: false,
      oldestCachedDate: 0,
      newestCachedDate: 0,
      daysCovered: 0,
    };
  }

  const oldestTs = new Date(index.oldestCachedDate).getTime();
  const newestTs = new Date(index.lastFetchedDate).getTime();
  const daysCovered = Math.ceil((newestTs - oldestTs) / (24 * 60 * 60 * 1000));

  return {
    hasCache: true,
    oldestCachedDate: oldestTs,
    newestCachedDate: newestTs,
    daysCovered,
  };
}

/**
 * Get cached records for a specific number of days
 * Returns records from monthly cache within the timeframe
 */
export function getCachedRecords(
  wallet: string,
  days: number
): DriftFundingPaymentRecord[] {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);

  const months = getMonthsInRange(startDate, now);
  const allRecords: DriftFundingPaymentRecord[] = [];

  for (const { year, month } of months) {
    const cached = getCachedFundingMonth(wallet, year, month);
    if (cached) {
      allRecords.push(...cached.records);
    }
  }

  // Filter to requested timeframe and deduplicate
  const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const filtered = allRecords.filter((r) => r.ts >= cutoffTs);
  const deduplicated = deduplicateFundingRecords(filtered);

  // Sort by timestamp (newest first)
  deduplicated.sort((a, b) => b.ts - a.ts);

  return deduplicated;
}

/**
 * Store records in the cache, organized by month
 * Merges with existing cached data
 */
export function storeRecords(
  wallet: string,
  records: DriftFundingPaymentRecord[]
): void {
  if (records.length === 0) return;

  // Group records by month
  const recordsByMonth = new Map<string, DriftFundingPaymentRecord[]>();

  for (const record of records) {
    const date = new Date(record.ts * 1000);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!recordsByMonth.has(key)) {
      recordsByMonth.set(key, []);
    }
    recordsByMonth.get(key)!.push(record);
  }

  // Store each month, merging with existing cache
  for (const [key, monthRecords] of recordsByMonth) {
    const [yearStr, monthStr] = key.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    // Merge with existing cache
    const existing = getCachedFundingMonth(wallet, year, month);
    const existingRecords = existing?.records || [];
    const allMonthRecords = [...existingRecords, ...monthRecords];
    const deduplicated = deduplicateFundingRecords(allMonthRecords);

    setCachedFundingMonth(wallet, year, month, deduplicated);
  }

  // Update day index
  const allSorted = [...records].sort((a, b) => b.ts - a.ts);
  if (allSorted.length > 0) {
    const existingIndex = getCachedDayIndex(wallet);
    const newestDate = new Date(allSorted[0].ts * 1000);
    const oldestDate = new Date(allSorted[allSorted.length - 1].ts * 1000);

    setCachedDayIndex(wallet, {
      lastFetchedDate: formatDateYYYYMMDD(newestDate),
      oldestCachedDate: existingIndex
        ? existingIndex.oldestCachedDate < formatDateYYYYMMDD(oldestDate)
          ? existingIndex.oldestCachedDate
          : formatDateYYYYMMDD(oldestDate)
        : formatDateYYYYMMDD(oldestDate),
      fetchedAt: Date.now(),
    });
  }
}

/**
 * Update the fetchedAt timestamp without adding new records
 * Used when we check for recent records but find none
 */
export function touchCacheTimestamp(wallet: string): void {
  const existingIndex = getCachedDayIndex(wallet);
  if (existingIndex) {
    setCachedDayIndex(wallet, {
      ...existingIndex,
      fetchedAt: Date.now(),
    });
  }
}

/**
 * Calculate what date range needs to be fetched based on cache state
 */
export interface FetchRange {
  startDate: Date;
  endDate: Date;
  needsFetch: "recent" | "historical" | "both" | "none";
}

export function getMissingDateRange(wallet: string, requestedDays: number): FetchRange {
  const now = new Date();
  const today = formatDateYYYYMMDD(now);
  const requestedStartDate = new Date(now);
  requestedStartDate.setDate(requestedStartDate.getDate() - requestedDays);
  const requestedStart = formatDateYYYYMMDD(requestedStartDate);

  const index = getCachedDayIndex(wallet);

  if (!index) {
    console.log("[CacheManager] 📭 No cache index found, need full fetch");
    return {
      startDate: requestedStartDate,
      endDate: now,
      needsFetch: "both",
    };
  }

  const staleDurationMs = Date.now() - index.fetchedAt;
  const staleDurationMin = staleDurationMs / 1000 / 60;
  const isStale = staleDurationMs > 5 * 60 * 1000;
  const hasToday = index.lastFetchedDate === today;
  const hasHistorical = index.oldestCachedDate <= requestedStart;

  console.log("[CacheManager] 📋 Cache index state:", {
    lastFetchedDate: index.lastFetchedDate,
    fetchedAt: new Date(index.fetchedAt).toLocaleString(),
    minutesSinceFetch: staleDurationMin.toFixed(1),
    isStale,
    hasToday,
    hasHistorical,
    today,
  });

  if (hasToday && !isStale && hasHistorical) {
    console.log("[CacheManager] ✅ Cache is fresh and complete");
    return {
      startDate: requestedStartDate,
      endDate: now,
      needsFetch: "none",
    };
  }

  if (!hasToday || isStale) {
    if (!hasHistorical) {
      console.log("[CacheManager] 🔄 Cache stale and missing historical, need full fetch");
      return {
        startDate: requestedStartDate,
        endDate: now,
        needsFetch: "both",
      };
    }
    console.log("[CacheManager] 🔄 Cache stale, need recent fetch only");
    const lastCachedDate = new Date(index.lastFetchedDate);
    return {
      startDate: lastCachedDate,
      endDate: now,
      needsFetch: "recent",
    };
  }

  console.log("[CacheManager] 🔄 Need historical fetch");
  const oldestCached = new Date(index.oldestCachedDate);
  return {
    startDate: requestedStartDate,
    endDate: oldestCached,
    needsFetch: "historical",
  };
}

/**
 * Get months that need fetching for extended timeframes
 */
export function getMonthsToFetch(
  wallet: string,
  days: number
): { year: number; month: number; needsFetch: boolean }[] {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);

  const months = getMonthsInRange(startDate, now);

  return months.map(({ year, month }) => {
    const cached = getCachedFundingMonth(wallet, year, month);
    const isCurrent = isCurrentMonth(year, month);
    const needsFetch = shouldRefreshMonth(cached, isCurrent);

    return { year, month, needsFetch };
  });
}

/**
 * Check if an extended timeframe has cached data that can be displayed
 * Returns true if getCachedRecords returns data for this timeframe
 */
export function isExtendedTimeframeCached(
  wallet: string,
  timeframe: "3M" | "6M" | "1Y"
): boolean {
  const daysMap = { "3M": 90, "6M": 180, "1Y": 365 };
  const days = daysMap[timeframe];
  const records = getCachedRecords(wallet, days);
  return records.length > 0;
}

/**
 * Get list of extended timeframes that have cached data to display
 */
export function getCachedExtendedTimeframes(
  wallet: string
): ("3M" | "6M" | "1Y")[] {
  const cached: ("3M" | "6M" | "1Y")[] = [];
  if (isExtendedTimeframeCached(wallet, "3M")) cached.push("3M");
  if (isExtendedTimeframeCached(wallet, "6M")) cached.push("6M");
  if (isExtendedTimeframeCached(wallet, "1Y")) cached.push("1Y");
  return cached;
}

/**
 * Select default timeframe based on cache state
 * For returning addresses with cached data
 */
export function selectDefaultTimeframe(cacheState: CacheState): "24H" | "7D" | "30D" | "3M" | "6M" | "1Y" {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  if (!cacheState.hasCache) {
    return "7D";
  }

  if (cacheState.newestCachedDate >= sevenDaysAgo) {
    return "7D";  // Has recent data
  }

  // Auto-select smallest timeframe with data
  const daysSinceNewest = (now - cacheState.newestCachedDate) / (24 * 60 * 60 * 1000);
  if (daysSinceNewest <= 30) return "30D";
  if (daysSinceNewest <= 90) return "3M";
  if (daysSinceNewest <= 180) return "6M";
  return "1Y";
}
