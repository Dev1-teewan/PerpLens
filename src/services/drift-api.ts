import type {
  DriftFundingPaymentsResponse,
  DriftFundingPaymentRecord,
  DailyCandleRecord,
  DailyCandlesResponse,
  DriftUserResponse,
} from "./drift-types";
import {
  getCachedFundingMonth,
  setCachedFundingMonth,
  getCachedCandleMonth,
  setCachedCandleMonth,
  getMonthsInRange,
  isCurrentMonth,
  shouldRefreshMonth,
  getTimeframeDateRange,
  setCachedDayIndex,
  getMissingDateRange,
  formatDateYYYYMMDD,
} from "./cache-utils";

const DRIFT_API_BASE = "https://data.api.drift.trade";

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
 * Fetch funding payments for a user address (general endpoint, with pagination)
 */
export async function fetchFundingPayments(
  userAddress: string,
  nextPage?: string
): Promise<DriftFundingPaymentsResponse> {
  const url = nextPage
    ? `${DRIFT_API_BASE}/user/${userAddress}/fundingPayments?page=${encodeURIComponent(
        nextPage
      )}`
    : `${DRIFT_API_BASE}/user/${userAddress}/fundingPayments`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Drift API error: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

/**
 * Fetch funding payments for a specific year and month.
 * Uses localStorage cache: returns cached data when valid and not stale; writes to cache after a successful fetch.
 */
export async function fetchFundingPaymentsByMonth(
  userAddress: string,
  year: number,
  month: number
): Promise<DriftFundingPaymentsResponse> {
  const cached = getCachedFundingMonth(userAddress, year, month);
  const isCurrent = isCurrentMonth(year, month);
  if (cached && !shouldRefreshMonth(cached, isCurrent)) {
    return { success: true, records: cached.records, meta: {} };
  }

  const url = `${DRIFT_API_BASE}/user/${userAddress}/fundingPayments/${year}/${month}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Drift API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  if (data.success && data.records) {
    setCachedFundingMonth(userAddress, year, month, data.records);
  }
  return data;
}

/**
 * Fetch funding payment records with progressive loading.
 * Calls onProgress when initial days are loaded, continues fetching until maxDays.
 * Stops when records are older than maxDays or no more pages.
 */
export async function fetchFundingPaymentsProgressive(
  userAddress: string,
  options: {
    initialDays?: number; // Days to fetch before first callback (default: 7)
    maxDays?: number; // Max days to fetch (default: 30)
    onInitialLoad?: (records: DriftFundingPaymentRecord[]) => void;
    onComplete?: (records: DriftFundingPaymentRecord[]) => void;
  } = {}
): Promise<DriftFundingPaymentRecord[]> {
  const { initialDays = 7, maxDays = 30, onInitialLoad, onComplete } = options;

  const allRecords: DriftFundingPaymentRecord[] = [];
  let nextPage: string | undefined = undefined;

  const now = Math.floor(Date.now() / 1000);
  const initialCutoff = now - initialDays * 24 * 60 * 60;
  const maxCutoff = now - maxDays * 24 * 60 * 60;

  let initialLoadTriggered = false;

  do {
    const response = await fetchFundingPayments(userAddress, nextPage);

    if (response.success && response.records) {
      allRecords.push(...response.records);

      // Check if we've loaded enough for initial display
      if (!initialLoadTriggered) {
        const oldestRecord = response.records[response.records.length - 1];
        if (oldestRecord && oldestRecord.ts <= initialCutoff) {
          initialLoadTriggered = true;
          // Filter to only initial days and call callback
          const initialRecords = allRecords.filter(
            (r) => r.ts >= initialCutoff
          );
          onInitialLoad?.(initialRecords);
        }
      }

      // Check if oldest record is beyond maxDays cutoff
      const oldestRecord = response.records[response.records.length - 1];
      if (oldestRecord && oldestRecord.ts < maxCutoff) {
        // Filter out records older than maxDays and stop
        const filteredRecords = allRecords.filter((r) => r.ts >= maxCutoff);
        onComplete?.(filteredRecords);
        return filteredRecords;
      }
    }

    nextPage = response.meta?.nextPage;
  } while (nextPage);

  // If we finished without hitting maxDays cutoff, trigger callbacks
  if (!initialLoadTriggered) {
    onInitialLoad?.(allRecords);
  }

  // Filter to maxDays just in case
  const filteredRecords = allRecords.filter((r) => r.ts >= maxCutoff);
  onComplete?.(filteredRecords);
  return filteredRecords;
}

/**
 * Simple fetch for all records up to maxDays (non-progressive)
 */
export async function fetchAllRecentFundingPayments(
  userAddress: string,
  maxDays: number = 30
): Promise<DriftFundingPaymentRecord[]> {
  const allRecords: DriftFundingPaymentRecord[] = [];
  let nextPage: string | undefined = undefined;

  const now = Math.floor(Date.now() / 1000);
  const cutoffTs = now - maxDays * 24 * 60 * 60;

  do {
    const response = await fetchFundingPayments(userAddress, nextPage);

    if (response.success && response.records) {
      allRecords.push(...response.records);

      // Check if oldest record is beyond cutoff
      const oldestRecord = response.records[response.records.length - 1];
      if (oldestRecord && oldestRecord.ts < cutoffTs) {
        break;
      }
    }

    nextPage = response.meta?.nextPage;
  } while (nextPage);

  // Filter to only records within maxDays
  return allRecords.filter((r) => r.ts >= cutoffTs);
}

/**
 * Fetch funding payments with incremental caching
 * Only fetches missing data, reuses cached historical data
 */
export async function fetchFundingPaymentsIncremental(
  userAddress: string,
  days: number,
  options: {
    onInitialLoad?: (records: DriftFundingPaymentRecord[]) => void;
    onComplete?: (records: DriftFundingPaymentRecord[]) => void;
    onCacheHit?: () => void;
  } = {}
): Promise<DriftFundingPaymentRecord[]> {
  const { onInitialLoad, onComplete, onCacheHit } = options;

  // Check what needs to be fetched
  const { needsFetch, startDate, endDate } = getMissingDateRange(
    userAddress,
    days
  );

  // Get all cached records for this timeframe from monthly cache
  const { startDate: tfStart, endDate: tfEnd } = getTimeframeDateRange(days);
  const months = getMonthsInRange(tfStart, tfEnd);
  const cachedRecords: DriftFundingPaymentRecord[] = [];

  for (const { year, month } of months) {
    const cached = getCachedFundingMonth(userAddress, year, month);
    if (cached) {
      cachedRecords.push(...cached.records);
    }
  }

  // If no fetch needed, return cached data immediately
  if (needsFetch === "none") {
    onCacheHit?.();
    const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    const filtered = cachedRecords.filter((r) => r.ts >= cutoffTs);
    filtered.sort((a, b) => b.ts - a.ts);
    onInitialLoad?.(filtered);
    onComplete?.(filtered);
    return filtered;
  }

  // Track if initial load has been triggered
  let initialLoadTriggered = false;
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysCutoff = now - 7 * 24 * 60 * 60; // 7 days ago

  // If we have cached data covering 7 days, provide initial load immediately
  if (cachedRecords.length > 0) {
    const cutoffTs = now - days * 24 * 60 * 60;
    const filtered = cachedRecords.filter((r) => r.ts >= cutoffTs);
    filtered.sort((a, b) => b.ts - a.ts);

    // Check if cached data covers at least 7 days
    const oldestCached =
      filtered.length > 0 ? filtered[filtered.length - 1].ts : now;
    if (oldestCached <= sevenDaysCutoff) {
      onInitialLoad?.(filtered);
      initialLoadTriggered = true;
    }
  }

  // Fetch missing data
  const fetchedRecords: DriftFundingPaymentRecord[] = [];
  const startTs = Math.floor(startDate.getTime() / 1000);
  const endTs = Math.floor(endDate.getTime() / 1000);

  let nextPage: string | undefined = undefined;

  do {
    const response = await fetchFundingPayments(userAddress, nextPage);

    if (response.success && response.records) {
      // Filter to only records in the missing range
      const relevantRecords = response.records.filter(
        (r) => r.ts >= startTs && r.ts <= endTs
      );
      fetchedRecords.push(...relevantRecords);

      // Trigger initial load once we have 7 days of data
      if (!initialLoadTriggered && fetchedRecords.length > 0) {
        const allRecords = [...cachedRecords, ...fetchedRecords];
        allRecords.sort((a, b) => b.ts - a.ts);
        const oldestRecord = allRecords[allRecords.length - 1];

        // Check if we have at least 7 days of data
        if (oldestRecord && oldestRecord.ts <= sevenDaysCutoff) {
          initialLoadTriggered = true;
          onInitialLoad?.(allRecords);
        }
      }

      // Check if oldest record is beyond our start date
      const oldestRecord = response.records[response.records.length - 1];
      if (oldestRecord && oldestRecord.ts < startTs) {
        break;
      }
    }

    nextPage = response.meta?.nextPage;
  } while (nextPage);

  // If initial load wasn't triggered (less than 7 days of data), trigger it now with all available data
  if (
    !initialLoadTriggered &&
    (cachedRecords.length > 0 || fetchedRecords.length > 0)
  ) {
    const allRecords = [...cachedRecords, ...fetchedRecords];
    allRecords.sort((a, b) => b.ts - a.ts);
    onInitialLoad?.(allRecords);
  }

  // Cache the fetched records by month
  const recordsByMonth = new Map<string, DriftFundingPaymentRecord[]>();
  for (const record of fetchedRecords) {
    const date = new Date(record.ts * 1000);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!recordsByMonth.has(key)) {
      recordsByMonth.set(key, []);
    }
    recordsByMonth.get(key)!.push(record);
  }

  for (const [key, records] of recordsByMonth) {
    const [yearStr, monthStr] = key.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    // Merge with existing cache for this month
    const existing = getCachedFundingMonth(userAddress, year, month);
    const existingRecords = existing?.records || [];

    // Deduplicate by txSig
    const allMonthRecords = [...existingRecords, ...records];
    const deduplicated = deduplicateFundingRecords(allMonthRecords);

    setCachedFundingMonth(userAddress, year, month, deduplicated);
  }

  // Merge cached and fetched records
  const allRecords = [...cachedRecords, ...fetchedRecords];

  // Deduplicate by txSig
  const deduplicated = deduplicateFundingRecords(allRecords);

  // Filter to requested timeframe and sort
  const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const filtered = deduplicated.filter((r) => r.ts >= cutoffTs);
  filtered.sort((a, b) => b.ts - a.ts);

  // Update day index
  if (filtered.length > 0) {
    const newestDate = new Date(filtered[0].ts * 1000);
    const oldestDate = new Date(filtered[filtered.length - 1].ts * 1000);
    setCachedDayIndex(userAddress, {
      lastFetchedDate: formatDateYYYYMMDD(newestDate),
      oldestCachedDate: formatDateYYYYMMDD(oldestDate),
      fetchedAt: Date.now(),
    });
  }

  onComplete?.(filtered);
  return filtered;
}

/**
 * Fetch current market price from candles API
 * Returns the oracleClose from the latest 1-minute candle
 */
export async function fetchMarketCandle(
  symbol: string
): Promise<number | null> {
  try {
    // Remove "-PERP" suffix if present
    const marketSymbol = symbol.replace("-PERP", "");
    const url = `${DRIFT_API_BASE}/market/${marketSymbol}/candles/1?limit=1`;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch candle for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // API returns { success: true, records: [...] }
    if (
      data.success &&
      Array.isArray(data.records) &&
      data.records.length > 0
    ) {
      const latestCandle = data.records[0];
      // Use oracleClose if available, otherwise fall back to fillClose
      const price = latestCandle.oracleClose ?? latestCandle.fillClose;
      if (typeof price === "number") {
        return price;
      }
    }

    console.warn(`No valid price found in response for ${symbol}`);
    return null;
  } catch (error) {
    console.warn(`Error fetching candle for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch current prices for multiple markets in parallel
 * Returns a Map of symbol -> price
 */
export async function fetchMultipleMarketPrices(
  symbols: string[]
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  // Fetch all prices in parallel
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const price = await fetchMarketCandle(symbol);
      return { symbol, price };
    })
  );

  // Populate the map with successful results
  for (const { symbol, price } of results) {
    if (price !== null) {
      priceMap.set(symbol, price);
    }
  }

  return priceMap;
}

