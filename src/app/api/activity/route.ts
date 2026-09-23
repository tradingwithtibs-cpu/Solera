import { NextResponse, type NextRequest } from "next/server";
import { knownStockMints, parseSwap, swapToFill, type RpcTransaction } from "@/lib/activity";
import type { PublicFill } from "@/lib/fills";
import { isWalletAddress } from "@/lib/owner";
import { SOL } from "@/lib/tokens";

/**
 * GET /api/activity?wallets=a,b → recent tokenized-stock swaps those
 * wallets made on-chain, newest first, as public fills (via "chain").
 * The Following tab reads this for the Leaderboard wallets a user follows,
 * who mostly never trade through Solera.
 *
 * Reads the public RPC (or SOLANA_RPC_URL): one signature list and up to
 * SIGNATURES transaction lookups per wallet, cached per wallet for ten
 * minutes, at most WALLETS wallets per call. A wallet whose lookups fail
 * simply contributes nothing this round.
 */
const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const WALLETS = 10;
const SIGNATURES = 20;
const CACHE_TTL_MS = 10 * 60_000;
const SOL_PRICE_TTL_MS = 60_000;

export const maxDuration = 30;

const cache = new Map<string, { at: number; fills: PublicFill[] }>();
let solPrice: { at: number; usd: number | null } = { at: 0, usd: null };

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: T; error?: unknown };
    return data.error ? null : (data.result ?? null);
  } catch {
    return null;
  }
}

async function solUsd(): Promise<number | null> {
  if (Date.now() - solPrice.at < SOL_PRICE_TTL_MS) return solPrice.usd;
  try {
    const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL.mint}`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const data = (await res.json()) as Record<string, { usdPrice?: number }>;
    const usd = data[SOL.mint]?.usdPrice ?? null;
    solPrice = { at: Date.now(), usd: typeof usd === "number" && usd > 0 ? usd : solPrice.usd };
  } catch {
    solPrice = { at: Date.now(), usd: solPrice.usd };
  }
  return solPrice.usd;
}

async function walletFills(wallet: string, mints: Record<string, string>, sol: number | null): Promise<PublicFill[]> {
  const hit = cache.get(wallet);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.fills;
  const sigs = await rpc<Array<{ signature: string; err: unknown }>>("getSignaturesForAddress", [wallet, { limit: SIGNATURES }]);
  if (!sigs) return hit?.fills ?? [];
  const fills: PublicFill[] = [];
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await rpc<RpcTransaction>("getTransaction", [s.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]);
    if (!tx) continue;
    const swap = parseSwap(tx, wallet, mints, sol);
    if (swap) fills.push(swapToFill(swap, wallet, null));
  }
  cache.set(wallet, { at: Date.now(), fills });
  return fills;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("wallets") ?? "";
  const wallets = [...new Set(raw.split(",").map((w) => w.trim()).filter(isWalletAddress))].slice(0, WALLETS);
  if (wallets.length === 0) return NextResponse.json({ fills: [] });
  const mints = knownStockMints();
  const sol = await solUsd();
  const perWallet = await Promise.all(wallets.map((w) => walletFills(w, mints, sol)));
  const fills = perWallet.flat().sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ fills, fetchedAt: Date.now() });
}
