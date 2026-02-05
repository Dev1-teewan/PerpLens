/**
 * Drift Protocol API client
 * Core fetch functions for funding payments, prices, and user state
 *
 * Note: Higher-level fetching logic (incremental, extended, probe) is in funding-fetcher.ts
 */

import type {
  DriftFundingPaymentsResponse,
  DailyCandleRecord,
  DailyCandlesResponse,
  DriftUserResponse,
} from "./drift-types";
import {
  getCachedFundingMonth,
  setCachedFundingMonth,
  getCachedHourlyCandles,
  setCachedHourlyCandles,
  getCachedDailyCandles,
  setCachedDailyCandles,
  getTodayDateString,
  daysBetween,
  isCurrentMonth,
  shouldRefreshMonth,
  migrateOldCandleCaches,
} from "./cache-utils";

// Run migration on module load
migrateOldCandleCaches();

const DRIFT_API_BASE = "https://data.api.drift.trade";

const MAX_LOGGED_ERROR_KEYS = 100;
const loggedErrorKeys = new Set<string>();

function logOnce(key: string, message: string, ...args: unknown[]): void {
  if (loggedErrorKeys.has(key)) return;
  if (loggedErrorKeys.size >= MAX_LOGGED_ERROR_KEYS) loggedErrorKeys.clear();
  loggedErrorKeys.add(key);
  console.warn(message, ...args);
}

/** Message shown when API returns 403 or request is blocked (e.g. CORS). */
export const RATE_LIMIT_MESSAGE =
  "Too many requests. Please try again in a few minutes.";

function isRateLimitLike(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network") ||
      msg.includes("cors") ||
      msg.includes("403") ||
      msg.includes("forbidden")
    );
  }
  return false;
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

  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    if (isRateLimitLike(e)) {
      throw new Error(RATE_LIMIT_MESSAGE);
    }
    throw e;
  }

  if (response.status === 403) {
    throw new Error(RATE_LIMIT_MESSAGE);
  }
  if (!response.ok) {
    throw new Error(
      `Drift API error: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

/**
 * Fetch funding payments for a specific year and month.
 * Uses localStorage cache: returns cached data when valid and not stale.
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

  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    if (isRateLimitLike(e)) {
      throw new Error(RATE_LIMIT_MESSAGE);
    }
    throw e;
  }

  if (response.status === 403) {
    throw new Error(RATE_LIMIT_MESSAGE);
  }
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
 * Fetch current market price from candles API
 * Returns the oracleClose from the latest 1-minute candle
 */
export async function fetchMarketCandle(
  symbol: string
): Promise<number | null> {
  try {
    const marketSymbol = symbol.endsWith("-PERP") ? symbol : `${symbol}-PERP`;
    const url = `${DRIFT_API_BASE}/market/${marketSymbol}/candles/1?limit=1`;

    const response = await fetch(url);
    if (!response.ok) {
      logOnce(`candle-fail:${symbol}:${response.status}`, `Failed to fetch candle for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (
      data.success &&
      Array.isArray(data.records) &&
      data.records.length > 0
    ) {
      const latestCandle = data.records[0];
      const price = latestCandle.oracleClose ?? latestCandle.fillClose;
      if (typeof price === "number") {
        return price;
      }
    }

    logOnce(`no-price:${symbol}`, `No valid price found in response for ${symbol}`);
    return null;
  } catch (error) {
    logOnce(`candle-error:${symbol}`, `Error fetching candle for ${symbol}:`, error);
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

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const price = await fetchMarketCandle(symbol);
      return { symbol, price };
    })
  );

  for (const { symbol, price } of results) {
    if (price !== null) {
      priceMap.set(symbol, price);
    }
  }

  return priceMap;
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
    const symbol = marketSymbol.endsWith("-PERP") ? marketSymbol : `${marketSymbol}-PERP`;
    const url = `${DRIFT_API_BASE}/market/${symbol}/candles/D?limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      logOnce(`daily-fail:${symbol}:${response.status}`, `Failed to fetch daily candles for ${symbol}: ${response.status}`);
      return [];
    }

    const data: DailyCandlesResponse = await response.json();

    if (data.success && Array.isArray(data.records)) {
      return data.records;
    }

    return [];
  } catch (error) {
    logOnce(`daily-error:${marketSymbol}`, `Error fetching daily candles for ${marketSymbol}:`, error);
    return [];
  }
}

/**
 * Fetch hourly candles for a market (resolution=60 minutes)
 * Used for 24H heatmap to calculate hourly notional values
 * Fetches 48 hours by default to ensure coverage across timezones
 */
export async function fetchHourlyCandles(
  marketSymbol: string,
  limit: number = 48
): Promise<DailyCandleRecord[]> {
  try {
    const symbol = marketSymbol.endsWith("-PERP") ? marketSymbol : `${marketSymbol}-PERP`;
    const url = `${DRIFT_API_BASE}/market/${symbol}/candles/60?limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      logOnce(`hourly-fail:${symbol}:${response.status}`, `Failed to fetch hourly candles for ${symbol}: ${response.status}`);
      return [];
    }

    const data: DailyCandlesResponse = await response.json();

    if (data.success && Array.isArray(data.records)) {
      return data.records;
    }

    return [];
  } catch (error) {
    logOnce(`hourly-error:${marketSymbol}`, `Error fetching hourly candles for ${marketSymbol}:`, error);
    return [];
  }
}

