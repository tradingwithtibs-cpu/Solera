import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnon } from "@/lib/supabase";
import { rowToPublicFill, type PublicFill } from "@/lib/fills";

/**
 * GET /api/tape?limit=50&ticker=AAPLx → the newest public fills across
 * live (verified) and practice tables, newest first. Names are resolved by
 * the client through /api/profile?owners=.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAnon();
  if (!supabase) return NextResponse.json({ fills: [], configured: false });
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 50)));
  const ticker = request.nextUrl.searchParams.get("ticker");
  let live = supabase.from("live_fills").select("id, owner, wallet, signature, ticker, mint, side, quantity, price_per_share, total_value, note, wrong_if, leg, via, created_at").order("created_at", { ascending: false }).limit(limit);
  let practice = supabase.from("practice_fills").select("id, owner, ticker, mint, side, quantity, price_per_share, total_value, note, wrong_if, leg, via, created_at").order("created_at", { ascending: false }).limit(limit);
  if (ticker) {
    live = live.eq("ticker", ticker);
    practice = practice.eq("ticker", ticker);
  }
  const [l, p] = await Promise.all([live, practice]);
  const missing = (e: { message: string } | null) => !!e && /relation|schema cache/i.test(e.message);
  if (l.error && !missing(l.error)) return NextResponse.json({ error: l.error.message }, { status: 502 });
  if (p.error && !missing(p.error)) return NextResponse.json({ error: p.error.message }, { status: 502 });
  const fills: PublicFill[] = [
    ...((l.data ?? []) as Record<string, unknown>[]).map((r) => rowToPublicFill(r, "live")),
    ...((p.data ?? []) as Record<string, unknown>[]).map((r) => rowToPublicFill(r, "practice")),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  return NextResponse.json({ fills, configured: !(l.error && p.error) });
}
