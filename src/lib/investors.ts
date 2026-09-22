import type { HoldingPosition, Investor, TickerSymbol } from "./types";
import { getEffectivePrice, type HistoryWindow } from "./live-prices";
import { trailingChangePct } from "./portfolio";
import type { Profile } from "./profiles";

/**
 * Real investors are real wallets. Nothing here is made up: a wallet's
 * identity is its address, its holdings are what the chain says it holds,
 * and its "performance" is how those holdings moved over the last 7 days
 * at market prices. What we can't know — what they paid, who they are —
 * simply isn't shown.
 */

export interface WalletHoldings {
  address: string;
  holdings: { ticker: TickerSymbol; shares: number }[];
}

const AVATAR_COLORS = [
  "var(--color-tk-1)",
  "var(--color-tk-2)",
  "var(--color-tk-3)",
  "var(--color-tk-4)",
  "var(--color-tk-5)",
  "var(--color-tk-6)",
  "var(--color-tk-7)",
  "var(--color-tk-8)",
];

/** Stable per-address color, so a wallet looks the same everywhere and across reloads. */
export function avatarColorFor(address: string): string {
  let hash = 0;
  for (const ch of address) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Value-weighted 7-day price move of a set of holdings, at current prices.
 * The honest replacement for a made-up "monthly return": it's how the
 * market moved what they hold, not what they earned since buying.
 */
export function weightedTrailingChangePct(holdings: HoldingPosition[], window: HistoryWindow = "7d"): number {
  let value = 0;
  let weighted = 0;
  for (const h of holdings) {
    const v = h.shares * getEffectivePrice(h.ticker);
    value += v;
    weighted += v * trailingChangePct(h.ticker, window);
  }
  return value > 0 ? weighted / value : 0;
}

export function walletToInvestor(wallet: WalletHoldings, profile?: Profile | null): Investor {
  const holdings = wallet.holdings.map((h) => ({ ticker: h.ticker, shares: h.shares }));
  const initials = profile?.name
    ? profile.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : wallet.address.slice(0, 2).toUpperCase();
  return {
    id: wallet.address,
    kind: "wallet",
    name: profile?.name ?? shortAddress(wallet.address),
    handle: profile ? `@${profile.handle}` : "on-chain wallet",
    initials,
    avatarColor: avatarColorFor(wallet.address),
    bio:
      profile?.bio ||
      `A real Solana wallet holding ${holdings.length} tokenized ${holdings.length === 1 ? "stock" : "stocks"}. Holdings are read live from the chain.`,
    performancePct: weightedTrailingChangePct(holdings),
    performance30dPct: weightedTrailingChangePct(holdings, "30d"),
    holdings,
    walletAddress: wallet.address,
  };
}
