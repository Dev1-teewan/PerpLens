import { pgTable, text, serial, numeric, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

// Strategy/Portfolio Snapshot
export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  walletSubkey: text("wallet_subkey").notNull().unique(), // The identifier user enters
  totalFundingPnl: numeric("total_funding_pnl").notNull(),
  currentApy: numeric("current_apy").notNull(),
  activeNotional: numeric("active_notional").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Daily PnL History (for charts and heatmap)
export const dailyMetrics = pgTable("daily_metrics", {
  id: serial("id").primaryKey(),
  strategyId: integer("strategy_id").notNull(),
  date: timestamp("date").notNull(),
  dailyPnl: numeric("daily_pnl").notNull(),
  dailyFunding: numeric("daily_funding").notNull(),
  cumulativePnl: numeric("cumulative_pnl").notNull(),
});

// Active Positions (Pairs)
export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  strategyId: integer("strategy_id").notNull(),
  pairName: text("pair_name").notNull(), // e.g., "SOL-PERP"
  hedgeType: text("hedge_type").notNull().default("Cash & Carry"),
  notionalSize: numeric("notional_size").notNull(),
  netPnl: numeric("net_pnl").notNull(),
  fundingEarned: numeric("funding_earned").notNull(),
  roi: numeric("roi").notNull(), // Percentage
  status: text("status").notNull().default("Open"),
  // Additional details for the "drawer"
  longEntryPrice: numeric("long_entry_price").notNull(),
  shortEntryPrice: numeric("short_entry_price").notNull(),
  currentPrice: numeric("current_price").notNull(),
});

// === RELATIONS ===
export const strategiesRelations = relations(strategies, ({ many }) => ({
  dailyMetrics: many(dailyMetrics),
  positions: many(positions),
}));

export const dailyMetricsRelations = relations(dailyMetrics, ({ one }) => ({
  strategy: one(strategies, {
    fields: [dailyMetrics.strategyId],
    references: [strategies.id],
  }),
}));

export const positionsRelations = relations(positions, ({ one }) => ({
  strategy: one(strategies, {
    fields: [positions.strategyId],
    references: [strategies.id],
  }),
}));

// === BASE SCHEMAS ===
export const insertStrategySchema = createInsertSchema(strategies).omit({ id: true, updatedAt: true });
export const insertDailyMetricSchema = createInsertSchema(dailyMetrics).omit({ id: true });
export const insertPositionSchema = createInsertSchema(positions).omit({ id: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Strategy = typeof strategies.$inferSelect;
export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type Position = typeof positions.$inferSelect;

export type StrategyResponse = Strategy & {
  dailyMetrics: DailyMetric[];
  positions: Position[];
};

import { integer } from "drizzle-orm/pg-core";
