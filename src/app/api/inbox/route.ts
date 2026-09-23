import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { getSupabaseService } from "@/lib/supabase";

/** GET /api/inbox[?unread=1] → the owner's notifications, newest first (docs/port/backend.md §9.8). */
export async function GET(request: NextRequest) {
  try {
    const session = requireOwner(request);
    const service = getSupabaseService();
    if (!service) throw new HttpError(501, "The inbox isn't enabled on this deployment yet.");
    const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";
    let q = service.from("inbox").select("id, kind, plan_id, title, body, href, read_at, created_at").eq("owner", session.owner).order("created_at", { ascending: false }).limit(50);
    if (unreadOnly) q = q.is("read_at", null);
    const { data, error } = await q;
    if (error) throw new HttpError(502, error.message);
    const items = ((data ?? []) as Array<{ id: string; kind: string; plan_id: string | null; title: string; body: string; href: string | null; read_at: string | null; created_at: string }>).map((r) => ({
      id: r.id,
      kind: r.kind,
      planId: r.plan_id,
      title: r.title,
      body: r.body,
      href: r.href,
      readAt: r.read_at ? Date.parse(r.read_at) : null,
      createdAt: Date.parse(r.created_at),
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
