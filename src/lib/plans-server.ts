import { HttpError } from "./auth-server";
import { getSupabaseService } from "./supabase";
import { ACTIVE_STATUSES, DEFAULT_ARM_DAYS, describe, validateCondition, type Plan, type PlanCondition, type PlanMode, type PlanStatus } from "./plans";
import { fillPractice, loadPractice } from "./practice-server";
import { jupiterPriceForMint, jupiterPricesForMints, mintForTicker } from "./prices-server";
import { SOL } from "./tokens";
import { toTriggerOrder, type TriggerMapping } from "./jupiter-trigger-map";
import { evaluatePlans, type EvaluatorDeps, type EvaluatorResult } from "./plan-evaluator";

/** Storage for plans and the inbox, and the real dependencies for the evaluator. */
interface PlanRow {
  id: string;
  owner: string;
  wallet: string | null;
  mode: PlanMode;
  execution: Plan["execution"];
  text: string;
  condition: PlanCondition;
  summary: string;
  status: PlanStatus;
  arm_until: string | null;
  hold_until: string | null;
  trigger_order_id: string | null;
  trigger_deposit_sig: string | null;
  trigger_state: string | null;
  trigger_checked_at: string | null;
  ready_at: string | null;
  filled: Plan["filled"];
  log: Plan["log"];
  source: "ui" | "agent";
  evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, owner, wallet, mode, execution, text, condition, summary, status, arm_until, hold_until, trigger_order_id, trigger_deposit_sig, trigger_state, trigger_checked_at, ready_at, filled, log, source, evaluated_at, created_at, updated_at";

function service() {
  const s = getSupabaseService();
  if (!s) throw new HttpError(501, "Plans aren't enabled on this deployment yet.");
  return s;
}

const ts = (s: string | null) => (s ? Date.parse(s) : null);

export function toPlan(r: PlanRow): Plan {
  return {
    id: r.id,
    owner: r.owner,
    wallet: r.wallet,
    mode: r.mode,
    execution: r.execution,
    text: r.text,
    condition: r.condition,
    summary: r.summary,
    status: r.status,
    armUntil: ts(r.arm_until),
    holdUntil: ts(r.hold_until),
    triggerOrderId: r.trigger_order_id,
    triggerState: r.trigger_state,
    triggerDepositSig: r.trigger_deposit_sig ?? null,
    triggerCheckedAt: ts(r.trigger_checked_at ?? null),
    readyAt: ts(r.ready_at),
    filled: r.filled ?? null,
    log: Array.isArray(r.log) ? r.log : [],
    source: r.source,
    evaluatedAt: ts(r.evaluated_at),
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
  };
}

export async function listPlans(owner: string): Promise<Plan[]> {
  const { data, error } = await service().from("plans").select(COLUMNS).eq("owner", owner).order("created_at", { ascending: false }).limit(100);
  if (error) throw new HttpError(502, error.message);
  return ((data ?? []) as PlanRow[]).map(toPlan);
}

export async function getPlan(id: string, owner?: string): Promise<Plan | null> {
  let q = service().from("plans").select(COLUMNS).eq("id", id);
  if (owner) q = q.eq("owner", owner);
  const { data, error } = await q.maybeSingle();
  if (error) throw new HttpError(502, error.message);
  return data ? toPlan(data as PlanRow) : null;
}

/** What a live plan becomes on Jupiter (backend §9.3): the order preview, or the reason it waits as notify + sign. */
export type LivePreview = ({ execution: "trigger" } & Extract<TriggerMapping, { ok: true }>) | { execution: "notify"; reason: string };

export async function livePreview(condition: PlanCondition, wallet: string, token: { mint: string; decimals: number }): Promise<LivePreview> {
  const [price, solUsd] = await Promise.all([jupiterPriceForMint(token.mint), jupiterPriceForMint(SOL.mint)]);
  if (!price) return { execution: "notify", reason: `No live price for ${condition.ticker} right now; Solera will watch it and notify you.` };
  const now = Date.now();
  const days = condition.armDays ?? DEFAULT_ARM_DAYS;
  const mapping = toTriggerOrder(condition, { wallet, token: { ...token, symbol: condition.ticker }, price, solUsd, now, armUntil: now + days * 24 * 60 * 60_000 });
  if (!mapping.ok) return { execution: "notify", reason: mapping.reason };
  return { execution: "trigger", ...mapping };
}

export async function createPlan(input: {
  owner: string;
  wallet: string | null;
  mode: PlanMode;
  text: string;
  condition: PlanCondition;
  source?: "ui" | "agent";
  execution?: Plan["execution"];
}): Promise<{ plan: Plan; live: LivePreview | null }> {
  const problem = validateCondition(input.condition, { standing: true });
  if (problem) throw new HttpError(400, problem);
  const token = await mintForTicker(input.condition.ticker);
  if (!token) throw new HttpError(400, `No Solana mint known for ${input.condition.ticker} yet.`);
  if (input.mode === "live" && !input.wallet) throw new HttpError(403, "Connect a wallet to arm a live plan.");
  // Live plans: Jupiter holds what it can express; everything else waits as notify + sign. A caller may force notify.
  const live = input.mode === "live" && input.wallet && input.execution !== "notify" ? await livePreview(input.condition, input.wallet, token) : null;
  const execution: Plan["execution"] = input.mode === "practice" ? "server" : input.execution === "notify" ? "notify" : (live?.execution ?? "notify");
  const { data, error } = await service()
    .from("plans")
    .insert({
      owner: input.owner,
      wallet: input.mode === "live" ? input.wallet : null,
      mode: input.mode,
      execution,
      text: input.text.slice(0, 280),
      condition: input.condition,
      summary: describe(input.condition),
      status: "proposed",
      source: input.source ?? "ui",
      log: [{ at: Date.now(), from: null, to: "proposed", msg: "proposed" }],
    })
    .select(COLUMNS)
    .single();
  if (error) throw new HttpError(502, error.message);
  return { plan: toPlan(data as PlanRow), live: input.mode === "live" ? (live ?? { execution: "notify", reason: "Solera will watch this one and notify you." }) : null };
}

function patchRow(patch: Partial<Plan>): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.armUntil !== undefined) row.arm_until = patch.armUntil === null ? null : new Date(patch.armUntil).toISOString();
  if (patch.holdUntil !== undefined) row.hold_until = patch.holdUntil === null ? null : new Date(patch.holdUntil).toISOString();
  if (patch.triggerOrderId !== undefined) row.trigger_order_id = patch.triggerOrderId;
  if (patch.triggerState !== undefined) row.trigger_state = patch.triggerState;
  if (patch.triggerDepositSig !== undefined) row.trigger_deposit_sig = patch.triggerDepositSig;
  if (patch.triggerCheckedAt !== undefined) row.trigger_checked_at = patch.triggerCheckedAt === null ? null : new Date(patch.triggerCheckedAt).toISOString();
  if (patch.readyAt !== undefined) row.ready_at = patch.readyAt === null ? null : new Date(patch.readyAt).toISOString();
  if (patch.filled !== undefined) row.filled = patch.filled;
  if (patch.log !== undefined) row.log = patch.log;
  if (patch.evaluatedAt !== undefined) row.evaluated_at = patch.evaluatedAt === null ? null : new Date(patch.evaluatedAt).toISOString();
  return row;
}