/**
 * Fetch historical data for specific months
 * Useful for backfilling data
 */
export async function fetchHistoricalData(
  userAddress: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): Promise<DriftFundingPaymentRecord[]> {
  const allRecords: DriftFundingPaymentRecord[] = [];

  let currentYear = startYear;
  let currentMonth = startMonth;

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    const response = await fetchFundingPaymentsByMonth(
      userAddress,
      currentYear,
      currentMonth
    );

    if (response.success && response.records) {
      allRecords.push(...response.records);
    }

    // Move to next month
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return allRecords;
}

/**
 * Loading state for extended timeframe fetching
 */
export interface ExtendedLoadingState {
  loadedMonths: number;
  totalMonths: number;
  phase: "cache" | "fetch" | "complete";
}

/**
 * Fetch funding payments for extended timeframes (3M/6M/1Y) with caching
 * Uses monthly endpoint with localStorage caching
 */
export async function fetchFundingPaymentsExtended(
  userAddress: string,
  days: number,
  options: {
    onProgress?: (state: ExtendedLoadingState) => void;
    onInitialLoad?: (records: DriftFundingPaymentRecord[]) => void;
    onComplete?: (records: DriftFundingPaymentRecord[]) => void;
  } = {}
): Promise<DriftFundingPaymentRecord[]> {
  const { onProgress, onInitialLoad, onComplete } = options;

  // Get the date range and months to fetch
  const { startDate, endDate } = getTimeframeDateRange(days);
  const months = getMonthsInRange(startDate, endDate);

  // Reverse to fetch most recent first
  const monthsToFetch = [...months].reverse();
  const totalMonths = monthsToFetch.length;

  const allRecords: DriftFundingPaymentRecord[] = [];
  const cachedRecords: DriftFundingPaymentRecord[] = [];
  const monthsNeedingFetch: { year: number; month: number }[] = [];

  // Phase 1: Check cache for all months
  onProgress?.({ loadedMonths: 0, totalMonths, phase: "cache" });

  for (const { year, month } of monthsToFetch) {
    const cached = getCachedFundingMonth(userAddress, year, month);
    const isCurrent = isCurrentMonth(year, month);

    if (cached && !shouldRefreshMonth(cached, isCurrent)) {
      cachedRecords.push(...cached.records);
    } else {
      monthsNeedingFetch.push({ year, month });
    }
  }

  // If we have cached data, provide initial load immediately
  if (cachedRecords.length > 0) {
    allRecords.push(...cachedRecords);
    onInitialLoad?.(allRecords);
  }

  // Phase 2: Fetch missing months
  if (monthsNeedingFetch.length > 0) {
    onProgress?.({
      loadedMonths: totalMonths - monthsNeedingFetch.length,
      totalMonths,
      phase: "fetch",
    });

    // Fetch in batches of 3 for parallelism
    const BATCH_SIZE = 3;
    let fetchedCount = totalMonths - monthsNeedingFetch.length;

    for (let i = 0; i < monthsNeedingFetch.length; i += BATCH_SIZE) {
      const batch = monthsNeedingFetch.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async ({ year, month }) => {
          try {
            const response = await fetchFundingPaymentsByMonth(
              userAddress,
              year,
              month
            );
            if (response.success && response.records) {
              // Cache the results
              setCachedFundingMonth(userAddress, year, month, response.records);
              return response.records;
            }
            return [];
          } catch (error) {
            console.warn(`Failed to fetch month ${year}-${month}:`, error);
            return [];
          }
        })
      );

      // Add batch results to all records
      for (const records of batchResults) {
        allRecords.push(...records);
      }

      fetchedCount += batch.length;
      onProgress?.({
        loadedMonths: fetchedCount,
        totalMonths,
        phase: fetchedCount === totalMonths ? "complete" : "fetch",
      });

      // After first batch, trigger initial load if not already done
      if (i === 0 && cachedRecords.length === 0) {
        onInitialLoad?.(allRecords);
      }
    }
  }

  // Filter records to only those within the timeframe
  const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const filteredRecords = allRecords.filter((r) => r.ts >= cutoffTs);

  // Sort by timestamp (newest first)
  filteredRecords.sort((a, b) => b.ts - a.ts);

  onProgress?.({ loadedMonths: totalMonths, totalMonths, phase: "complete" });
  onComplete?.(filteredRecords);

  return filteredRecords;
}

