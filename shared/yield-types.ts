/**
 * Yield API response types shared by server and frontend.
 * Server populates these from Drift SDK on-chain data;
 * frontend consumes them via /api/yield/* endpoints.
 */

/** A single perp market's live funding rate (hourly + annualized). */
export interface FundingRateRow {
  symbol: string;
  marketIndex: number;
  fundingRateHourPct: number;
  fundingRateYearPct: number;
}

/** A perp market that has no corresponding spot market on Drift. */
export interface PerpWithoutSpotRow {
  symbol: string;
  baseAsset: string;
  marketIndex: number;
  fundingRateHourPct: number;
  fundingRateYearPct: number;
  category: string;
}

/** A delta-neutral pair (short perp + lend spot) with combined APY. */
export interface DeltaNeutralRow {
  perpSymbol: string;
  spotSymbol: string;
  deltaNeutralApyPct: number;
  strategy: "Profitable" | "Reduced Earnings";
  lendingApyPct: number;
  fundingRateYearPct: number;
  borrowingRatePct?: number;
}

/** Spot market lending and borrowing rates. */
export interface SpotRatesRow {
  lendingApyPct: number;
  borrowingRatePct: number;
}
