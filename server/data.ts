import { subDays } from "date-fns";
import type { StrategyResponse, Strategy, DailyMetric, Position } from "@shared/schema";

const mainStrategy: Strategy = {
  id: 1,
  walletSubkey: "main-account",
  totalFundingPnl: "12450.80",
  currentApy: "18.5",
  activeNotional: "250000.00",
  updatedAt: new Date(),
};

function buildDailyMetrics(): DailyMetric[] {
  const metrics: DailyMetric[] = [];
  let cumulativePnl = 12450.80;
  for (let i = 0; i < 90; i++) {
    const date = subDays(new Date(), i);
    const baseFunding = Math.random() * 150 + 50;
    const priceShock = Math.random() > 0.95 ? Math.random() * -50 : 0;
    const dailyPnlVal = baseFunding + priceShock;
    metrics.push({
      id: i + 1,
      strategyId: 1,
      date,
      dailyPnl: dailyPnlVal.toFixed(2),
      dailyFunding: baseFunding.toFixed(2),
      cumulativePnl: (cumulativePnl - i * 140).toFixed(2),
    });
  }
  return metrics;
}

const mainPositions: Position[] = [
  {
    id: 1,
    strategyId: 1,
    pairName: "SOL-PERP",
    notionalSize: "85000.00",
    netPnl: "4200.50",
    fundingEarned: "4500.00",
    roi: "12.5",
    hedgeType: "Cash & Carry",
    status: "Open",
    longEntryPrice: "145.20",
    shortEntryPrice: "145.50",
    currentPrice: "158.00",
  },
  {
    id: 2,
    strategyId: 1,
    pairName: "BTC-PERP",
    notionalSize: "120000.00",
    netPnl: "7800.20",
    fundingEarned: "8100.00",
    roi: "8.2",
    hedgeType: "Cash & Carry",
    status: "Open",
    longEntryPrice: "62000.00",
    shortEntryPrice: "62150.00",
    currentPrice: "64500.00",
  },
  {
    id: 3,
    strategyId: 1,
    pairName: "ETH-PERP",
    notionalSize: "45000.00",
    netPnl: "450.10",
    fundingEarned: "500.00",
    roi: "4.1",
    hedgeType: "Cash & Carry",
    status: "Open",
    longEntryPrice: "3100.00",
    shortEntryPrice: "3105.00",
    currentPrice: "3200.00",
  },
];

const dailyMetrics = buildDailyMetrics();

const mainAccountData: StrategyResponse = {
  ...mainStrategy,
  dailyMetrics,
  positions: mainPositions,
};

const store = new Map<string, StrategyResponse>([["main-account", mainAccountData]]);

export function getStrategyByWallet(walletSubkey: string): StrategyResponse | undefined {
  return store.get(walletSubkey) ?? (walletSubkey === "main-account" ? mainAccountData : undefined);
}
