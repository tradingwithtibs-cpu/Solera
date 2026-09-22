import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireOwner } from "@/lib/auth-server";
import { resetPractice } from "@/lib/practice-server";

/** POST /api/practice/reset — starting cash, no positions; fills stay as history. Also creates the row. */
export async function POST(request: NextRequest) {
  try {
    const session = requireOwner(request);
    const portfolio = await resetPractice(session.owner);
    return NextResponse.json({ portfolio });
  } catch (err) {
    return errorResponse(err);
  }
}
