import { XSTOCK_TOKENS } from "./tokens";
import { findCatalogToken } from "./catalog-server";

const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";

/** The mint behind a ticker, featured or catalog. */
export async function mintForTicker(ticker: string): Promise<{ mint: string; decimals: number } | null> {
  const featured = (XSTOCK_TOKENS as Record<string, { mint: string; decimals: number }>)[ticker];
  if (featured) return { mint: featured.mint, decimals: featured.decimals };
  const token = await findCatalogToken(ticker);
  return token ? { mint: token.mint, decimals: token.decimals } : null;
}

/** One Jupiter price, in USD, or undefined when Jupiter has none. Server-side pricing for practice fills and the evaluator. */
export async function jupiterPriceForMint(mint: string): Promise<number | undefined> {
  const res = await fetch(`${JUPITER_PRICE_URL}?ids=${mint}`, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
  if (!res.ok) return undefined;
  const data = (await res.json()) as Record<string, { usdPrice?: number } | undefined>;
  const p = data[mint]?.usdPrice;
  return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : undefined;
}

/** Prices for several mints in one call. */
export async function jupiterPricesForMints(mints: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    const res = await fetch(`${JUPITER_PRICE_URL}?ids=${batch.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) continue;
    const data = (await res.json()) as Record<string, { usdPrice?: number } | undefined>;
    for (const m of batch) {
      const p = data[m]?.usdPrice;
      if (typeof p === "number" && Number.isFinite(p) && p > 0) out[m] = p;
    }
  }
  return out;
}
