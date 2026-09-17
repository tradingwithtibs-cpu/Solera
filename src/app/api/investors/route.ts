import { NextResponse } from "next/server";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { XSTOCK_TOKENS } from "@/lib/tokens";
import type { WalletHoldings } from "@/lib/investors";
import type { TickerSymbol } from "@/lib/types";

/**
 * Real holders of the tokenized stocks, from public data:
 * - rugcheck.xyz's free token report lists each mint's top 20 token
 *   accounts with their owner wallets and flags known program accounts
 *   (AMM pools, lockers). No key needed.
 * - One unrestricted RPC batch call classifies each owner: a wallet is a
 *   System-Program-owned, non-executable account; anything else is a
 *   program's PDA (pool vault, locker) and is dropped.
 *
 * Custodian-sized positions (over 20% of a token's supply, i.e. the
 * issuer's reserve or an exchange) are excluded too — they're not
 * investors anyone would follow. Cached 10 minutes, stale-while-revalidate.
 */
const RUGCHECK = "https://api.rugcheck.xyz/v1/tokens";
const SOLANA_RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const CACHE_TTL_MS = 10 * 60_000;
const CUSTODIAN_PCT = 20;
const MAX_WALLETS = 40;

export interface InvestorsResponse {
  wallets: WalletHoldings[];
  fetchedAt: number;
}

interface RugcheckHolder {
  owner: string;
  address: string;
  uiAmount: number;
  pct: number;
}
interface RugcheckReport {
  topHolders?: RugcheckHolder[];
  knownAccounts?: Record<string, { name?: string; type?: string }>;
}

let cached: { at: number; body: InvestorsResponse } | null = null;
let refreshing: Promise<InvestorsResponse | null> | null = null;

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return NextResponse.json(cached.body);
  refreshing ??= refresh().finally(() => {
    refreshing = null;
  });
  if (cached) return NextResponse.json(cached.body);
  const body = await refreshing;
  if (!body) return NextResponse.json({ error: "Holder data unavailable" }, { status: 502 });
  return NextResponse.json(body);
}

const TICKERS = Object.keys(XSTOCK_TOKENS) as TickerSymbol[];

async function refresh(): Promise<InvestorsResponse | null> {
  const reports = await Promise.allSettled(TICKERS.map((t) => fetchReport(XSTOCK_TOKENS[t].mint)));

  // owner → ticker → shares
  const byOwner = new Map<string, Map<TickerSymbol, number>>();
  reports.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const ticker = TICKERS[i];
    const known = r.value.knownAccounts ?? {};
    for (const h of r.value.topHolders ?? []) {
      if (!h.owner || !(h.uiAmount > 0)) continue;
      if (known[h.owner] || known[h.address]) continue;
      if (h.pct > CUSTODIAN_PCT) continue;
      const row = byOwner.get(h.owner) ?? new Map<TickerSymbol, number>();
      row.set(ticker, (row.get(ticker) ?? 0) + h.uiAmount);
      byOwner.set(h.owner, row);
    }
  });
  if (byOwner.size === 0) return null;

  const wallets = await keepRealWallets([...byOwner.keys()]);
  const list: WalletHoldings[] = wallets
    .map((address) => ({
      address,
      holdings: [...byOwner.get(address)!.entries()].map(([ticker, shares]) => ({ ticker, shares })),
    }))
    // Diversified wallets first: they make for better profiles to follow.
    .sort((a, b) => b.holdings.length - a.holdings.length)
    .slice(0, MAX_WALLETS);

  const body = { wallets: list, fetchedAt: Date.now() };
  cached = { at: body.fetchedAt, body };
  return body;
}

async function fetchReport(mint: string): Promise<RugcheckReport> {
  const res = await fetch(`${RUGCHECK}/${mint}/report`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`rugcheck ${res.status}`);
  return (await res.json()) as RugcheckReport;
}

/** Owners that are plain wallets (System-owned, not executable). Unknown accounts are kept. */
async function keepRealWallets(owners: string[]): Promise<string[]> {
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const keep: string[] = [];
  for (let i = 0; i < owners.length; i += 100) {
    const chunk = owners.slice(i, i + 100);
    let infos: (Awaited<ReturnType<Connection["getAccountInfo"]>> | null)[];
    try {
      infos = await connection.getMultipleAccountsInfo(chunk.map((o) => new PublicKey(o)));
    } catch {
      // If the RPC is unavailable, don't silently include pool PDAs — skip this chunk.
      continue;
    }
    chunk.forEach((owner, j) => {
      const info = infos[j];
      if (!info || (info.owner.equals(SystemProgram.programId) && !info.executable)) keep.push(owner);
    });
  }
  return keep;
}
