import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { deleteProposed, getPlan, savePlan, transitionPlan } from "@/lib/plans-server";

type Params = { params: Promise<{ id: string }> };

/** GET /api/plans/:id → the owner's plan. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = requireOwner(request);
    const { id } = await params;
    const plan = await getPlan(id, session.owner);
    if (!plan) throw new HttpError(404, "No such plan.");
    return NextResponse.json({ plan });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * PATCH /api/plans/:id
 *   { status: "armed" }                                   proposed/ready → armed
 *   { status: "armed", trigger: { orderId, depositSignature } }   live trigger plans
 *   { status: "cancelled" }
 *   { status: "done", fillId }                             notify fallback: the tap's fill landed
 *   { triggerState, filled? }                              client-side Jupiter sync
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = requireOwner(request);
    const { id } = await params;
    const plan = await getPlan(id, session.owner);
    if (!plan) throw new HttpError(404, "No such plan.");
    let body: { status?: string; fillId?: string; trigger?: { orderId: string; depositSignature: string }; triggerState?: string; filled?: { price: number; shares: number; at: number } };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    if (body.status === "armed" || body.status === "cancelled" || body.status === "done") {
      const next = await transitionPlan(plan, body.status, { fillId: body.fillId, trigger: body.trigger });
      return NextResponse.json({ plan: next });
    }
    if (typeof body.triggerState === "string") {
      await savePlan(plan.id, { triggerState: body.triggerState.slice(0, 40), ...(body.filled ? { filled: body.filled } : {}), log: plan.log });
      return NextResponse.json({ plan: await getPlan(plan.id, session.owner) });
    }
    throw new HttpError(400, "Nothing to change.");
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/plans/:id → only proposed drafts; everything else is history. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = requireOwner(request);
    const { id } = await params;
    const removed = await deleteProposed(id, session.owner);
    if (!removed) throw new HttpError(409, "Only a proposed plan can be deleted; cancel it instead.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
