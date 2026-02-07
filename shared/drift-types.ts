/**
 * Drift API funding payment types shared between client and server.
 */

export interface DriftFundingPaymentRecord {
  ts: number;
  txSig: string;
  txSigIndex: number;
  slot: number;
  userAuthority: string;
  user: string;
  marketIndex: number;
  fundingPayment: string;
  baseAssetAmount: string;
  userLastCumulativeFunding: string;
  ammCumulativeFundingLong: string;
  ammCumulativeFundingShort: string;
}

export interface DriftFundingPaymentsResponse {
  success: boolean;
  records: DriftFundingPaymentRecord[];
  meta: {
    nextPage?: string;
  };
}
