import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStrategyByWallet } from "../../server/data";
import { fetchAllRecentFundingPayments } from "../../server/drift-service";
import { transformDriftDataToStrategy } from "../../server/drift-transformer";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const walletSubkey = String(req.query.walletSubkey ?? "");

  if (walletSubkey === "main-account") {
    const strategy = getStrategyByWallet(walletSubkey);
    if (strategy) return res.json(strategy);
  }

  try {
    const records = await fetchAllRecentFundingPayments(walletSubkey, 10);
    if (records.length === 0) {
      return res.status(404).json({ message: "No funding payment records found for this address." });
    }
    const strategy = transformDriftDataToStrategy(walletSubkey, records);
    res.json(strategy);
  } catch (error) {
    console.error("Error fetching Drift data:", error);
    res.status(500).json({ message: "Failed to fetch data from Drift API." });
  }
}
