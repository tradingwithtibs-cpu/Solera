"use client";

import "./plans.css";
import { useSyncExternalStore } from "react";
import { Panel } from "@/components/panels/Panel";
import { openAuthSheet } from "@/components/auth/auth-sheet-store";
import { refreshPlans, usePlans } from "@/hooks/use-plans";
import { useSession } from "@/hooks/use-session";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTriggerSync } from "@/hooks/use-trigger-sync";
import { openArmPlanSheet } from "@/components/trigger/trigger-sheet-store";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { getEffectivePrice, getLivePrices, isLivePriced, subscribeLivePrices } from "@/lib/live-prices";
import type { Plan, PlanCondition } from "@/lib/plans";
import { PlanComposer } from "./PlanComposer";
import { PlanRow } from "./PlanRow";
import { Toasts } from "./Toasts";
import { showToast } from "./toast-store";
import { EMPTY_LIVE, SIGNED_OUT, armedToast, exampleChips, footFor, healthLine, modeNotice } from "./plan-format";
import { useClock } from "./use-clock";

/** The three example sentences, rebuilt from live prices on every price tick; a ticker with no live price has no chip. */
function useExampleChips(): string[] {
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  return exampleChips((t) => (isLivePriced(t) ? getEffectivePrice(t) : undefined));
}

interface Props {
  /** Registry id: "plans" on both the portfolio and the agent grids. */
  id?: string;
  /** `/agent?plan=<sentence>` prefills the composer and waits; nothing is armed on load. */
  initialText?: string;
  /** The row the Agent tab's PlansCard pointed at. */
  highlightId?: string | null;
}

/**
 * The Plans card (agent-ux §2): the composer with its live preview and
 * example chips, the live rows, EARLIER, and the mode's foot with the
 * server-watch line. One component on /portfolio and /agent; the poll is
 * shared through usePlans(). Signed out it explains why plans need an
 * owner and offers SIGN IN.
 */
export function PlansPanel({ id = "plans", initialText, highlightId = null }: Props) {
  const { mode } = useTradeMode();
  const { signedIn, token } = useSession();
  const { publicKey } = useWallet();
  const plans = usePlans();
  useTriggerSync(plans.live, publicKey?.toBase58() ?? null, token, () => void refreshPlans());
  const now = useClock();
  const chips = useExampleChips();

  const live = plans.live;
  const subtitle = `standing orders in plain words · ${live.length} live`;
  const notice = modeNotice(live, mode);

  const armFromComposer = async (text: string, condition: PlanCondition) => {
    const created = await plans.create(text, condition, mode, "ui");
    if (created.mode === "live" && created.execution === "trigger") {
      // Jupiter holds this one: the sheet walks through sign-in and the deposit, then records the arm.
      openArmPlanSheet(created.id);
      return;
    }
    let armed: Plan;
    try {
      armed = await plans.arm(created.id);
    } catch (err) {
      await plans.discard(created.id).catch(() => undefined);
      throw err;
    }
    showToast({ kind: "ok", message: armedToast(armed) });
  };

  const cancelPlan = async (plan: Plan) => {
    await plans.cancel(plan.id);
    showToast({ kind: "ok", message: "Plan cancelled." });
  };

  const foot = (
    <>
      {footFor(mode)}
      <span className="pl-health">{healthLine(plans.health, now ?? 0)}</span>
    </>
  );

  return (
    <Panel id={id} title="Plans" subtitle={subtitle} foot={foot} className="pl-panel">
      <div className="pl">
        <PlanComposer mode={mode} disabled={!signedIn} chips={chips} onArm={armFromComposer} initialText={initialText} />

        {!signedIn ? (
          <div className="pl-signin">
            <p>{SIGNED_OUT}</p>
            <button type="button" className="btn-primary btn-small" onClick={() => openAuthSheet("signup")}>
              Sign in
            </button>
          </div>
        ) : plans.unavailable ? (
          <p className="pl-empty">Plans aren&apos;t enabled on this deployment yet. Your practice ticket still works.</p>
        ) : (
          <>
            {notice && <p className="pl-note">{notice}</p>}
            {plans.plans === null ? (
              plans.error ? (
                <p className="pl-error" role="alert">
                  Couldn&apos;t load your plans · {plans.error}
                </p>
              ) : (
                <div className="skeleton" style={{ height: 56, borderRadius: "var(--radius-control)" }} aria-busy="true" aria-label="Loading your plans" />
              )
            ) : live.length === 0 ? (
              <p className="pl-empty">{EMPTY_LIVE}</p>
            ) : (
              <ul className="pl-list" aria-label="Live plans">
                {live.map((p) => (
                  <PlanRow key={p.id} plan={p} now={now} onCancel={cancelPlan} highlighted={p.id === highlightId} />
                ))}
              </ul>
            )}
            {plans.error && plans.plans !== null && (
              <p className="pl-error" role="status">
                {plans.error}
              </p>
            )}
            {plans.earlier.length > 0 && (
              <>
                <p className="eyebrow pl-earlier">Earlier</p>
                <ul className="pl-list past" aria-label="Earlier plans">
                  {plans.earlier.map((p) => (
                    <PlanRow key={p.id} plan={p} now={now} highlighted={p.id === highlightId} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <Toasts />
      </div>
    </Panel>
  );
}
