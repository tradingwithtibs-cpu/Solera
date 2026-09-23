import type Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../http-error";
import { execute } from "./execute";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOLS } from "./tools";
import type { AgentCard, AgentModel, AgentRequest, AgentResponse, AgentState, Msg, ToolContext, ToolDeps, Turn } from "./types";

/**
 * The loop (docs/port/backend.md §7.5). A manual loop rather than the SDK's
 * tool runner so it runs unchanged against the mock. Each request runs its
 * own loop to completion; tool blocks never cross requests, and the state
 * block gives the model fresh app state every turn.
 */
export const MAX_ITERATIONS = 6;
export const MAX_TURNS = 12;
export const MAX_CHARS = 4_000;

const PREVIEW_TOOLS = new Set(["create_plan"]);

function short(wallet: string | null): string | null {
  return wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : null;
}

export function buildState(req: AgentRequest, ctx: ToolContext, now = new Date()): AgentState {
  return {
    mode: ctx.mode,
    signedIn: !!ctx.owner,
    wallet: short(ctx.wallet),
    ...(ctx.ticker ? { ticker: ctx.ticker } : {}),
    ...(ctx.page ? { page: ctx.page } : {}),
    intent: ctx.intent,
    openPlans: ctx.openPlans,
    pendingDraft: req.context?.pendingDraft ?? null,
    now: now.toISOString(),
  };
}

/** Plain-text turns → API messages, the state block prefixed to the first user message. */
export function toMessages(req: AgentRequest, state: AgentState): Msg[] {
  const turns = req.messages
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content.length > 0);
  while (turns.length && turns[0].role !== "user") turns.shift();
  const recent = turns.slice(-MAX_TURNS);
  while (recent.length && recent[0].role !== "user") recent.shift();
  if (recent.length === 0 || recent[recent.length - 1].role !== "user") throw new HttpError(400, "Say something first.");
  const block = `<state>${JSON.stringify(state)}</state>`;
  return recent.map((m, i) => ({ role: m.role, content: i === 0 ? `${block}\n\n${m.content}` : m.content }));
}

function textOf(turn: Turn): string {
  return turn.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function runAgent(model: AgentModel, req: AgentRequest, ctx: ToolContext, deps: ToolDeps): Promise<AgentResponse> {
  const state = buildState(req, ctx);
  const messages = toMessages(req, state);
  const allowed = ctx.intent === "plan_preview" ? PREVIEW_TOOLS : null;
  const cards: AgentCard[] = [];
  const toolTrace: AgentResponse["toolTrace"] = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 };
  let sawUsage = false;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const turn = await model.complete({ system: SYSTEM_PROMPT, tools: TOOLS, messages });
    if (turn.usage) {
      sawUsage = true;
      usage.inputTokens += turn.usage.input_tokens;
      usage.outputTokens += turn.usage.output_tokens;
      usage.cacheReadInputTokens += turn.usage.cache_read_input_tokens ?? 0;
    }
    const done = (reply: string): AgentResponse => ({
      model: model.name,
      reply,
      cards,
      toolTrace,
      ...(sawUsage ? { usage } : {}),
      pendingDraft: turn.pendingDraft ?? null,
    });
    if (turn.stop_reason === "refusal") return done("I can't help with that one.");
    if (turn.stop_reason === "max_tokens") throw new HttpError(502, "The agent's reply was cut off. Try a shorter question.");
    const uses = turn.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (turn.stop_reason !== "tool_use" || uses.length === 0) return done(textOf(turn));

    messages.push({ role: "assistant", content: turn.content });
    // Every tool call in the turn runs at once and every result goes back in one user message (the parallel tool use contract).
    const results = await Promise.all(
      uses.map(async (u) => {
        const started = Date.now();
        try {
          if (allowed && !allowed.has(u.name)) return { content: JSON.stringify({ error: "That tool isn't available in this step." }), isError: true, ms: Date.now() - started };
          const r = await execute(u.name, u.input, ctx, deps);
          return { ...r, ms: Date.now() - started };
        } catch (err) {
          return { content: JSON.stringify({ error: err instanceof Error ? err.message : "That didn't work." }), isError: true, ms: Date.now() - started };
        }
      }),
    );
    results.forEach((r, i) => {
      toolTrace.push({ name: uses[i].name, ok: !r.isError, ms: r.ms });
      if (r.card) cards.push(r.card);
    });
    messages.push({
      role: "user",
      content: results.map((r, i) => ({ type: "tool_result", tool_use_id: uses[i].id, content: r.content, is_error: !!r.isError })),
    });
  }
  throw new HttpError(502, "The agent took too many steps. Try a simpler question.");
}
