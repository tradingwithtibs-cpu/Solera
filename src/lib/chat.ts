import type { ChatMessage } from "./types";

/**
 * Rooms are one per tokenized stock, keyed by ticker ("AAPLx"). Posting
 * needs a signed-in wallet (see session.ts); reading is public. Pure
 * validation lives here so the route and the composer agree.
 */
export const MESSAGE_MAX = 280;
export const ROOM_PATTERN = /^[A-Z0-9.]{1,12}x$/;
/** Minimum gap between two posts from one wallet. */
export const POST_COOLDOWN_MS = 3_000;

export function isValidRoom(room: string): boolean {
  return ROOM_PATTERN.test(room);
}

// Control characters other than tab/newline (which collapse to spaces below).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");

/** Collapses whitespace, strips control characters. */
export function normalizeMessageBody(body: string): string {
  return body.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/** User-facing problem with a message, or null when it can be posted. */
export function validateMessageBody(body: string): string | null {
  const clean = normalizeMessageBody(body);
  if (clean.length === 0) return "Write something first.";
  if (clean.length > MESSAGE_MAX) return `Keep it under ${MESSAGE_MAX} characters.`;
  return null;
}

export interface MessageRow {
  id: number | string;
  room: string;
  /** The owner string (wallet or auth user id); absent on rows written before the port. */
  owner?: string | null;
  wallet: string | null;
  body: string;
  created_at: string;
}

export function rowToMessage(r: MessageRow): ChatMessage {
  const author = r.owner ?? r.wallet ?? "";
  return { id: String(r.id), room: r.room, author, wallet: r.wallet ?? null, body: r.body, createdAt: Date.parse(r.created_at) };
}

/** Merges new messages into a list, deduplicated by id and ordered oldest first. */
export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}
