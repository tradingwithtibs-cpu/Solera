import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { fillPractice, fillToTransaction } from "@/lib/practice-server";
import type { PracticeFillInput } from "@/lib/fills";

/**
 * POST /api/practice/fill — a practice order, priced by the server at the
 * live Jupiter price and settled against the owner's row. Returns the fill,
 * the new portfolio and a TradeResult. 409 carries the current portfolio
 * when the client's version was stale.
 */
export async function POST(request: NextRequest) {
  try {
    const session = requireOwner(request);
    let body: PracticeFillInput;
    try {
      body = (await request.json()) as PracticeFillInput;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const { fill, portfolio, result } = await fillPractice(session.owner, body);
    return NextResponse.json({ fill, transaction: fillToTransaction(fill), portfolio, result });
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      return NextResponse.json({ error: err.message, portfolio: (err as HttpError & { portfolio?: unknown }).portfolio ?? null }, { status: 409 });
    }
    return errorResponse(err);
  }
}
