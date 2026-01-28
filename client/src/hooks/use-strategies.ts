import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

export function useStrategy(walletSubkey: string) {
  return useQuery({
    queryKey: [api.strategies.getByWallet.path, walletSubkey],
    queryFn: async () => {
      const url = buildUrl(api.strategies.getByWallet.path, { walletSubkey });
      const res = await fetch(url);
      
      // Handle demo mode logic if not found, or backend will return 404
      // For this implementation, we rely on backend response
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch strategy data");
      
      return api.strategies.getByWallet.responses[200].parse(await res.json());
    },
    enabled: !!walletSubkey,
  });
}
