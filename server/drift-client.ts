/**
 * Drift client for server-side yield/funding rate reads.
 * Simple init: Connection + Wallet + subscribe. No authority, sub-accounts, or delegates.
 */

import { Connection, Keypair } from "@solana/web3.js";
import {
  DriftClient,
  Wallet,
  loadKeypair,
  MainnetPerpMarkets,
  MainnetSpotMarkets,
  getMarketsAndOraclesForSubscription,
} from "@drift-labs/sdk";
import type { SpotMarketConfig } from "@drift-labs/sdk";
import path from "path";
import fs from "fs";

const ENV = "mainnet-beta" as const;
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedClient: DriftClient | null = null;
let cachedAt: number | null = null;

function isWebSocketClosedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("readyState") && msg.includes("3") ||
    msg.includes("socket was not") && msg.includes("CONNECTING")
  );
}

/**
 * Clears the cached DriftClient so the next getDriftClient() creates a fresh connection.
 * Call this when you see WebSocket-closed errors (e.g. readyState was 3) to recover.
 */
export async function invalidateDriftClientCache(): Promise<void> {
  if (cachedClient) {
    try {
      await cachedClient.unsubscribe();
    } catch {
      /* ignore */
    }
    cachedClient = null;
    cachedAt = null;
  }
}

function getKeypair(): Keypair {
  const keypath = process.env.SOLANA_KEYPAIR_PATH;
  const base58 = process.env.WALLET_PRIVATE_KEY;
  if (base58) {
    return loadKeypair(base58);
  }
  if (keypath) {
    const resolved = path.isAbsolute(keypath)
      ? keypath
      : path.resolve(
          process.cwd(),
          keypath.replace(/^~/, process.env.HOME ?? ""),
        );
    if (fs.existsSync(resolved)) {
      return loadKeypair(resolved);
    }
    return loadKeypair(keypath);
  }
  throw new Error(
    "One of SOLANA_KEYPAIR_PATH or WALLET_PRIVATE_KEY must be set for Drift SDK",
  );
}

/**
 * Returns a subscribed DriftClient (cached). Uses SOLANA_RPC_URL, SOLANA_KEYPAIR_PATH or WALLET_PRIVATE_KEY.
 * Cache is invalidated after CACHE_TTL_MS so we get a fresh WebSocket periodically.
 */
export async function getDriftClient(): Promise<DriftClient> {
  const now = Date.now();
  if (cachedClient?.isSubscribed && cachedAt != null && now - cachedAt < CACHE_TTL_MS) {
    return cachedClient;
  }
  // Clean up stale or expired client before re-creating
  if (cachedClient) {
    try {
      await cachedClient.unsubscribe();
    } catch {
      /* ignore */
    }
    cachedClient = null;
    cachedAt = null;
  }
  const rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC;
  const connection = new Connection(rpcUrl, "confirmed");
  const keypair = getKeypair();
  const wallet = new Wallet(keypair);
  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } =
    getMarketsAndOraclesForSubscription(ENV);
  const client = new DriftClient({
    connection,
    wallet,
    env: ENV,
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos,
  });
  try {
    await client.subscribe();
    console.log("[drift-client] DriftClient subscribed successfully");
  } catch (err) {
    console.error("[drift-client] DriftClient subscribe failed:", err instanceof Error ? err.message : err);
    throw err;
  }
  cachedClient = client;
  cachedAt = Date.now();
  return client;
}

/**
 * Runs fn with a DriftClient. If fn throws a WebSocket-closed error (e.g. readyState 3),
 * invalidates the cache and retries once with a fresh client. Use this around any logic
 * that uses the client so Helius free tier socket drops are recovered automatically.
 */
export async function withDriftClient<T>(
  fn: (client: DriftClient) => Promise<T>
): Promise<T> {
  const client = await getDriftClient();
  try {
    return await fn(client);
  } catch (err) {
    if (!isWebSocketClosedError(err)) throw err;
    await invalidateDriftClientCache();
    const freshClient = await getDriftClient();
    return fn(freshClient);
  }
}

// --- Perp → Spot mapping (special cases from docs) ---

const PERP_BASE_TO_SPOT_SYMBOL: Record<string, string> = {
  "1MBONK": "BONK",
  "1MPEPE": "PEPE",
  "1KWEN": "WEN",
  "1KMEW": "MEW",
  BTC: "wBTC",
  ETH: "wETH",
};

const SPOT_BY_SYMBOL = new Map<string, SpotMarketConfig>(
  MainnetSpotMarkets.map((s) => [s.symbol, s]),
);

/**
 * Resolve perp symbol to spot market config or null. Handles 1MBONK→BONK, BTC→wBTC, etc.
 */
export function resolveSpotMarketForPerp(
  perpSymbol: string,
): SpotMarketConfig | null {
  const perp = MainnetPerpMarkets.find((p) => p.symbol === perpSymbol);
  if (!perp) return null;
  const base = perp.baseAssetSymbol;
  const spotSymbol = PERP_BASE_TO_SPOT_SYMBOL[base] ?? base;
  return SPOT_BY_SYMBOL.get(spotSymbol) ?? null;
}
