"use client";

import { useId, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { isDeferredSigner } from "@/lib/deferred-signing";
import { getTriggerClient } from "@/lib/jupiter-trigger";
import { solscanTxUrl } from "@/lib/jupiter";
import type { Plan } from "@/lib/plans";
import { shortAddress } from "@/lib/investors";
import { cancelWithJupiter, friendlyTriggerError, type CancelResult } from "@/lib/trigger-arm";
import { Sheet, SheetHead } from "../auth/Sheet";
import { notifyPlansChanged } from "./trigger-sheet-store";

/** What sits in the vault, from the plan: the settlement amount for buys, the shares for sells. */
export function depositTextFor(plan: Plan): string {
  const a = plan.condition.action;
  if (a.side === "sell") return `${"shares" in a ? a.shares : "your"} ${plan.condition.ticker}`;
  return `${"amountUsd" in a ? `$${a.amountUsd.toFixed(2)} of ${plan.condition.payWith ?? "SOL"}` : `${a.shares} shares' worth of ${plan.condition.payWith ?? "SOL"}`}`;
}

/**
 * CANCEL & WITHDRAW for a Jupiter order (agent-ux §3.4): the order stops
 * right away; the deposit comes back with one signature. An expired order
 * uses the same sheet to get the funds back.
 */
export function CancelPlanSheet({ plan, loadError, sessionToken, resume, onClose }: { plan: Plan | null; loadError: string | null; sessionToken: string; resume?: { jwt?: string }; onClose: () => void }) {
  const id = useId();
  const { publicKey, signMessage, signTransaction, wallet } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  const deferred = isDeferredSigner(wallet?.adapter);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CancelResult | null>(null);

  const expired = plan?.triggerState === "expired";
  const pendingWithdraw = plan?.triggerState === "pending_withdraw";
  const deposit = plan ? depositTextFor(plan) : "";
  const hasToken = !!resume?.jwt || (address ? !!getTriggerClient().cachedToken(address) : false);
  const signatures = hasToken ? 1 : 2;

  async function run() {
    if (!plan || !address || busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await cancelWithJupiter({
        plan,
        wallet: { publicKey: address, signMessage: signMessage ?? undefined, signTransaction: signTransaction ?? undefined, deferred },
        sessionToken,
        depositText: deposit,
        onProgress: setLabel,
        resume,
      });
      if (outcome === "deferred") return;
      setResult(outcome);
      if (outcome.plan) notifyPlansChanged();
    } catch (err) {
      setError(friendlyTriggerError(err, "cancel"));
      setLabel(null);
    } finally {
      setBusy(false);
    }
  }

  const title = result ? (expired ? "Funds returned" : "Cancelled") : expired ? "Get your funds back" : pendingWithdraw ? "Finish the withdrawal" : "Cancel and withdraw";
  const button = expired ? "Withdraw · sign in wallet" : pendingWithdraw ? "Finish withdrawal" : "Cancel & withdraw · sign in wallet";

  return (
    <Sheet labelledBy={id} onClose={onClose} locked={busy} narrow>
      <SheetHead eyebrow="Live plan" title={title} id={id} onClose={busy ? undefined : onClose} />
      {loadError && (
        <p role="alert" className="field-error">
          {loadError}
        </p>
      )}
      {plan && !address && <p className="sheet-text">Connect {plan.wallet ? shortAddress(plan.wallet) : "the plan's wallet"} to cancel this order.</p>}
      {plan && address && !result && (
        <>
          <p className="text-[13px] font-medium text-fg">{plan.summary}</p>
          <p className="sheet-text">
            {expired
              ? `${deposit} is still in your Jupiter vault. The order expired unfilled; withdrawing returns it to your wallet with one signature.`
              : `${deposit} is in your Jupiter vault. Cancelling stops the order right away and returns it to your wallet; that return needs one signature.`}
          </p>
          <p className="sheet-foot">{signatures === 2 ? "2 signatures: sign in, then the withdrawal." : "1 signature: the withdrawal."}</p>
          {label && busy && <p className="mb-3 text-[12px] text-muted">{label}</p>}
          {error && (
            <p role="alert" className="field-error mb-3">
              {error}
            </p>
          )}
          <div className="sheet-actions">
            <button type="button" className="btn-primary" onClick={run} disabled={busy} aria-busy={busy}>
              {busy ? "Waiting for your wallet…" : button}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              keep it
            </button>
          </div>
        </>
      )}
      {plan && result && (
        <>
          <p className="sheet-text">
            {deposit} is back in your wallet ·{" "}
            <a href={solscanTxUrl(result.txSignature)} target="_blank" rel="noreferrer" className="text-link underline underline-offset-2">
              view on Solscan ↗
            </a>
          </p>
          {result.recordError && (
            <p role="alert" className="field-error mb-3">
              Jupiter returned the funds, but Solera couldn&apos;t mark the plan cancelled yet: {result.recordError}
            </p>
          )}
          <div className="sheet-actions">
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
