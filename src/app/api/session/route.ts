import { NextResponse, type NextRequest } from "next/server";
import { isClaimFresh } from "@/lib/profiles";
import { buildSignInMessage } from "@/lib/session";
import { isSessionConfigured, issueSessionToken } from "@/lib/session-server";
import { verifyWalletSignature } from "@/lib/verify-signature";
import { isWalletAddress } from "@/lib/owner";
import { getSupabaseService } from "@/lib/supabase";

interface WalletBody {
  wallet: string;
  issuedAt: number;
  /** Base64 ed25519 signature over buildSignInMessage(). */
  signature: string;
}
interface EmailBody {
  /** The Supabase Auth access token from the browser's sign-in. */
  supabaseAccessToken: string;
}

/**
 * POST /api/session — trade one proof of identity for a 30-day session
 * token: a wallet's signature over the sign-in message (body A), or a
 * Supabase Auth access token for an email account (body B, verified with
 * the Auth server). Nothing is stored; the token is self-contained.
 */
export async function POST(request: NextRequest) {
  if (!isSessionConfigured()) return NextResponse.json({ error: "Sign-in isn't enabled on this deployment yet." }, { status: 501 });
  let body: Partial<WalletBody & EmailBody>;
  try {
    body = (await request.json()) as Partial<WalletBody & EmailBody>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.supabaseAccessToken === "string") {
    const service = getSupabaseService();
    if (!service) return NextResponse.json({ error: "Email sign-in isn't enabled on this deployment yet." }, { status: 501 });
    const { data, error } = await service.auth.getUser(body.supabaseAccessToken);
    if (error || !data.user) return NextResponse.json({ error: "That sign-in has expired. Log in again." }, { status: 401 });
    const { token, expiresAt } = issueSessionToken({ userId: data.user.id });
    const { data: profile } = await service.from("profiles").select("wallet").eq("user_id", data.user.id).maybeSingle();
    const wallet = (profile as { wallet?: string | null } | null)?.wallet ?? undefined;
    return NextResponse.json({ token, owner: data.user.id, kind: "user", wallet: wallet ?? null, expiresAt });
  }

  if (!isWalletAddress(body.wallet) || !isClaimFresh(body.issuedAt ?? NaN)) {
    return NextResponse.json({ error: "This signature has expired. Sign again." }, { status: 400 });
  }
  if (!verifyWalletSignature(body.wallet, buildSignInMessage(body.wallet, body.issuedAt!), body.signature ?? "")) {
    return NextResponse.json({ error: "Signature doesn't match this wallet." }, { status: 401 });
  }
  const { token, expiresAt } = issueSessionToken({ wallet: body.wallet });
  return NextResponse.json({ token, owner: body.wallet, kind: "wallet", wallet: body.wallet, expiresAt });
}
