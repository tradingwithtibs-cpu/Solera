// Core domain types for Solera.
//
// These shapes are intentionally decoupled from where the data comes from.
// Right now everything is populated from `mock-data.ts`; later this can be
// swapped for real on-chain/indexer data without touching the UI.

/**
 * A tokenized-stock symbol, e.g. "AAPLx". Eight are featured with curated
 * data (see mock-data.ts); the rest come from the live catalog (see
 * lib/catalog.ts), so this is an open string rather than a fixed union.
 */
export type TickerSymbol = string;

export interface TickerInfo {
  symbol: TickerSymbol;
  /** Underlying company/index name, e.g. "Tesla". */
  name: string;
  /** Simulated current price in USD. */
  price: number;
  /** Tailwind background color class used for the ticker's accent dot/avatar. */
  color: string;
  /** Placeholder trailing series (oldest → newest) shown until real history loads; empty for catalog tokens. */
  history: number[];
  /** Solana mint, for catalog tokens (featured mints live in lib/tokens.ts). */
  mint?: string;
}

/** A single position: how many (fractional) shares are held of a ticker. */
export interface HoldingPosition {
  ticker: TickerSymbol;
  shares: number;
  /** Optional short rationale for the position — "why", not just "what". */
  thesis?: string;
  /**
   * Average price paid per share. Only meaningful for the signed-in user's
   * own portfolio (used to compute real unrealized gain/loss); investor
   * mock holdings don't need it since their `performancePct` is a
   * standalone fake figure.
   */
  costBasis?: number;
}

/** Handles for the social platforms an investor may link on their profile. */
export interface InvestorSocials {
  x?: string;
  instagram?: string;
  discord?: string;
}

export interface Investor {
  id: string;
  /** "wallet": a real on-chain holder. "sample": a hand-written placeholder shown until real data loads. */
  kind?: "wallet" | "sample";
  name: string;
  handle: string;
  initials: string;
  /** Tailwind background color class for the avatar. */
  avatarColor: string;
  bio: string;
  /** For wallets: value-weighted 7-day price move of their holdings. For samples: a made-up monthly figure. */
  performancePct: number;
  /** Wallets only: the same measure over 30 days. */
  performance30dPct?: number;
  holdings: HoldingPosition[];
  socials?: InvestorSocials;
  /**
   * Fake Solana address, standing in for a real wallet. Performance isn't
   * actually verified against it yet — see OnChainBadge.tsx — this is here
   * so the concept has a concrete anchor once wallets are wired in for real.
   */
  walletAddress: string;
}

export type TradeSide = "buy" | "sell";

/** A completed trade, logged locally for the Portfolio "Recent activity" / Activity screen. */
export interface Transaction {
  id: string;
  ticker: TickerSymbol;
  /** Missing on transactions logged before sell support existed — treat as "buy". */
  side?: TradeSide;
  quantity: number;
  pricePerShare: number;
  /** Dollar value of the trade — cost for a buy, proceeds for a sell. */
  totalValue: number;
  timestamp: number;
  /** Set when this trade was placed via "Copy" from an investor's holding. */
  copiedFromInvestorId?: string;
  /** Solana transaction signature — present only for live (on-chain) trades. */
  signature?: string;
}

export type OptionSide = "call" | "put";

/**
 * A single listed contract from the (simulated) options chain — see
 * lib/options.ts for how these are generated. Not persisted anywhere;
 * regenerated deterministically from the ticker + a contract's own
 * side/strike/expiration whenever it's needed again (e.g. from a URL).
 */
export interface OptionContract {
  underlying: TickerSymbol;
  side: OptionSide;
  /** Strike price in USD. */
  strike: number;
  /** ISO date string — the contract's expiration date. */
  expiration: string;
  /** Simulated premium, per share (multiply by 100 for one contract's cost). */
  premium: number;
}

/**
 * A held options position — the user's own contract holding. Buy-only for
 * now (see the design conversation this came out of): no writing/selling,
 * so there's no assignment risk to model. Kept separate from
 * `HoldingPosition` (equity shares) rather than merged in, since options
 * expire and settle completely differently and shouldn't feed into the
 * Solera Score or cost-basis math built for shares.
 */
export interface OptionPosition extends OptionContract {
  /** Stable identity for one contract spec: `${underlying}-${side}-${strike}-${expiration}`. */
  id: string;
  /** Whole number — contracts don't trade in fractions. */
  contracts: number;
  /** Weighted-average premium paid per share, across top-ups. */
  costBasisPremium: number;
}

/** A completed options buy, logged for "Recent options activity". */
export interface OptionTransaction {
  id: string;
  underlying: TickerSymbol;
  side: OptionSide;
  strike: number;
  expiration: string;
  contracts: number;
  premium: number;
  /** Dollar cost of the trade: premium * 100 * contracts. */
  totalValue: number;
  timestamp: number;
}

/** A message in a per-ticker demo chat room. Local-only — see use-chat.ts. */
/** One post in a ticker's room. The author is a wallet; profiles (if claimed) supply the name. */
export interface ChatMessage {
  id: string;
  room: string;
  wallet: string;
  body: string;
  /** Unix ms. */
  createdAt: number;
}
