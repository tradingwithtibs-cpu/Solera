/**
 * Wallet-owned profiles. A profile is the one thing Solera stores about a
 * person: a handle, a display name, a short bio, and whether it's public.
 * The wallet is the identity; proving you own it is a signed message, not
 * a password. Everything in this module is pure so both the client (to
 * build the message) and the server route (to validate the claim) share it.
 */
export interface Profile {
  wallet: string;
  handle: string;
  name: string;
  bio: string;
  avatarUrl?: string | null;
  visibility: "public" | "private";
  updatedAt?: string;
}

export interface ProfileInput {
  handle: string;
  name: string;
  bio: string;
  visibility: "public" | "private";
}

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const NAME_MAX = 40;
export const BIO_MAX = 160;
/** A signed claim is accepted for this long after it was signed. */
export const CLAIM_MAX_AGE_MS = 5 * 60_000;

/** Returns a user-facing error, or null when the input is acceptable. */
export function validateProfileInput(input: Partial<ProfileInput>): string | null {
  const handle = (input.handle ?? "").trim().toLowerCase();
  const name = (input.name ?? "").trim();
  const bio = (input.bio ?? "").trim();
  if (!HANDLE_PATTERN.test(handle)) return "Handle must be 3–20 characters: lowercase letters, numbers, or underscores.";
  if (name.length < 1 || name.length > NAME_MAX) return `Name must be 1–${NAME_MAX} characters.`;
  if (bio.length > BIO_MAX) return `Bio must be ${BIO_MAX} characters or fewer.`;
  if (input.visibility !== "public" && input.visibility !== "private") return "Choose public or private.";
  return null;
}

export function normalizeProfileInput(input: ProfileInput): ProfileInput {
  return {
    handle: input.handle.trim().toLowerCase(),
    name: input.name.trim(),
    bio: input.bio.trim(),
    visibility: input.visibility,
  };
}

/**
 * The exact text the wallet signs. Human-readable on purpose: wallets show
 * it to the user, and it binds the wallet, the fields, and a timestamp so
 * a signature can't be replayed later or reused for different content.
 */
export function buildProfileClaimMessage(wallet: string, input: ProfileInput, issuedAt: number): string {
  const p = normalizeProfileInput(input);
  return [
    "Solera profile update",
    `Wallet: ${wallet}`,
    `Handle: @${p.handle}`,
    `Name: ${p.name}`,
    `Bio: ${p.bio}`,
    `Visibility: ${p.visibility}`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
  ].join("\n");
}

export function isClaimFresh(issuedAt: number, now = Date.now()): boolean {
  return Number.isFinite(issuedAt) && now - issuedAt >= -60_000 && now - issuedAt <= CLAIM_MAX_AGE_MS;
}
