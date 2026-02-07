import type { Express } from "express";
import type { Server } from "http";
import { getStrategyByWallet } from "./data";
import { api } from "../shared/routes";
import { fetchAllRecentFundingPayments } from "./drift-service";
import { transformDriftDataToStrategy } from "./drift-transformer";
import {
  getAllPerpFundingRates,
  getDeltaNeutralAPYs,
  getPerpsWithoutSpot,
  getSpotRates,
} from "./funding-rate-service";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Disable caching for all API routes to prevent 304 responses
  app.use("/api", (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    next();
  });

  app.get(api.strategies.getByWallet.path, async (req, res) => {
    const walletSubkey = String(req.params.walletSubkey ?? "");

    // If it's the main-account, use mock data as fallback
    if (walletSubkey === "main-account") {
      const strategy = getStrategyByWallet(walletSubkey);
      if (strategy) {
        return res.json(strategy);
      }
    }

    // Otherwise, fetch from Drift API
    try {
      const records = await fetchAllRecentFundingPayments(walletSubkey, 10);

      if (records.length === 0) {
        return res.status(404).json({
          message: "No funding payment records found for this address.",
        });
      }

      const strategy = transformDriftDataToStrategy(walletSubkey, records);
      res.json(strategy);
    } catch (error) {
      console.error("Error fetching Drift data:", error);
      return res.status(500).json({
        message: "Failed to fetch data from Drift API.",
      });
    }
  });

  // Yield Scanner: live funding and delta-neutral APY (Drift SDK)
  async function handleYieldError(err: unknown, res: Express.Response): Promise<boolean> {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("SOLANA_KEYPAIR_PATH") || msg.includes("WALLET_PRIVATE_KEY")) {
      res.status(503).json({
        message: "Yield API unavailable: Drift SDK not configured (set SOLANA_KEYPAIR_PATH or WALLET_PRIVATE_KEY).",
      });
      return true;
    }
    console.error("Yield API error:", err);
    res.status(500).json({ message: "Failed to fetch yield data." });
    return true;
  }

  app.get("/api/yield/funding-rates", async (_req, res) => {
    try {
      const data = await getAllPerpFundingRates();
      res.json(data);
    } catch (err) {
      await handleYieldError(err, res);
    }
  });

  app.get("/api/yield/delta-neutral", async (_req, res) => {
    try {
      const data = await getDeltaNeutralAPYs();
      res.json(data);
    } catch (err) {
      await handleYieldError(err, res);
    }
  });

  app.get("/api/yield/perps-without-spot", async (req, res) => {
    try {
      const skipPrediction = req.query.skipPrediction !== "false";
      const data = await getPerpsWithoutSpot({ skipPrediction });
      res.json(data);
    } catch (err) {
      await handleYieldError(err, res);
    }
  });

  app.get("/api/yield/spot-rates/:marketIndex", async (req, res) => {
    try {
      const marketIndex = parseInt(String(req.params.marketIndex), 10);
      if (Number.isNaN(marketIndex)) {
        return res.status(400).json({ message: "Invalid marketIndex." });
      }
      const data = await getSpotRates(marketIndex);
      if (data === null) {
        return res.status(404).json({ message: "Spot market not found." });
      }
      res.json(data);
    } catch (err) {
      await handleYieldError(err, res);
    }
  });

  return httpServer;
}
