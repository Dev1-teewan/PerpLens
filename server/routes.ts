import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { subDays, format } from "date-fns";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // GET Strategy details
  app.get(api.strategies.getByWallet.path, async (req, res) => {
    const walletSubkey = req.params.walletSubkey;
    const strategy = await storage.getStrategyByWallet(walletSubkey);

    if (!strategy) {
      // If requesting the demo account and it doesn't exist, we could trigger a seed,
      // but simpler to just return 404 and let the seed script handle initialization.
      return res.status(404).json({ message: "Strategy not found for this wallet." });
    }

    res.json(strategy);
  });

  // Seed Data Endpoint (Internal use or auto-run)
  // We'll auto-seed if 'main-account' is missing in a separate function call below
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getStrategyByWallet("main-account");
  if (existing) return;

  console.log("Seeding database with mock DeFi data...");

  // 1. Create Strategy
  const strategy = await storage.createStrategy({
    walletSubkey: "main-account",
    totalFundingPnl: "12450.80",
    currentApy: "18.5",
    activeNotional: "250000.00"
  });

  // 2. Generate Daily Metrics (Last 90 days)
  const metrics = [];
  let cumulativePnl = 12450.80;
  // Working backwards from today
  for (let i = 0; i < 90; i++) {
    const date = subDays(new Date(), i);
    
    // Mock data generation: mostly positive funding, occasional variance
    const baseFunding = Math.random() * 150 + 50; // $50 - $200 daily
    const priceShock = Math.random() > 0.95 ? (Math.random() * -50) : 0; // Occasional small drawdown
    const dailyPnlVal = baseFunding + priceShock;
    
    // We adjust the running total backwards
    // Current total is 12450. So 90 days ago it was lower.
    // Actually, let's build forward to match the final number, but since we are inserting 
    // mock data, let's just generate reasonable numbers.
    // To make the chart look "cumulative" up to the current total, we can just assign values.
    
    metrics.push({
      strategyId: strategy.id,
      date: date,
      dailyPnl: dailyPnlVal.toFixed(2),
      dailyFunding: baseFunding.toFixed(2),
      cumulativePnl: (cumulativePnl - (i * 140)).toFixed(2) // Rough linear decrease for past data
    });
  }
  
  await storage.createDailyMetrics(metrics);

  // 3. Create Positions
  await storage.createPositions([
    {
      strategyId: strategy.id,
      pairName: "SOL-PERP",
      notionalSize: "85000.00",
      netPnl: "4200.50",
      fundingEarned: "4500.00", // Net is lower due to fees/slippage maybe
      roi: "12.5",
      longEntryPrice: "145.20",
      shortEntryPrice: "145.50", // Premium capture
      currentPrice: "158.00"
    },
    {
      strategyId: strategy.id,
      pairName: "BTC-PERP",
      notionalSize: "120000.00",
      netPnl: "7800.20",
      fundingEarned: "8100.00",
      roi: "8.2",
      longEntryPrice: "62000.00",
      shortEntryPrice: "62150.00",
      currentPrice: "64500.00"
    },
    {
      strategyId: strategy.id,
      pairName: "ETH-PERP",
      notionalSize: "45000.00",
      netPnl: "450.10",
      fundingEarned: "500.00",
      roi: "4.1",
      longEntryPrice: "3100.00",
      shortEntryPrice: "3105.00",
      currentPrice: "3200.00"
    }
  ]);
  
  console.log("Database seeded successfully.");
}
