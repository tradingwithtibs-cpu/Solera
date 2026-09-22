import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionFromHeader, type Session } from "./session-server";
import { getSupabaseService } from "./supabase";

/** An error a route turns straight into a JSON response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 500 });
}

/** The session behind `Authorization: Bearer <token>`, or a 401. Every write route starts here. */
export function requireOwner(request: NextRequest): Session {
  const session = sessionFromHeader(request.headers.get("authorization"));
  if (!session) throw new HttpError(401, "Sign in to do that.");
  return session;
}

/**
 * The wallet a session may trade with: the wallet itself for wallet
 * sessions, or the wallet linked to an email account's profile.
 */
export async function walletForSession(session: Session): Promise<string | null> {
  if (session.wallet) return session.wallet;
  const service = getSupabaseService();
  if (!service || !session.userId) return null;
  const { data } = await service.from("profiles").select("wallet").eq("user_id", session.userId).maybeSingle();
  const wallet = (data as { wallet?: string | null } | null)?.wallet;
  return typeof wallet === "string" && wallet ? wallet : null;
}
