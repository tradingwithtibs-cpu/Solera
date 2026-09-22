import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_TTL_MS } from "./session";
import { ownerKind, type OwnerKind } from "./owner";

/**
 * Server-only session tokens: `base64url(payload).hmac`. The HMAC key is a
 * dedicated secret when set, otherwise derived from the Supabase service
 * key (never used raw). The payload carries exactly one claim: `w` (a
 * wallet) or `u` (a Supabase Auth user id). Old `{ w, exp }` tokens keep
 * verifying. A token proves the owner signed in recently; it carries no
 * other authority.
 */
function secret(): string | null {
  const dedicated = process.env.SOLERA_SESSION_SECRET;
  if (dedicated) return dedicated;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return service ? createHmac("sha256", service).update("solera-session").digest("hex") : null;
}

export function isSessionConfigured(): boolean {
  return secret() !== null;
}

interface Payload {
  w?: string;
  u?: string;
  exp: number;
}

export interface Session {
  owner: string;
  kind: OwnerKind;
  wallet?: string;
  userId?: string;
  expiresAt: number;
}

function sign(encodedPayload: string): string {
  const key = secret();
  if (!key) throw new Error("Sessions aren't configured.");
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

export function issueSessionToken(identity: { wallet: string } | { userId: string }, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + SESSION_TTL_MS;
  const payload: Payload = "wallet" in identity ? { w: identity.wallet, exp: expiresAt } : { u: identity.userId, exp: expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${sign(encoded)}`, expiresAt };
}

/** The session a token belongs to, or null when it's forged, malformed, or expired. */
export function verifySessionToken(token: string | null | undefined, now = Date.now()): Session | null {
  if (!token || !secret()) return null;
  const [encoded, mac] = token.split(".");
  if (!encoded || !mac) return null;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(encoded));
  } catch {
    return null;
  }
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Payload;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    const hasW = typeof payload.w === "string";
    const hasU = typeof payload.u === "string";
    if (hasW === hasU) return null; // exactly one claim
    if (hasW) {
      if (ownerKind(payload.w!) !== "wallet") return null;
      return { owner: payload.w!, kind: "wallet", wallet: payload.w, expiresAt: payload.exp };
    }
    if (ownerKind(payload.u!) !== "user") return null;
    return { owner: payload.u!, kind: "user", userId: payload.u, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

/** Reads `Authorization: Bearer <token>`. */
export function sessionFromHeader(header: string | null): Session | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return verifySessionToken(match?.[1]);
}
