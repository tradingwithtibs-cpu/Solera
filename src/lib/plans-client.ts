import type { Plan, PlanCondition, PlanMode } from "./plans";
import type { PendingDraft } from "./agent/types";

/**
 * Browser-side calls to the plans routes (docs/port/backend.md §6.3, §8.5,
 * §9.8) and the agent (§7.1). One place for the fetch shapes so the Plans
 * panel, the plan cards in the Agent tab, the inbox and the ticket's
 * ?plan= prefill all speak the same contract. Every call takes the session
 * token from `useSession()`; reads that need no owner pass `null`.
 */
export interface InboxItem {
  id: string;
  kind: "plan_ready" | "plan_filled" | "plan_failed" | "plan_expired" | "plan_cancelled" | string;
  planId: string | null;
  title: string;
  body: string;
  href: string | null;
  readAt: number | null;
  createdAt: number;
}

export interface PlanPreview {
  condition: PlanCondition | null;
  summary: string | null;
  question: string | null;
  partial: PendingDraft["condition"];
}

export class PlansClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlansClientError";
  }
}

function headers(token: string | null, json = true): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function call<T>(input: string, init: RequestInit): Promise<T> {
  const res = await fetch(input, { cache: "no-store", ...init });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new PlansClientError(res.status, message);
  }
  return body as T;
}

export const plansClient = {
  list: (token: string) => call<{ plans: Plan[] }>("/api/plans", { headers: headers(token, false) }).then((r) => r.plans),
  get: (token: string, id: string) => call<{ plan: Plan }>(`/api/plans/${encodeURIComponent(id)}`, { headers: headers(token, false) }).then((r) => r.plan),
  /** A proposed plan; arm it next. `source` is "agent" when the sentence came through the Agent tab. */
  create: (token: string, input: { text: string; condition: PlanCondition; mode: PlanMode; source?: "ui" | "agent" }) =>
    call<{ plan: Plan }>("/api/plans", { method: "POST", headers: headers(token), body: JSON.stringify(input) }).then((r) => r.plan),
  arm: (token: string, id: string, trigger?: { orderId: string; depositSignature: string }) =>
    call<{ plan: Plan }>(`/api/plans/${encodeURIComponent(id)}`, { method: "PATCH", headers: headers(token), body: JSON.stringify({ status: "armed", ...(trigger ? { trigger } : {}) }) }).then((r) => r.plan),
  cancel: (token: string, id: string) =>
    call<{ plan: Plan }>(`/api/plans/${encodeURIComponent(id)}`, { method: "PATCH", headers: headers(token), body: JSON.stringify({ status: "cancelled" }) }).then((r) => r.plan),
  /** The notify path: the person's own tap filled it. */
  done: (token: string, id: string, fillId?: string) =>
    call<{ plan: Plan }>(`/api/plans/${encodeURIComponent(id)}`, { method: "PATCH", headers: headers(token), body: JSON.stringify({ status: "done", fillId }) }).then((r) => r.plan),
  /** Proposed drafts only. */
  discard: (token: string, id: string) => call<{ ok: true }>(`/api/plans/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(token, false) }),
  /** What Solera read from a sentence: no model, no owner needed. */
  preview: (text: string) => call<PlanPreview>("/api/plans/preview", { method: "POST", headers: headers(null), body: JSON.stringify({ text }) }),
  health: () => call<{ lastEvaluatedAt: number | null; serverWatch: boolean }>("/api/plans/health", { headers: headers(null, false) }),
  /** The open tab's own minute check (backend §8.5); fires only this owner's plans. */
  evaluateSelf: (token: string) => call<{ pass: string; fired: number; notified: number; expired: number }>("/api/plans/evaluate?scope=self", { method: "POST", headers: headers(token, false) }),
  inbox: (token: string, unreadOnly = false) => call<{ items: InboxItem[] }>(`/api/inbox${unreadOnly ? "?unread=1" : ""}`, { headers: headers(token, false) }).then((r) => r.items),
  markRead: (token: string, ids: string[]) => call<{ ok: true }>("/api/inbox/read", { method: "POST", headers: headers(token), body: JSON.stringify({ ids }) }),
};

export type PlansClient = typeof plansClient;
