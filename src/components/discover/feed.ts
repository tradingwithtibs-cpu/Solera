import type { PublicFill, Leg } from "@/lib/fills";
import type { FeedNews } from "@/hooks/use-news";
import type { Transaction } from "@/lib/types";
import { PRE_IPO_MINTS } from "@/lib/pre-ipo";
import { ownerKind } from "@/lib/owner";
import { shortAddress } from "@/lib/investors";
import type { Profile } from "@/lib/profiles";

/**
 * The feed's rows: a real fill (from /api/tape, /api/fills or this
 * browser's practice ledger) or a real headline. Pure helpers; nothing
 * here invents a person, a note or a number.
 */
export interface FeedFill {
  kind: "fill";
  id: string;
  at: number;
  mode: "practice" | "live";
  /** Owner string: wallet address or account id. */
  owner: string;
  wallet: string | null;
  ticker: string | null;
  mint: string | null;
  side: "buy" | "sell";
  quantity: number;
  pricePerShare: number;
  totalValue: number;
  note: string | null;
  wrongIf: string | null;
  leg: Leg | null;
  via: string;
  signature: string | null;
  /** The signed-in owner's (or this browser's) own fill. */
  mine: boolean;
  /** From this browser's practice ledger, not the server. */
  local: boolean;
}

export type FeedItem = FeedFill | FeedNews;

export type FeedTab = "news" | "hot" | "all" | "following" | "mine";

export const FEED_TABS: { key: FeedTab; label: string }[] = [
  { key: "news", label: "News" },
  { key: "hot", label: "Hot" },
  { key: "all", label: "Everyone" },
  { key: "following", label: "Following" },
  { key: "mine", label: "Mine" },
];

export function fromPublicFill(f: PublicFill, mine: boolean): FeedFill {
  return {
    kind: "fill",
    id: `fill:${f.mode}:${f.id}`,
    at: f.createdAt,
    mode: f.mode,
    owner: f.owner,
    wallet: f.wallet ?? (ownerKind(f.owner) === "wallet" ? f.owner : null),
    ticker: f.ticker,
    mint: f.mint,
    side: f.side,
    quantity: f.quantity,
    pricePerShare: f.pricePerShare,
    totalValue: f.totalValue,
    note: f.note,
    wrongIf: f.wrongIf,
    leg: f.leg,
    via: f.via || "ticket",
    signature: f.signature,
    mine,
    local: false,
  };
}

/** A fill from this browser's ledger (signed out), shown on "Mine" only. */
export function fromLocalTransaction(t: Transaction, mode: "practice" | "live", owner: string): FeedFill {
  return {
    kind: "fill",
    id: `local:${t.id}`,
    at: t.timestamp,
    mode,
    owner,
    wallet: ownerKind(owner) === "wallet" ? owner : null,
    ticker: t.ticker,
    mint: null,
    side: t.side ?? "buy",
    quantity: t.quantity,
    pricePerShare: t.pricePerShare,
    totalValue: t.totalValue,
    note: t.note ?? null,
    wrongIf: t.wrongIf ?? null,
    leg: t.leg ?? null,
    via: t.via ?? (t.copiedFromInvestorId ? "copy" : "ticket"),
    signature: t.signature ?? null,
    mine: true,
    local: true,
  };
}

/** The symbol a fill traded: the xStock ticker, or the pre-IPO token's symbol from its mint. */
export function fillSymbol(f: FeedFill): string {
  if (f.ticker) return f.ticker;
  if (f.mint) return PRE_IPO_MINTS[f.mint]?.symbol ?? shortAddress(f.mint);
  return "—";
}

/** Display name for a fill's actor: the claimed profile, else the short wallet, else a short account id. */
export function actorName(f: FeedFill, profile: Profile | null | undefined): string {
  if (profile?.name) return profile.name;
  if (f.wallet) return shortAddress(f.wallet);
  return `Account ${f.owner.slice(0, 4)}`;
}

export function actorInitials(f: FeedFill, profile: Profile | null | undefined): string {
  if (profile?.name) {
    return profile.name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }
  return (f.wallet ?? f.owner).slice(0, 2).toUpperCase();
}

/** Percent move since the fill printed, sign flipped for sells so "up" means the trade is working. */
export function sinceFillPct(f: FeedFill, price: number): number | null {
  if (!(price > 0) || !(f.pricePerShare > 0)) return null;
  const raw = ((price - f.pricePerShare) / f.pricePerShare) * 100;
  return f.side === "sell" ? -raw : raw;
}

/** Newest first. */
export function byRecency(a: FeedItem, b: FeedItem): number {
  return b.at - a.at;
}

/**
 * "Hot" until votes exist (task S1): headlines and fills that carry a
 * note, by recency. The partner's score / (age + 2)^1.4 collapses to this
 * when every score is zero.
 */
export function hotItems(news: FeedNews[], fills: FeedFill[]): FeedItem[] {
  return [...news, ...fills.filter((f) => !!f.note)].sort(byRecency);
}

/** Fills within the last hour, grouped by symbol, busiest first. */
export function groupLastHour(fills: FeedFill[], now: number): { symbol: string; count: number }[] {
  const hour = now - 3_600_000;
  const counts = new Map<string, number>();
  for (const f of fills) {
    if (f.at <= hour) continue;
    const s = fillSymbol(f);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()].map(([symbol, count]) => ({ symbol, count })).sort((a, b) => b.count - a.count);
}

export function shortSignature(sig: string): string {
  return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}

export function legLabel(leg: Leg): string {
  return leg === "gap" ? "gap closes" : "mark rises";
}
