import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { deleteProposed, getPlan, savePlan, transitionPlan } from "@/lib/plans-server";
import { verifyFeePayer } from "@/lib/solana-verify";

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
    let body: {
      status?: string;
      fillId?: string;
      trigger?: { orderId?: string; depositSignature?: string; expiresAt?: number; depositConfirmed?: boolean; withdrawSignature?: string };
      triggerState?: string;
      filled?: { price: number; shares: number; at: number };
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    if (body.status === "armed" && body.trigger) {
      // A Jupiter order: the deposit must have landed from this plan's wallet before the row says "armed" (backend §9.4 step 6).
      const t = body.trigger;
      if (typeof t.orderId !== "string" || !t.orderId || typeof t.depositSignature !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{60,120}$/.test(t.depositSignature)) throw new HttpError(400, "A Jupiter order needs its id and the deposit signature.");
      if (!plan.wallet) throw new HttpError(403, "This plan has no wallet to verify the deposit against.");
      const verified = await verifyFeePayer(t.depositSignature, plan.wallet);
      if (verified === false) throw new HttpError(400, "That deposit transaction failed or was sent by another wallet.");
      if (verified === null) throw new HttpError(409, "The deposit isn't visible on-chain yet. Try again in a few seconds; the order exists on Jupiter's side either way.");
      const expiresAt = typeof t.expiresAt === "number" && Number.isFinite(t.expiresAt) && t.expiresAt > Date.now() ? t.expiresAt : undefined;
      const next = await transitionPlan(plan, "armed", { trigger: { orderId: t.orderId.slice(0, 80), depositSignature: t.depositSignature, expiresAt, depositConfirmed: t.depositConfirmed !== false } });
      return NextResponse.json({ plan: next });
    }
    if (body.status === "armed" || body.status === "cancelled" || body.status === "done") {
      const withdraw = body.status === "cancelled" && typeof body.trigger?.withdrawSignature === "string" ? body.trigger.withdrawSignature.slice(0, 120) : undefined;
      const next = await transitionPlan(plan, body.status, { fillId: body.fillId, trigger: withdraw ? { orderId: plan.triggerOrderId ?? "", depositSignature: plan.triggerDepositSig ?? "", withdrawSignature: withdraw } : undefined });
      return NextResponse.json({ plan: next });
    }
    if (typeof body.triggerState === "string") {
      await savePlan(plan.id, { triggerState: body.triggerState.slice(0, 40), triggerCheckedAt: Date.now(), ...(body.filled ? { filled: body.filled } : {}), log: plan.log });
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
