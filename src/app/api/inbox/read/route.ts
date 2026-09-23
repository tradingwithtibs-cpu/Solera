import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { getSupabaseService } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/inbox/read { ids } → marks the owner's rows read. */
export async function POST(request: NextRequest) {
  try {
    const session = requireOwner(request);
    const service = getSupabaseService();
    if (!service) throw new HttpError(501, "The inbox isn't enabled on this deployment yet.");
    let body: { ids?: unknown };
    try {
      body = (await request.json()) as { ids?: unknown };
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, 100) : [];
    if (ids.length === 0) throw new HttpError(400, "Nothing to mark.");
    const { error } = await service.from("inbox").update({ read_at: new Date().toISOString() }).eq("owner", session.owner).in("id", ids).is("read_at", null);
    if (error) throw new HttpError(502, error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
