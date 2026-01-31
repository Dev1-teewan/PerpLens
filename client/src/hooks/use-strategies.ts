import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { mockStrategy } from "@/mock-strategy";

export function useStrategy(walletSubkey: string) {
  return useQuery({
    queryKey: [api.strategies.getByWallet.path, walletSubkey],
    queryFn: async () => {
      const url = buildUrl(api.strategies.getByWallet.path, { walletSubkey });
      try {
        const res = await fetch(url, {
          cache: "no-cache", // Avoid 304 issues by always fetching fresh data
        });
        if (res.status === 404)
          return walletSubkey === "main-account" ? mockStrategy : null;
        // 304 Not Modified is a valid response - browser should use cached data
        // But with no-cache, we shouldn't get 304s anymore
        if (!res.ok && res.status !== 304) {
          throw new Error("Failed to fetch strategy data");
        }
        return (await res.json()) as typeof mockStrategy;
      } catch {
        if (walletSubkey === "main-account") return mockStrategy;
        throw new Error("Failed to fetch strategy data");
      }
    },
    enabled: !!walletSubkey,
    retry: 1, // Only retry once to avoid infinite loops
  });
}
