"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { useLivePriceFor } from "@/hooks/use-live-price-for";
import { useConnectWallet } from "@/components/ConnectWalletProvider";
import { openAuthSheet } from "@/components/auth/auth-sheet-store";
import { useNow } from "@/components/portfolio/use-now";
import { plansClient } from "@/lib/plans-client";
import { describe, validateCondition, type PlanCondition } from "@/lib/plans";
import type { AgentCard } from "@/lib/agent/types";
import type { CardState } from "@/hooks/use-agent-chat";
import { PlanEditorSheet } from "./PlanEditorSheet";
import { toast } from "./toast";
import { armedToast, armLabel, doesRow, money, notifyToast, thenRow, triggerDistance, untilRow, whatHappens } from "./helpers";

type PlanCardData = Extract<AgentCard, { kind: "plan" }>;

interface Props {
  card: PlanCardData;
  state?: CardState;
  onChange: (patch: CardState) => void;
}

/** The note fields typed on the card, folded into the condition that arms. */
function withNote(c: PlanCondition, note: string, wrongIf: string): PlanCondition {
  const next: PlanCondition = { ...c };
  const n = note.trim();
  const w = wrongIf.trim();
  if (n) next.note = n.slice(0, 280);
  else delete next.note;
  if (w) next.wrongIf = w.slice(0, 160);
  else delete next.wrongIf;
  return next;
}

/**
 * The PLAN CARD (agent-ux §1.6): the rule Solera read, the price it
 * watches, what happens by mode, an optional note, and the three buttons.
 * Nothing here arms without the tap; signed out, the tap opens the auth
 * sheet and the condition is posted after sign-in. Live trigger plans arm
 * like notify plans for now; the Jupiter sheet is task A5.
 */
