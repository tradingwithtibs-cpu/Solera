import type { OwnerKind } from "./owner";

/**
 * A signed-in session: one wallet signature (or one Supabase Auth login),
 * good for 30 days, lets the owner post, vote, keep notes and arm plans
 * without signing every action. Minted and checked server-side
 * (session-server.ts); this module is the client-safe part.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

export interface StoredSession {
  /** The owner string: wallet address or auth user id. */
  owner: string;
  kind: OwnerKind;
  /** The wallet, for wallet sessions (and linked email accounts once known). */
  wallet?: string;
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
