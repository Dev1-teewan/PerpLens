import { z } from "zod";
import type { StrategyResponse } from "./schema";

export const api = {
  strategies: {
    getByWallet: {
      method: "GET" as const,
      path: "/api/strategies/:walletSubkey",
      responses: {
        200: z.custom<StrategyResponse>(),
        404: z.object({ message: z.string() }),
      },
    },
  },
};

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
