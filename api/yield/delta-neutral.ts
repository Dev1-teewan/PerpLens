import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDeltaNeutralAPYs } from "../../server/funding-rate-service";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const data = await getDeltaNeutralAPYs();
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("SOLANA_KEYPAIR_PATH") || msg.includes("WALLET_PRIVATE_KEY")) {
      return res.status(503).json({ message: "Yield API unavailable: Drift SDK not configured." });
    }
    console.error("Yield API error:", err);
    res.status(500).json({ message: "Failed to fetch yield data." });
  }
}
