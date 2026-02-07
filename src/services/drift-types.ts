/**
 * Drift API response types — re-exported from shared
 */
export type { DriftFundingPaymentRecord, DriftFundingPaymentsResponse } from "../../shared/drift-types";

/**
 * Market names — re-exported from shared
 */
export { DRIFT_MARKET_NAMES, getMarketName } from "../../shared/market-names";

/**
 * Daily candle record from Drift API
 */
export interface DailyCandleRecord {
  ts: number;
  oracleClose: number;
  oracleOpen: number;
  oracleHigh: number;
  oracleLow: number;
}

export interface DailyCandlesResponse {
  success: boolean;
  records: DailyCandleRecord[];
}

/**
 * User account state types from Drift API
 */
export interface DriftUserAccount {
  authority: string;
  subAccountId: number;
  status: number;
  totalCollateral: string;
  freeCollateral: string;
  health: number;
  leverage: number;
  marginRatio: number;
  lastActiveSlot: number;
}

export interface DriftSpotBalance {
  marketIndex: number;
  symbol: string;
  balance: string;
  tokenAmount: string;
  oraclePrice: string;
  value: string;
}

export interface DriftPerpPosition {
  marketIndex: number;
  symbol: string;
  baseAssetAmount: string;
  quoteAssetAmount: string;
  entryPrice: string;
  oraclePrice: string;
  unrealizedPnl: string;
  unsettledPnl: string;
  lpShares: string;
}

export interface DriftOrder {
  orderId: number;
  status: string;
  orderType: string;
  marketIndex: number;
  marketType: string;
  baseAssetAmount: string;
  price: string;
  direction: string;
  reduceOnly: boolean;
  postOnly: boolean;
  slot: number;
}

export interface DriftUserResponse {
  success: boolean;
  user: string;
  account: DriftUserAccount;
  perpPositions: DriftPerpPosition[];
  spotBalances: DriftSpotBalance[];
  orders: DriftOrder[];
}
