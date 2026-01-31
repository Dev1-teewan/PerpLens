import type { DriftFundingPaymentRecord } from "./drift-types";
import type { StrategyResponse, DailyMetric, Position } from "../types/schema";
import { getMarketName } from "./drift-types";

export type Timeframe = "24H" | "7D" | "30D";

interface MarketAggregation {
  marketIndex: number;
  totalFunding: number;
  records: DriftFundingPaymentRecord[];
  latestBaseAssetAmount: string;
  latestTimestamp: number;
  dailyFunding: Map<string, number>;  // Per-day funding for sparkline
}

interface DailyAggregation {
  date: string;
  totalFunding: number;
  recordCount: number;
}

interface HourlyAggregation {
  hourKey: string;
  totalFunding: number;
  recordCount: number;
}

/**
 * Format unix timestamp to local date string (YYYY-MM-DD)
 */
function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format unix timestamp to local hour key (YYYY-MM-DDTHH)
 */
function formatLocalHourKey(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hour}`;
}

/**
 * Transform Drift API funding payment records into our StrategyResponse format
 */
export function transformDriftDataToStrategy(
  userAddress: string,
  records: DriftFundingPaymentRecord[],
  timeframe: Timeframe = "7D"
): StrategyResponse {
  if (records.length === 0) {
    // Return empty strategy if no records
    return {
      id: 1,
      walletSubkey: userAddress,
      totalFundingPnl: "0.00",
      currentApy: "",
      activeNotional: "",
      updatedAt: new Date(),
      dailyMetrics: [],
      positions: [],
    };
  }

  // Sort records by timestamp (newest first)
  const sortedRecords = [...records].sort((a, b) => b.ts - a.ts);

  // 1. Aggregate by market to get positions
  const marketMap = new Map<number, MarketAggregation>();

  for (const record of sortedRecords) {
    const marketIndex = record.marketIndex;
    if (!marketMap.has(marketIndex)) {
      marketMap.set(marketIndex, {
        marketIndex,
        totalFunding: 0,
        records: [],
        latestBaseAssetAmount: record.baseAssetAmount,
        latestTimestamp: record.ts,
        dailyFunding: new Map<string, number>(),
      });
    }

    const marketAgg = marketMap.get(marketIndex)!;
    const fundingAmount = parseFloat(record.fundingPayment);
    marketAgg.totalFunding += fundingAmount;
    marketAgg.records.push(record);

    // Track daily funding for this market
    const dateKey = formatLocalDate(record.ts);
    const currentDayFunding = marketAgg.dailyFunding.get(dateKey) || 0;
    marketAgg.dailyFunding.set(dateKey, currentDayFunding + fundingAmount);

    // Update latest position size if this record is newer
    if (record.ts > marketAgg.latestTimestamp) {
      marketAgg.latestTimestamp = record.ts;
      marketAgg.latestBaseAssetAmount = record.baseAssetAmount;
    }
  }

  // 2. Create positions from market aggregations
  const positions: Position[] = Array.from(marketMap.values()).map(
    (marketAgg, index) => {
      const baseAsset = Math.abs(parseFloat(marketAgg.latestBaseAssetAmount));
      const fundingEarned = marketAgg.totalFunding;

      // Build per-market daily metrics for sparkline
      const sortedDays = Array.from(marketAgg.dailyFunding.entries())
        .sort(([a], [b]) => a.localeCompare(b));

      let cumulativePnl = 0;
      const marketDailyMetrics: DailyMetric[] = sortedDays.map(([date, dailyFunding], idx) => {
        cumulativePnl += dailyFunding;
        return {
          id: idx + 1,
          strategyId: 1,
          date: new Date(date),
          dailyPnl: dailyFunding.toFixed(2),
          dailyFunding: dailyFunding.toFixed(2),
          cumulativePnl: cumulativePnl.toFixed(2),
        };
      });

      return {
        id: index + 1,
        strategyId: 1,
        pairName: getMarketName(marketAgg.marketIndex),
        hedgeType: "Cash & Carry",
        notionalSize: baseAsset.toFixed(2),
        notionalValue: "0.00", // Will be calculated in useStrategy after fetching prices
        netPnl: fundingEarned.toFixed(2),
        fundingEarned: fundingEarned.toFixed(2),
        roi: baseAsset > 0 ? ((fundingEarned / baseAsset) * 100).toFixed(2) : "0.00",
        status: baseAsset > 0 ? "Open" : "Closed",
        longEntryPrice: "0.00", // Not available from funding payment data
        shortEntryPrice: "0.00", // Not available from funding payment data
        currentPrice: "0.00", // Will be fetched from candles API
        marketDailyMetrics,
      };
    }
  );

  // 3. Aggregate by day or by hour (using LOCAL timezone)
  const is24H = timeframe === "24H";
  let dailyMetrics: DailyMetric[];

  if (is24H) {
    const hourlyMap = new Map<string, HourlyAggregation>();
    for (const record of records) {
      const hourKey = formatLocalHourKey(record.ts);
      if (!hourlyMap.has(hourKey)) {
        hourlyMap.set(hourKey, { hourKey, totalFunding: 0, recordCount: 0 });
      }
      const agg = hourlyMap.get(hourKey)!;
      agg.totalFunding += parseFloat(record.fundingPayment);
      agg.recordCount++;
    }
    const sortedHours = Array.from(hourlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b));
    let cumulativePnl = 0;
    dailyMetrics = sortedHours.map(([hourKey, agg], index) => {
      cumulativePnl += agg.totalFunding;
      return {
        id: index + 1,
        strategyId: 1,
        date: new Date(hourKey + ":00:00"),
        dailyPnl: agg.totalFunding.toFixed(2),
        dailyFunding: agg.totalFunding.toFixed(2),
        cumulativePnl: cumulativePnl.toFixed(2),
      };
    });
  } else {
    const dailyMap = new Map<string, DailyAggregation>();
    for (const record of records) {
      const date = formatLocalDate(record.ts);
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { date, totalFunding: 0, recordCount: 0 });
      }
      const dailyAgg = dailyMap.get(date)!;
      dailyAgg.totalFunding += parseFloat(record.fundingPayment);
      dailyAgg.recordCount++;
    }
    const sortedDays = Array.from(dailyMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
    let cumulativePnl = 0;
    dailyMetrics = sortedDays.map(([date, dailyAgg], index) => {
      cumulativePnl += dailyAgg.totalFunding;
      return {
        id: index + 1,
        strategyId: 1,
        date: new Date(date),
        dailyPnl: dailyAgg.totalFunding.toFixed(2),
        dailyFunding: dailyAgg.totalFunding.toFixed(2),
        cumulativePnl: cumulativePnl.toFixed(2),
      };
    });
  }

  // 5. Calculate total funding PnL
  const totalFundingPnl = records.reduce(
    (sum, record) => sum + parseFloat(record.fundingPayment),
    0
  );

  return {
    id: 1,
    walletSubkey: userAddress,
    totalFundingPnl: totalFundingPnl.toFixed(2),
    currentApy: "", // Leave empty as requested
    activeNotional: "", // Leave empty as requested
    updatedAt: new Date(),
    dailyMetrics,
    positions,
  };
}