export function PlanCard({ card, state, onChange }: Props) {
  const condition = state?.condition ?? card.condition;
  const summary = state?.summary ?? card.summary;
  const planId = state?.planId !== undefined ? state.planId : card.planId;
  const status = state?.status ?? "proposed";
  const cardLive = card.mode === "live";
  const router = useRouter();
  const { token, signedIn } = useSession();
  const { mode, connected, setMode } = useTradeMode();
  const { openConnect } = useConnectWallet();
  useLivePriceFor(condition.ticker);
  const { price, isLive } = useEffectivePrice(condition.ticker);
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(!!condition.note || !!condition.wrongIf);
  const [note, setNote] = useState(condition.note ?? "");
  const [wrongIf, setWrongIf] = useState(condition.wrongIf ?? "");
  const [editing, setEditing] = useState(false);
  const [ring, setRing] = useState(false);

  if (status === "discarded") return <p className="agent-stub">discarded</p>;

  const armed = status === "armed";
  const trigger = condition.trigger.kind === "price" ? condition.trigger : null;
  const then = thenRow(condition);
  const distance = trigger && isLive ? triggerDistance(price, trigger.price) : "";

  const arm = async () => {
    if (!token) {
      openAuthSheet("signup");
      return;
    }
    if (cardLive && mode !== "live") {
      if (connected) setMode("live");
      else openConnect();
      return;
    }
    setRing(true);
    setBusy(true);
    setProblem(null);
    try {
      const next = withNote(condition, note, wrongIf);
      const changed = next.note !== condition.note || next.wrongIf !== condition.wrongIf;
      let id = planId;
      if (!id || changed) {
        const invalid = validateCondition(next, { standing: true });
        if (invalid) {
          setProblem(invalid);
          return;
        }
        // A draft is disposable: post the edited condition, then drop the old proposal.
        const created = await plansClient.create(token, { text: card.text, condition: next, mode: card.mode, source: "agent" });
        if (id) plansClient.discard(token, id).catch(() => {});
        id = created.id;
      }
      const plan = await plansClient.arm(token, id);
      onChange({ status: "armed", planId: plan.id, condition: plan.condition, summary: plan.summary, armUntil: plan.armUntil });
      if (plan.mode === "live") toast(notifyToast(plan.condition), "ok");
      else toast(armedToast(plan.summary), "ok");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't arm that plan.");
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (planId && token) {
      setBusy(true);
      try {
        await plansClient.discard(token, planId);
      } catch {
        // The draft is disposable either way; housekeeping removes leftovers.
      } finally {
        setBusy(false);
      }
    }
    onChange({ status: "discarded" });
  };

  const saveEdit = async (next: PlanCondition) => {
    if (token) {
      const created = await plansClient.create(token, { text: card.text, condition: next, mode: card.mode, source: "agent" });
      if (planId) plansClient.discard(token, planId).catch(() => {});
      onChange({ planId: created.id, condition: created.condition, summary: created.summary });
    } else {
      onChange({ planId: null, condition: next, summary: describe(next) });
    }
    setNote(next.note ?? "");
    setWrongIf(next.wrongIf ?? "");
    setNoteOpen(!!next.note || !!next.wrongIf);
    setProblem(null);
    setEditing(false);
  };

  const viewInPlans = () => {
    const panel = document.querySelector<HTMLElement>('[data-panel="plans"]');
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    else router.push("/portfolio");
  };

  return (
    <section className="agent-card plan" aria-label={armed ? "Armed plan" : "Proposed plan"}>
      <header className="agent-card-head">
        <h3>
          PLAN · {armed ? "ARMED" : "PROPOSED"}
        </h3>
        <span className="agent-card-chips">
          <span className={`chip ${cardLive ? "live" : "practice"}`}>{card.mode}</span>
          {cardLive && <span className="chip">{card.execution === "trigger" ? "Jupiter order" : "notify + sign"}</span>}
        </span>
      </header>
      <div className="agent-card-body">
        <p className="agent-summary">{summary}</p>
        <dl className="agent-rows">
          <dt>Watches</dt>
          <dd>
            {condition.ticker} · now {isLive ? money(price) : "— (no live price right now)"}
            {trigger && (
              <>
                {" "}
                · trigger {money(trigger.price)}
                {distance && ` ${distance}`}
              </>
            )}
          </dd>
          <dt>Does</dt>
          <dd>{doesRow(condition, isLive ? price : undefined)}</dd>
          {then && (
            <>
              <dt>Then</dt>
              <dd>{then}</dd>
            </>
          )}
          {condition.wrongIf && (
            <>
              <dt>Wrong if</dt>
              <dd>“{condition.wrongIf}”</dd>
            </>
          )}
          <dt>Until</dt>
          <dd>{untilRow(condition, now, state?.armUntil)}</dd>
        </dl>
        <p className="eyebrow">What happens</p>
        <p className="agent-what">{whatHappens(condition, card.mode, card.execution)}</p>
        {!armed &&
          (noteOpen ? (
            <div className="agent-note-fields">
              <label className="field-label">
                <span>
                  Why? <em>optional · carried onto the fill</em>
                </span>
                <div className="field">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} rows={2} placeholder="the thesis, in a sentence" disabled={busy} />
                </div>
              </label>
              {!condition.wrongIf && (
                <label className="field-label">
                  <span>
                    Wrong if <em>optional · 160</em>
                  </span>
                  <div className="field">
                    <input type="text" value={wrongIf} onChange={(e) => setWrongIf(e.target.value)} maxLength={160} placeholder="deliveries fall two quarters in a row" disabled={busy} />
                  </div>
                </label>
              )}
            </div>
          ) : (
            <button type="button" className="agent-note-toggle" onClick={() => setNoteOpen(true)}>
              + add a note (optional)
            </button>
          ))}
        {problem && (
          <p role="alert" className="field-error">
            {problem}
          </p>
        )}
        <div className="agent-actions">
          {armed ? (
            <button type="button" className="btn-secondary btn-small" onClick={viewInPlans}>
              view in plans
            </button>
          ) : (
            <>
              <button type="button" className={`btn btn-live btn-small ${ring ? "armed" : ""}`} onClick={arm} disabled={busy} aria-busy={busy}>
                {busy ? "Arming…" : armLabel({ signedIn, cardLive, toggleLive: mode === "live" })}
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={() => setEditing(true)} disabled={busy}>
                Edit
              </button>
              <button type="button" className="btn-ghost btn-small" onClick={discard} disabled={busy}>
                Discard
              </button>
            </>
          )}
        </div>
      </div>
      {editing && <PlanEditorSheet condition={condition} mode={card.mode} onSave={saveEdit} onClose={() => setEditing(false)} />}
    </section>
  );
}
