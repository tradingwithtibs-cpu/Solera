import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { getSupabaseService } from "@/lib/supabase";
import { normalizeNoteInput, validateNoteInput, type PositionNote, type PositionNoteInput } from "@/lib/notes";

interface Row {
  key: string;
  note: string;
  horizon: string;
  wrong_if: string;
  wrong_hit_at: string | null;
  pinned: boolean;
  sort_order: number;
  updated_at: string;
}

const COLUMNS = "key, note, horizon, wrong_if, wrong_hit_at, pinned, sort_order, updated_at";

function toNote(r: Row): PositionNote {
  return {
    key: r.key,
    note: r.note,
    horizon: r.horizon,
    wrongIf: r.wrong_if,
    wrongHitAt: r.wrong_hit_at ? Date.parse(r.wrong_hit_at) : null,
    pinned: r.pinned,
    sortOrder: r.sort_order,
    updatedAt: Date.parse(r.updated_at),
  };
}

/** GET /api/notes → the owner's position notes. */
export async function GET(request: NextRequest) {
  try {
    const session = requireOwner(request);
    const service = getSupabaseService();
    if (!service) throw new HttpError(501, "Notes aren't enabled on this deployment yet.");
    const { data, error } = await service.from("position_notes").select(COLUMNS).eq("owner", session.owner).order("sort_order");
    if (error) throw new HttpError(502, error.message);
    return NextResponse.json({ notes: ((data ?? []) as Row[]).map(toNote) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/notes { key, note?, horizon?, wrongIf?, wrongHitAt?, pinned?, sortOrder? } → upsert one note (or many with { notes: [...] }). */
export async function PUT(request: NextRequest) {
  try {
    const session = requireOwner(request);
    const service = getSupabaseService();
    if (!service) throw new HttpError(501, "Notes aren't enabled on this deployment yet.");
    let body: PositionNoteInput | { notes: PositionNoteInput[] };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const inputs = "notes" in body ? body.notes.slice(0, 200) : [body];
    for (const input of inputs) {
      const problem = validateNoteInput(input);
      if (problem) throw new HttpError(400, problem);
    }
    const keys = inputs.map((i) => i.key);
    const { data: existingRows } = await service.from("position_notes").select(COLUMNS).eq("owner", session.owner).in("key", keys);
    const previous = new Map(((existingRows ?? []) as Row[]).map((r) => [r.key, toNote(r)]));
    const now = Date.now();
    const rows = inputs.map((i) => {
      const n = normalizeNoteInput(i, previous.get(i.key), now);
      return {
        owner: session.owner,
        key: n.key,
        note: n.note,
        horizon: n.horizon,
        wrong_if: n.wrongIf,
        wrong_hit_at: n.wrongHitAt ? new Date(n.wrongHitAt).toISOString() : null,
        pinned: n.pinned,
        sort_order: n.sortOrder,
        updated_at: new Date(now).toISOString(),
      };
    });
    const { data, error } = await service.from("position_notes").upsert(rows, { onConflict: "owner,key" }).select(COLUMNS);
    if (error) throw new HttpError(502, error.message);
    return NextResponse.json({ notes: ((data ?? []) as Row[]).map(toNote) });
  } catch (err) {
    return errorResponse(err);
  }
}
