/**
 * Pre-IPO tokens: on-chain exposure to private companies, from two issuers.
 *
 * - PreStocks (prestocks.com): 8 companies. Each token is backed 1:1 by SPV
 *   exposure; the issuer publishes a "mark" price from private secondary
 *   deals plus the valuation that mark implies.
 * - Tessera (tessera.pe): 3 companies as T-Tokens (loan participation
 *   rights on an SPV holding the shares). Publishes a mark price and the
 *   company valuation that mark corresponds to.
 *
 * Three companies are sold by both — OpenAI, Kalshi, SpaceX — and the two
 * tokens for the same company trade at different prices. A raw price
 * comparison is meaningless (one token ≠ one share, and the slice differs
 * per issuer), so everything here normalizes to the company valuation a
 * token's price implies. That's the number a buyer actually cares about:
 * "what am I valuing OpenAI at if I pay this?"
 */

export type Issuer = "PreStocks" | "Tessera";

export type CompanyId =
  | "openai"
  | "anthropic"
  | "spacex"
  | "kalshi"
  | "anduril"
  | "neuralink"
  | "polymarket"
  | "figureai";

export interface Company {
  id: CompanyId;
  name: string;
  /** Short label for the round badge. */
  short: string;
  /** Tailwind background class for the badge, matching TickerInfo.color. */
  color: string;
  sector: string;
}

export const COMPANIES: Record<CompanyId, Company> = {
  openai: { id: "openai", name: "OpenAI", short: "OAI", color: "bg-neutral-900", sector: "Artificial intelligence" },
  anthropic: { id: "anthropic", name: "Anthropic", short: "ANT", color: "bg-orange-500", sector: "Artificial intelligence" },
  spacex: { id: "spacex", name: "SpaceX", short: "SPX", color: "bg-slate-600", sector: "Aerospace" },
  kalshi: { id: "kalshi", name: "Kalshi", short: "KAL", color: "bg-emerald-600", sector: "Prediction markets" },
  anduril: { id: "anduril", name: "Anduril", short: "AND", color: "bg-zinc-700", sector: "Defense" },
  neuralink: { id: "neuralink", name: "Neuralink", short: "NRL", color: "bg-violet-600", sector: "Neurotech" },
  polymarket: { id: "polymarket", name: "Polymarket", short: "POLY", color: "bg-blue-600", sector: "Prediction markets" },
  figureai: { id: "figureai", name: "Figure AI", short: "FIG", color: "bg-cyan-600", sector: "Robotics" },
};

/** Issuer symbol → company. Anything not listed here is ignored by the route. */
export const PRESTOCKS_SYMBOLS: Record<string, CompanyId> = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  SPACEX: "spacex",
  KALSHI: "kalshi",
  ANDURIL: "anduril",
  NEURALINK: "neuralink",
  POLYMARKET: "polymarket",
  FIGUREAI: "figureai",
};

export const TESSERA_CODES: Record<string, CompanyId> = {
  tOpenAI: "openai",
  tKalshi: "kalshi",
  tSpaceX: "spacex",
};

/**
 * Static registry of every pre-IPO mint, so a wallet's balances can be
 * labelled and valued without waiting for the issuer feeds. Mints don't
 * change; prices come from /api/pre-ipo.
 */
export interface PreIpoMintInfo {
  mint: string;
  symbol: string;
  issuer: Issuer;
  company: CompanyId;
  decimals: number;
}

export const PRE_IPO_MINTS: Record<string, PreIpoMintInfo> = Object.fromEntries(
  (
    [
      ["PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", "OPENAI", "PreStocks", "openai"],
      ["Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw", "ANTHROPIC", "PreStocks", "anthropic"],
      ["PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", "SPACEX", "PreStocks", "spacex"],
      ["PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua", "KALSHI", "PreStocks", "kalshi"],
      ["PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB", "ANDURIL", "PreStocks", "anduril"],
      ["PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S", "NEURALINK", "PreStocks", "neuralink"],
      ["Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP", "POLYMARKET", "PreStocks", "polymarket"],
      ["PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd", "FIGUREAI", "PreStocks", "figureai"],
      ["oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ", "T-OpenAI", "Tessera", "openai"],
      ["TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ", "T-Kalshi", "Tessera", "kalshi"],
      ["TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v", "T-SpaceX", "Tessera", "spacex"],
    ] as [string, string, Issuer, CompanyId][]
  ).map(([mint, symbol, issuer, company]) => [mint, { mint, symbol, issuer, company, decimals: 9 }]),
);

