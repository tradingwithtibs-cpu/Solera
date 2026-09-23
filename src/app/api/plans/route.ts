import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner, walletForSession } from "@/lib/auth-server";
import { createPlan, listPlans } from "@/lib/plans-server";
import type { PlanCondition, PlanMode } from "@/lib/plans";

/** GET /api/plans → the owner's plans, newest first. */
export async function GET(request: NextRequest) {
  try {
    const session = requireOwner(request);
    return NextResponse.json({ plans: await listPlans(session.owner) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/plans { text, condition, mode, source?, execution?: "notify" } → a proposed plan (arm it with PATCH) and, for live, the Jupiter preview or the notify reason. */
export async function POST(request: NextRequest) {
  try {
    const session = requireOwner(request);
    let body: { text?: string; condition?: PlanCondition; mode?: PlanMode; source?: "ui" | "agent"; execution?: "notify" };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    if (typeof body.text !== "string" || !body.text.trim()) throw new HttpError(400, "Write the plan in plain words.");
    const mode: PlanMode = body.mode === "live" ? "live" : "practice";
    const wallet = mode === "live" ? await walletForSession(session) : null;
    const { plan, live } = await createPlan({ owner: session.owner, wallet, mode, text: body.text.trim(), condition: body.condition as PlanCondition, source: body.source, execution: body.execution === "notify" ? "notify" : undefined });
    return NextResponse.json({ plan, live });
  } catch (err) {
    return errorResponse(err);
  }
}
