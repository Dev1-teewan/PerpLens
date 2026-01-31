/**
 * Drift API response types
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

/**
 * Market index to name mapping for Drift Protocol
 * You can expand this as needed
 */ export const DRIFT_MARKET_NAMES: Record<number, string> = {
  0: "SOL-PERP",
  1: "BTC-PERP",
  2: "ETH-PERP",
  3: "APT-PERP",
  4: "1MBONK-PERP",
  5: "POL-PERP",
  6: "ARB-PERP",
  7: "DOGE-PERP",
  8: "BNB-PERP",
  9: "SUI-PERP",
  10: "1MPEPE-PERP",
  11: "OP-PERP",
  12: "RENDER-PERP",
  13: "XRP-PERP",
  14: "HNT-PERP",
  15: "INJ-PERP",
  16: "LINK-PERP",
  17: "RLB-PERP",
  18: "PYTH-PERP",
  19: "TIA-PERP",
  20: "JTO-PERP",
  21: "SEI-PERP",
  22: "AVAX-PERP",
  23: "WIF-PERP",
  24: "JUP-PERP",
  25: "DYM-PERP",
  26: "TAO-PERP",
  27: "W-PERP",
  28: "KMNO-PERP",
  29: "TNSR-PERP",
  30: "DRIFT-PERP",
  31: "CLOUD-PERP",
  32: "IO-PERP",
  33: "ZEX-PERP",
  34: "POPCAT-PERP",
  35: "1KWEN-PERP",
  36: "TRUMP-WIN-2024-BET",
  37: "KAMALA-POPULAR-VOTE-2024-BET",
  38: "FED-CUT-50-SEPT-2024-BET",
  39: "REPUBLICAN-POPULAR-AND-WIN-BET",
  40: "BREAKPOINT-IGGYERIC-BET",
  41: "DEMOCRATS-WIN-MICHIGAN-BET",
  42: "TON-PERP",
  43: "LANDO-F1-SGP-WIN-BET",
  44: "MOTHER-PERP",
  45: "MOODENG-PERP",
  46: "WARWICK-FIGHT-WIN-BET",
  47: "DBR-PERP",
  48: "WLF-5B-1W-BET",
  49: "VRSTPN-WIN-F1-24-DRVRS-CHMP-BET",
  50: "LNDO-WIN-F1-24-US-GP-BET",
  51: "1KMEW-PERP",
  52: "MICHI-PERP",
  53: "GOAT-PERP",
  54: "FWOG-PERP",
  55: "PNUT-PERP",
  56: "RAY-PERP",
  57: "SUPERBOWL-LIX-LIONS-BET",
  58: "SUPERBOWL-LIX-CHIEFS-BET",
  59: "HYPE-PERP",
  60: "LTC-PERP",
  61: "ME-PERP",
  62: "PENGU-PERP",
  63: "AI16Z-PERP",
  64: "TRUMP-PERP",
  65: "MELANIA-PERP",
  66: "BERA-PERP",
  67: "NBAFINALS25-OKC-BET",
  68: "NBAFINALS25-BOS-BET",
  69: "KAITO-PERP",
  70: "IP-PERP",
  71: "FARTCOIN-PERP",
  72: "ADA-PERP",
  73: "PAXG-PERP",
  74: "LAUNCHCOIN-PERP",
  75: "PUMP-PERP",
  76: "ASTER-PERP",
  77: "XPL-PERP",
  78: "2Z-PERP",
  79: "ZEC-PERP",
  80: "MNT-PERP",
  81: "1KPUMP-PERP",
  82: "MET-PERP",
  83: "1KMON-PERP",
};
export function getMarketName(marketIndex: number): string {
  return DRIFT_MARKET_NAMES[marketIndex] || `MARKET-${marketIndex}`;
}
