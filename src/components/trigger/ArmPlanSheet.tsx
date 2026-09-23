"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLivePortfolio } from "@/hooks/use-live-portfolio";
import { getTokenForSymbol } from "@/lib/catalog";
import { isDeferredSigner } from "@/lib/deferred-signing";
import { solscanTxUrl } from "@/lib/jupiter";
import { clampSlippage, SLIPPAGE_DEFAULT_BPS, toTriggerOrder } from "@/lib/jupiter-trigger-map";
import { getEffectivePrice, getLivePrices, getSolPrice, subscribeLivePrices } from "@/lib/live-prices";
import { DEFAULT_ARM_DAYS, type Plan } from "@/lib/plans";
import { shortAddress } from "@/lib/investors";
import { armWithJupiter, friendlyTriggerError, STEP_LABELS, type ArmProgress, type ArmResult, type TriggerOk } from "@/lib/trigger-arm";
import { Sheet, SheetHead } from "../auth/Sheet";
import { notifyPlansChanged } from "./trigger-sheet-store";

const JUPITER_URL = "https://jup.ag/trigger";

// A clock the render can read purely: ticks every 30 s while a sheet is open.
const clockListeners = new Set<() => void>();
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
function subscribeClock(l: () => void) {
  clockListeners.add(l);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((fn) => fn());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(l);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
function useNow(): number {
  return useSyncExternalStore(subscribeClock, () => clockNow || (clockNow = Date.now()), () => 0);
}

function dateLong(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function amount(n: number, unit: string): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: unit === "USDC" ? 2 : 4 })} ${unit}`;
}

/**
 * ARM IT for a live plan Jupiter can hold (agent-ux §3.1, §3.2): the order
 * in plain words, the disclosures, then the two prompts — sign in, approve
 * the deposit — with every step's error inline. On iOS each prompt leaves
 * the page and the resumer reopens this sheet with the token it earned.
 */
export function ArmPlanSheet({ plan, planId, loadError, sessionToken, resume, onClose }: { plan: Plan | null; planId: string; loadError: string | null; sessionToken: string; resume?: { jwt?: string }; onClose: () => void }) {
  const id = useId();
  const { publicKey, signMessage, signTransaction, wallet } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  const walletName = wallet?.adapter.name ?? "your wallet";
  const deferred = isDeferredSigner(wallet?.adapter);
  const { holdings } = useLivePortfolio();
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const now = useNow();
  const [slippageBps, setSlippageBps] = useState(SLIPPAGE_DEFAULT_BPS);
  const [editingSlippage, setEditingSlippage] = useState(false);
  const [progress, setProgress] = useState<ArmProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArmResult | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const ticker = plan?.condition.ticker ?? "";
  const token = ticker ? getTokenForSymbol(ticker) : undefined;
  const price = ticker ? getEffectivePrice(ticker) : 0;
  const solUsd = getSolPrice();
  const held = holdings.find((h) => h.ticker === ticker)?.shares;

  const mapping = useMemo(() => {
    if (!plan || !token || !address || !now) return null;
    const days = plan.condition.armDays ?? DEFAULT_ARM_DAYS;
    return toTriggerOrder(plan.condition, { wallet: address, token: { ...token, symbol: ticker }, price, solUsd, heldShares: held, now, armUntil: now + days * 24 * 60 * 60_000, payWith: plan.condition.payWith, slippageBps });
  }, [plan, token, address, ticker, price, solUsd, held, slippageBps, now]);

  const ok: TriggerOk | null = mapping && mapping.ok ? mapping : null;

  async function run() {
    if (!plan || !ok || !address || busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await armWithJupiter({
        plan,
        mapping: ok,
        wallet: { publicKey: address, signMessage: signMessage ?? undefined, signTransaction: signTransaction ?? undefined, deferred },
        sessionToken,
        onProgress: setProgress,
        resume,
      });
      if (outcome === "deferred") return; // Phantom has the page now; the resumer finishes.
      setResult(outcome);
      if (outcome.recorded) notifyPlansChanged();
    } catch (err) {
      setError(friendlyTriggerError(err, progress?.step ?? "auth"));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  // Reopened by the iOS resumer with a token: continue straight into step 2.
  useEffect(() => {
    if (resume?.jwt && ok && !started.current && !busy && !result) {
      started.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the mapping is ready
  }, [resume?.jwt, ok]);

  const stepNo = progress ? (progress.step === "auth" ? 1 : 2) : 1;
  const signedIn = !!resume?.jwt || (progress && progress.step !== "auth");

  return (
    <Sheet labelledBy={id} onClose={onClose} locked={busy}>
      <SheetHead eyebrow="Live plan · Jupiter Trigger" title={result ? "Armed with Jupiter" : "Arm it with your wallet"} id={id} onClose={busy ? undefined : onClose} />
      {!plan && !loadError && (
        <div role="status" aria-busy="true">
          <div className="skeleton h-4 w-2/3" />
        </div>
      )}
      {loadError && (
        <p role="alert" className="field-error">
          {loadError}
        </p>
      )}
      {plan && !address && <p className="sheet-text">Connect the wallet this plan belongs to ({plan.wallet ? shortAddress(plan.wallet) : "your wallet"}) to arm it.</p>}
      {plan && address && mapping && !mapping.ok && (
        <>
          <p className="sheet-text">{mapping.reason}</p>
          <p className="sheet-foot">Solera can watch this one and notify you instead. Arm it from Plans as a notify plan.</p>
        </>
      )}
      {plan && ok && !result && (
        <>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted" aria-label="Progress">
            <span className={signedIn ? "text-gain" : stepNo === 1 ? "text-fg" : ""}>1 sign in{signedIn ? " ✓" : ""}</span>
            <span className="mx-2">·</span>
            <span className={stepNo === 2 ? "text-fg" : ""}>2 approve deposit</span>
          </p>
          <p className="mt-2 text-[13px] font-medium text-fg">{plan.summary}</p>
          <p className="text-xs text-muted">{ok.summary}</p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12px]">
            <dt className="eyebrow">What moves now</dt>
            <dd className="font-mono">
              {amount(ok.deposit.amount, ok.deposit.unit)} → your Jupiter vault
            </dd>
            <dt className="eyebrow">When it fills</dt>
            <dd>
              {plan.condition.action.side === "buy"
                ? `Jupiter's keeper swaps it for ${ticker} and sends the ${ticker} to your wallet`
                : `Jupiter's keeper sells the ${ticker} and sends the proceeds to your wallet`}
            </dd>
            <dt className="eyebrow">Slippage</dt>
            <dd className="font-mono">
              up to {(slippageBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} %{" "}
              {editingSlippage ? (
                <label className="ml-2 inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    defaultValue={slippageBps / 100}
                    className="field w-16 px-1 py-0.5 text-[12px]"
                    aria-label="Slippage percent"
                    onChange={(e) => setSlippageBps(clampSlippage(Number(e.target.value) * 100))}
                    onBlur={() => setEditingSlippage(false)}
                    data-autofocus
                  />
                  <span className="text-muted">%</span>
                </label>
              ) : (
                <button type="button" className="text-link underline underline-offset-2" onClick={() => setEditingSlippage(true)} disabled={busy}>
                  change
                </button>
              )}
            </dd>
            <dt className="eyebrow">Expires</dt>
            <dd>{dateLong(ok.expiresAt)} · unfilled funds come back with one more signature</dd>
          </dl>
          <p className="sheet-text mt-3 text-[11px] leading-relaxed">
            {ok.disclosures.slice(0, 5).join(" ")} {ticker} is issued by a third party, not by Solera; it carries price exposure, not shareholder rights; xStocks are not offered to US persons.
          </p>
          {progress?.challenge && progress.step === "auth" && (
            <div className="mb-3 rounded-[var(--radius-control)] border border-line bg-inset p-2">
              <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted">{progress.challenge}</pre>
              <p className="mt-1 text-[11px] text-fg">This proves the wallet is yours. It moves nothing.</p>
            </div>
          )}
          {progress?.step === "deposit" && (
            <p className="mb-3 text-[12px] text-fg">
              {walletName} will show a transfer of {amount(ok.deposit.amount, ok.deposit.unit)} to {progress.vault ? shortAddress(progress.vault) : "your vault"}. That is the deposit.
            </p>
          )}
          {progress && progress.step !== "auth" && progress.step !== "deposit" && <p className="mb-3 text-[12px] text-muted">{STEP_LABELS[progress.step]}</p>}
          {error && (
            <p role="alert" className="field-error mb-3">
              {error}
            </p>
          )}
          <div className="sheet-actions">
            <button type="button" className="btn-live" onClick={run} disabled={busy} aria-busy={busy}>
              {busy ? (progress?.step === "auth" || progress?.step === "deposit" ? `Waiting for ${walletName}…` : "Working…") : deferred ? (signedIn ? "Approve deposit" : `Continue with ${walletName}`) : `Continue with ${walletName}`}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              not now
            </button>
          </div>
          <p className="sheet-foot">
            {deferred ? `Two hops to ${walletName}: sign in, then approve the deposit. ` : `Two prompts: sign in, then approve the deposit. `}
            Solera never holds keys or funds. The vault is Jupiter&apos;s, and only your wallet can withdraw from it.
            {progress?.vault ? ` · vault ${shortAddress(progress.vault)}` : ""}
          </p>
        </>
      )}
      {plan && ok && result && (
        <>
          <p className="text-[13px] font-medium text-fg">{plan.summary}</p>
          <p className="sheet-text">
            {amount(ok.deposit.amount, ok.deposit.unit)} is in your Jupiter vault · order {result.orderId.slice(0, 8)}… ·{" "}
            <a href={solscanTxUrl(result.txSignature)} target="_blank" rel="noreferrer" className="text-link underline underline-offset-2">
              view on Solscan ↗
            </a>{" "}
            ·{" "}
            <a href={JUPITER_URL} target="_blank" rel="noreferrer" className="text-link underline underline-offset-2">
              view on Jupiter ↗
            </a>
          </p>
          {!result.recorded && (
            <p role="alert" className="field-error mb-3">
              The order is live on Jupiter, but Solera couldn&apos;t confirm the deposit yet. It will show up in Plans within a minute; if not, tap Refresh there.
              {result.recordError ? ` (${result.recordError})` : ""}
            </p>
          )}
          <p className="sheet-foot">Funds are held by Jupiter until fill or cancel. You can cancel from Plans any time; that needs one signature and returns the funds.</p>
          <div className="sheet-actions">
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
      {plan && !mapping && address && <p className="sheet-text">{token ? "Reading prices…" : `No Solana mint known for ${ticker} yet.`}</p>}
    </Sheet>
  );
}
