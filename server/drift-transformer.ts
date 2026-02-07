/**
 * Minimal server-side transform: funding payment records → StrategyResponse.
 */

import type { StrategyResponse, Position, DailyMetric } from "../shared/schema";
import type { DriftFundingPaymentRecord } from "./drift-service";
import { getMarketName } from "../shared/market-names";

function formatLocalDate(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function transformDriftDataToStrategy(
  userAddress: string,
  records: DriftFundingPaymentRecord[]
): StrategyResponse {
  if (records.length === 0) {
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

  const sorted = [...records].sort((a, b) => b.ts - a.ts);
  const byMarket = new Map<
    number,
    { totalFunding: number; latestBaseAsset: string; dailyFunding: Map<string, number> }
  >();

  for (const r of sorted) {
    const funding = parseFloat(r.fundingPayment);
    if (!byMarket.has(r.marketIndex)) {
      byMarket.set(r.marketIndex, {
        totalFunding: 0,
        latestBaseAsset: r.baseAssetAmount,
        dailyFunding: new Map(),
      });
    }
    const agg = byMarket.get(r.marketIndex)!;
    agg.totalFunding += funding;
    agg.latestBaseAsset = r.baseAssetAmount;
    const dateKey = formatLocalDate(r.ts);
    agg.dailyFunding.set(dateKey, (agg.dailyFunding.get(dateKey) ?? 0) + funding);
  }

  let totalPnl = 0;
  const positions: Position[] = Array.from(byMarket.entries()).map(([marketIndex], idx) => {
    const agg = byMarket.get(marketIndex)!;
    totalPnl += agg.totalFunding;
    const baseAsset = Math.abs(parseFloat(agg.latestBaseAsset));
    const sortedDays = Array.from(agg.dailyFunding.entries()).sort(([a], [b]) => a.localeCompare(b));
    let cum = 0;
    const marketDailyMetrics: DailyMetric[] = sortedDays.map(([date, dailyFunding], i) => {
      cum += dailyFunding;
      return {
        id: i + 1,
        strategyId: 1,
        date: new Date(date),
        dailyPnl: dailyFunding.toFixed(2),
        dailyFunding: dailyFunding.toFixed(2),
        cumulativePnl: cum.toFixed(2),
      };
    });
    return {
      id: idx + 1,
      strategyId: 1,
      pairName: getMarketName(marketIndex),
      hedgeType: "Cash & Carry",
      strategySide: parseFloat(agg.latestBaseAsset) < 0 ? "Short Perp + Long Spot" : "Long Perp + Short Spot",
      notionalSize: baseAsset.toFixed(2),
      notionalValue: "0.00",
      netPnl: agg.totalFunding.toFixed(2),
      fundingEarned: agg.totalFunding.toFixed(2),
      roi: baseAsset > 0 ? ((agg.totalFunding / baseAsset) * 100).toFixed(2) : "0.00",
      status: baseAsset > 0 ? "Open" : "Closed",
      longEntryPrice: "0.00",
      shortEntryPrice: "0.00",
      currentPrice: "0.00",
      marketDailyMetrics,
    };
  });

  const dailyMap = new Map<string, number>();
  for (const r of records) {
    const key = formatLocalDate(r.ts);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + parseFloat(r.fundingPayment));
  }
  let runningCum = 0;
  const dailyMetrics: DailyMetric[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dailyFunding], i) => {
      runningCum += dailyFunding;
      return {
        id: i + 1,
        strategyId: 1,
        date: new Date(date),
        dailyPnl: dailyFunding.toFixed(2),
        dailyFunding: dailyFunding.toFixed(2),
        cumulativePnl: runningCum.toFixed(2),
      };
    });

  return {
    id: 1,
    walletSubkey: userAddress,
    totalFundingPnl: totalPnl.toFixed(2),
    currentApy: "",
    activeNotional: "",
    updatedAt: new Date(),
    dailyMetrics,
    positions,
  };
}
