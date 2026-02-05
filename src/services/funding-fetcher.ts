/**
 * Clean funding data fetcher with milestone callbacks
 * Handles incremental fetching with clear state transitions
 */

import type { DriftFundingPaymentRecord } from "./drift-types";
import type { Timeframe, LoadingProgress } from "@/types/loading-types";
import { getTimeframeDays } from "@/types/loading-types";
import {
  fetchFundingPayments,
  fetchFundingPaymentsByMonth,
} from "./drift-api";
import {
  getCachedRecords,
  storeRecords,
  getMissingDateRange,
} from "./cache-manager";
import { getMonthsInRange, isCurrentMonth, shouldRefreshMonth, getCachedFundingMonth, setCachedFundingMonth } from "./cache-utils";

/**
 * Callbacks for fetch progress and milestones
 */
export interface FetchCallbacks {
  onMilestone: (milestone: "7d" | "14d" | "30d") => void;
  onRecords: (records: DriftFundingPaymentRecord[], totalDaysLoaded: number) => void;
  onProgress?: (progress: LoadingProgress) => void;
  onComplete: (records: DriftFundingPaymentRecord[]) => void;
  onError: (error: Error) => void;
  onCacheHit?: () => void;
}

/**
 * Deduplicate funding records by txSig and txSigIndex
 */
