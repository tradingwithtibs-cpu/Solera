import { NextResponse } from "next/server";
import { planHealth } from "@/lib/plans-server";
import { errorResponse } from "@/lib/auth-server";

/** GET /api/plans/health → when the watcher last ran and whether it is alive (within 3 minutes). */
export async function GET() {
  try {
    return NextResponse.json(await planHealth());
  } catch (err) {
    return errorResponse(err);
  }
}
