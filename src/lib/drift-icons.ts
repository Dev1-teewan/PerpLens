const DRIFT_LOGO_BASE = "https://drift-public.s3.eu-central-1.amazonaws.com/assets/icons/markets";

/** Symbols whose icons use .webp format on Drift CDN. */
const WEBP_SYMBOLS = new Set(["wif", "bonk"]);

/** 1K/1M-prefixed symbols whose icon is .svg on the CDN (not .webp). */
const SVG_OVERRIDE_SYMBOLS = new Set(["pump", "mon"]);

/**
 * Returns the Drift CDN icon URL for a given market symbol (e.g. "SOL-PERP" or "SOL").
 * Handles 1M/1K prefix stripping and .webp vs .svg format selection.
 */
export function getDriftIconUrl(symbolOrPair: string): string {
  const symbol = symbolOrPair.split("-")[0].toLowerCase();
  let fileSymbol = symbol;
  let ext: "webp" | "svg" = "svg";

  if (symbol.startsWith("1m") || symbol.startsWith("1k")) {
    fileSymbol = symbol.slice(2);
    ext = SVG_OVERRIDE_SYMBOLS.has(fileSymbol) ? "svg" : "webp";
  } else if (WEBP_SYMBOLS.has(symbol)) {
    ext = "webp";
  }

  return `${DRIFT_LOGO_BASE}/${fileSymbol}.${ext}`;
}
