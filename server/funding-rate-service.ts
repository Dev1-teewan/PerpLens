/**
 * Server-side funding rate service: perp funding, perps without spot,
 * delta-neutral APY, and spot lend/borrow rates. Uses Drift SDK on-chain data.
 */

import {
  isVariant,
  MainnetPerpMarkets,
  calculateDepositRate,
  calculateBorrowRate,
  calculateFormattedLiveFundingRate,
} from "@drift-labs/sdk";
import { withDriftClient, resolveSpotMarketForPerp } from "./drift-client";
import type { FundingRateRow, DeltaNeutralRow, PerpWithoutSpotRow, SpotRatesRow } from "../shared/yield-types";

const SPOT_RATE_SCALE = 1e6;

/**
 * Simple in-memory TTL cache. DriftClient polls every ~1s, so a 5s cache
 * prevents burst computation when multiple clients hit the same endpoint.
 */
const CACHE_TTL_MS = 5_000;
interface CacheEntry<T> { data: T; ts: number; }
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data as T;
  return null;
}
function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

export async function getAllPerpFundingRates(): Promise<FundingRateRow[]> {
  const cached = getCached<FundingRateRow[]>("fundingRates");
  if (cached) return cached;
  const rows = await withDriftClient((client) => {
    const out: FundingRateRow[] = [];
    for (const perp of MainnetPerpMarkets) {
      const perpMarket = client.getPerpMarketAccount(perp.marketIndex);
      if (!perpMarket || !isVariant(perpMarket.status, "active")) continue;

      const oracleData = client.getOracleDataForPerpMarket(perp.marketIndex);
      const mmOracleData = client.getMMOracleDataForPerpMarket(perp.marketIndex);

      try {
        const hour = calculateFormattedLiveFundingRate(
          perpMarket,
          mmOracleData,
          oracleData,
          "hour"
        );
        const year = calculateFormattedLiveFundingRate(
          perpMarket,
          mmOracleData,
          oracleData,
          "year"
        );
        out.push({
          symbol: perp.symbol,
          marketIndex: perp.marketIndex,
          fundingRateHourPct: hour.shortRate,
          fundingRateYearPct: year.shortRate,
        });
      } catch {
        continue;
      }
    }
    return out;
  });
  setCache("fundingRates", rows);
  return rows;
}

export interface GetPerpsWithoutSpotOptions {
  skipPrediction?: boolean;
}

export async function getPerpsWithoutSpot(
  options: GetPerpsWithoutSpotOptions = {}
): Promise<PerpWithoutSpotRow[]> {
  const { skipPrediction = true } = options;
  const cacheKey = `perpsWithoutSpot:${skipPrediction}`;
  const cached = getCached<PerpWithoutSpotRow[]>(cacheKey);
  if (cached) return cached;
  const rows = await withDriftClient((client) => {
    const out: PerpWithoutSpotRow[] = [];
    for (const perp of MainnetPerpMarkets) {
      const spot = resolveSpotMarketForPerp(perp.symbol);
      if (spot) continue;
      if (skipPrediction && perp.category?.includes("Prediction")) continue;

      const perpMarket = client.getPerpMarketAccount(perp.marketIndex);
      if (!perpMarket || !isVariant(perpMarket.status, "active")) continue;

      const oracleData = client.getOracleDataForPerpMarket(perp.marketIndex);
      const mmOracleData = client.getMMOracleDataForPerpMarket(perp.marketIndex);

      try {
        const hour = calculateFormattedLiveFundingRate(
          perpMarket,
          mmOracleData,
          oracleData,
          "hour"
        );
        const year = calculateFormattedLiveFundingRate(
          perpMarket,
          mmOracleData,
          oracleData,
          "year"
        );
        out.push({
          symbol: perp.symbol,
          baseAsset: perp.baseAssetSymbol,
          marketIndex: perp.marketIndex,
          fundingRateHourPct: hour.shortRate,
          fundingRateYearPct: year.shortRate,
          category: perp.category?.[0] ?? "Other",
        });
      } catch {
        continue;
      }
    }
    return out.sort((a, b) => b.fundingRateYearPct - a.fundingRateYearPct);
  });
  setCache(cacheKey, rows);
  return rows;
}

export async function getDeltaNeutralAPYs(): Promise<DeltaNeutralRow[]> {
  const cached = getCached<DeltaNeutralRow[]>("deltaNeutral");
  if (cached) return cached;
  const rows = await withDriftClient((client) => {
    const out: DeltaNeutralRow[] = [];
    for (const perp of MainnetPerpMarkets) {
      const spot = resolveSpotMarketForPerp(perp.symbol);
      if (!spot) continue;

      const perpMarket = client.getPerpMarketAccount(perp.marketIndex);
      const spotMarket = client.getSpotMarketAccount(spot.marketIndex);
      if (!perpMarket || !spotMarket || !isVariant(perpMarket.status, "active")) {
        continue;
      }

      const oracleData = client.getOracleDataForPerpMarket(perp.marketIndex);
      const mmOracleData = client.getMMOracleDataForPerpMarket(perp.marketIndex);

      try {
        const year = calculateFormattedLiveFundingRate(
          perpMarket,
          mmOracleData,
          oracleData,
          "year"
        );
        const lendingApy = calculateDepositRate(spotMarket);
        const borrowingRate = calculateBorrowRate(spotMarket);
        const lendingApyPct = (lendingApy.toNumber() / SPOT_RATE_SCALE) * 100;
        const borrowingRatePct = (borrowingRate.toNumber() / SPOT_RATE_SCALE) * 100;
        const fundingRateYearPct = year.shortRate;
        const deltaNeutralApyPct = lendingApyPct + fundingRateYearPct;

        out.push({
          perpSymbol: perp.symbol,
          spotSymbol: spot.symbol,
          deltaNeutralApyPct,
          strategy: fundingRateYearPct > 0 ? "Profitable" : "Reduced Earnings",
          lendingApyPct,
          fundingRateYearPct,
          borrowingRatePct,
        });
      } catch {
        continue;
      }
    }
    return out.sort((a, b) => b.deltaNeutralApyPct - a.deltaNeutralApyPct);
  });
  setCache("deltaNeutral", rows);
  return rows;
}

export async function getSpotRates(
  spotMarketIndex: number
): Promise<SpotRatesRow | null> {
  return withDriftClient((client) => {
    const spotMarket = client.getSpotMarketAccount(spotMarketIndex);
    if (!spotMarket) return null;

    const depositRate = calculateDepositRate(spotMarket);
    const borrowRate = calculateBorrowRate(spotMarket);

    return {
      lendingApyPct: (depositRate.toNumber() / SPOT_RATE_SCALE) * 100,
      borrowingRatePct: (borrowRate.toNumber() / SPOT_RATE_SCALE) * 100,
    };
  });
}
