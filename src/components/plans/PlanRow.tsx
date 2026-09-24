"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { openCancelPlanSheet } from "@/components/trigger/trigger-sheet-store";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { ACTIVE_STATUSES, type Plan } from "@/lib/plans";
import { STATUS_LABEL, STATUS_TONE, jupiterHoldingLine, jupiterLine, lastLog, modeChip, money, relTime, shortDate, statusTitle, triggerAction, walletNotice, watchLine } from "./plan-format";

interface Props {
  plan: Plan;
  /** From useClock(); null during hydration. */
  now: number | null;
  /** Practice and notify plans cancel inline; absent for finished rows. */
  onCancel?: (plan: Plan) => Promise<void>;
  /**
   * Jupiter rows only: one wallet signature that signs in with Jupiter and
   * mirrors the order state (agent-ux §2.3). Absent while a token is
   * cached, on wallets that leave the page to sign, or when no wallet is
   * connected.
   */
  onRefreshJupiter?: () => Promise<void>;
  /** The row the Agent tab pointed at (its PlansCard row → highlight here). */
  highlighted?: boolean;
}

/**
 * One plan (agent-ux §2.2): symbol, status chip with its meaning on hover,
 * mode chip, the executor chip for live, the sentence in quotes, the
 * restatement, the price it watches with the freshness, and the last log
 * line. Jupiter rows (§2.3) add the mirrored order state, the vault
 * sentence, and CANCEL & WITHDRAW / WITHDRAW through the wallet sheet;
 * nothing here calls Jupiter directly.
 */
export function PlanRow({ plan, now, onCancel, onRefreshJupiter, highlighted = false }: Props) {
  const { price, isLive: priced } = useEffectivePrice(plan.condition.ticker);
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone = STATUS_TONE[plan.status];
  const active = ACTIVE_STATUSES.includes(plan.status);
  const isTrigger = plan.execution === "trigger";
  const mode = modeChip(plan);
  const clock = now ?? plan.updatedAt;
  const livePrice = priced && price > 0 ? price : undefined;

  const log = lastLog(plan);
  const lastEntry = plan.log[plan.log.length - 1];
  const showLog = !!log && !!lastEntry && !(lastEntry.to === "proposed" || (lastEntry.to === "armed" && lastEntry.from === "proposed"));
  const logIsFill = !!lastEntry && (lastEntry.to === "done" || lastEntry.to === "holding") && /^(filled|bought|sold|target|stop)/i.test(log ?? "");

  // A Jupiter row belongs to the wallet that armed it: another wallet only reads it; with none connected
  // the action stays (the sheet asks for that wallet first), the refresh needs a signer.
  const notice = isTrigger ? walletNotice(plan, address) : null;
  const ownWallet = !plan.wallet || !address || plan.wallet === address;
  const action = isTrigger ? triggerAction(plan) : null;
  const needsYou = !!action && action.kind !== "cancel";

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () =>
    run(async () => {
      if (!onCancel) return;
      await onCancel(plan);
      setConfirming(false);
    }, "Couldn't cancel that plan.");

  const refresh = () =>
    run(async () => {
      if (onRefreshJupiter) await onRefreshJupiter();
    }, "Couldn't reach Jupiter just now.");

  return (
    <li className={`pl-row pl-${tone} ${highlighted ? "is-target" : ""} ${needsYou ? "needs-you" : ""}`} id={`plan-${plan.id}`} data-plan-id={plan.id} data-status={plan.status}>
      <div className="pl-main">
        <p className="pl-line1">
          <b>{plan.condition.ticker}</b>
          <span className={`chip pl-status pl-${tone}`} title={statusTitle(plan)}>
            {STATUS_LABEL[plan.status]}
          </span>
          <span className={mode.className} title={mode.title}>
            {mode.label}
          </span>
          {plan.mode === "live" && <span className={`chip pl-exec ${active ? "" : "pl-muted"}`}>{isTrigger ? "Jupiter order" : "notify + sign"}</span>}
        </p>
        <q>{plan.text}</q>
        <small>{plan.summary}</small>
        {active && !isTrigger && <small className="pl-watch">{watchLine(plan, livePrice, clock)}</small>}
        {active && isTrigger && plan.status === "holding" && <small className="pl-watch">{jupiterHoldingLine(plan, livePrice)}</small>}
        {isTrigger && (
          <>
            <small>{jupiterLine(plan, now)}</small>
            <small className="pl-vault">Funds are held by Jupiter until fill or cancel.</small>
            {notice && <small>{notice}</small>}
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
        {!active && plan.armUntil && plan.status === "expired" && !isTrigger && <em>expired {shortDate(plan.armUntil)}</em>}
        {error && (
          <p className="pl-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {(active || action) && (
        <div className="pl-actions">
          {plan.status === "ready" && !isTrigger && (
            <Link href={`/buy/${encodeURIComponent(plan.condition.ticker)}?plan=${encodeURIComponent(plan.id)}`} className="btn-live btn-small">
              Open ticket
            </Link>
          )}
          {isTrigger ? (
            <>
              {action && ownWallet && (
                <button type="button" className={`${needsYou ? "btn-secondary" : "btn-ghost"} btn-small`} onClick={() => openCancelPlanSheet(plan.id)} title={action.title} disabled={busy}>
                  {action.label}
                </button>
              )}
              {onRefreshJupiter && ownWallet && address && (
                <button type="button" className="btn-ghost btn-small" onClick={refresh} disabled={busy} aria-busy={busy || undefined} title="One message to sign; it moves nothing.">
                  {busy ? "Signing in…" : "Refresh · sign in with wallet"}
                </button>
              )}
            </>
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
