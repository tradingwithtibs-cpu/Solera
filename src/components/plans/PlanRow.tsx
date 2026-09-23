"use client";

import { openCancelPlanSheet } from "@/components/trigger/trigger-sheet-store";

import { useState } from "react";
import Link from "next/link";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import type { Plan } from "@/lib/plans";
import { STATUS_LABEL, STATUS_TONE, lastLog, money, relTime, shortDate, statusTitle, triggerStateLabel, watchLine } from "./plan-format";

interface Props {
  plan: Plan;
  /** From useClock(); null during hydration. */
  now: number | null;
  /** Practice and notify plans cancel inline; absent for finished rows. */
  onCancel?: (plan: Plan) => Promise<void>;
  /** The row the Agent tab pointed at (its PlansCard row → highlight here). */
  highlighted?: boolean;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/**
 * One plan (agent-ux §2.2): symbol, status chip with its meaning on hover,
 * mode chip, the executor chip for live, the sentence in quotes, the
 * restatement, the price it watches with the freshness, and the last log
 * line. Live trigger rows add Jupiter's state and the vault sentence
 * (§2.3); the data for those arrives with A5, so they render from
 * `triggerState` / `triggerOrderId` when present and never call Jupiter.
 */
export function PlanRow({ plan, now, onCancel, highlighted = false }: Props) {
  const { price, isLive: priced } = useEffectivePrice(plan.condition.ticker);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone = STATUS_TONE[plan.status];
  const active = plan.status === "armed" || plan.status === "holding" || plan.status === "ready";
  const isTrigger = plan.execution === "trigger";
  const clock = now ?? plan.updatedAt;
  const livePrice = priced && price > 0 ? price : undefined;

  const log = lastLog(plan);
  const lastEntry = plan.log[plan.log.length - 1];
  const showLog = !!log && !!lastEntry && !(lastEntry.to === "proposed" || (lastEntry.to === "armed" && lastEntry.from === "proposed"));
  const logIsFill = !!lastEntry && (lastEntry.to === "done" || lastEntry.to === "holding") && /^(filled|bought|sold|target|stop)/i.test(log ?? "");

  const cancel = async () => {
    if (!onCancel) return;
    setBusy(true);
    setError(null);
    try {
      await onCancel(plan);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel that plan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`pl-row pl-${tone} ${highlighted ? "is-target" : ""}`} id={`plan-${plan.id}`} data-plan-id={plan.id} data-status={plan.status}>
      <div className="pl-main">
        <p className="pl-line1">
          <b>{plan.condition.ticker}</b>
          <span className={`chip pl-status pl-${tone}`} title={statusTitle(plan)}>
            {STATUS_LABEL[plan.status]}
          </span>
          <span className={`chip ${plan.mode}`}>{plan.mode}</span>
          {plan.mode === "live" && <span className="chip pl-exec">{isTrigger ? "Jupiter order" : "notify + sign"}</span>}
        </p>
        <q>{plan.text}</q>
        <small>{plan.summary}</small>
        {active && <small className="pl-watch">{watchLine(plan, livePrice, clock)}</small>}
        {isTrigger && (
          <>
            <small>
              Jupiter order · {triggerStateLabel(plan.triggerState)}
              {plan.triggerOrderId ? ` · order ${shortId(plan.triggerOrderId)}` : ""}
              {plan.armUntil ? ` · expires ${shortDate(plan.armUntil)}` : ""}
            </small>
            <small className="pl-vault">Funds are held by Jupiter until fill or cancel.</small>
          </>
        )}
        {plan.status === "ready" ? (
          <em>
            ready since {plan.readyAt ? `${relTime(plan.readyAt, clock)} ago` : "just now"}
            {livePrice !== undefined ? ` · price now ${money(livePrice)}` : ""}
          </em>
        ) : showLog ? (
          <em className={logIsFill ? "fill" : undefined}>{log}</em>
        ) : null}
        {!active && plan.armUntil && plan.status === "expired" && <em>expired {shortDate(plan.armUntil)}</em>}
        {error && (
          <p className="pl-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {active && (
        <div className="pl-actions">
          {plan.status === "ready" && !isTrigger && (
            <Link href={`/buy/${encodeURIComponent(plan.condition.ticker)}?plan=${encodeURIComponent(plan.id)}`} className="btn-live btn-small">
              Open ticket
            </Link>
          )}
          {isTrigger ? (
            <button type="button" className="btn-ghost btn-small" onClick={() => openCancelPlanSheet(plan.id)} disabled={busy}>
              {plan.triggerState === "expired" ? "Get funds back" : plan.triggerState === "pending_withdraw" ? "Finish withdrawal" : "Cancel & withdraw"}
            </button>
          ) : (
            onCancel &&
            !confirming && (
              <button type="button" className="btn-ghost btn-small" onClick={() => setConfirming(true)} disabled={busy}>
                cancel
              </button>
            )
          )}
        </div>
      )}

      {confirming && (
        <div className="pl-confirm" role="group" aria-label="Cancel this plan?">
          <p>
            Cancel this plan?
            {plan.status === "holding" && <small>Your position stays; Solera just stops watching its exits.</small>}
          </p>
          <button type="button" className="btn-secondary btn-small" onClick={cancel} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Cancelling…" : "Yes · cancel"}
          </button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setConfirming(false)} disabled={busy}>
            Keep
          </button>
        </div>
      )}
    </li>
  );
}
