import { ACTIVE_STATUSES, type Plan, type PlanExit, type PlanMode, type PlanStatus, type PlanTrigger } from "../../lib/plans";

/**
 * Pure wording and ordering for the Plans panel (docs/port/agent-ux.md §2,
 * §4): status labels and their hover text, the row order, the example
 * chips built from live prices, the relative times and the feet. No React,
 * no fetches, relative imports only, so tests/plans-ui.test.mjs can load it
 * through the TS transpile harness.
 */
export type StatusTone = "armed" | "holding" | "ready" | "done" | "failed" | "muted";

export const STATUS_LABEL: Record<PlanStatus, string> = {
  proposed: "PROPOSED",
  armed: "ARMED",
  holding: "HOLDING",
  ready: "READY TO SIGN",
  done: "FILLED",
  failed: "FAILED",
  cancelled: "CANCELLED",
  expired: "EXPIRED",
};

/** Colour never stands alone: the word is always there, the tone only tints it. Expired and cancelled stay neutral. */
export const STATUS_TONE: Record<PlanStatus, StatusTone> = {
  proposed: "muted",
  armed: "armed",
  holding: "holding",
  ready: "ready",
  done: "done",
  failed: "failed",
  cancelled: "muted",
  expired: "muted",
};

const FINISHED: PlanStatus[] = ["done", "failed", "cancelled", "expired"];

export function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Oct 22" */
export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function lastLog(plan: Pick<Plan, "log">): string | null {
  const entry = plan.log[plan.log.length - 1];
  return entry ? entry.msg : null;
}

/** The `title` on a status chip: what the state means, in one clause. */
export function statusTitle(plan: Pick<Plan, "status" | "filled" | "log">): string | undefined {
  switch (plan.status) {
    case "armed":
      return "watching the price; nothing has happened yet";
    case "holding":
      return "bought; watching the exit levels";
    case "ready":
      return "the price is there; open the ticket and sign";
    case "done":
      return plan.filled ? `filled at ${money(plan.filled.price)} on ${shortDate(plan.filled.at)}` : "filled";
    case "failed":
      return lastLog(plan) ?? "failed";
    case "expired":
      return (lastLog(plan) ?? "").includes("hold window") ? "hold window ended, position kept" : "expired before the trigger hit";
    default:
      return undefined;
  }
}

/** Live rows (armed · holding · ready) newest first, then the last six finished rows. Proposed drafts are never listed. */
export function sortPlans(plans: readonly Plan[]): { live: Plan[]; earlier: Plan[] } {
  const live = plans.filter((p) => ACTIVE_STATUSES.includes(p.status)).sort((a, b) => b.createdAt - a.createdAt);
  const earlier = plans
    .filter((p) => FINISHED.includes(p.status))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);
  return { live, earlier };
}

