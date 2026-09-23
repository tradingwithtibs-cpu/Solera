import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { errorResponse, HttpError } from "@/lib/auth-server";
import { sessionFromHeader } from "@/lib/session-server";
import { runEvaluator } from "@/lib/plans-server";

export const maxDuration = 30;

function bearer(request: NextRequest): string | null {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

function secretMatches(given: string | null): boolean {
  const secret = process.env.PLAN_EVALUATOR_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/plans/evaluate?pass=minute|daily   Authorization: Bearer <PLAN_EVALUATOR_SECRET>
 * POST /api/plans/evaluate?scope=self          Authorization: Bearer <owner session>
 * Runs the watcher for everyone (the scheduled call) or for one owner (the open tab).
 */
export async function POST(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get("scope");
    const token = bearer(request);
    if (scope === "self") {
      const session = sessionFromHeader(request.headers.get("authorization"));
      if (!session) throw new HttpError(401, "Sign in to check your plans.");
      return NextResponse.json(await runEvaluator({ pass: "self", scopeOwner: session.owner }));
    }
    if (!secretMatches(token)) throw new HttpError(401, "Not allowed.");
    const pass = request.nextUrl.searchParams.get("pass") === "daily" ? "daily" : "minute";
    return NextResponse.json(await runEvaluator({ pass }));
  } catch (err) {
    return errorResponse(err);
  }
}
