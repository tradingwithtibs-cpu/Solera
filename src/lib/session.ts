/**
 * A signed-in session: one wallet signature, good for 30 days, lets the
 * wallet post in chat rooms without signing every message. The token is
 * minted and checked server-side (session-server.ts); this module is the
 * client-safe part: the message the wallet signs, and the stored shape.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

export interface StoredSession {
  wallet: string;
  token: string;
  expiresAt: number;
}

export function buildSignInMessage(wallet: string, issuedAt: number): string {
  return [
    "Sign in to Solera",
    `Wallet: ${wallet}`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
    "",
    "This signature lets you post in Solera rooms for 30 days. It cannot move funds or approve transactions.",
  ].join("\n");
}
