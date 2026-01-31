import type { Express } from "express";
import type { Server } from "http";
import { getStrategyByWallet } from "./data";
import { api } from "@shared/routes";
import { fetchAllRecentFundingPayments } from "./drift-service";
import { transformDriftDataToStrategy } from "./drift-transformer";

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

  return httpServer;
}