export async function savePlan(id: string, patch: Partial<Plan>): Promise<void> {
  const { error } = await service().from("plans").update(patchRow(patch)).eq("id", id);
  if (error) throw new HttpError(502, error.message);
}

/** The status changes a person may request from the UI. */
export async function transitionPlan(
  plan: Plan,
  to: "armed" | "cancelled" | "done",
  extra: { fillId?: string; trigger?: { orderId: string; depositSignature: string; expiresAt?: number; depositConfirmed?: boolean; withdrawSignature?: string } } = {},
): Promise<Plan> {
  const now = Date.now();
  const allowed: Record<string, PlanStatus[]> = {
    armed: ["proposed", "ready"],
    cancelled: ["proposed", "armed", "holding", "ready"],
    done: ["ready"],
  };
  if (!allowed[to].includes(plan.status)) throw new HttpError(409, `A ${plan.status} plan can't become ${to}.`);
  const armMsg = extra.trigger ? `armed · Jupiter order ${extra.trigger.orderId}${extra.trigger.depositConfirmed === false ? " (deposit landing)" : ""}` : "armed";
  const cancelMsg = extra.trigger?.withdrawSignature ? `cancelled by you · withdrawal ${extra.trigger.withdrawSignature.slice(0, 8)}…` : "cancelled by you";
  const patch: Partial<Plan> = { status: to, log: [...plan.log, { at: now, from: plan.status, to, msg: to === "armed" ? armMsg : to === "cancelled" ? cancelMsg : `done via ticket${extra.fillId ? ` (${extra.fillId})` : ""}` }] };
  if (to === "armed") {
    const days = plan.condition.armDays ?? DEFAULT_ARM_DAYS;
    patch.armUntil = extra.trigger?.expiresAt ?? now + days * 24 * 60 * 60_000;
    patch.readyAt = null;
    if (extra.trigger) {
      patch.triggerOrderId = extra.trigger.orderId;
      patch.triggerDepositSig = extra.trigger.depositSignature;
      patch.triggerState = extra.trigger.depositConfirmed === false ? "pending" : "open";
      patch.triggerCheckedAt = now;
    }
  }
  if (to === "cancelled" && extra.trigger?.withdrawSignature) patch.triggerState = "cancelled";
  await savePlan(plan.id, patch);
  return (await getPlan(plan.id))!;
}

