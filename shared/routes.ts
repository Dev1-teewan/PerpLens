import { z } from "zod";
import { strategies, dailyMetrics, positions } from "./schema";

// ============================================
// API CONTRACT
// ============================================
export const api = {
  strategies: {
    // Get strategy by wallet subkey
    getByWallet: {
      method: "GET" as const,
      path: "/api/strategies/:walletSubkey",
      responses: {
        200: z.custom<typeof strategies.$inferSelect & {
          dailyMetrics: typeof dailyMetrics.$inferSelect[];
          positions: typeof positions.$inferSelect[];
        }>(),
        404: z.object({ message: z.string() }),
      },
    },
  },
};

// ============================================
// HELPER
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
