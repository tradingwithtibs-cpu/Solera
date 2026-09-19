import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_TTL_MS } from "./session";

/**
 * Server-only session tokens: `base64url(payload).hmac`. The HMAC key is a
 * dedicated secret when set, otherwise derived from the Supabase service
 * key (never used raw), so no extra configuration is needed to turn chat
 * on. A token proves a wallet signed in recently; it can't be forged
 * without the secret and carries no other authority.
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
  w: string;
  exp: number;
}

function sign(encodedPayload: string): string {
  const key = secret();
  if (!key) throw new Error("Sessions aren't configured.");
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

export function issueSessionToken(wallet: string, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + SESSION_TTL_MS;
  const encoded = Buffer.from(JSON.stringify({ w: wallet, exp: expiresAt } satisfies Payload)).toString("base64url");
  return { token: `${encoded}.${sign(encoded)}`, expiresAt };
}

/** The wallet a token belongs to, or null when it's forged, malformed, or expired. */
export function verifySessionToken(token: string | null | undefined, now = Date.now()): { wallet: string; expiresAt: number } | null {
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
    if (typeof payload.w !== "string" || typeof payload.exp !== "number" || payload.exp <= now) return null;
    return { wallet: payload.w, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

/** Reads `Authorization: Bearer <token>`. */
export function sessionFromHeader(header: string | null): { wallet: string; expiresAt: number } | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return verifySessionToken(match?.[1]);
}
