import { TICKERS } from "./mock-data";
import { XSTOCK_TOKENS, type TokenInfo } from "./tokens";
import type { TickerInfo, TickerSymbol } from "./types";

/**
 * Every tokenized stock on Solana, not just the eight featured ones.
 *
 * The featured tickers in mock-data.ts have curated names, colors, Pyth
 * feeds and 30-day history. Everything else comes from the catalog
 * (app/api/catalog): CoinGecko's list of xStock tokens with Solana mints,
 * priced and ranked by liquidity through Jupiter. Once registered on the
 * client, a catalog token can be browsed, charted, held and traded exactly
 * like a featured one — it just has no Pyth premium badge.
 */
export interface CatalogToken {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  coingeckoId: string;
  usdPrice?: number;
  liquidityUsd?: number;
  change24hPct?: number;
}

/** Below this much pool liquidity a market is thin: wide spreads, real price impact on small orders. */
export const THIN_LIQUIDITY_USD = 25_000;

const bySymbol = new Map<string, CatalogToken>();
const byMint = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

export function registerCatalog(tokens: CatalogToken[]) {
  for (const t of tokens) {
    bySymbol.set(t.symbol, t);
    byMint.set(t.mint, t.symbol);
  }
  version++;
  listeners.forEach((l) => l());
}

export function subscribeCatalog(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever the catalog is (re)registered — a cheap snapshot for useSyncExternalStore. */
export function getCatalogVersion(): number {
  return version;
}

export function isCatalogLoaded(): boolean {
  return bySymbol.size > 0;
}

/** Catalog tokens, most liquid first. */
export function getCatalogTokens(): CatalogToken[] {
  return [...bySymbol.values()].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}

export function getCatalogToken(symbol: string): CatalogToken | undefined {
  return bySymbol.get(symbol);
}

export function isFeatured(symbol: string): boolean {
  return Object.hasOwn(TICKERS, symbol);
}

const COLORS = [
  "bg-violet-500", "bg-sky-500", "bg-rose-500", "bg-amber-500", "bg-emerald-500",
  "bg-indigo-500", "bg-cyan-600", "bg-fuchsia-500", "bg-orange-500", "bg-teal-500", "bg-blue-600", "bg-lime-600",
];

function colorFor(symbol: string): string {
  let hash = 0;
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

/**
 * Display info for any ticker. Featured tickers keep their curated entry;
 * catalog tokens get a generated one; anything unknown (e.g. a practice
 * holding persisted before the catalog loaded) gets a neutral placeholder
 * rather than crashing a render.
 */
export function getTickerInfo(symbol: TickerSymbol): TickerInfo {
  const featured = TICKERS[symbol];
  if (featured) return featured;
  const c = bySymbol.get(symbol);
  if (c) return { symbol, name: c.name, price: c.usdPrice ?? 0, color: colorFor(symbol), history: [], mint: c.mint };
  return { symbol, name: symbol, price: 0, color: "bg-neutral-400", history: [] };
}

/** Loose on purpose: a stored practice holding must survive a reload even before the catalog arrives. */
export function isKnownTicker(symbol: unknown): symbol is TickerSymbol {
  return typeof symbol === "string" && (isFeatured(symbol) || bySymbol.has(symbol) || /^[A-Z0-9.]{1,12}x$/.test(symbol));
}

export function getTokenForSymbol(symbol: string): TokenInfo | undefined {
  const featured = (XSTOCK_TOKENS as Record<string, TokenInfo>)[symbol];
  if (featured) return featured;
  const c = bySymbol.get(symbol);
  return c ? { mint: c.mint, decimals: c.decimals } : undefined;
}

export function symbolForMint(mint: string): string | undefined {
  for (const [symbol, info] of Object.entries(XSTOCK_TOKENS)) if (info.mint === mint) return symbol;
  return byMint.get(mint);
}

/** The full display list: featured first, then the catalog by liquidity, without duplicates. */
export function getAllTickerInfos(): TickerInfo[] {
  const featured = Object.values(TICKERS);
  const rest = getCatalogTokens()
    .filter((t) => !isFeatured(t.symbol))
    .map((t) => getTickerInfo(t.symbol));
  return [...featured, ...rest];
}
