import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { importPractice } from "@/lib/practice-server";
import type { HoldingPosition, Transaction } from "@/lib/types";

/** POST /api/practice/import { cash, holdings, fills } — seeds the account from a device's local practice history, once. */
export async function POST(request: NextRequest) {
  try {
    const session = requireOwner(request);
    let body: { cash?: number; holdings?: HoldingPosition[]; fills?: Transaction[] };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const portfolio = await importPractice(session.owner, { cash: Number(body.cash), holdings: body.holdings ?? [], fills: body.fills ?? [] });
    return NextResponse.json({ portfolio });
  } catch (err) {
    return errorResponse(err);
  }
}
