"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PENDING_KEY,
  clearPending,
  clearResult,
  readPending,
  readResult,
  type DeepLinkResult,
  type PendingRequest,
} from "@/lib/deferred-signing";
import { didInitiateDeepLinkHere } from "@/lib/phantom-deeplink-adapter";
import { fromBase58 } from "@/lib/phantom-deeplink";
import { fillToTradeResult, finishDeferredSwap, settlementDollars } from "@/lib/trade";
import { recordLiveTrade } from "@/hooks/use-live-portfolio";
import { setProfile } from "@/hooks/use-profiles";
import { completeSignIn, getStoredSession } from "@/hooks/use-session";
import { finishTriggerAuth, finishTriggerDeposit, finishTriggerWithdraw } from "@/lib/trigger-arm";
import { openArmPlanSheet, openCancelPlanSheet, notifyPlansChanged } from "./trigger/trigger-sheet-store";
import { submitProfileClaim, submitWalletLink } from "./ProfileSheet";
import { solscanTxUrl } from "@/lib/jupiter";
import { fromBaseUnits } from "@/lib/tokens";
import { formatCurrency, formatShares } from "@/lib/format";
import { celebrateTrade } from "@/lib/celebrate";
import { Sheet } from "./auth/Sheet";
import { CheckCircleIcon } from "./icons";

interface Outcome {
  tone: "success" | "error" | "info";
  title: string;
  body: string;
  link?: { href: string; label: string };
}

/**
 * Finishes whatever a Phantom deeplink round trip was for. The adapter
 * has already decrypted the reply into a result; this pairs it with the
 * request that was pending, does the second half (submit the swap, save
 * the profile, mint the session), and tells the user how it went.
 * Mounted once, app-wide, so it works on whichever page Phantom returns to.
 */
export function DeepLinkResumer() {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    // The tab that handed off to Phantom: once another tab finishes the
    // round trip (iOS opens the reply in a new tab), refresh to catch up.
    const onStorage = (e: StorageEvent) => {
      if (e.key === PENDING_KEY && e.newValue === null && didInitiateDeepLinkHere()) window.location.reload();
    };
    window.addEventListener("storage", onStorage);

    const result = readResult();
    if (!result) return () => window.removeEventListener("storage", onStorage);
    const pending = readPending();
    clearResult();
    clearPending();
    if (!pending || pending.id !== result.id) return () => window.removeEventListener("storage", onStorage);

    // Phantom comes back to the bare path; put the original query string back.
    try {
      const target = new URL(pending.returnTo);
      const here = `${window.location.pathname}${window.location.search}`;
      if (target.origin === window.location.origin && `${target.pathname}${target.search}` !== here) {
        router.replace(`${target.pathname}${target.search}`);
      }
    } catch {
      // Unparseable returnTo: stay where we are.
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(busyLabel(pending));
    resolve(pending, result)
      .then(setOutcome)
      .catch((err: unknown) => setOutcome({ tone: "error", title: "Something went wrong", body: err instanceof Error ? err.message : String(err) }))
      .finally(() => setBusy(null));
    return () => window.removeEventListener("storage", onStorage);
  }, [router]);

  if (busy) {
    return (
      <div className="toasts" role="status" aria-live="polite">
        <div className="toast in glass glass-era">
          <p className="eyebrow">Phantom</p>
          <p className="mt-1 font-semibold text-fg">{busy}</p>
          <p className="text-xs text-muted">Hang on a moment.</p>
        </div>
      </div>
    );
  }
  if (!outcome) return null;

  const close = () => setOutcome(null);
  return (
    <Sheet labelledBy={id} onClose={close}>
      <div className="text-center">
        {outcome.tone === "success" && <CheckCircleIcon className="mx-auto h-10 w-10 text-gain" />}
        <p className="eyebrow mt-2">Phantom</p>
        <h3 id={id}>{outcome.title}</h3>
        <p className="sheet-text">{outcome.body}</p>
        {outcome.link && (
          <p className="mb-3">
            <a href={outcome.link.href} target="_blank" rel="noreferrer" className="btn-secondary btn-small">
              {outcome.link.label} ↗
            </a>
          </p>
        )}
        <button type="button" onClick={close} className="btn-primary w-full">
          Done
        </button>
      </div>
    </Sheet>
  );
}

function busyLabel(p: PendingRequest): string {
  if (p.continuation?.kind === "trigger-auth") return "Signing in with Jupiter…";
  if (p.continuation?.kind === "trigger-deposit") return "Sending your deposit to Jupiter…";
  if (p.continuation?.kind === "trigger-withdraw") return "Returning your funds from Jupiter…";
  if (p.request === "signTransaction") return "Sending your order to Jupiter…";
  if (p.continuation?.kind === "profile") return "Saving your profile…";
  if (p.continuation?.kind === "wallet-link") return "Linking your wallet…";
  if (p.continuation?.kind === "session") return "Signing you in…";
  return "Finishing up with Phantom…";
}

