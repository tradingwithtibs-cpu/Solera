import { XSTOCK_TOKENS } from "./tokens";
import type { CatalogToken } from "./catalog";
import bundled from "@/data/xstocks.json";

/**
 * Server-side source for the catalog. The token list ships with the app
 * (src/data/xstocks.json, generated from CoinGecko's coin list: every id
 * ending in "-xstock" with a Solana mint) so a cold server never depends on
 * CoinGecko's heavily rate-limited list endpoint; it's refreshed from
 * CoinGecko opportunistically every 6 hours. Prices come from Jupiter in
 * batches of 50, hourly. All keyless.
 */
const COINGECKO_LIST = "https://api.coingecko.com/api/v3/coins/list?include_platform=true";
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const LIST_TTL_MS = 6 * 60 * 60_000;
const PRICE_TTL_MS = 60 * 60_000;

interface CoinListEntry {
  id: string;
  symbol: string;
  name: string;
  platforms?: Record<string, string>;
}

const BUNDLED: CatalogToken[] = (bundled as { symbol: string; name: string; mint: string; coingeckoId: string }[]).map((t) => ({
  ...t,
  decimals: 8,
}));

let list: { at: number; tokens: CatalogToken[] } | null = null;
let priced: { at: number; tokens: CatalogToken[] } | null = null;
let refreshing: Promise<CatalogToken[]> | null = null;

/** "AMDX" → "AMDx", "BRK.BX" → "BRK.Bx". */
export function normalizeSymbol(raw: string): string {
  const upper = raw.toUpperCase();
  return upper.endsWith("X") ? `${upper.slice(0, -1)}x` : `${upper}x`;
}

export function normalizeName(raw: string): string {
  return raw.replace(/\s*xstock\s*$/i, "").trim();
}

/** The unpriced list: bundled snapshot immediately, CoinGecko refresh when it allows. Never throws. */
export async function getCatalogList(): Promise<CatalogToken[]> {
  if (list && Date.now() - list.at < LIST_TTL_MS) return list.tokens;
  try {
    const tokens = await fetchList();
    list = { at: Date.now(), tokens };
    return tokens;
  } catch {
    // Rate-limited or down: use what we have, and don't retry for a while.
    list ??= { at: Date.now() - LIST_TTL_MS + 10 * 60_000, tokens: BUNDLED };
    return list.tokens;
  }
}

async function fetchList(): Promise<CatalogToken[]> {
  const res = await fetch(COINGECKO_LIST, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Solera)" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`coingecko list ${res.status}`);
  const data = (await res.json()) as CoinListEntry[];
  const seen = new Set<string>();
  const tokens: CatalogToken[] = [];
  for (const c of data) {
    const mint = c.platforms?.solana;
    if (!c.id.endsWith("-xstock") || !mint) continue;
    const symbol = normalizeSymbol(c.symbol);
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    tokens.push({ symbol, name: normalizeName(c.name), mint, decimals: 8, coingeckoId: c.id });
  }
  // Make sure the featured eight are present even if CoinGecko's list hiccups.
  for (const [symbol, info] of Object.entries(XSTOCK_TOKENS)) {
    if (!seen.has(symbol)) tokens.push({ symbol, name: symbol, mint: info.mint, decimals: info.decimals, coingeckoId: "" });
  }
  return tokens;
}

interface JupiterPriceEntry {
  usdPrice?: number;
  liquidity?: number;
  priceChange24h?: number;
  decimals?: number;
}

async function priceAll(tokens: CatalogToken[]): Promise<CatalogToken[]> {
  const out = tokens.map((t) => ({ ...t }));
  const byMint = new Map(out.map((t) => [t.mint, t]));
  const mints = out.map((t) => t.mint);
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    try {
      let res = await fetch(`${JUPITER_PRICE_URL}?ids=${batch.join(",")}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429) {
        // Jupiter's free tier throttles bursts; back off once and retry this batch.
        await new Promise((r) => setTimeout(r, 4_000));
        res = await fetch(`${JUPITER_PRICE_URL}?ids=${batch.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      }
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, JupiterPriceEntry | undefined>;
      for (const mint of batch) {
        const p = data[mint];
        const t = byMint.get(mint);
        if (!p || !t) continue;
        if (typeof p.usdPrice === "number" && p.usdPrice > 0) t.usdPrice = p.usdPrice;
        if (typeof p.liquidity === "number") t.liquidityUsd = p.liquidity;
        if (typeof p.priceChange24h === "number") t.change24hPct = p.priceChange24h;
        if (typeof p.decimals === "number") t.decimals = p.decimals;
      }
    } catch {
      // Leave this batch unpriced; it'll be retried next refresh.
    }
    // Stay polite with Jupiter's free tier (~60 requests a minute).
    if (i + 50 < mints.length) await new Promise((r) => setTimeout(r, 1_100));
  }
  return out.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}

/** The priced catalog. Serves the previous snapshot while a refresh runs. */
export async function getCatalog(): Promise<CatalogToken[]> {
  if (priced && Date.now() - priced.at < PRICE_TTL_MS) return priced.tokens;
  refreshing ??= (async () => {
    const tokens = await priceAll(await getCatalogList());
    priced = { at: Date.now(), tokens };
    return tokens;
  })().finally(() => {
    refreshing = null;
  });
  if (priced) return priced.tokens;
  return refreshing;
}

/** Look up one catalog token by symbol (server). Uses the unpriced list, so it never waits on pricing. */
export async function findCatalogToken(symbol: string): Promise<CatalogToken | undefined> {
  const tokens = await getCatalogList();
  return tokens.find((t) => t.symbol === symbol);
}