/**
 * Fetch hourly candles for multiple markets with caching
 * Returns a map of market symbol -> hourly candle records
 */
export async function fetchMultipleHourlyCandles(
  symbols: string[]
): Promise<Map<string, DailyCandleRecord[]>> {
  const resultMap = new Map<string, DailyCandleRecord[]>();

  await Promise.all(
    symbols.map(async (symbol) => {
      // Check cache first
      const cached = getCachedHourlyCandles(symbol);
      if (cached) {
        resultMap.set(symbol, cached.records);
        return;
      }

      // Fetch fresh data (use default 48 hours for timezone coverage)
      const candles = await fetchHourlyCandles(symbol);
      if (candles.length > 0) {
        setCachedHourlyCandles(symbol, candles);
        resultMap.set(symbol, candles);
      } else {
        resultMap.set(symbol, []);
      }
    })
  );

  return resultMap;
}

/**
 * Fetch daily candles for multiple markets with simple caching
 * - First call: fetch 366 days and cache
 * - Subsequent calls: fetch only the diff (new days since last cached date)
 */
export async function fetchMultipleDailyCandles(
  symbols: string[]
): Promise<Map<string, DailyCandleRecord[]>> {
  const resultMap = new Map<string, DailyCandleRecord[]>();
  const today = getTodayDateString();

  await Promise.all(
    symbols.map(async (symbol) => {
      const cached = getCachedDailyCandles(symbol);

      if (cached && cached.lastDate === today) {
        // Cache is up to date, use it directly
        resultMap.set(symbol, cached.records);
        return;
      }

      if (cached && cached.records.length > 0) {
        // Cache exists but needs update - fetch only the diff
        const diffDays = daysBetween(cached.lastDate, today);

        if (diffDays > 0 && diffDays < 30) {
          // Fetch just the missing days (plus 1 for safety)
          const newCandles = await fetchDailyCandles(symbol, diffDays + 1);

          if (newCandles.length > 0) {
            // Merge: filter out old duplicates, add new candles
            const existingTs = new Set(cached.records.map((c) => c.ts));
            const uniqueNew = newCandles.filter((c) => !existingTs.has(c.ts));
            const merged = [...cached.records, ...uniqueNew];

            // Keep only last 366 days and sort by timestamp
            const cutoffTs = Math.floor(Date.now() / 1000) - 366 * 24 * 60 * 60;
            const filtered = merged
              .filter((c) => c.ts >= cutoffTs)
              .sort((a, b) => a.ts - b.ts);

            setCachedDailyCandles(symbol, filtered, today);
            resultMap.set(symbol, filtered);
            return;
          }
        }
      }

      // No cache or cache too old - fetch full 366 days
      const candles = await fetchDailyCandles(symbol, 366);

      if (candles.length > 0) {
        const sorted = [...candles].sort((a, b) => a.ts - b.ts);
        setCachedDailyCandles(symbol, sorted, today);
        resultMap.set(symbol, sorted);
      } else {
        resultMap.set(symbol, cached?.records ?? []);
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

    return data;
  } catch (error) {
    console.warn(`Error fetching user state for ${accountId}:`, error);
    return null;
  }
}
