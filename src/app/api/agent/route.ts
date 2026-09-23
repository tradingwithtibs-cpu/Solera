import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, walletForSession } from "@/lib/auth-server";
import { sessionFromHeader } from "@/lib/session-server";
import { isActive } from "@/lib/plans";
import { listPlans } from "@/lib/plans-server";
import { mapAnthropicError } from "@/lib/agent/anthropic-model";
import { selectModel, selectModelName } from "@/lib/agent/model";
import { MAX_CHARS, MAX_TURNS, runAgent } from "@/lib/agent/run";
import { realDeps, tickerResolver } from "@/lib/agent/server-deps";
import type { AgentRequest, PendingDraft, ToolContext } from "@/lib/agent/types";

/** A tool-using turn can exceed the legacy 10 s default (docs/port/backend.md §7.1). */
export const maxDuration = 60;

/** GET /api/agent → which model answers here, so the Agent tab can label itself before the first turn. */
export async function GET() {
  return NextResponse.json({ model: selectModelName() });
}

function parseBody(body: unknown): AgentRequest {
  const b = (body ?? {}) as Partial<AgentRequest> & { context?: Record<string, unknown> };
  if (!Array.isArray(b.messages) || b.messages.length === 0) throw new HttpError(400, "Say something first.");
  if (b.messages.length > MAX_TURNS * 2) throw new HttpError(400, "That conversation is too long; start a new one.");
  const messages = b.messages.map((m) => {
    const role = (m as { role?: string }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") throw new HttpError(400, "Invalid message.");
    if (content.length > MAX_CHARS) throw new HttpError(400, `Keep each message under ${MAX_CHARS} characters.`);
    return { role: role as "user" | "assistant", content };
  });
  const c = b.context ?? {};
  const ticker = typeof c.ticker === "string" && /^[A-Za-z0-9.]{1,13}$/.test(c.ticker) ? c.ticker : undefined;
  const page = typeof c.page === "string" ? c.page.slice(0, 40) : undefined;
  const intent = c.intent === "plan_preview" ? "plan_preview" : "chat";
  let pendingDraft: PendingDraft | null = null;
  const d = c.pendingDraft as Partial<PendingDraft> | null | undefined;
  if (d && typeof d === "object" && typeof d.text === "string" && d.text.length <= 400 && d.condition && typeof d.condition === "object") {
    pendingDraft = { text: d.text, condition: d.condition };
  }
  return { messages, mode: b.mode === "live" ? "live" : "practice", context: { ticker, page, intent, pendingDraft } };
}

/** POST /api/agent { messages, mode, context? } → AgentResponse. Session optional; the write tools need one. */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const req = parseBody(body);
    const session = sessionFromHeader(request.headers.get("authorization"));
    const wallet = session ? await walletForSession(session).catch(() => session.wallet ?? null) : null;
    // Live needs a wallet to sign; an email account without one is told practice (agent-ux §1.9).
    const mode = req.mode === "live" && wallet ? "live" : "practice";
    const plans = session ? await listPlans(session.owner).catch(() => []) : [];
    const openPlans = plans
      .filter((p) => p.status === "proposed" || isActive(p.status))
      .slice(0, 20)
      .map((p, i) => ({ n: i + 1, id: p.id, summary: p.summary, status: p.status, mode: p.mode }));
    const ctx: ToolContext = {
      owner: session?.owner ?? null,
      wallet,
      mode,
      ticker: req.context?.ticker,
      page: req.context?.page,
      intent: req.context?.intent ?? "chat",
      openPlans,
    };
    const model = selectModel({ resolveTicker: await tickerResolver() });
    const response = await runAgent(model, { ...req, mode }, ctx, realDeps());
    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(mapAnthropicError(err) ?? err);
  }
}