/** "12 s" · "2 min" · "3 h" · "2 d" — the number a "checked … ago" line carries. */
export function relTime(from: number, now: number): string {
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** (trigger − now) / now, signed, one decimal: "−21.0%" / "+4.2%". */
export function signedDistance(trigger: number, now: number): string {
  if (!(now > 0)) return "—";
  const d = ((trigger - now) / now) * 100;
  const sign = d > 0.05 ? "+" : d < -0.05 ? "−" : "";
  return `${sign}${Math.abs(d).toFixed(1)}%`;
}

/** The example chips, rebuilt from live prices so they are never stale; a ticker without a price has no chip. */
export const EXAMPLE_TEMPLATES: ReadonlyArray<{ ticker: string; text: (price: number) => string }> = [
  { ticker: "TSLAx", text: (p) => `if TSLAx falls to $${Math.floor(p * 0.95)}, buy $250` },
  { ticker: "NVDAx", text: (p) => `sell half of NVDAx if it rises to $${Math.ceil(p * 1.08)}` },
  { ticker: "SPYx", text: (p) => `if SPYx rises to $${Math.ceil(p * 1.03)}, buy $100, stop at $${Math.floor(p * 0.98)}` },
];

export function exampleChips(priceFor: (ticker: string) => number | undefined): string[] {
  const chips: string[] = [];
  for (const t of EXAMPLE_TEMPLATES) {
    const p = priceFor(t.ticker);
    if (typeof p === "number" && Number.isFinite(p) && p > 0) chips.push(t.text(p));
  }
  return chips.slice(0, 3);
}

function exitsLine(exits: PlanExit[]): string {
  const target = exits.find((e) => e.kind === "target");
  const stop = exits.find((e) => e.kind === "stop");
  return [target ? `target ${money(target.price)}` : null, stop ? `stop ${money(stop.price)}` : null].filter(Boolean).join(" / ");
}

/**
 * Line 4 of a row: the price it watches and how fresh the check is.
 * `price` is undefined when the ticker has no live price right now.
 */
export function watchLine(plan: Pick<Plan, "status" | "condition" | "execution" | "evaluatedAt">, price: number | undefined, now: number): string {
  const { ticker, trigger, exits } = plan.condition;
  const checked = plan.evaluatedAt ? ` · checked ${relTime(plan.evaluatedAt, now)} ago` : "";
  const lead = plan.execution === "notify" ? "notify + sign · Solera watching" : null;
  if (price === undefined) return [lead, `no live price for ${ticker} right now · plan still ${plan.status}`].filter(Boolean).join(" · ");
  if (plan.status === "holding") return [lead, `holding · now ${money(price)}`, exits.length ? exitsLine(exits) : null].filter(Boolean).join(" · ") + checked;
  if (trigger.kind !== "price") return [lead, `watching ${ticker} · now ${money(price)}`].filter(Boolean).join(" · ") + checked;
  const t = `trigger ${money(trigger.price)} (${signedDistance(trigger.price, price)})`;
  return [lead, `watching ${ticker} · now ${money(price)}`, t].filter(Boolean).join(" · ") + checked;
}

/** "at or above" / "at or below", for the notify toast. */
export function triggerWords(trigger: PlanTrigger): string {
  if (trigger.kind !== "price") return "there";
  return trigger.op === "gte" ? "at or above" : "at or below";
}

/** Jupiter's orderState → the badge word (agent-ux §2.3). */
export function triggerStateLabel(state: string | null | undefined): string {
  switch (state) {
    case "pending":
      return "deposit landing";
    case "open":
      return "open";
    case "executing":
      return "filling…";
    case "filled":
      return "filled";
    case "pending_withdraw":
      return "withdrawal pending";
    case "expired":
      return "expired · funds still in vault";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return state ? state.replace(/_/g, " ") : "not yet synced";
  }
}

/** The toast after a plan arms: practice restates the rule, live says where the notification lands. */
export function armedToast(plan: Pick<Plan, "mode" | "summary" | "condition">): string {
  if (plan.mode === "live" && plan.condition.trigger.kind === "price") {
    return `Armed. You'll get a notification here when ${plan.condition.ticker} is ${triggerWords(plan.condition.trigger)} ${money(plan.condition.trigger.price)}.`;
  }
  return `Armed: ${plan.summary}`;
}

export const FOOT_PRACTICE =
  "A plan is your sentence, executed in practice cash on Solera's server when its price condition is met — checked about once a minute. Human conditions (\"until deliveries miss\") become the position's wrong-if for you to mark.";
export const FOOT_LIVE =
  "Price conditions become a Jupiter Trigger order you sign once; funds sit in Jupiter's vault until it fills or you cancel. Anything Trigger can't express waits here as \"ready to sign\". One sign-in with your wallet (good for 24 hours), then one signature per order.";

export function footFor(mode: PlanMode): string {
  return mode === "live" ? FOOT_LIVE : FOOT_PRACTICE;
}

export interface PlanHealth {
  lastEvaluatedAt: number | null;
  serverWatch: boolean;
}

export function healthLine(health: PlanHealth | null, now: number | null): string {
  if (health?.serverWatch && health.lastEvaluatedAt) return now ? `server watch: on · last check ${relTime(health.lastEvaluatedAt, now)} ago` : "server watch: on";
  return "server watch: off · checking while this tab is open";
}

/** "9U76…vMQd" — the same shape as the wallet pill's. */
export function shortWallet(address: string): string {
  return address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/** "abc123…wxyz" for a Jupiter order id. */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/**
 * The one action a Jupiter row offers (agent-ux §2.3, §3.4): CANCEL &
 * WITHDRAW while the order watches, FINISH WITHDRAWAL after an
 * interrupted cancel, WITHDRAW for an expired order whose deposit still
 * sits in the vault. Null once the funds have left the vault.
 */
export function triggerAction(plan: Pick<Plan, "status" | "triggerState">): { label: string; title: string; kind: "cancel" | "finish" | "withdraw" } | null {
  switch (plan.triggerState) {
    case "expired":
      return { kind: "withdraw", label: "Withdraw · sign in wallet", title: "The order expired unfilled; the deposit stays in Jupiter's vault until you withdraw it." };
    case "pending_withdraw":
      return { kind: "finish", label: "Finish withdrawal", title: "The cancel went through; the return still needs your signature." };
    case "filled":
    case "cancelled":
    case "failed":
      return null;
    default:
      return ACTIVE_STATUSES.includes(plan.status) ? { kind: "cancel", label: "Cancel & withdraw", title: "Stops the order right away; the deposit comes back with one signature." } : null;
  }
}

/** Line 4 of a Jupiter row: the mirrored order state, the id, the expiry, and how fresh the mirror is. */
export function jupiterLine(plan: Pick<Plan, "triggerState" | "triggerOrderId" | "armUntil" | "triggerCheckedAt">, now: number | null): string {
  const parts = [`Jupiter order · ${triggerStateLabel(plan.triggerState)}`];
  if (plan.triggerOrderId) parts.push(`order ${shortId(plan.triggerOrderId)}`);
  if (plan.armUntil) parts.push(`expires ${shortDate(plan.armUntil)}`);
  if (plan.triggerCheckedAt && now) parts.push(`Jupiter status checked ${relTime(plan.triggerCheckedAt, now)} ago`);
  return parts.join(" · ");
}

/** A holding OTOCO row: the child pair is live on Jupiter's side (agent-ux §2.3). */
export function jupiterHoldingLine(plan: Pick<Plan, "condition">, price: number | undefined): string {
  const exits = exitsLine(plan.condition.exits);
  return [`holding${price !== undefined ? ` · now ${money(price)}` : ""}`, `Jupiter watching${exits ? ` ${exits}` : ""}`].join(" · ");
}

/** A live row belongs to the wallet that armed it (agent-ux §5 "Wallet disconnected"): who can act on it, in one line, or null when the connected wallet is that one. */
export function walletNotice(plan: Pick<Plan, "wallet">, address: string | null): string | null {
  if (!plan.wallet) return null;
  if (!address) return `Connect ${shortWallet(plan.wallet)} to refresh Jupiter status.`;
  if (address !== plan.wallet) return `armed from ${shortWallet(plan.wallet)}`;
  return null;
}

/** When the toggle differs from a plan's mode, one line says the other mode's plans are still watched (agent-ux §5). */
export function modeNotice(live: readonly Pick<Plan, "mode" | "execution">[], mode: PlanMode): string | null {
  const other = live.filter((p) => p.mode !== mode);
  if (other.length === 0) return null;
  const n = other.length;
  if (mode === "practice") {
    const byJupiter = other.every((p) => p.execution === "trigger");
    return `${n} live plan${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} still being watched by ${byJupiter ? "Jupiter" : "Solera"}.`;
  }
  return `${n} practice plan${n === 1 ? "" : "s"} still run${n === 1 ? "s" : ""} on Solera's server.`;
}

/** The plan_ready toast line, parsed from the inbox row the evaluator wrote. */
export function readyToastText(row: { title: string; body: string }): string {
  const sym = row.title.match(/:\s*([A-Z0-9.]{1,12}x)\b/)?.[1];
  const price = row.body.match(/is at (\$[\d,]+(?:\.\d+)?)/)?.[1];
  if (sym && price) return `${sym} is at ${price} — a plan is ready to sign.`;
  return `${sym ?? "A plan"} is ready to sign.`;
}

export const EMPTY_LIVE = "No live plans. Write one above — Solera reads it, shows you the rule it understood, and only arms it when you say so.";
export const SIGNED_OUT = "Sign in to keep plans running while you're away.";
export const INBOX_EMPTY = "Nothing to sign or read. Plans that need you show up here.";
export const INBOX_FOOT = "Solera notifies here, in the app. Email and push aren't wired yet.";
