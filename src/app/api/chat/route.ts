import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnon, getSupabaseService } from "@/lib/supabase";
import { sessionFromHeader } from "@/lib/session-server";
import { POST_COOLDOWN_MS, isValidRoom, normalizeMessageBody, rowToMessage, validateMessageBody, type MessageRow } from "@/lib/chat";

const PAGE = 100;

/** GET /api/chat?room=AAPLx → the room's latest messages, oldest first. */
export async function GET(request: NextRequest) {
  const room = request.nextUrl.searchParams.get("room") ?? "";
  if (!isValidRoom(room)) return NextResponse.json({ error: "Unknown room." }, { status: 400 });
  const supabase = getSupabaseAnon();
  if (!supabase) return NextResponse.json({ messages: [], configured: false });

  const primary = await supabase
    .from("messages")
    .select("id, room, owner, wallet, body, created_at")
    .eq("room", room)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  let data = primary.data as MessageRow[] | null;
  let error = primary.error;
  if (error && /owner/.test(error.message)) {
    // port.sql not run yet: rows are wallet-authored only.
    const legacy = await supabase.from("messages").select("id, room, wallet, body, created_at").eq("room", room).order("created_at", { ascending: false }).limit(PAGE);
    data = legacy.data as MessageRow[] | null;
    error = legacy.error;
  }
  if (error) {
    // The table hasn't been created yet: same as not configured, from the reader's point of view.
    const missing = /relation .* does not exist|schema cache/i.test(error.message);
    return NextResponse.json(missing ? { messages: [], configured: false } : { error: error.message }, { status: missing ? 200 : 502 });
  }
  const messages = ((data ?? []) as MessageRow[]).map(rowToMessage).reverse();
  return NextResponse.json({ messages, configured: true });
}

/**
 * POST /api/chat — post in a room as the signed-in wallet. Auth is the
 * session token from /api/session; the wallet in the token is the author,
 * so nobody can post as someone else. A short per-wallet cooldown keeps a
 * script from flooding a room.
 */
export async function POST(request: NextRequest) {
  const service = getSupabaseService();
  if (!service) return NextResponse.json({ error: "Chat isn't enabled on this deployment yet." }, { status: 501 });
  const session = sessionFromHeader(request.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "Sign in with your wallet to post." }, { status: 401 });

  let body: { room?: string; body?: string };
  try {
    body = (await request.json()) as { room?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const room = body.room ?? "";
  if (!isValidRoom(room)) return NextResponse.json({ error: "Unknown room." }, { status: 400 });
  const problem = validateMessageBody(body.body ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const text = normalizeMessageBody(body.body ?? "");

  const authorColumn = session.wallet ? "wallet" : "owner";
  const { data: last } = await service
    .from("messages")
    .select("created_at")
    .eq(authorColumn, session.owner)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && Date.now() - Date.parse((last as { created_at: string }).created_at) < POST_COOLDOWN_MS) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }

  const inserted = await service
    .from("messages")
    .insert({ room, owner: session.owner, wallet: session.wallet ?? null, body: text })
    .select("id, room, owner, wallet, body, created_at")
    .single();
  let data = inserted.data as MessageRow | null;
  let error = inserted.error;
  if (error && /owner/.test(error.message)) {
    if (!session.wallet) return NextResponse.json({ error: "Rooms for email accounts open once the database migration has run." }, { status: 503 });
    const legacy = await service.from("messages").insert({ room, wallet: session.wallet, body: text }).select("id, room, wallet, body, created_at").single();
    data = legacy.data as MessageRow | null;
    error = legacy.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ message: rowToMessage(data as MessageRow) });
}
