import { NextResponse, type NextRequest } from "next/server";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { getSupabaseAnon, getSupabaseService } from "@/lib/supabase";
import {
  buildProfileClaimMessage,
  isClaimFresh,
  normalizeProfileInput,
  validateProfileInput,
  type Profile,
  type ProfileInput,
} from "@/lib/profiles";

interface Row {
  wallet: string;
  handle: string;
  name: string;
  bio: string;
  avatar_url: string | null;
  visibility: "public" | "private";
  updated_at: string;
}

function toProfile(r: Row): Profile {
  return { wallet: r.wallet, handle: r.handle, name: r.name, bio: r.bio, avatarUrl: r.avatar_url, visibility: r.visibility, updatedAt: r.updated_at };
}

/** GET /api/profile?wallets=a,b,c → public profiles for those wallets (missing ones simply absent). */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAnon();
  if (!supabase) return NextResponse.json({ profiles: {}, configured: false });
  const wallets = (request.nextUrl.searchParams.get("wallets") ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (wallets.length === 0) return NextResponse.json({ profiles: {}, configured: true });

  const { data, error } = await supabase.from("profiles").select("*").in("wallet", wallets);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const profiles: Record<string, Profile> = {};
  for (const row of (data ?? []) as Row[]) profiles[row.wallet] = toProfile(row);
  return NextResponse.json({ profiles, configured: true });
}

interface ClaimBody {
  wallet: string;
  profile: ProfileInput;
  issuedAt: number;
  /** Base64 ed25519 signature over buildProfileClaimMessage(). */
  signature: string;
}

/**
 * POST /api/profile — create or update the caller's own profile.
 * The body carries the wallet, the fields, a timestamp, and the wallet's
 * signature over the canonical message for exactly those fields. We verify
 * the signature against the wallet's public key and only then write with
 * the service role. No password, no session, nothing to phish.
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

  const invalid = validateProfileInput(body.profile ?? {});
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (!isClaimFresh(body.issuedAt)) return NextResponse.json({ error: "This signature has expired. Sign again." }, { status: 400 });

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(body.wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  }
  const message = new TextEncoder().encode(buildProfileClaimMessage(body.wallet, body.profile, body.issuedAt));
  let signature: Uint8Array;
  try {
    signature = Uint8Array.from(Buffer.from(body.signature, "base64"));
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  if (signature.length !== 64 || !nacl.sign.detached.verify(message, signature, pubkey.toBytes())) {
    return NextResponse.json({ error: "Signature doesn't match this wallet." }, { status: 401 });
  }

  const p = normalizeProfileInput(body.profile);
  const { data, error } = await service
    .from("profiles")
    .upsert(
      { wallet: body.wallet, handle: p.handle, name: p.name, bio: p.bio, visibility: p.visibility, updated_at: new Date().toISOString() },
      { onConflict: "wallet" },
    )
    .select("*")
    .single();
  if (error) {
    const taken = /profiles_handle_unique|duplicate key/i.test(error.message);
    return NextResponse.json({ error: taken ? "That handle is taken." : error.message }, { status: taken ? 409 : 502 });
  }
  return NextResponse.json({ profile: toProfile(data as Row) });
}
