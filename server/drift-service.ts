/**
 * Minimal server-side Drift API client for strategies route.
 * Fetches funding payments from the public Drift Data API.
 */

import type { DriftFundingPaymentRecord, DriftFundingPaymentsResponse } from "../shared/drift-types";

export type { DriftFundingPaymentRecord };

const DRIFT_API_BASE = "https://data.api.drift.trade";

export async function fetchAllRecentFundingPayments(
  userAddress: string,
  limit: number
): Promise<DriftFundingPaymentRecord[]> {
  const url = `${DRIFT_API_BASE}/user/${userAddress}/fundingPayments?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Drift API error: ${res.status} ${res.statusText}`);
  }
  const data: DriftFundingPaymentsResponse = await res.json();
  return data.records ?? [];
}
