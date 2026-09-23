"use client";

import { useId, useState } from "react";
import { useConnectWallet } from "@/components/ConnectWalletProvider";
import { CheckCircleIcon } from "@/components/icons";
import { COMPANIES, formatValuation, jupiterSwapUrl, type PreIpoToken } from "@/lib/pre-ipo";
import { formatCurrency } from "@/lib/format";
import { solscanTxUrl } from "@/lib/jupiter";
import { settlementBaseUnits } from "@/lib/trade";
import { SETTLEMENT, SOL_FEE_RESERVE, fromBaseUnits, type SettlementCurrency } from "@/lib/tokens";
import { NOTE_MAX, WRONG_IF_MAX, type Leg } from "@/lib/fills";
import { usePreIpoBuy } from "@/hooks/use-pre-ipo-buy";
import { useSwapQuote } from "@/hooks/use-swap-quote";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { celebrateTrade } from "@/lib/celebrate";
import { signedPct } from "./format";

const QUICK_AMOUNTS = [25, 50, 100, 250];

/**
 * The one pre-IPO buy form, in two placements: the ticket column of the
 * asset card on desktop, and the bottom sheet a market row opens on a
 * phone. Live mode is a real Jupiter swap with an optional thesis (why,
 * wrong-if, and which leg the thesis rides on); practice mode is the
 * connect prompt, because there is no practice ledger for pre-IPO mints.
 */
