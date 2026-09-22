import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnon, getSupabaseService } from "@/lib/supabase";
import {
  buildProfileClaimMessage,
  buildWalletLinkMessage,
  isClaimFresh,
  normalizeProfileInput,
  validateProfileInput,
  type Profile,
  type ProfileInput,
} from "@/lib/profiles";
import { verifyWalletSignature } from "@/lib/verify-signature";
import { isOwner, isWalletAddress, ownerKind } from "@/lib/owner";
import { sessionFromHeader } from "@/lib/session-server";

interface Row {
  owner?: string | null;
  user_id?: string | null;
  wallet: string | null;
  handle: string;
  name: string;
  bio: string;
  avatar_url: string | null;
  visibility: "public" | "private";
  updated_at: string;
}

const COLUMNS = "owner, user_id, wallet, handle, name, bio, avatar_url, visibility, updated_at";

function toProfile(r: Row): Profile {
  const owner = r.owner ?? r.user_id ?? r.wallet ?? "";
  return {
    owner,
    kind: ownerKind(owner) ?? "wallet",
    wallet: r.wallet ?? null,
    handle: r.handle,
    name: r.name,
    bio: r.bio,
    avatarUrl: r.avatar_url,
    visibility: r.visibility,
    updatedAt: r.updated_at,
  };
}

/**
 * GET /api/profile?owners=a,b,c (or the older ?wallets=) → public profiles
 * keyed by owner; missing ones are simply absent.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAnon();
  if (!supabase) return NextResponse.json({ profiles: {}, configured: false });
  const raw = `${request.nextUrl.searchParams.get("owners") ?? ""},${request.nextUrl.searchParams.get("wallets") ?? ""}`;
  const owners = [...new Set(raw.split(",").map((w) => w.trim()).filter(isOwner))].slice(0, 100);
  if (owners.length === 0) return NextResponse.json({ profiles: {}, configured: true });

  // Before port.sql runs there is no owner column; fall back to wallets so profiles keep working.
  const primary = await supabase.from("profiles").select(COLUMNS).in("owner", owners);
  let data = primary.data as Row[] | null;
  let error = primary.error;
  if (error && /owner/.test(error.message)) {
    const legacy = await supabase.from("profiles").select("wallet, handle, name, bio, avatar_url, visibility, updated_at").in("wallet", owners);
    data = legacy.data as Row[] | null;
    error = legacy.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const profiles: Record<string, Profile> = {};
  for (const row of (data ?? []) as Row[]) {
    const p = toProfile(row);
    if (p.owner) profiles[p.owner] = p;
    if (p.wallet && p.wallet !== p.owner) profiles[p.wallet] = p;
  }
  return NextResponse.json({ profiles, configured: true });
}

interface ClaimBody {
  wallet?: string;
  profile?: ProfileInput;
  issuedAt?: number;
  signature?: string;
  link?: { wallet: string; issuedAt: number; signature: string };
}

function taken(message: string) {
  return /profiles_handle_unique|duplicate key/i.test(message);
}

/**
 * POST /api/profile — create or update a profile. Three proofs:
 * - a wallet's signature over the claim message (body: wallet, profile, issuedAt, signature);
 * - an email account's session (Bearer token, kind user) with { profile };
 * - an email account linking a wallet: { link: { wallet, issuedAt, signature } } signed by that wallet.
 */
export async function POST(request: NextRequest) {
  const service = getSupabaseService();
  if (!service) return NextResponse.json({ error: "Profiles aren't enabled on this deployment yet." }, { status: 501 });

  let body: ClaimBody;
  try {
    body = (await request.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const session = sessionFromHeader(request.headers.get("authorization"));

  // --- link a wallet to an email account ---------------------------------
  if (body.link) {
    if (!session || session.kind !== "user" || !session.userId) return NextResponse.json({ error: "Log in to link a wallet." }, { status: 401 });
    const { wallet, issuedAt, signature } = body.link;
    if (!isWalletAddress(wallet) || !isClaimFresh(issuedAt)) return NextResponse.json({ error: "This signature has expired. Sign again." }, { status: 400 });
    if (!verifyWalletSignature(wallet, buildWalletLinkMessage(session.userId, wallet, issuedAt), signature ?? "")) {
      return NextResponse.json({ error: "Signature doesn't match this wallet." }, { status: 401 });
    }
    const { data: existing } = await service.from("profiles").select("user_id").eq("wallet", wallet).maybeSingle();
    const existingUser = (existing as { user_id?: string | null } | null)?.user_id;
    if (existing && existingUser !== session.userId) {
      return NextResponse.json({ error: "That wallet already has its own profile." }, { status: 409 });
    }
    const { data, error } = await service
      .from("profiles")
      .update({ wallet, updated_at: new Date().toISOString() })
      .eq("user_id", session.userId)
      .select(COLUMNS)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    if (!data) return NextResponse.json({ error: "Claim a profile first." }, { status: 404 });
    return NextResponse.json({ profile: toProfile(data as Row) });
  }

  const invalid = validateProfileInput(body.profile ?? {});
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const p = normalizeProfileInput(body.profile!);
  const fields = { handle: p.handle, name: p.name, bio: p.bio, visibility: p.visibility, updated_at: new Date().toISOString() };

  // --- email account: the session is the proof -----------------------------
  if (!body.signature && session?.kind === "user" && session.userId) {
    const { data, error } = await service
      .from("profiles")
      .upsert({ user_id: session.userId, ...fields }, { onConflict: "user_id" })
      .select(COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: taken(error.message) ? "That handle is taken." : error.message }, { status: taken(error.message) ? 409 : 502 });
    return NextResponse.json({ profile: toProfile(data as Row) });
  }

  // --- wallet: the signature is the proof ----------------------------------
  if (!isWalletAddress(body.wallet)) return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  if (!isClaimFresh(body.issuedAt ?? NaN)) return NextResponse.json({ error: "This signature has expired. Sign again." }, { status: 400 });
  if (!verifyWalletSignature(body.wallet, buildProfileClaimMessage(body.wallet, body.profile!, body.issuedAt!), body.signature ?? "")) {
    return NextResponse.json({ error: "Signature doesn't match this wallet." }, { status: 401 });
  }
  const { data, error } = await service
    .from("profiles")
    .upsert({ wallet: body.wallet, ...fields }, { onConflict: "wallet" })
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: taken(error.message) ? "That handle is taken." : error.message }, { status: taken(error.message) ? 409 : 502 });
  return NextResponse.json({ profile: toProfile(data as Row) });
}
