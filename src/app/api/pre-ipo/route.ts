import { NextResponse } from "next/server";
import {
  PRESTOCKS_SYMBOLS,
  TESSERA_CODES,
  impliedValuation,
  premiumToMark,
  type PreIpoToken,
} from "@/lib/pre-ipo";

const PRESTOCKS_URL = "https://prestocks.com/api/prestocks";
const TESSERA_URL = "https://rest-api.tessera.pe/v1/public/token-details";
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";

/** Issuer marks move slowly; Jupiter prices are re-read on every refresh. */
const CACHE_TTL_MS = 30_000;

export interface PreIpoResponse {
  tokens: PreIpoToken[];
  /** Which issuer feeds answered; the UI can say so when one is down. */
  sources: { prestocks: boolean; tessera: boolean };
  fetchedAt: number;
}

let cached: { at: number; body: PreIpoResponse } | null = null;

interface PreStocksEntry {
  symbol: string;
  contract_address: string;
  markPrice: number;
  markValuation: number;
  tokenPrice: number;
  impliedValuation: number;
}

interface TesseraEntry {
  code: string;
  symbol: string;
  mint: string;
  markPrice: number;
  markValuation: number;
  holders?: number;
}

interface JupiterPriceEntry {
  usdPrice?: number;
  liquidity?: number;
  priceChange24h?: number;
  decimals?: number;
}

/**
 * Every pre-IPO token from both issuers, normalized so they can be compared.
 * Server-side so the three upstream calls happen once per 30s for all
 * users, not once per browser.
 */
export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return NextResponse.json(cached.body);

  const [prestocks, tessera] = await Promise.allSettled([fetchPreStocks(), fetchTessera()]);
  const partial: Omit<PreIpoToken, "tokenPrice" | "impliedValuation" | "premiumPct">[] = [
    ...(prestocks.status === "fulfilled" ? prestocks.value : []),
    ...(tessera.status === "fulfilled" ? tessera.value : []),
  ];
  if (partial.length === 0) {
    return NextResponse.json({ error: "Pre-IPO issuers unreachable" }, { status: 502 });
  }

  // Live trading prices for every mint in one Jupiter call. If Jupiter is
  // down we still return the list, priced at the issuer's mark (so the
  // premium reads 0%), rather than nothing.
  let jupiter: Record<string, JupiterPriceEntry | undefined> = {};
  try {
    const res = await fetch(`${JUPITER_PRICE_URL}?ids=${partial.map((t) => t.mint).join(",")}`, {
      cache: "no-store",
    });
    if (res.ok) jupiter = (await res.json()) as typeof jupiter;
  } catch {
    // Fall through with issuer marks only.
  }

  const tokens: PreIpoToken[] = partial.map((t) => {
    const j = jupiter[t.mint];
    const tokenPrice = j?.usdPrice && j.usdPrice > 0 ? j.usdPrice : t.markPrice;
    return {
      ...t,
      decimals: j?.decimals ?? t.decimals,
      tokenPrice,
      impliedValuation: impliedValuation(tokenPrice, t.markPrice, t.markValuation),
      premiumPct: premiumToMark(tokenPrice, t.markPrice),
      liquidityUsd: j?.liquidity,
      change24hPct: j?.priceChange24h,
    };
  });

  const body: PreIpoResponse = {
    tokens,
    sources: { prestocks: prestocks.status === "fulfilled", tessera: tessera.status === "fulfilled" },
    fetchedAt: Date.now(),
  };
  cached = { at: body.fetchedAt, body };
  return NextResponse.json(body);
}

async function fetchPreStocks() {
  const res = await fetch(PRESTOCKS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`PreStocks ${res.status}`);
  const data = (await res.json()) as PreStocksEntry[];
  return data
    .filter((e) => PRESTOCKS_SYMBOLS[e.symbol] && e.markPrice > 0 && e.markValuation > 0)
    .map((e) => ({
      issuer: "PreStocks" as const,
      company: PRESTOCKS_SYMBOLS[e.symbol],
      symbol: e.symbol,
      mint: e.contract_address,
      decimals: 9,
      markPrice: e.markPrice,
      markValuation: e.markValuation,
    }));
}

async function fetchTessera() {
  const res = await fetch(TESSERA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Tessera ${res.status}`);
  const data = (await res.json()) as TesseraEntry[];
  return data
    .filter((e) => TESSERA_CODES[e.code] && e.markPrice > 0 && e.markValuation > 0)
    .map((e) => ({
      issuer: "Tessera" as const,
      company: TESSERA_CODES[e.code],
      symbol: e.symbol,
      mint: e.mint,
      decimals: 9,
      markPrice: e.markPrice,
      markValuation: e.markValuation,
      holders: e.holders,
    }));
}