export async function deleteProposed(id: string, owner: string): Promise<boolean> {
  const { data, error } = await service().from("plans").delete().eq("id", id).eq("owner", owner).eq("status", "proposed").select("id");
  if (error) throw new HttpError(502, error.message);
  return (data ?? []).length > 0;
}

export async function planHealth(): Promise<{ lastEvaluatedAt: number | null; serverWatch: boolean }> {
  const { data } = await service().from("plans").select("evaluated_at").not("evaluated_at", "is", null).order("evaluated_at", { ascending: false }).limit(1).maybeSingle();
  const last = (data as { evaluated_at?: string } | null)?.evaluated_at;
  const at = last ? Date.parse(last) : null;
  return { lastEvaluatedAt: at, serverWatch: at !== null && Date.now() - at < 3 * 60_000 };
}

export async function addInbox(row: { owner: string; kind: string; planId: string; title: string; body: string; href?: string }) {
  await service().from("inbox").insert({ owner: row.owner, kind: row.kind, plan_id: row.planId, title: row.title.slice(0, 120), body: row.body.slice(0, 500), href: row.href ?? null });
}

/** The evaluator with real storage, Jupiter pricing and the practice ledger. */
export function realEvaluatorDeps(budgetMs = 8_000): EvaluatorDeps {
  const s = service();
  return {
    now: () => Date.now(),
    budgetMs,
    loadActive: async (scopeOwner) => {
      let q = s.from("plans").select(COLUMNS).in("status", ACTIVE_STATUSES).order("evaluated_at", { ascending: true, nullsFirst: true }).limit(200);
      if (scopeOwner) q = q.eq("owner", scopeOwner);
      const { data, error } = await q;
      if (error) throw new HttpError(502, error.message);
      return ((data ?? []) as PlanRow[]).map(toPlan);
    },
    priceFor: async (tickers) => {
      const mints = await Promise.all(tickers.map(async (t) => [t, (await mintForTicker(t))?.mint] as const));
      const known = mints.filter((m): m is readonly [string, string] => !!m[1]);
      const prices = await jupiterPricesForMints(known.map((m) => m[1]));
      const out: Record<string, number> = {};
      for (const [ticker, mint] of known) if (prices[mint]) out[ticker] = prices[mint];
      return out;
    },
    fillPractice: async (owner, input) => {
      const { fill } = await fillPractice(owner, input);
      return { fillId: fill.id, quantity: fill.quantity, pricePerShare: fill.pricePerShare };
    },
    heldShares: async (owner, ticker) => {
      const { portfolio } = await loadPractice(owner);
      return portfolio?.holdings.find((h) => h.ticker === ticker)?.shares ?? 0;
    },
    savePlan: (id, patch) => savePlan(id, patch),
    inbox: (row) => addInbox(row),
  };
}

export async function runEvaluator(opts: { pass: EvaluatorResult["pass"]; scopeOwner?: string }): Promise<EvaluatorResult> {
  return evaluatePlans(realEvaluatorDeps(), opts);
}
