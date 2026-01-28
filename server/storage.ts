import { db } from "./db";
import {
  strategies,
  dailyMetrics,
  positions,
  type Strategy,
  type DailyMetric,
  type Position,
  type StrategyResponse
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getStrategyByWallet(walletSubkey: string): Promise<StrategyResponse | undefined>;
  // Seed method
  createStrategy(strategy: any): Promise<Strategy>;
  createDailyMetrics(metrics: any[]): Promise<void>;
  createPositions(pos: any[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getStrategyByWallet(walletSubkey: string): Promise<StrategyResponse | undefined> {
    const strategy = await db.query.strategies.findFirst({
      where: eq(strategies.walletSubkey, walletSubkey),
      with: {
        dailyMetrics: {
          orderBy: [desc(dailyMetrics.date)],
          limit: 100 // Last 100 days as requested
        },
        positions: true
      }
    });
    return strategy;
  }

  async createStrategy(strategy: any): Promise<Strategy> {
    const [newStrategy] = await db.insert(strategies).values(strategy).returning();
    return newStrategy;
  }

  async createDailyMetrics(metrics: any[]): Promise<void> {
    if (metrics.length === 0) return;
    await db.insert(dailyMetrics).values(metrics);
  }

  async createPositions(pos: any[]): Promise<void> {
    if (pos.length === 0) return;
    await db.insert(positions).values(pos);
  }
}

export const storage = new DatabaseStorage();