async function resolve(pending: PendingRequest, result: DeepLinkResult): Promise<Outcome | null> {
  if (result.error) {
    const cancelled = /reject|cancel|denied|declin/i.test(result.error);
    return {
      tone: cancelled ? "info" : "error",
      title: pending.request === "connect" ? "Phantom didn't connect" : "Nothing was signed",
      body: cancelled ? "You cancelled in Phantom. Nothing was spent." : result.error,
    };
  }

  if (pending.request === "connect") {
    return {
      tone: "success",
      title: "Phantom connected",
      body: "You're on Solera in Safari with your Phantom wallet. Balances load from your wallet in a moment.",
    };
  }

  const c = pending.continuation;
  if (!result.payload) throw new Error("Phantom's reply was empty.");
  const bytes = fromBase58(result.payload);

  if (pending.request === "signTransaction" && c?.kind === "trigger-deposit") {
    const session = getStoredSession();
    if (!session) return { tone: "error", title: "Signed, but not recorded", body: "Your Solera session ended while Phantom was open. The order may exist on Jupiter; open Plans and tap Refresh." };
    const armed = await finishTriggerDeposit(c, bytes, session.token);
    if (armed.recorded) notifyPlansChanged();
    return {
      tone: armed.recorded ? "success" : "info",
      title: "Armed with Jupiter",
      body: armed.recorded
        ? `${armed.plan?.summary ?? "Your plan"}. ${c.depositText} is in your Jupiter vault until it fills, expires, or you cancel.`
        : `The order is live on Jupiter, but Solera couldn't confirm the deposit yet. It will show up in Plans within a minute; if not, tap Refresh there.`,
      link: { href: solscanTxUrl(armed.txSignature), label: "View on Solscan" },
    };
  }
  if (pending.request === "signTransaction" && c?.kind === "trigger-withdraw") {
    const session = getStoredSession();
    if (!session) return { tone: "error", title: "Signed, but not recorded", body: "Your Solera session ended while Phantom was open. Open Plans and tap Refresh." };
    const done = await finishTriggerWithdraw(c, bytes, session.token);
    if (done.plan) notifyPlansChanged();
    return { tone: "success", title: "Funds returned", body: `${c.depositText} is back in your wallet.`, link: { href: solscanTxUrl(done.txSignature), label: "View on Solscan" } };
  }
  if (pending.request === "signTransaction") {
    if (!c || c.kind !== "swap") {
      return { tone: "info", title: "Signed, but not sent", body: "Solera lost track of which order this was for, so nothing was submitted and nothing was spent. Please try again." };
    }
    const fill = await finishDeferredSwap(c, bytes);
    if (c.trade.kind === "xstock") {
      const { ticker, side, copiedFromInvestorId, note, wrongIf, leg, via, planId } = c.trade;
      const r = fillToTradeResult(fill, { ticker, side, payWith: c.payWith, tokenDecimals: side === "buy" ? c.outDecimals : c.inDecimals });
      recordLiveTrade(c.wallet, {
        id: r.txId,
        ticker,
        side,
        quantity: r.quantity,
        pricePerShare: r.pricePerShare,
        totalValue: r.totalValue,
        timestamp: r.timestamp,
        copiedFromInvestorId,
        signature: r.txId,
        note,
        wrongIf,
        leg,
        via,
        planId,
        ...(r.settledIn ? { settledIn: r.settledIn, settledAmount: r.settledAmount } : {}),
      } as Parameters<typeof recordLiveTrade>[1]);
      celebrateTrade();
      const settled = r.settledAmount !== undefined ? `${r.settledAmount.toFixed(c.payWith === "SOL" ? 4 : 2)} ${c.payWith}` : "";
      return {
        tone: "success",
        title: "Order filled on Solana",
        body: `You ${side === "buy" ? "bought" : "sold"} ${formatCurrency(r.totalValue)} of ${ticker} (≈ ${formatShares(r.quantity)} shares)${settled ? ` ${side === "buy" ? "for" : "and received"} ${settled}` : ""}.`,
        link: { href: solscanTxUrl(r.txId), label: "View on Solscan" },
      };
    }
    const amount = fromBaseUnits(fill.outUnits, c.outDecimals);
    const settledAmount = fromBaseUnits(fill.inUnits, c.inDecimals);
    const dollars = settlementDollars(fill.inUsd, settledAmount, c.payWith);
    celebrateTrade();
    return {
      tone: "success",
      title: `${c.trade.symbol} is in your wallet`,
      body: `You bought ${formatShares(amount)} ${c.trade.symbol} (${c.trade.name}) for ${formatCurrency(dollars)}.`,
      link: { href: solscanTxUrl(fill.signature), label: "View on Solscan" },
    };
  }

  // signMessage
  const signatureBase64 = Buffer.from(bytes).toString("base64");
  if (c?.kind === "profile") {
    const saved = await submitProfileClaim(c.wallet, c.profile, c.issuedAt, signatureBase64);
    setProfile(saved);
    return { tone: "success", title: "Profile saved", body: `You're @${saved.handle} on Solera. Your name now shows wherever this wallet appears.` };
  }
  if (c?.kind === "session") {
    await completeSignIn(c.wallet, c.issuedAt, signatureBase64);
    return { tone: "success", title: "Signed in", body: "You can post in rooms from this wallet for the next 30 days." };
  }
  if (c?.kind === "wallet-link") {
    const session = getStoredSession();
    if (!session || session.kind !== "user") return { tone: "error", title: "Signed, but not linked", body: "Log in to your email account again, then link the wallet from the account sheet." };
    const saved = await submitWalletLink(session.token, c.wallet, c.issuedAt, signatureBase64);
    setProfile(saved);
    return { tone: "success", title: "Wallet linked", body: `${c.wallet.slice(0, 4)}…${c.wallet.slice(-4)} now belongs to your account. Live trades and plans use it.` };
  }
  if (c?.kind === "trigger-auth") {
    try {
      const { jwt, exp } = await finishTriggerAuth(c.wallet, bytes);
      if (c.purpose === "cancel") openCancelPlanSheet(c.planId, { jwt, exp });
      else openArmPlanSheet(c.planId, { jwt, exp });
      return null; // the sheet takes over at step 2
    } catch {
      return { tone: "info", title: "Jupiter sign-in expired", body: "That Jupiter sign-in expired. Open Plans and tap Arm it again — nothing was moved." };
    }
  }
  return { tone: "info", title: "Signed", body: "Phantom signed the message, but Solera had nothing waiting for it." };
}
