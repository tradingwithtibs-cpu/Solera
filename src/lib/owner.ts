/**
 * The one identity string every row and session carries. A wallet user's
 * owner is the base58 address; an email user's owner is their Supabase
 * Auth user id. The alphabets cannot collide (base58 has no hyphen).
 * Mirrored in SQL by public.is_owner() (supabase/port.sql).
 */
export type OwnerKind = "wallet" | "user";

const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const USER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function ownerKind(owner: string): OwnerKind | null {
  return WALLET.test(owner) ? "wallet" : USER.test(owner) ? "user" : null;
}

export function isOwner(value: unknown): value is string {
  return typeof value === "string" && ownerKind(value) !== null;
}

export function isWalletAddress(value: unknown): value is string {
  return typeof value === "string" && WALLET.test(value);
}