export function PreIpoBuyForm({ token, onDone, held }: { token: PreIpoToken; onDone?: () => void; held?: number }) {
  const company = COMPANIES[token.company];
  const id = useId();
  const [amount, setAmount] = useState("25");
  const [payWith, setPayWith] = useState<SettlementCurrency>("SOL");
  const [leg, setLeg] = useState<Leg | undefined>(undefined);
  const [note, setNote] = useState("");
  const [wrongIf, setWrongIf] = useState("");
  const { status, fill, error, run, reset, isLive } = usePreIpoBuy();
  const { solBalance, usdcBalance, solUsd, isLoaded } = useActivePortfolio();
  const { connected, setMode } = useTradeMode();
  const { openConnect } = useConnectWallet();

  const dollars = Math.max(0, Number(amount) || 0);
  const estimate = token.tokenPrice > 0 ? dollars / token.tokenPrice : 0;
  const spendable = payWith === "SOL" ? Math.max(0, solBalance - SOL_FEE_RESERVE) * solUsd : usdcBalance;
  const exceeds = isLive && dollars > spendable;
  // Paying in SOL needs the SOL price first; the ticket renders before the price store has answered.
  const canPrice = payWith === "USDC" || solUsd > 0;
  const canSubmit = isLive && canPrice && dollars > 0 && !exceeds && status !== "pending";
  const settleUnits = isLive && canPrice && dollars > 0 ? settlementBaseUnits(dollars, payWith) : "0";
  const settleAmount = fromBaseUnits(settleUnits, SETTLEMENT[payWith].decimals);
  const sliderMax = Math.floor(spendable);

  // A real quote from Jupiter — there is no separate review step, so it's
  // requested as soon as there's a live amount to price.
  const { quote, isLoading: quoteLoading } = useSwapQuote(
    settleUnits !== "0" ? { inputMint: SETTLEMENT[payWith].mint, outputMint: token.mint, amountBaseUnits: settleUnits } : null,
  );
  const quotedAmount = quote ? fromBaseUnits(quote.outAmount, token.decimals) : undefined;

  if (status === "success" && fill) {
    return (
      <div className="pi-success" role="status">
        <CheckCircleIcon className="h-12 w-12 text-gain" />
        <h4>Order filled on Solana</h4>
        <p>
          You bought <span className="font-mono">{fill.amount.toFixed(4)}</span> {token.symbol} for{" "}
          <span className="font-mono">{formatCurrency(fill.dollars)}</span> (
          <span className="font-mono">
            {fill.settledAmount.toFixed(fill.settledIn === "SOL" ? 4 : 2)} {fill.settledIn}
          </span>
          ).
          {fill.thesis?.note && " Your note is saved on the fill."}
        </p>
        <a href={solscanTxUrl(fill.signature)} target="_blank" rel="noreferrer" className="font-mono text-xs text-link underline">
          {fill.signature.slice(0, 8)}…{fill.signature.slice(-6)} on Solscan ↗
        </a>
        <button
          type="button"
          onClick={() => {
            reset();
            onDone?.();
          }}
          className="btn-primary w-full"
        >
          Done
        </button>
      </div>
    );
  }

  if (!isLive) {
    return (
      <div className="pi-prompt">
        <p className="eyebrow">Practice mode</p>
        <p>Pre-IPO tokens are bought for real, from your wallet. Connect one and switch to live trading.</p>
        {connected ? (
          <button type="button" onClick={() => setMode("live")} className="btn-live w-full">
            Switch to Live
          </button>
        ) : (
          <button type="button" onClick={openConnect} className="btn-primary w-full">
            Connect wallet
          </button>
        )}
        <a href={jupiterSwapUrl(token.mint)} target="_blank" rel="noreferrer" className="text-center text-xs font-semibold text-link">
          Or buy on Jupiter ↗
        </a>
      </div>
    );
  }

  const legHelp =
    leg === "gap"
      ? `Token is ${signedPct(token.premiumPct)} vs the mark. You are saying that number goes toward zero.`
      : leg === "mark"
        ? `Mark is ${formatCurrency(token.markPrice)}. You are saying the issuer re-marks higher, whatever the gap does.`
        : "Optional. Name the leg and the readout later is about whether this leg moved.";

  return (
    <form
      className="pi-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const result = await run(token, dollars, payWith, {
          note: note.trim() || undefined,
          wrongIf: wrongIf.trim() || undefined,
          leg,
        });
        if (result) celebrateTrade();
      }}
    >
      <fieldset disabled={status === "pending"}>
        <div className="pi-ticket-head">
          <span className="chip live">Buy · live</span>
          <div className="seg" role="group" aria-label="Pay with">
            {(["SOL", "USDC"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={payWith === c} onClick={() => setPayWith(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="pi-leg">
          <p className="eyebrow">
            This thesis is about <em>optional</em>
          </p>
          <div className="seg leg" role="group" aria-label="This thesis is about">
            <button type="button" data-leg="gap" aria-pressed={leg === "gap"} onClick={() => setLeg(leg === "gap" ? undefined : "gap")}>
              The gap closes
            </button>
            <button type="button" data-leg="mark" aria-pressed={leg === "mark"} onClick={() => setLeg(leg === "mark" ? undefined : "mark")}>
              The mark rises
            </button>
          </div>
          <p className="pi-leg-help">{legHelp}</p>
        </div>

        <p className="pi-ticket-pos">
          {held !== undefined && held > 0 ? (
            <>
              You hold{" "}
              <b>
                {held.toFixed(4)} {token.symbol}
              </b>{" "}
              ({formatCurrency(held * token.tokenPrice)})
            </>
          ) : (
            "No position yet."
          )}
        </p>

        <div className="pi-amount">
          <div className="pi-amount-row">
            <label htmlFor={`${id}-amount`}>Amount</label>
            <div className="field">
              <span aria-hidden="true">$</span>
              <input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => /^\d*(\.\d{0,2})?$/.test(e.target.value) && setAmount(e.target.value)}
                aria-label="Amount to invest in dollars"
              />
            </div>
          </div>
          {sliderMax >= 1 && (
            <input
              type="range"
              className="trade-slider"
              min={0}
              max={sliderMax}
              step={1}
              value={Math.min(Math.floor(dollars), sliderMax)}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount slider"
            />
          )}
          <div className="pi-amount-meta">
            <span>$0</span>
            <span>
              <span className="font-mono">{isLoaded ? formatCurrency(spendable) : "—"}</span> in {payWith} available
            </span>
          </div>
          <div className="pi-quick">
            {QUICK_AMOUNTS.map((q) => (
              <button key={q} type="button" disabled={q > spendable} onClick={() => setAmount(String(q))} className="btn-secondary btn-small">
                ${q}
              </button>
            ))}
            <button type="button" disabled={spendable <= 0} onClick={() => setAmount(spendable.toFixed(2))} className="btn-secondary btn-small">
              Max
            </button>
          </div>
        </div>

        <div className="pi-quote" aria-live="polite">
          <div>
            <small>You pay</small>
            <b>
              {dollars > 0 && canPrice ? `${settleAmount.toFixed(payWith === "SOL" ? 4 : 2)} ${payWith}` : "—"}
            </b>
          </div>
          <div>
            <small>You get</small>
            <b>
              {dollars > 0 ? `${(quotedAmount ?? estimate).toFixed(4)} ${token.symbol}` : "—"}
            </b>
          </div>
          <div>
            <small>Route</small>
            <b>{quote ? "Jupiter Ultra" : quoteLoading ? "Jupiter · fetching…" : "Jupiter Ultra"}</b>
          </div>
          <div>
            <small>Impact · fees</small>
            <b className={quote && Math.abs(quote.priceImpactPct) > 1 ? "text-warn" : ""}>
              {quote ? `${quote.priceImpactPct > 0 ? "+" : ""}${quote.priceImpactPct.toFixed(2)}% · ${(quote.feeBps / 100).toFixed(2)}%` : "—"}
            </b>
          </div>
        </div>
        <p className="pi-quote-src">
          {quote ? (
            <>
              Routed quote from <b>Jupiter Ultra</b> · {formatCurrency(token.tokenPrice)} per token · implies {formatValuation(token.impliedValuation)}
            </>
          ) : quoteLoading ? (
            "Asking Jupiter for a real quote…"
          ) : !canPrice ? (
            "Waiting for the SOL price before quoting."
          ) : (
            <>
              {formatCurrency(token.tokenPrice)} per token · implies {formatValuation(token.impliedValuation)} for {company.name}
            </>
          )}
        </p>

        <label className="field-label pi-field">
          <span>
            Why? <em>optional · saved on the fill</em>
          </span>
          <div className="field">
            <textarea
              rows={2}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="One sentence you'd want to read back in six months…"
            />
          </div>
        </label>
        <label className="field-label pi-field">
          <span>
            Wrong if <em>optional</em>
          </span>
          <div className="field">
            <input type="text" maxLength={WRONG_IF_MAX} value={wrongIf} onChange={(e) => setWrongIf(e.target.value)} placeholder="The thing that would make you exit" />
          </div>
        </label>

        {exceeds && (
          <p className="field-error" role="alert">
            That&apos;s more than your {payWith} balance.
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-live w-full" disabled={!canSubmit} aria-busy={status === "pending"}>
          {status === "pending" ? "Waiting for your wallet…" : `Buy ${token.symbol} · sign in wallet`}
        </button>
        <p className="pi-disclosure">
          Real swap on Solana mainnet through Jupiter. Your wallet will ask you to sign. {token.issuer} tokens give price exposure to the
          company; they are not shares and carry no ownership, votes, or place on the share register. Issued by {token.issuer}, not Solera;
          availability depends on where you live. Not financial advice.
        </p>
        <p className="pi-ticket-foot">Signed in your wallet, landed on mainnet. Solera never holds keys or funds.</p>
      </fieldset>
    </form>
  );
}
