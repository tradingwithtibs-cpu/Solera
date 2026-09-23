"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { plansClient, PlansClientError } from "@/lib/plans-client";
import type { Plan, PlanCondition, PlanMode } from "@/lib/plans";
import { sortPlans, type PlanHealth } from "@/components/plans/plan-format";
import { useSession } from "./use-session";

/**
 * The person's plans, shared by every Plans panel on the page through one
 * module store (docs/port/agent-ux.md §2): `GET /api/plans` every 15 s while
 * mounted, on focus and after every action; `GET /api/plans/health` every
 * 60 s; and the open tab's own minute check, `POST /api/plans/evaluate?scope=self`
 * (backend §8.5), so a practice plan still fires with the tab open when the
 * scheduled watcher is off.
 */
export interface PlansSnapshot {
  plans: Plan[] | null;
  error: string | null;
  /** 501: the routes are not enabled on this deployment (no Supabase). */
  unavailable: boolean;
  fetchedAt: number | null;
  health: PlanHealth | null;
}

const EMPTY: PlansSnapshot = { plans: null, error: null, unavailable: false, fetchedAt: null, health: null };
const LIST_MS = 15_000;
const HEALTH_MS = 60_000;
const EVALUATE_MS = 60_000;

let snapshot: PlansSnapshot = EMPTY;
let currentToken: string | null = null;
let refs = 0;
let listTimer: ReturnType<typeof setInterval> | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let evalTimer: ReturnType<typeof setInterval> | null = null;
let listInFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function patch(next: Partial<PlansSnapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

/** Re-reads the list for the current session; safe to call from anywhere (the ticket after a plan fill, a card after arming). */
export function refreshPlans(): Promise<void> {
  const token = currentToken;
  if (!token) return Promise.resolve();
  if (listInFlight) return listInFlight;
  listInFlight = (async () => {
    try {
      const plans = await plansClient.list(token);
      if (currentToken === token) patch({ plans, error: null, unavailable: false, fetchedAt: Date.now() });
    } catch (err) {
      if (currentToken !== token) return;
      const status = err instanceof PlansClientError ? err.status : 0;
      patch({ error: err instanceof Error ? err.message : "Couldn't load your plans.", unavailable: status === 501 });
    } finally {
      listInFlight = null;
    }
  })();
  return listInFlight;
}

async function refreshHealth() {
  try {
    patch({ health: await plansClient.health() });
  } catch {
    patch({ health: null });
  }
}

async function evaluateSelf() {
  const token = currentToken;
  if (!token) return;
  try {
    const r = await plansClient.evaluateSelf(token);
    if (r.fired || r.notified || r.expired) void refreshPlans();
  } catch {
    // The scheduled watcher or the next tick will catch it; never surface this.
  }
}

function onFocus() {
  void refreshHealth();
  void refreshPlans();
}

/** The Jupiter sheets (arm, cancel, withdraw) announce a change this way once it landed. */
function onPlansChanged() {
  void refreshPlans();
}

function start() {
  void refreshHealth();
  healthTimer = setInterval(refreshHealth, HEALTH_MS);
  if (currentToken) {
    void refreshPlans();
    listTimer = setInterval(refreshPlans, LIST_MS);
    void evaluateSelf();
    evalTimer = setInterval(evaluateSelf, EVALUATE_MS);
  }
  window.addEventListener("focus", onFocus);
  window.addEventListener("solera:plans-changed", onPlansChanged);
}

function stop() {
  if (listTimer) clearInterval(listTimer);
  if (healthTimer) clearInterval(healthTimer);
  if (evalTimer) clearInterval(evalTimer);
  listTimer = healthTimer = evalTimer = null;
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("solera:plans-changed", onPlansChanged);
}

function attach(token: string | null): () => void {
  refs++;
  if (refs === 1) {
    currentToken = token;
    patch({ plans: null, error: null, unavailable: false, fetchedAt: null });
    start();
  } else if (token !== currentToken) {
    stop();
    currentToken = token;
    patch({ plans: null, error: null, unavailable: false, fetchedAt: null });
    start();
  }
  return () => {
    refs--;
    if (refs === 0) stop();
  };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function usePlans() {
  const { token, signedIn } = useSession();
  const snap = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

  useEffect(() => attach(token), [token]);

  const sorted = useMemo(() => sortPlans(snap.plans ?? []), [snap.plans]);

  const need = useCallback((): string => {
    if (!token) throw new Error("Sign in to keep plans running while you're away.");
    return token;
  }, [token]);

  const create = useCallback(
    async (text: string, condition: PlanCondition, mode: PlanMode, source: "ui" | "agent" = "ui"): Promise<Plan> => {
      return plansClient.create(need(), { text, condition, mode, source });
    },
    [need],
  );
  /** The same POST keeping the server's live preview, so a live sentence knows whether Jupiter holds it or Solera notifies (backend §9.3). */
  const createWithPreview = useCallback(
    async (text: string, condition: PlanCondition, mode: PlanMode, source: "ui" | "agent" = "ui") => {
      return plansClient.createWithPreview(need(), { text, condition, mode, source });
    },
    [need],
  );
  const arm = useCallback(
    async (id: string): Promise<Plan> => {
      const plan = await plansClient.arm(need(), id);
      await refreshPlans();
      return plan;
    },
    [need],
  );
  const cancel = useCallback(
    async (id: string): Promise<Plan> => {
      const plan = await plansClient.cancel(need(), id);
      await refreshPlans();
      return plan;
    },
    [need],
  );
  const discard = useCallback(
    async (id: string): Promise<void> => {
      await plansClient.discard(need(), id);
      await refreshPlans();
    },
    [need],
  );

  return {
    ...snap,
    live: sorted.live,
    earlier: sorted.earlier,
    signedIn,
    token,
    refresh: refreshPlans,
    create,
    createWithPreview,
    arm,
    cancel,
    discard,
  };
}
