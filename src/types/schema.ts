/**
 * API types for strategy dashboard (no database).
 */

export interface Strategy {
  id: number;
  walletSubkey: string;
  totalFundingPnl: string;
  previousPeriodFundingPnl?: string;
  currentApy?: string;
  activeNotional?: string;
  updatedAt?: string | Date;
}

export interface DailyMarketBreakdown {
  marketIndex: number;
  marketName: string;
  dailyFunding: number;
  notionalValue: number;
  apy: number;
}

export interface DailyMetric {
  id: number;
  strategyId: number;
  date: string | Date;
  dailyPnl: string;
  dailyFunding: string;
  cumulativePnl: string;
  notionalValue?: string;
  portfolioApy?: string;
  perMarketBreakdown?: DailyMarketBreakdown[];
}

export interface Position {
  id: number;
  strategyId: number;
  pairName: string;
  hedgeType: string;
  notionalSize: string;         // Token amount
  notionalValue: string;        // Token amount × current price (USD)
  netPnl: string;
  fundingEarned: string;
  roi: string;
  status: string;
  longEntryPrice: string;
  shortEntryPrice: string;
  currentPrice: string;         // From candles API
  marketDailyMetrics?: DailyMetric[];  // Per-market PnL history for sparkline
}

export interface StrategyResponse extends Strategy {
  dailyMetrics: DailyMetric[];
  positions: Position[];
}
