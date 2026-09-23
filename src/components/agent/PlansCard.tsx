"use client";

import { useState } from "react";
import { useSession } from "@/hooks/use-session";
import { plansClient } from "@/lib/plans-client";
import { isActive, type PlanStatus } from "@/lib/plans";
import type { AgentCard } from "@/lib/agent/types";
import { toast } from "./toast";

type PlansCardData = Extract<AgentCard, { kind: "plans" }>;

const LABEL: Record<PlanStatus, string> = {
  proposed: "PROPOSED",
  armed: "ARMED",
  holding: "HOLDING",
  ready: "READY TO SIGN",
  done: "FILLED",
  failed: "FAILED",
  expired: "EXPIRED",
  cancelled: "CANCELLED",
};
const TITLE: Partial<Record<PlanStatus, string>> = {
  armed: "watching the price; nothing has happened yet",
  holding: "bought; watching the exit levels",
  ready: "the price is there; open the ticket and sign",
  expired: "expired before the trigger hit",
};
const CHIP: Partial<Record<PlanStatus, string>> = { armed: "st-armed", holding: "st-holding", ready: "st-ready", done: "st-done", failed: "st-failed" };

/**
 * The PLANS CARD (agent-ux §1.5): one row per plan from list_plans, status
 * chip · summary · mode chip. Cancel with an inline confirm for practice
 * plans; live rows cancel from the Plans panel (a Jupiter order needs a
 * signature, task A5).
 */
export function PlansCard({ card }: { card: PlansCardData }) {
  const { token } = useSession();
  const [statuses, setStatuses] = useState<Record<string, PlanStatus>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const cancel = async (id: string) => {
    if (!token) return;
    setBusy(id);
    setProblem(null);
    try {
      const plan = await plansClient.cancel(token, id);
      setStatuses((s) => ({ ...s, [id]: plan.status }));
      toast("Plan cancelled.", "ok");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't cancel that plan.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <section className="agent-card plans" aria-label="Your plans">
      <header className="agent-card-head">
        <h3>
          YOUR PLANS
        </h3>
        <span className="agent-card-chips">
          <span className="agent-line">{card.plans.length} shown</span>
        </span>
      </header>
      <div className="agent-card-body">
        {card.plans.length === 0 ? (
          <p className="agent-line">No plans yet.</p>
        ) : (
          <ul className="agent-plans">
            {card.plans.map((p) => {
              const status = statuses[p.id] ?? p.status;
              const cancellable = !!token && p.mode === "practice" && isActive(status);
              return (
                <li key={p.id} className="agent-plan-row">
                  <div>
                    <p className="agent-plan-chips">
                      <span className={`chip ${CHIP[status] ?? ""}`} title={TITLE[status]}>
                        {LABEL[status] ?? status}
                      </span>
                      <span className={`chip ${p.mode === "live" ? "live" : "practice"}`}>{p.mode}</span>
                    </p>
                    <p className="agent-line">{p.summary}</p>
                  </div>
                  {cancellable &&
                    (confirming === p.id ? (
                      <span className="agent-confirm" role="group" aria-label="Cancel this plan?">
                        Cancel this plan?
                        {status === "holding" && <span> Your position stays; Solera just stops watching its exits.</span>}
                        <button type="button" className="btn-secondary btn-small" onClick={() => cancel(p.id)} disabled={busy === p.id} aria-busy={busy === p.id}>
                          Yes · cancel
                        </button>
                        <button type="button" className="btn-ghost btn-small" onClick={() => setConfirming(null)} disabled={busy === p.id}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn-ghost btn-small" onClick={() => setConfirming(p.id)}>
                        cancel
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
        {problem && (
          <p role="alert" className="field-error">
            {problem}
          </p>
        )}
      </div>
    </section>
  );
}
