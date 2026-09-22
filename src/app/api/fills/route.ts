import { NextResponse, type NextRequest } from "next/server";
import { Connection } from "@solana/web3.js";
import { errorResponse, HttpError, requireOwner, walletForSession } from "@/lib/auth-server";
import { getSupabaseAnon, getSupabaseService } from "@/lib/supabase";
import { normalizeThesis, rowToPublicFill, validateThesis, TICKER_PATTERN, type ThesisFields } from "@/lib/fills";
import { isOwner } from "@/lib/owner";

const SOLANA_RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

interface LiveFillBody extends ThesisFields {
  signature: string;
  ticker?: string;
  mint?: string;
  side: "buy" | "sell";
  quantity: number;
  pricePerShare: number;
  totalValue: number;
  settledIn?: "SOL" | "USDC";
  settledAmount?: number;
}

const LIVE_COLUMNS = "id, owner, wallet, signature, ticker, mint, side, quantity, price_per_share, total_value, note, wrong_if, leg, via, created_at";
const PRACTICE_COLUMNS = "id, owner, ticker, mint, side, quantity, price_per_share, total_value, note, wrong_if, leg, via, created_at";

type AnyRow = Record<string, unknown>;

/** Confirms a landed Jupiter swap: it exists, succeeded, and the fee payer is this wallet. */
async function verifyOnChain(signature: string, wallet: string): Promise<boolean | null> {
  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) return null; // not visible yet
    if (tx.meta?.err) return false;
    const payer = tx.transaction.message.staticAccountKeys[0]?.toBase58();
    return payer === wallet;
  } catch {
    return null;
  }
}

/** GET /api/fills?owner=<owner>&limit=50 → one owner's public fills (both modes). */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAnon();
  const owner = request.nextUrl.searchParams.get("owner") ?? "";
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 50)));
  if (!supabase) return NextResponse.json({ fills: [], configured: false });
  if (!isOwner(owner)) return NextResponse.json({ error: "Unknown owner." }, { status: 400 });
  const [live, practice] = await Promise.all([
    supabase.from("live_fills").select(LIVE_COLUMNS).or(`owner.eq.${owner},wallet.eq.${owner}`).order("created_at", { ascending: false }).limit(limit),
    supabase.from("practice_fills").select(PRACTICE_COLUMNS).eq("owner", owner).order("created_at", { ascending: false }).limit(limit),
  ]);
  if (live.error && !/relation|schema cache/i.test(live.error.message)) return NextResponse.json({ error: live.error.message }, { status: 502 });
  if (practice.error && !/relation|schema cache/i.test(practice.error.message)) return NextResponse.json({ error: practice.error.message }, { status: 502 });
  const fills = [
    ...((live.data ?? []) as AnyRow[]).map((r) => rowToPublicFill(r, "live")),
    ...((practice.data ?? []) as AnyRow[]).map((r) => rowToPublicFill(r, "practice")),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  return NextResponse.json({ fills, configured: !(live.error && practice.error) });
}

/**
 * POST /api/fills — a live fill for the public tape, from a session with a
 * wallet. Verified on-chain inline when the transaction is already visible;
 * otherwise stored unverified (hidden by RLS) and re-checked later.
 */
export async function POST(request: NextRequest) {
  try {
    const session = requireOwner(request);
    const wallet = await walletForSession(session);
    if (!wallet) throw new HttpError(403, "Connect a wallet to record a live trade.");
    const service = getSupabaseService();
    if (!service) throw new HttpError(501, "Fills aren't enabled on this deployment yet.");
    let body: LiveFillBody;
    try {
      body = (await request.json()) as LiveFillBody;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    if (typeof body.signature !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(body.signature)) throw new HttpError(400, "That doesn't look like a Solana signature.");
    if (body.ticker && !TICKER_PATTERN.test(body.ticker)) throw new HttpError(400, "Unknown ticker.");
    if (!body.ticker && !body.mint) throw new HttpError(400, "Say which token was traded.");
    if (body.side !== "buy" && body.side !== "sell") throw new HttpError(400, "Choose buy or sell.");
    for (const n of [body.quantity, body.pricePerShare, body.totalValue]) {
      if (!(typeof n === "number" && Number.isFinite(n) && n > 0)) throw new HttpError(400, "Invalid fill amounts.");
    }
    const thesisProblem = validateThesis(body);
    if (thesisProblem) throw new HttpError(400, thesisProblem);
    const thesis = normalizeThesis(body);
    const verified = await verifyOnChain(body.signature, wallet);
    if (verified === false) throw new HttpError(400, "That transaction failed or was sent by another wallet.");

    const row = {
      owner: session.owner,
      wallet,
      signature: body.signature,
      ticker: body.ticker ?? null,
      mint: body.mint ?? null,
      side: body.side,
      quantity: body.quantity,
      price_per_share: body.pricePerShare,
      total_value: body.totalValue,
      settled_in: body.settledIn ?? null,
      settled_amount: body.settledAmount ?? null,
      note: thesis.note ?? null,
      wrong_if: thesis.wrongIf ?? null,
      leg: thesis.leg ?? null,
      via: thesis.via ?? "ticket",
      plan_id: thesis.planId ?? null,
      copied_from: thesis.copiedFrom ?? null,
      verified: verified === true,
    };
    const { data, error } = await service.from("live_fills").upsert(row, { onConflict: "signature" }).select(LIVE_COLUMNS).single();
    if (error) throw new HttpError(502, error.message);
    return NextResponse.json({ fill: rowToPublicFill(data as AnyRow, "live"), verified: verified === true }, { status: verified === true ? 200 : 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
