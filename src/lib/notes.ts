/**
 * Position notes: the thesis a person keeps on a holding, with a horizon
 * and a "wrong if". Keyed by owner and position key (a ticker, or a
 * pre-IPO mint). Signed-out users keep them in the browser; signed-in
 * users keep them on the server and the browser copy is uploaded once.
 */
export const NOTE_MAX = 280;
export const HORIZON_MAX = 24;
export const WRONG_IF_MAX = 160;

export interface PositionNote {
  key: string;
  note: string;
  horizon: string;
  wrongIf: string;
  wrongHitAt: number | null;
  pinned: boolean;
  sortOrder: number;
  updatedAt: number;
}

export type PositionNoteInput = Partial<Omit<PositionNote, "key" | "updatedAt">> & { key: string };

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function isNoteKey(key: unknown): key is string {
  return typeof key === "string" && /^[A-Za-z0-9.\-]{1,64}$/.test(key);
}

/** User-facing problem, or null. */
export function validateNoteInput(input: Partial<PositionNoteInput>): string | null {
  if (!isNoteKey(input.key)) return "Unknown position.";
  if (typeof input.note === "string" && input.note.trim().length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`;
  if (typeof input.horizon === "string" && input.horizon.trim().length > HORIZON_MAX) return `Keep the horizon under ${HORIZON_MAX} characters.`;
  if (typeof input.wrongIf === "string" && input.wrongIf.trim().length > WRONG_IF_MAX) return `Keep "wrong if" under ${WRONG_IF_MAX} characters.`;
  return null;
}

export function normalizeNoteInput(input: PositionNoteInput, previous?: PositionNote, now = Date.now()): PositionNote {
  return {
    key: input.key,
    note: input.note !== undefined ? clean(input.note, NOTE_MAX) : (previous?.note ?? ""),
    horizon: input.horizon !== undefined ? clean(input.horizon, HORIZON_MAX) : (previous?.horizon ?? ""),
    wrongIf: input.wrongIf !== undefined ? clean(input.wrongIf, WRONG_IF_MAX) : (previous?.wrongIf ?? ""),
    wrongHitAt: input.wrongHitAt !== undefined ? input.wrongHitAt : (previous?.wrongHitAt ?? null),
    pinned: input.pinned !== undefined ? !!input.pinned : (previous?.pinned ?? false),
    sortOrder: typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder) : (previous?.sortOrder ?? 0),
    updatedAt: now,
  };
}
