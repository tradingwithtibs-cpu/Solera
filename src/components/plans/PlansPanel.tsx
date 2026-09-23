"use client";

import "./plans.css";
import { useRef, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Panel } from "@/components/panels/Panel";
import { openAuthSheet } from "@/components/auth/auth-sheet-store";
import { getTriggerSheetState, openArmPlanSheet } from "@/components/trigger/trigger-sheet-store";
import { usePlans } from "@/hooks/use-plans";
import { useSession } from "@/hooks/use-session";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { syncTriggerStates, useTriggerSync } from "@/hooks/use-trigger-sync";
import { isDeferredSigner } from "@/lib/deferred-signing";
import { getTriggerClient } from "@/lib/jupiter-trigger";
import { getEffectivePrice, getLivePrices, isLivePriced, subscribeLivePrices } from "@/lib/live-prices";
import type { Plan, PlanCondition } from "@/lib/plans";
import { PlanComposer, type ArmOutcome } from "./PlanComposer";
import { PlanRow } from "./PlanRow";
import { Toasts } from "./Toasts";
import { showToast } from "./toast-store";
import { EMPTY_LIVE, SIGNED_OUT, armedToast, exampleChips, footFor, healthLine, modeNotice } from "./plan-format";
import { useClock } from "./use-clock";

const SHEET_POLL_MS = 300;

/** The three example sentences, rebuilt from live prices on every price tick; a ticker with no live price has no chip. */
function useExampleChips(): string[] {
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  return exampleChips((t) => (isLivePriced(t) ? getEffectivePrice(t) : undefined));
}

/**
 * Resolves once the arm sheet for `planId` is done with: "armed" the moment
 * the sheet records a change (it stays open on its ✓ state until DONE), or
 * "dismissed" when it closes without one. The sheet store has no plain
 * subscribe, so this watches it while the sheet is up.
 */
function waitForArmSheet(planId: string): Promise<ArmOutcome> {
  const v0 = getTriggerSheetState().version;
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const s = getTriggerSheetState();
      if (s.version > v0) {
        clearInterval(timer);
        resolve("armed");
      } else if (s.kind !== "arm" || s.planId !== planId) {
        clearInterval(timer);
        resolve("dismissed");
      }
    }, SHEET_POLL_MS);
  });
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
 * owner and offers SIGN IN. Live sentences Jupiter can hold go through
 * the arm sheet (§3.1); everything else arms on the tap, here.
 */
export function PlansPanel({ id = "plans", initialText, highlightId = null }: Props) {
  const { mode } = useTradeMode();
  const { signedIn } = useSession();
  const plans = usePlans();
  const now = useClock();
  const chips = useExampleChips();
  const { publicKey, signMessage, wallet } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  /** A live draft the arm sheet was dismissed on: the same sentence reopens it instead of minting another draft. */
  const pendingTrigger = useRef<{ key: string; id: string } | null>(null);

  // Jupiter rows: mirror the order state every minute while this tab holds a token for the wallet (backend §9.7).
  const allPlans = plans.plans ?? [];
  useTriggerSync(allPlans, address, plans.token, plans.refresh);
  // A cheap read of the in-memory token cache; re-read on every render, so the REFRESH button goes away once the arm sheet signed in.
  const hasJwt = !!address && !!getTriggerClient().cachedToken(address);
  const canRefreshJupiter = !!address && !!signMessage && !!plans.token && !hasJwt && !isDeferredSigner(wallet?.adapter);

  const live = plans.live;
  const subtitle = `standing orders in plain words · ${live.length} live`;
  const notice = modeNotice(live, mode);

  const armNow = async (created: Plan): Promise<Plan> => {
    try {
      return await plans.arm(created.id);
    } catch (err) {
      await plans.discard(created.id).catch(() => undefined);
      throw err;
    }
  };

  const armFromComposer = async (text: string, condition: PlanCondition): Promise<ArmOutcome> => {
    if (mode === "live") {
      const pending = pendingTrigger.current;
      let planId: string | null = pending && pending.key === text ? pending.id : null;
      if (!planId) {
        const { plan } = await plans.createWithPreview(text, condition, "live", "ui");
        if (plan.execution !== "trigger") {
          const armed = await armNow(plan);
          showToast({ kind: "ok", message: armedToast(armed) });
          return "armed";
        }
        planId = plan.id;
        pendingTrigger.current = { key: text, id: plan.id };
      }
      // Jupiter holds this one: the wallet sheet signs in, deposits and records; the sheet owns the outcome and its toast.
      openArmPlanSheet(planId);
      const outcome = await waitForArmSheet(planId);
      if (outcome === "armed") pendingTrigger.current = null;
      return outcome;
    }
    const created = await plans.create(text, condition, mode, "ui");
    const armed = await armNow(created);
    showToast({ kind: "ok", message: armedToast(armed) });
    return "armed";
  };

  const cancelPlan = async (plan: Plan) => {
    await plans.cancel(plan.id);
    showToast({ kind: "ok", message: "Plan cancelled." });
  };

  /** REFRESH · SIGN IN WITH WALLET: one signMessage for a 24 h Jupiter token, then the same mirror the minute sync runs. */
  const refreshJupiter = async () => {
    if (!address || !signMessage || !plans.token) throw new Error("Connect a wallet that can sign messages first.");
    await getTriggerClient().authenticate({ publicKey: address, signMessage });
    await syncTriggerStates(plans.plans ?? [], address, plans.token);
    await plans.refresh();
  };

  const foot = (
    <>
      {footFor(mode)}
      <span className="pl-health">{healthLine(plans.health, now)}</span>
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
                  <PlanRow key={p.id} plan={p} now={now} onCancel={cancelPlan} onRefreshJupiter={canRefreshJupiter && p.execution === "trigger" ? refreshJupiter : undefined} highlighted={p.id === highlightId} />
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
                    <PlanRow key={p.id} plan={p} now={now} onRefreshJupiter={canRefreshJupiter && p.execution === "trigger" ? refreshJupiter : undefined} highlighted={p.id === highlightId} />
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
