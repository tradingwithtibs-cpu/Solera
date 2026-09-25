import { PRE_IPO_MINTS } from "./pre-ipo";
import { SOL, USDC, XSTOCK_TOKENS } from "./tokens";
import type { PublicFill } from "./fills";

/**
 * On-chain activity for wallets the user follows (the Following tab):
 * a wallet's recent transactions, read from the RPC, reduced to the
 * tokenized-stock swaps in them. Pure parsing lives here so it can be
 * tested without a network; app/api/activity does the fetching.
 *
 * A swap is recognised from the wallet's own token balance changes: the
 * stock mint that moved decides the side and the size, and the SOL or
 * USDC that moved the other way prices it. Anything else (transfers,
 * staking, NFTs) is ignored.
 */

/** The shape of one parsed transaction, as the RPC returns it with `jsonParsed` encoding. */
export interface RpcTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number; uiAmount: number | null };
}
export interface RpcTransaction {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: RpcTokenBalance[];
    postTokenBalances?: RpcTokenBalance[];
  } | null;
  transaction?: { signatures?: string[]; message?: { accountKeys?: Array<{ pubkey: string } | string> } };
}

const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCdmzE9Vh3D";
const LAMPORTS = 1e9;

/** Mint → symbol for every tokenized stock the parser knows; the catalog can extend it at request time. */
export function knownStockMints(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [symbol, info] of Object.entries(XSTOCK_TOKENS)) out[info.mint] = symbol;
  for (const [mint, info] of Object.entries(PRE_IPO_MINTS)) out[mint] = info.symbol;
  return { ...out, ...extra };
}

function keyOf(k: { pubkey: string } | string): string {
  return typeof k === "string" ? k : k.pubkey;
}

/** Net change of each mint the wallet owns across the transaction, in whole tokens. */
export function tokenDeltas(tx: RpcTransaction, wallet: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (list: RpcTokenBalance[] | undefined, sign: 1 | -1) => {
    for (const b of list ?? []) {
      if (b.owner !== wallet) continue;
      const amount = Number(b.uiTokenAmount.amount) / Math.pow(10, b.uiTokenAmount.decimals);
      if (!Number.isFinite(amount)) continue;
      out.set(b.mint, (out.get(b.mint) ?? 0) + sign * amount);
    }
  };
  add(tx.meta?.preTokenBalances, -1);
  add(tx.meta?.postTokenBalances, 1);
  return out;
}

/** Net change of the wallet's own SOL, fee excluded when the wallet paid it. */
export function solDelta(tx: RpcTransaction, wallet: string): number {
  const keys = tx.transaction?.message?.accountKeys ?? [];
  const index = keys.findIndex((k) => keyOf(k) === wallet);
  if (index < 0) return 0;
  const pre = tx.meta?.preBalances?.[index];
  const post = tx.meta?.postBalances?.[index];
  if (typeof pre !== "number" || typeof post !== "number") return 0;
  const fee = index === 0 ? (tx.meta?.fee ?? 0) : 0;
  return (post - pre + fee) / LAMPORTS;
}

export interface ParsedSwap {
  signature: string;
  at: number;
  mint: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  /** What the other leg was worth in dollars, when SOL or a dollar stable moved; null otherwise. */
  paidUsd: number | null;
}

/**
 * The stock swap in one transaction for `wallet`, or null when it is not
 * one. Exactly one known stock mint must have moved; the counter-leg is
 * USDC/USDT (dollars as is) or SOL (priced with `solUsd`).
 */
export function parseSwap(tx: RpcTransaction, wallet: string, mints: Record<string, string>, solUsd: number | null): ParsedSwap | null {
  if (!tx.meta || tx.meta.err) return null;
  const signature = tx.transaction?.signatures?.[0];
  if (!signature || !tx.blockTime) return null;
  const deltas = tokenDeltas(tx, wallet);
  const moved = [...deltas.entries()].filter(([mint, d]) => mints[mint] && Math.abs(d) > 1e-9);
  if (moved.length !== 1) return null;
  const [mint, delta] = moved[0];
  const stable = (deltas.get(USDC.mint) ?? 0) + (deltas.get(USDT_MINT) ?? 0);
  const sol = solDelta(tx, wallet) + (deltas.get(SOL.mint) ?? 0);
  let paidUsd: number | null = null;
  if (Math.abs(stable) > 1e-6) paidUsd = Math.abs(stable);
  else if (Math.abs(sol) > 1e-6 && solUsd && solUsd > 0) paidUsd = Math.abs(sol) * solUsd;
  return { signature, at: tx.blockTime * 1000, mint, symbol: mints[mint], side: delta > 0 ? "buy" : "sell", quantity: Math.abs(delta), paidUsd };
}

/** A parsed swap as a public fill, so the feed renders it like any other on-chain trade. */
export function swapToFill(swap: ParsedSwap, wallet: string, fallbackPrice: number | null): PublicFill {
  const price = swap.paidUsd !== null && swap.quantity > 0 ? swap.paidUsd / swap.quantity : (fallbackPrice ?? 0);
  const ticker = swap.mint in PRE_IPO_MINTS ? null : swap.symbol;
  return {
    id: `chain:${swap.signature}`,
    mode: "live",
    owner: wallet,
    wallet,
    ticker,
    mint: swap.mint,
    side: swap.side,
    quantity: swap.quantity,
    pricePerShare: price,
    totalValue: price * swap.quantity,
    note: null,
    wrongIf: null,
    leg: null,
    via: "chain",
    signature: swap.signature,
    createdAt: swap.at,
  };
}

/**
 * One wallet's history for its investor page: the fills it made through
 * Solera (which carry the note) and the stock swaps read from the chain,
 * newest first. A Solera live fill and its own on-chain transaction share a
 * signature and appear once, as the Solera row.
 */
export function mergeWalletHistory(solera: PublicFill[], chain: PublicFill[]): PublicFill[] {
  const seen = new Set(solera.map((f) => f.signature).filter((s): s is string => !!s));
  const extra = chain.filter((f) => !(f.signature && seen.has(f.signature)));
  return [...solera, ...extra].sort((a, b) => b.createdAt - a.createdAt);
}
