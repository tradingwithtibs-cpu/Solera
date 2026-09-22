import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireOwner } from "@/lib/auth-server";
import { fillToTransaction, loadPractice } from "@/lib/practice-server";

/** GET /api/practice → the owner's practice portfolio (null before the first fill or import) and latest fills. */
export async function GET(request: NextRequest) {
  try {
    const session = requireOwner(request);
    const { portfolio, fills } = await loadPractice(session.owner);
    return NextResponse.json({ portfolio, fills, transactions: fills.map(fillToTransaction) });
  } catch (err) {
    return errorResponse(err);
  }
}
