import type { DriftFundingPaymentsResponse, DriftFundingPaymentRecord } from "./drift-types";

const DRIFT_API_BASE = "https://data.api.drift.trade";

/**
 * Fetch funding payments for a user address (general endpoint, with pagination)
 */
export async function fetchFundingPayments(
  userAddress: string,
  nextPage?: string
): Promise<DriftFundingPaymentsResponse> {
  const url = nextPage
    ? `${DRIFT_API_BASE}/user/${userAddress}/fundingPayments?page=${encodeURIComponent(nextPage)}`
    : `${DRIFT_API_BASE}/user/${userAddress}/fundingPayments`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Drift API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch funding payments for a specific year and month
 */
export async function fetchFundingPaymentsByMonth(
  userAddress: string,
  year: number,
  month: number
): Promise<DriftFundingPaymentsResponse> {
  const url = `${DRIFT_API_BASE}/user/${userAddress}/fundingPayments/${year}/${month}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Drift API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch funding payment records with progressive loading.
 * Calls onProgress when initial days are loaded, continues fetching until maxDays.
 * Stops when records are older than maxDays or no more pages.
 */
export async function fetchFundingPaymentsProgressive(
  userAddress: string,
  options: {
    initialDays?: number;  // Days to fetch before first callback (default: 7)
    maxDays?: number;      // Max days to fetch (default: 30)
    onInitialLoad?: (records: DriftFundingPaymentRecord[]) => void;
    onComplete?: (records: DriftFundingPaymentRecord[]) => void;
  } = {}
): Promise<DriftFundingPaymentRecord[]> {
  const {
    initialDays = 7,
    maxDays = 30,
    onInitialLoad,
    onComplete
  } = options;

  const allRecords: DriftFundingPaymentRecord[] = [];
  let nextPage: string | undefined = undefined;

  const now = Math.floor(Date.now() / 1000);
  const initialCutoff = now - (initialDays * 24 * 60 * 60);
  const maxCutoff = now - (maxDays * 24 * 60 * 60);

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
          const initialRecords = allRecords.filter(r => r.ts >= initialCutoff);
          onInitialLoad?.(initialRecords);
        }
      }

      // Check if oldest record is beyond maxDays cutoff
      const oldestRecord = response.records[response.records.length - 1];
      if (oldestRecord && oldestRecord.ts < maxCutoff) {
        // Filter out records older than maxDays and stop
        const filteredRecords = allRecords.filter(r => r.ts >= maxCutoff);
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
  const filteredRecords = allRecords.filter(r => r.ts >= maxCutoff);
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
  const cutoffTs = now - (maxDays * 24 * 60 * 60);

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
  return allRecords.filter(r => r.ts >= cutoffTs);
}

/**
 * Fetch current market price from candles API
 * Returns the oracleClose from the latest 1-minute candle
 */
export async function fetchMarketCandle(symbol: string): Promise<number | null> {
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
    if (data.success && Array.isArray(data.records) && data.records.length > 0) {
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
