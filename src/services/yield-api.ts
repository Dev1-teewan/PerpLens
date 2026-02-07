/**
 * Yield Scanner API client. Fetches from same-origin /api/yield/* (server uses Drift SDK).
 */

import type { DeltaNeutralRow, FundingRateRow, PerpWithoutSpotRow, SpotRatesRow } from "../../shared/yield-types";

const API_BASE = "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  if (!isJson && contentType.includes("text/html")) {
    throw new Error("Yield API unavailable (server not running)");
  }
  if (!res.ok) {
    const body = isJson
      ? await res.json().catch(() => ({}))
      : { message: await res.text().catch(() => res.statusText) };
    const msg = (body as { message?: string }).message ?? res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchDeltaNeutralAPYs(): Promise<DeltaNeutralRow[]> {
  return get<DeltaNeutralRow[]>("/api/yield/delta-neutral");
}

export async function fetchFundingRates(): Promise<FundingRateRow[]> {
  return get<FundingRateRow[]>("/api/yield/funding-rates");
}

export async function fetchPerpsWithoutSpot(skipPrediction = true): Promise<PerpWithoutSpotRow[]> {
  return get<PerpWithoutSpotRow[]>(`/api/yield/perps-without-spot?skipPrediction=${skipPrediction}`);
}

export async function fetchSpotRates(spotMarketIndex: number): Promise<SpotRatesRow> {
  return get<SpotRatesRow>(`/api/yield/spot-rates/${spotMarketIndex}`);
}
