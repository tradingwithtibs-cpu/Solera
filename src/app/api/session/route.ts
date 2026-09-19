import { NextResponse, type NextRequest } from "next/server";
import { isClaimFresh } from "@/lib/profiles";
import { buildSignInMessage } from "@/lib/session";
import { isSessionConfigured, issueSessionToken } from "@/lib/session-server";
import { verifyWalletSignature } from "@/lib/verify-signature";

interface Body {
  wallet: string;
  issuedAt: number;
  /** Base64 ed25519 signature over buildSignInMessage(). */
  signature: string;
}

/**
 * POST /api/session — trade one wallet signature for a 30-day session
 * token. The token is what /api/chat accepts for posting. Nothing is
 * stored server-side; the token is self-contained and HMAC-signed.
 */
export async function POST(request: NextRequest) {
  if (!isSessionConfigured()) return NextResponse.json({ error: "Sign-in isn't enabled on this deployment yet." }, { status: 501 });
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.wallet !== "string" || !isClaimFresh(body.issuedAt)) {
    return NextResponse.json({ error: "This signature has expired. Sign again." }, { status: 400 });
  }
  if (!verifyWalletSignature(body.wallet, buildSignInMessage(body.wallet, body.issuedAt), body.signature ?? "")) {
    return NextResponse.json({ error: "Signature doesn't match this wallet." }, { status: 401 });
  }
  const { token, expiresAt } = issueSessionToken(body.wallet);
  return NextResponse.json({ token, wallet: body.wallet, expiresAt });
}