function deduplicateRecords(
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
 * Calculate days covered by records
 */
function getDaysCovered(records: DriftFundingPaymentRecord[]): number {
  if (records.length === 0) return 0;
  const now = Math.floor(Date.now() / 1000);
  const oldest = Math.min(...records.map((r) => r.ts));
  return Math.ceil((now - oldest) / (24 * 60 * 60));
}

/**
 * Fetch funding data incrementally with milestone callbacks
 * Fetches up to 30 days, triggering milestones at 7d, 14d, and 30d
 */
export async function fetchFundingIncremental(
  wallet: string,
  callbacks: FetchCallbacks,
  signal?: AbortSignal
): Promise<DriftFundingPaymentRecord[]> {
  const { onMilestone, onRecords, onComplete, onError, onCacheHit } = callbacks;

  try {
    // Check cache state
    const { needsFetch } = getMissingDateRange(wallet, 30);

    // Get any cached records
    const cachedRecords = getCachedRecords(wallet, 30);
    const cachedDays = getDaysCovered(cachedRecords);

    // If cache is complete, return immediately
    if (needsFetch === "none") {
      onCacheHit?.();

      // Trigger milestones based on cached data
      if (cachedDays >= 7) onMilestone("7d");
      if (cachedDays >= 14) onMilestone("14d");
      // Always trigger 30d milestone when initial fetch is complete to start extended fetch
      onMilestone("30d");

      onRecords(cachedRecords, cachedDays);
      onComplete(cachedRecords);
      return cachedRecords;
    }

    // If we have significant cache, provide initial load
    if (cachedDays >= 7) {
      onCacheHit?.();
      onMilestone("7d");
      if (cachedDays >= 14) onMilestone("14d");
      onRecords(cachedRecords, cachedDays);
    }

    // Fetch missing data
    const allRecords: DriftFundingPaymentRecord[] = [...cachedRecords];
    const fetchedRecords: DriftFundingPaymentRecord[] = [];

    let nextPage: string | undefined = undefined;
    const now = Math.floor(Date.now() / 1000);
    const thirtyDayCutoff = now - 30 * 24 * 60 * 60;

    let triggered7d = cachedDays >= 7;
    let triggered14d = cachedDays >= 14;
    let triggered30d = cachedDays >= 30;

    do {
      if (signal?.aborted) {
        throw new Error("Fetch aborted");
      }

      const response = await fetchFundingPayments(wallet, nextPage);

      if (response.success && response.records) {
        fetchedRecords.push(...response.records);

        // Merge and deduplicate
        const merged = deduplicateRecords([...allRecords, ...response.records]);
        allRecords.length = 0;
        allRecords.push(...merged);

        const daysCovered = getDaysCovered(allRecords);

        // Check milestones
        if (!triggered7d && daysCovered >= 7) {
          triggered7d = true;
          onMilestone("7d");
          onRecords(allRecords, daysCovered);
        }

        if (!triggered14d && daysCovered >= 14) {
          triggered14d = true;
          onMilestone("14d");
        }

        // Check if oldest record is beyond 30 days
        const oldestRecord = response.records[response.records.length - 1];
        if (oldestRecord && oldestRecord.ts < thirtyDayCutoff) {
          break;
        }
      }

      nextPage = response.meta?.nextPage;
    } while (nextPage);

    // Store fetched records in cache
    if (fetchedRecords.length > 0) {
      storeRecords(wallet, fetchedRecords);
    }

    // Final filtering and deduplication
    const finalRecords = deduplicateRecords(allRecords);
    finalRecords.sort((a, b) => b.ts - a.ts);

    const finalDays = getDaysCovered(finalRecords);

    // Trigger 30d milestone when initial fetch is complete and we have at least one record
    // When finalRecords is empty the caller handles transition in onComplete
    if (!triggered30d && finalRecords.length > 0) {
      console.log(`[Fetcher] Triggering 30d milestone, finalDays: ${finalDays}`);
      onMilestone("30d");
    }

    // If we never triggered 7d (very short history), do it now
    if (!triggered7d) {
      onMilestone("7d");
      onRecords(finalRecords, finalDays);
    }

    onRecords(finalRecords, finalDays);
    onComplete(finalRecords);

    return finalRecords;
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

/**
 * Fetch extended timeframe data (3M, 6M, 1Y)
 * Uses monthly endpoint with caching
 */
export async function fetchExtendedTimeframe(
  wallet: string,
  timeframe: Timeframe,
  callbacks: Omit<FetchCallbacks, "onMilestone">,
  signal?: AbortSignal
): Promise<DriftFundingPaymentRecord[]> {
  const { onRecords, onProgress, onComplete, onError } = callbacks;
  const days = getTimeframeDays(timeframe);

  try {
    // Get months to fetch
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    const months = getMonthsInRange(startDate, now);
    const monthsReversed = [...months].reverse();
    const totalMonths = monthsReversed.length;

    const allRecords: DriftFundingPaymentRecord[] = [];
    const cachedRecords: DriftFundingPaymentRecord[] = [];
    const monthsNeedingFetch: { year: number; month: number }[] = [];

    // Check cache for all months
    onProgress?.({ loadedMonths: 0, totalMonths, phase: "cache" });

    for (const { year, month } of monthsReversed) {
      if (signal?.aborted) throw new Error("Fetch aborted");

      const cached = getCachedFundingMonth(wallet, year, month);
      const isCurrent = isCurrentMonth(year, month);

      if (cached && !shouldRefreshMonth(cached, isCurrent)) {
        cachedRecords.push(...cached.records);
      } else {
        monthsNeedingFetch.push({ year, month });
      }
    }

    // Provide cached data immediately if available
    if (cachedRecords.length > 0) {
      const daysCovered = getDaysCovered(cachedRecords);
      onRecords(cachedRecords, daysCovered);
      allRecords.push(...cachedRecords);
    }

    // Fetch missing months
    if (monthsNeedingFetch.length > 0) {
      const BATCH_SIZE = 3;
      let fetchedCount = totalMonths - monthsNeedingFetch.length;

      onProgress?.({
        loadedMonths: fetchedCount,
        totalMonths,
        phase: "fetch",
      });

      for (let i = 0; i < monthsNeedingFetch.length; i += BATCH_SIZE) {
        if (signal?.aborted) throw new Error("Fetch aborted");

        const batch = monthsNeedingFetch.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async ({ year, month }) => {
            try {
              const response = await fetchFundingPaymentsByMonth(wallet, year, month);
              if (response.success && response.records) {
                setCachedFundingMonth(wallet, year, month, response.records);
                return response.records;
              }
              return [];
            } catch (error) {
              console.warn(`Failed to fetch month ${year}-${month}:`, error);
              return [];
            }
          })
        );

        for (const records of batchResults) {
          allRecords.push(...records);
        }

        fetchedCount += batch.length;
        onProgress?.({
          loadedMonths: fetchedCount,
          totalMonths,
          phase: fetchedCount === totalMonths ? "complete" : "fetch",
        });

        // Provide incremental update
        const daysCovered = getDaysCovered(allRecords);
        onRecords(allRecords, daysCovered);
      }
    }

    // Filter and sort
    const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    const filteredRecords = allRecords.filter((r) => r.ts >= cutoffTs);
    const deduplicated = deduplicateRecords(filteredRecords);
    deduplicated.sort((a, b) => b.ts - a.ts);

    onProgress?.({ loadedMonths: totalMonths, totalMonths, phase: "complete" });
    onComplete(deduplicated);

    return deduplicated;
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

/**
 * Probe last 12 months to find any history
 * Used when 30-day fetch returns empty
 */
export async function fetchProbe12Months(
  wallet: string,
  callbacks: {
    onProgress?: (loaded: number, total: number) => void;
    onComplete: (records: DriftFundingPaymentRecord[]) => void;
    onError: (error: Error) => void;
  },
  signal?: AbortSignal
): Promise<DriftFundingPaymentRecord[]> {
  const { onProgress, onComplete, onError } = callbacks;

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 365);

    const months = getMonthsInRange(startDate, now);
    const monthsReversed = [...months].reverse();
    const totalMonths = Math.min(12, monthsReversed.length);
    const toFetch = monthsReversed.slice(0, totalMonths);

    const allRecords: DriftFundingPaymentRecord[] = [];
    const BATCH_SIZE = 3;

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      if (signal?.aborted) throw new Error("Fetch aborted");

      const batch = toFetch.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async ({ year, month }) => {
          try {
            const response = await fetchFundingPaymentsByMonth(wallet, year, month);
            if (response.success && response.records && response.records.length > 0) {
              setCachedFundingMonth(wallet, year, month, response.records);
              return response.records;
            }
            if (response.success && response.records) {
              setCachedFundingMonth(wallet, year, month, []);
            }
            return [];
          } catch (error) {
            console.warn(`Probe failed for ${year}-${month}:`, error);
            throw error;
          }
        })
      );

      for (const records of batchResults) {
        allRecords.push(...records);
      }

      onProgress?.(Math.min(i + batch.length, totalMonths), totalMonths);
    }

    const deduplicated = deduplicateRecords(allRecords);
    deduplicated.sort((a, b) => b.ts - a.ts);

    onComplete(deduplicated);
    return deduplicated;
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}
