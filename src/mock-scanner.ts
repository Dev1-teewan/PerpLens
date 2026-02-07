export interface YieldAsset {
  symbol: string;
  pairName: string;
  iconUrl: string;
  perpFundingRate1h: number;
  perpFundingRate24h: number;
  spotLendingApy: number;
  spotBorrowApy: number;
  volatilityIndex: number;
}

const DRIFT_LOGO_BASE = "https://drift-public.s3.eu-central-1.amazonaws.com/assets/icons/markets";

export const mockYieldAssets: YieldAsset[] = [
  {
    symbol: "SOL",
    pairName: "SOL-PERP",
    iconUrl: `${DRIFT_LOGO_BASE}/sol.svg`,
    perpFundingRate1h: 0.0035,
    perpFundingRate24h: 0.042,
    spotLendingApy: 6.8,
    spotBorrowApy: 9.2,
    volatilityIndex: 62,
  },
  {
    symbol: "BTC",
    pairName: "BTC-PERP",
    iconUrl: `${DRIFT_LOGO_BASE}/btc.svg`,
    perpFundingRate1h: 0.0028,
    perpFundingRate24h: 0.034,
    spotLendingApy: 3.2,
    spotBorrowApy: 5.8,
    volatilityIndex: 45,
  },
  {
    symbol: "ETH",
    pairName: "ETH-PERP",
    iconUrl: `${DRIFT_LOGO_BASE}/eth.svg`,
    perpFundingRate1h: -0.0012,
    perpFundingRate24h: -0.015,
    spotLendingApy: 4.1,
    spotBorrowApy: 7.3,
    volatilityIndex: 51,
  },
  {
    symbol: "JUP",
    pairName: "JUP-PERP",
    iconUrl: `${DRIFT_LOGO_BASE}/jup.svg`,
    perpFundingRate1h: 0.0048,
    perpFundingRate24h: 0.058,
    spotLendingApy: 8.5,
    spotBorrowApy: 12.1,
    volatilityIndex: 78,
  },
  {
    symbol: "WIF",
    pairName: "WIF-PERP",
    iconUrl: `${DRIFT_LOGO_BASE}/wif.webp`,
    perpFundingRate1h: 0.0062,
    perpFundingRate24h: 0.075,
    spotLendingApy: 11.2,
    spotBorrowApy: 15.8,
    volatilityIndex: 89,
  },
  {
    symbol: "BONK",
    pairName: "BONK-PERP",
    iconUrl: `${DRIFT_LOGO_BASE}/bonk.webp`,
    perpFundingRate1h: -0.0018,
    perpFundingRate24h: -0.022,
    spotLendingApy: 5.4,
    spotBorrowApy: 8.9,
    volatilityIndex: 92,
  },
];
