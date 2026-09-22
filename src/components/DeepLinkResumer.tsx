"use client";

import { useEffect, useState } from "react";
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
import { completeSignIn } from "@/hooks/use-session";
import { submitProfileClaim } from "./ProfileSheet";
import { solscanTxUrl } from "@/lib/jupiter";
import { fromBaseUnits } from "@/lib/tokens";
import { formatCurrency, formatShares } from "@/lib/format";
import { celebrateTrade } from "@/lib/celebrate";
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
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
        <div role="status" aria-live="polite" className="w-full max-w-md rounded-3xl bg-panel p-5 text-center shadow-xl ring-1 ring-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">{busy}</p>
          <p className="mt-1 text-xs text-neutral-500">Hang on a moment.</p>
        </div>
      </div>
    );
  }
  if (!outcome) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center scrim p-3 sm:items-center" onClick={() => setOutcome(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={outcome.title}
        className="w-full max-w-md rounded-3xl bg-panel p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {outcome.tone === "success" && <CheckCircleIcon className="mx-auto h-12 w-12 text-emerald-500" />}
        <h2 className="mt-2 text-lg font-semibold text-neutral-900">{outcome.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{outcome.body}</p>
        {outcome.link && (
          <a href={outcome.link.href} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-indigo-600">
            {outcome.link.label} ↗
          </a>
        )}
        <button type="button" onClick={() => setOutcome(null)} className="btn-primary mt-4 w-full">
          Done
        </button>
      </div>
    </div>
  );
}

function busyLabel(p: PendingRequest): string {
  if (p.request === "signTransaction") return "Sending your order to Jupiter…";
  if (p.continuation?.kind === "profile") return "Saving your profile…";
  if (p.continuation?.kind === "session") return "Signing you in…";
  return "Finishing up with Phantom…";
}

async function resolve(pending: PendingRequest, result: DeepLinkResult): Promise<Outcome> {
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
  return { tone: "info", title: "Signed", body: "Phantom signed the message, but Solera had nothing waiting for it." };
}