export interface PreIpoToken {
  issuer: Issuer;
  company: CompanyId;
  /** Issuer's display symbol, e.g. "OPENAI" or "T-OpenAI". */
  symbol: string;
  mint: string;
  decimals: number;
  /** What the token trades at on Solana right now (Jupiter), in USD. */
  tokenPrice: number;
  /** The issuer's own reference price for one token, in USD. */
  markPrice: number;
  /** Company valuation the issuer's mark corresponds to, in USD. */
  markValuation: number;
  /** Company valuation the current token price implies, in USD. */
  impliedValuation: number;
  /** Token price vs mark, in percent: + means paying above the issuer's mark. */
  premiumPct: number;
  holders?: number;
  liquidityUsd?: number;
  change24hPct?: number;
}

/** Valuation the market price implies, scaling the issuer's mark → valuation ratio. */
export function impliedValuation(tokenPrice: number, markPrice: number, markValuation: number): number {
  if (!(tokenPrice > 0) || !(markPrice > 0) || !(markValuation > 0)) return NaN;
  return (tokenPrice / markPrice) * markValuation;
}

/** + when the token trades above the issuer's mark, − below. */
export function premiumToMark(tokenPrice: number, markPrice: number): number {
  if (!(tokenPrice > 0) || !(markPrice > 0)) return NaN;
  return ((tokenPrice - markPrice) / markPrice) * 100;
}

export interface CompanyComparison {
  company: Company;
  /** Cheapest implied valuation first. */
  tokens: PreIpoToken[];
  cheapest: PreIpoToken;
  priciest: PreIpoToken;
  /** How much lower the cheapest token's implied valuation is than the priciest's, in percent (0–100). */
  cheaperByPct: number;
  /** How far apart the issuers' own mark valuations are, in percent of the higher one. */
  markDisagreementPct: number;
  /** Which token trades furthest below its own issuer's mark (the "discount to mark" view). */
  bestDiscountToMark: PreIpoToken;
}

/**
 * Companies sold by more than one issuer, each with its tokens ordered from
 * cheapest implied valuation to priciest. This is the "which token should I
 * buy for OpenAI exposure?" answer.
 */
export function compareAcrossIssuers(tokens: PreIpoToken[]): CompanyComparison[] {
  const byCompany = new Map<CompanyId, PreIpoToken[]>();
  for (const t of tokens) {
    if (!Number.isFinite(t.impliedValuation)) continue;
    byCompany.set(t.company, [...(byCompany.get(t.company) ?? []), t]);
  }
  const out: CompanyComparison[] = [];
  for (const [id, list] of byCompany) {
    if (new Set(list.map((t) => t.issuer)).size < 2) continue;
    const sorted = [...list].sort((a, b) => a.impliedValuation - b.impliedValuation);
    const cheapest = sorted[0];
    const priciest = sorted[sorted.length - 1];
    const marks = list.map((t) => t.markValuation);
    const hiMark = Math.max(...marks);
    const loMark = Math.min(...marks);
    out.push({
      company: COMPANIES[id],
      tokens: sorted,
      cheapest,
      priciest,
      cheaperByPct: (1 - cheapest.impliedValuation / priciest.impliedValuation) * 100,
      markDisagreementPct: hiMark > 0 ? (1 - loMark / hiMark) * 100 : 0,
      bestDiscountToMark: [...list].sort((a, b) => a.premiumPct - b.premiumPct)[0],
    });
  }
  return out.sort((a, b) => b.cheaperByPct - a.cheaperByPct);
}

/** "$1.30T", "$31.1B". */
export function formatValuation(usd: number): string {
  if (!Number.isFinite(usd)) return "—";
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  return `$${(usd / 1e6).toFixed(0)}M`;
}

/** "$114K", "$1.2M" — for liquidity and other dollar amounts far below a valuation. */
export function formatCompactUsd(usd: number): string {
  if (!Number.isFinite(usd)) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

/** Jupiter's swap page for buying this token with SOL. */
export function jupiterSwapUrl(mint: string): string {
  return `https://jup.ag/swap/SOL-${mint}`;
}
