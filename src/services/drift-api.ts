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
  getCachedCandleMonth,
  setCachedCandleMonth,
  getMonthsInRange,
  isCurrentMonth,
  shouldRefreshMonth,
  getTimeframeDateRange,
} from "./cache-utils";

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
    const marketSymbol = symbol.replace("-PERP", "");
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
    const symbol = marketSymbol.replace("-PERP", "");
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
 * Fetch daily candles for multiple markets with caching
 * Only fetches candles for months where the market has activity
 */
export async function fetchMultipleDailyCandles(
  symbols: string[],
  days: number,
  marketMonths?: Map<string, { year: number; month: number }[]>
): Promise<Map<string, DailyCandleRecord[]>> {
  const resultMap = new Map<string, DailyCandleRecord[]>();
  const { startDate, endDate } = getTimeframeDateRange(days);
  const defaultMonths = getMonthsInRange(startDate, endDate);

  await Promise.all(
    symbols.map(async (symbol) => {
      const months = marketMonths?.get(symbol) ?? defaultMonths;

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

      // Calculate how many days of data we need
      const oldestMonth = months.reduce((oldest, m) => {
        const date = new Date(m.year, m.month - 1, 1);
        return date < oldest ? date : oldest;
      }, new Date());
      const daysNeeded =
        Math.ceil(
          (Date.now() - oldestMonth.getTime()) / (24 * 60 * 60 * 1000)
        ) + 31;

      // Fetch candles
      const candles = await fetchDailyCandles(
        symbol,
        Math.min(daysNeeded, days)
      );

      if (candles.length > 0) {
        // Group and cache by month
        const candlesByMonth = new Map<string, DailyCandleRecord[]>();
        for (const candle of candles) {
          const date = new Date(candle.ts * 1000);
          const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
          if (!candlesByMonth.has(key)) {
            candlesByMonth.set(key, []);
          }
          candlesByMonth.get(key)!.push(candle);
        }

        for (const [key, monthCandles] of candlesByMonth) {
          const [yearStr, monthStr] = key.split("-");
          setCachedCandleMonth(
            symbol,
            parseInt(yearStr),
            parseInt(monthStr),
            monthCandles
          );
        }

        const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
        resultMap.set(
          symbol,
          candles.filter((c) => c.ts >= cutoffTs)
        );
      } else {
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