/**
 * Probe last 12 months via year/month API to find any history.
 * Used when the general 30-day endpoint returns empty, to distinguish
 * "wrong address" from "valid address with no recent activity".
 * Caches each month so future 1Y view can reuse. Returns [] only if
 * all 12 months return no records.
 */
export async function fetchFundingPaymentsProbe12Months(
  userAddress: string,
  options: {
    onProgress?: (loadedMonths: number, totalMonths: number) => void;
  } = {}
): Promise<DriftFundingPaymentRecord[]> {
  const { onProgress } = options;
  const { startDate, endDate } = getTimeframeDateRange(365);
  const months = getMonthsInRange(startDate, endDate);
  const monthsToFetch = [...months].reverse();
  const totalMonths = Math.min(12, monthsToFetch.length);
  const toFetch = monthsToFetch.slice(0, totalMonths);

  const allRecords: DriftFundingPaymentRecord[] = [];
  const BATCH_SIZE = 3;

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ({ year, month }) => {
        try {
          const response = await fetchFundingPaymentsByMonth(
            userAddress,
            year,
            month
          );
          if (
            response.success &&
            response.records &&
            response.records.length > 0
          ) {
            setCachedFundingMonth(userAddress, year, month, response.records);
            return response.records;
          }
          if (response.success && response.records) {
            setCachedFundingMonth(userAddress, year, month, []);
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

  const deduplicated = deduplicateFundingRecords(allRecords);
  deduplicated.sort((a, b) => b.ts - a.ts);
  return deduplicated;
}

/**
 * Fetch daily candles for a market
 * Returns daily OHLC data for price calculations
 */
export async function fetchDailyCandles(
  marketSymbol: string,
  limit: number = 365
): Promise<DailyCandleRecord[]> {
  try {
    // Remove "-PERP" suffix if present
    const symbol = marketSymbol.replace("-PERP", "");
    const url = `${DRIFT_API_BASE}/market/${symbol}/candles/D?limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(
        `Failed to fetch daily candles for ${symbol}: ${response.status}`
      );
      return [];
    }

    const data: DailyCandlesResponse = await response.json();

    if (data.success && Array.isArray(data.records)) {
      return data.records;
    }

    return [];
  } catch (error) {
    console.warn(`Error fetching daily candles for ${marketSymbol}:`, error);
    return [];
  }
}

/**
 * Fetch daily candles for multiple markets with caching
 * Only fetches candles for months where the market has activity (based on marketMonths)
 */
export async function fetchMultipleDailyCandles(
  symbols: string[],
  days: number,
  marketMonths?: Map<string, { year: number; month: number }[]>
): Promise<Map<string, DailyCandleRecord[]>> {
  const resultMap = new Map<string, DailyCandleRecord[]>();
  const { startDate, endDate } = getTimeframeDateRange(days);
  const defaultMonths = getMonthsInRange(startDate, endDate);

  // For each symbol, check cache and fetch if needed
  await Promise.all(
    symbols.map(async (symbol) => {
      // Use market-specific months if provided, otherwise fall back to default range
      const months = marketMonths?.get(symbol) ?? defaultMonths;

      // Skip if no months with activity for this market
      if (months.length === 0) {
        resultMap.set(symbol, []);
        return;
      }

      const allCandles: DailyCandleRecord[] = [];
      const monthsNeedingFetch: { year: number; month: number }[] = [];

      // Check cache for each month
      for (const { year, month } of months) {
        const cached = getCachedCandleMonth(symbol, year, month);
        const isCurrent = isCurrentMonth(year, month);

        if (cached && !shouldRefreshMonth(cached, isCurrent)) {
          allCandles.push(...cached.records);
        } else {
          monthsNeedingFetch.push({ year, month });
        }
      }

      // If all months are cached, use cached data
      if (monthsNeedingFetch.length === 0) {
        resultMap.set(symbol, allCandles);
        return;
      }

      // Calculate how many days of data we actually need
      const oldestMonth = months.reduce((oldest, m) => {
        const date = new Date(m.year, m.month - 1, 1);
        return date < oldest ? date : oldest;
      }, new Date());
      const daysNeeded =
        Math.ceil(
          (Date.now() - oldestMonth.getTime()) / (24 * 60 * 60 * 1000)
        ) + 31;

      // Fetch candles for this symbol
      const candles = await fetchDailyCandles(
        symbol,
        Math.min(daysNeeded, days)
      );

      if (candles.length > 0) {
        // Group candles by month and cache each month
        const candlesByMonth = new Map<string, DailyCandleRecord[]>();
        for (const candle of candles) {
          const date = new Date(candle.ts * 1000);
          const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
          if (!candlesByMonth.has(key)) {
            candlesByMonth.set(key, []);
          }
          candlesByMonth.get(key)!.push(candle);
        }

        // Cache each month
        for (const [key, monthCandles] of candlesByMonth) {
          const [yearStr, monthStr] = key.split("-");
          const year = parseInt(yearStr);
          const month = parseInt(monthStr);
          setCachedCandleMonth(symbol, year, month, monthCandles);
        }

        // Combine cached and fetched candles, filter to timeframe
        const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
        const filteredCandles = candles.filter((c) => c.ts >= cutoffTs);
        resultMap.set(symbol, filteredCandles);
      } else {
        // If fetch failed, still return any cached data
        resultMap.set(symbol, allCandles);
      }
    })
  );

  return resultMap;
}

/**
 * Fetch user account state including positions, balances, and orders
 */
export async function fetchUserState(
  accountId: string
): Promise<DriftUserResponse | null> {
  try {
    const url = `${DRIFT_API_BASE}/user/${accountId}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`User account not found: ${accountId}`);
        return null;
      }
      throw new Error(
        `Drift API error: ${response.status} ${response.statusText}`
      );
    }

    const data: DriftUserResponse = await response.json();

    if (!data.success) {
      console.warn(`Failed to fetch user state for ${accountId}`);
      return null;
    }

    return data;
  } catch (error) {
    console.warn(`Error fetching user state for ${accountId}:`, error);
    return null;
  }
}
