import type { StrategyResponse } from "@/types/schema";

/** Mock data for frontend-only dev (when backend is not running). */
export const mockStrategy: StrategyResponse = {
  id: 1,
  walletSubkey: "main-account",
  totalFundingPnl: "12450.80",
  currentApy: "18.5",
  activeNotional: "250000.00",
  updatedAt: new Date().toISOString(),
  dailyMetrics: Array.from({ length: 90 }, (_, i) => ({
    id: i + 1,
    strategyId: 1,
    date: new Date(Date.now() - i * 864e5).toISOString(),
    dailyPnl: (100 + Math.random() * 100).toFixed(2),
    dailyFunding: (80 + Math.random() * 80).toFixed(2),
    cumulativePnl: (12450 - i * 140).toFixed(2),
  })),
  positions: [
    { id: 1, strategyId: 1, pairName: "SOL-PERP", notionalSize: "850.00", notionalValue: "134300.00", netPnl: "4200.50", fundingEarned: "4500.00", roi: "3.35", hedgeType: "Cash & Carry", strategySide: "Short Perp + Long Spot", status: "Open", longEntryPrice: "145.20", shortEntryPrice: "145.50", currentPrice: "158.00", marketDailyMetrics: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, strategyId: 1, date: new Date(Date.now() - (6 - i) * 864e5), dailyPnl: (600 + Math.random() * 100).toFixed(2), dailyFunding: (600 + Math.random() * 100).toFixed(2), cumulativePnl: ((i + 1) * 640).toFixed(2) })) },
    { id: 2, strategyId: 1, pairName: "BTC-PERP", notionalSize: "1.85", notionalValue: "119325.00", netPnl: "7800.20", fundingEarned: "8100.00", roi: "6.79", hedgeType: "Cash & Carry", strategySide: "Short Perp + Long Spot", status: "Open", longEntryPrice: "62000.00", shortEntryPrice: "62150.00", currentPrice: "64500.00", marketDailyMetrics: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, strategyId: 1, date: new Date(Date.now() - (6 - i) * 864e5), dailyPnl: (1100 + Math.random() * 200).toFixed(2), dailyFunding: (1100 + Math.random() * 200).toFixed(2), cumulativePnl: ((i + 1) * 1150).toFixed(2) })) },
    { id: 3, strategyId: 1, pairName: "ETH-PERP", notionalSize: "14.00", notionalValue: "44800.00", netPnl: "450.10", fundingEarned: "500.00", roi: "1.12", hedgeType: "Cash & Carry", strategySide: "Long Perp + Short Spot", status: "Open", longEntryPrice: "3100.00", shortEntryPrice: "3105.00", currentPrice: "3200.00", marketDailyMetrics: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, strategyId: 1, date: new Date(Date.now() - (6 - i) * 864e5), dailyPnl: (65 + Math.random() * 20).toFixed(2), dailyFunding: (65 + Math.random() * 20).toFixed(2), cumulativePnl: ((i + 1) * 71).toFixed(2) })) },
  ],
};
