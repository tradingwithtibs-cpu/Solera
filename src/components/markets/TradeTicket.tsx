"use client";

import "./markets.css";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useExecuteTrade } from "@/hooks/use-execute-trade";
import { usePreIpoBuy } from "@/hooks/use-pre-ipo-buy";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { useSwapQuote } from "@/hooks/use-swap-quote";
import { useInvestor } from "@/hooks/use-investors";
import { useNotes } from "@/hooks/use-notes";
import { useSession } from "@/hooks/use-session";
import { refreshPlans } from "@/hooks/use-plans";
import { useConnectWallet } from "@/components/ConnectWalletProvider";
import { relTime } from "@/components/plans/plan-format";
import { useClock } from "@/components/plans/use-clock";
import { TickerBadge } from "@/components/TickerBadge";
import { CheckCircleIcon } from "@/components/icons";
import { computeHoldings } from "@/lib/portfolio";
import { formatCurrency, formatShares } from "@/lib/format";
import { getTickerInfo, getTokenForSymbol } from "@/lib/catalog";
import { settlementBaseUnits } from "@/lib/trade";
import { SETTLEMENT, SOL_FEE_RESERVE, fromBaseUnits, toBaseUnits, type SettlementCurrency } from "@/lib/tokens";
import { COMPANIES, jupiterSwapUrl } from "@/lib/pre-ipo";
import { HORIZON_MAX, NOTE_MAX, WRONG_IF_MAX } from "@/lib/notes";
import { solscanTxUrl } from "@/lib/jupiter";
import { celebrateTrade } from "@/lib/celebrate";
import { fillFor } from "@/lib/palette";
import { met } from "@/lib/plans";
import { plansClient } from "@/lib/plans-client";
import type { TradeSide } from "@/lib/types";
import { usePlanPrefill } from "./use-plan-prefill";
import type { TicketTarget } from "./types";

const BUY_QUICK = [25, 50, 100, 250];
const SELL_QUICK = [25, 50, 75, 100];

type Leg = "gap" | "mark";

function pct(n: number, digits = 1): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}%`;
}

function shortSig(sig: string): string {
  return `${sig.slice(0, 8)}…${sig.slice(-6)}`;
}

interface Props {
  target: TicketTarget;
  initialSide?: TradeSide;
  /** From `?ref=`: the investor whose position is being copied. */
  refInvestorId?: string | null;
  /** Inline beside the chart (true) or full width on /buy. */
  compact?: boolean;
  /** From `?plan=`: rides along on the fill. */
  planId?: string | null;
}

/**
 * The ticket: side and settlement, the position line, amount with slider
 * and quick picks, the quote block (a practice estimate or Jupiter Ultra's
 * routed quote), the optional thesis, and the primary button that opens
 * the review sheet. Execution stays with useExecuteTrade / usePreIpoBuy.
 */
export function TradeTicket({ target, initialSide = "buy", refInvestorId, compact = false, planId }: Props) {
  const isPreIpo = target.kind === "pre-ipo";
  const token = isPreIpo ? target.token : null;
  const symbol = token ? token.symbol : target.kind === "xstock" ? target.ticker : "";
  const info = token ? null : getTickerInfo(symbol);
  const displayName = token ? COMPANIES[token.company].name : info!.name;
  const decimals = token ? token.decimals : (getTokenForSymbol(symbol)?.decimals ?? 8);
  const mint = token ? token.mint : getTokenForSymbol(symbol)?.mint;

  const { price: xPrice, isLive: xLive } = useEffectivePrice(token ? "" : symbol);
  const price = token ? token.tokenPrice : xPrice;
  const priceIsLive = token ? token.tokenPrice > 0 : xLive;
  const refInvestor = useInvestor(refInvestorId ?? undefined);
  const prefill = usePlanPrefill(planId);
  const trade = useExecuteTrade();
  const preIpoBuy = usePreIpoBuy();
  const { isLive } = trade;
  const { cashBalance, solBalance, usdcBalance, solUsd, holdings: rawHoldings, preIpoHoldings, recordTrade, isLoaded } = useActivePortfolio();
  const { save: saveNote } = useNotes();
  const { openConnect } = useConnectWallet();
  const { wallet } = useWallet();
  const walletName = wallet?.adapter.name ?? "wallet";
  const { token: sessionToken } = useSession();
  const clock = useClock();

  const [side, setSide] = useState<TradeSide>(token ? "buy" : initialSide);
  const [payWith, setPayWith] = useState<SettlementCurrency>("SOL");
  const [amount, setAmount] = useState(() => (initialSide === "sell" || refInvestorId ? "0" : "100"));
  const [sellFraction, setSellFraction] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [wrongIf, setWrongIf] = useState("");
  const [horizon, setHorizon] = useState("");
  const [leg, setLeg] = useState<Leg | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [appliedPrefill, setAppliedPrefill] = useState<string | null>(null);

  const owned = token ? undefined : computeHoldings(rawHoldings).find((h) => h.ticker === symbol);
  const ownedShares = token ? (preIpoHoldings[token.mint] ?? 0) : (owned?.shares ?? 0);
  const ownedValue = token ? ownedShares * token.tokenPrice : (owned?.value ?? 0);

  // A plan or the agent's order card prefills the form once, when it arrives (a fetch for `?plan=`),
  // without overwriting anything typed afterwards: the classic "adjust state on a new prop" pattern.
  if (prefill && prefill.key !== appliedPrefill && (prefill.shares === undefined || price > 0)) {
    setAppliedPrefill(prefill.key);
    const nextSide: TradeSide = token ? "buy" : (prefill.side ?? side);
    if (nextSide !== side) setSide(nextSide);
    setSellFraction(null);
    if (prefill.amount !== undefined) setAmount(prefill.amount.toFixed(2));
    else if (prefill.shares !== undefined) setAmount((prefill.shares * price).toFixed(2));
    else if (prefill.fraction !== undefined && nextSide === "sell") {
      setSellFraction(prefill.fraction);
      setAmount((prefill.fraction * ownedValue).toFixed(2));
    }
    if (prefill.note) setNote(prefill.note);
  }
  const plan = prefill?.plan ?? null;
  const planMoved = !!plan && priceIsLive && price > 0 && !met(plan.condition.trigger, price);

  const dollars = side === "sell" && sellFraction !== null ? ownedValue * sellFraction : Math.max(0, Number(amount) || 0);
  const shares = side === "sell" && sellFraction !== null ? ownedShares * sellFraction : price > 0 ? dollars / price : 0;
  const spendable = !isLive ? cashBalance : payWith === "SOL" ? Math.max(0, solBalance - SOL_FEE_RESERVE) * solUsd : usdcBalance;
  const spendableLabel = !isLive ? "cash available" : payWith === "SOL" ? "in SOL available" : "in USDC available";
  const maxAvailable = side === "buy" ? spendable : ownedValue;
  const exceedsMax = isLoaded && dollars > maxAvailable + 1e-9;
  const preIpoGate = isPreIpo && !isLive;
  const status = token ? preIpoBuy.status : trade.status;
  const error = token ? preIpoBuy.error : trade.error;
  const pending = status === "pending";
  const canSubmit = isLoaded && Number.isFinite(dollars) && dollars > 0 && !exceedsMax && (side === "buy" || ownedShares > 0) && !preIpoGate;

  // Slider: buy from $0 to what the chosen balance can pay for; sell up to the position.
  const sliderMax = Math.max(0, Math.floor(maxAvailable * 100) / 100);
  const sliderPct = sliderMax > 0 ? (Math.min(dollars, sliderMax) / sliderMax) * 100 : 0;
  const sliderFill = side === "buy" ? "var(--era-2)" : "var(--loss)";
  const sliderStyle = {
    background: `linear-gradient(to right, ${sliderFill} 0%, ${sliderFill} ${sliderPct}%, var(--line) ${sliderPct}%, var(--line) 100%)`,
    "--thumb-color": sliderFill,
  } as CSSProperties;

  // A live, no-commitment quote from Jupiter Ultra for the quote block.
  const quoteParams = useMemo(() => {
    if (!isLive || preIpoGate || dollars <= 0 || !mint) return null;
    try {
      if (side === "buy") return { inputMint: SETTLEMENT[payWith].mint, outputMint: mint, amountBaseUnits: settlementBaseUnits(dollars, payWith) };
      if (shares <= 0) return null;
      return { inputMint: mint, outputMint: SETTLEMENT[payWith].mint, amountBaseUnits: toBaseUnits(shares, decimals) };
    } catch {
      return null;
    }
  }, [isLive, preIpoGate, dollars, mint, side, payWith, shares, decimals]);
  const { quote, isLoading: quoteLoading, error: quoteError } = useSwapQuote(quoteParams);

  const settleAmount = payWith === "SOL" ? (solUsd > 0 ? `${(dollars / solUsd).toFixed(4)} SOL` : "— SOL") : `${dollars.toFixed(2)} USDC`;
  const payLine = side === "buy" ? (isLive ? settleAmount : formatCurrency(dollars)) : `${formatShares(shares)} ${symbol}`;
  const getLine =
    side === "buy"
      ? quote
        ? `${fromBaseUnits(quote.outAmount, decimals).toFixed(4)} ${symbol}`
        : priceIsLive
          ? `≈ ${shares.toFixed(4)} ${symbol}`
          : `— ${symbol}`
      : quote
        ? `${fromBaseUnits(quote.outAmount, SETTLEMENT[payWith].decimals).toFixed(payWith === "SOL" ? 4 : 2)} ${payWith}`
        : isLive
          ? `≈ ${settleAmount}`
          : formatCurrency(dollars);
  const routeLine = isLive ? (quoteLoading && !quote ? "Jupiter · fetching…" : "Jupiter Ultra") : "Practice fill · live price";
  const impactLine = isLive ? (quote ? `${quote.priceImpactPct.toFixed(2)}% · ${(quote.feeBps / 100).toFixed(2)}%` : "…") : "0.00% · $0.00";
  const quoteSource = !isLive
    ? "Simulated fill at the live Solana price. Switch to Live to route through Jupiter."
    : quoteError
      ? quoteError
      : quote
        ? `Routed quote from Jupiter Ultra · ${new Date(quote.quotedAt).toLocaleTimeString("en-GB")}`
        : dollars > 0
          ? "Asking Jupiter for a real quote…"
          : "Enter an amount for a routed Jupiter quote.";

  const via: "ticket" | "plan" | "copy" = planId ? "plan" : refInvestor && side === "buy" ? "copy" : "ticket";
  const thesis = { note: note.trim(), wrongIf: wrongIf.trim(), horizon: horizon.trim() };

  const resetForm = () => {
    trade.reset();
    preIpoBuy.reset();
    setReviewing(false);
    setSellFraction(null);
    setAmount(side === "sell" || refInvestorId ? "0" : "100");
    setNote("");
    setWrongIf("");
    setHorizon("");
    setLeg(null);
  };

  const changeSide = (next: TradeSide) => {
    setSide(next);
    setSellFraction(null);
    setAmount(next === "sell" || refInvestorId ? "0" : "100");
  };

  const persistThesis = (key: string) => {
    if (side !== "buy" || (!thesis.note && !thesis.wrongIf && !thesis.horizon)) return;
    void saveNote({ key, note: thesis.note, wrongIf: thesis.wrongIf, horizon: thesis.horizon });
  };

  const confirm = async () => {
    if (!canSubmit || pending) return;
    if (token) {
      const fill = await preIpoBuy.run(token, dollars, payWith, { note: thesis.note || undefined, wrongIf: thesis.wrongIf || undefined, leg: leg ?? undefined });
      if (fill) {
        persistThesis(token.mint);
        setReviewing(false);
        celebrateTrade();
      }
      return;
    }
    const copied = side === "buy" ? refInvestor?.id : undefined;
    const result = await trade.run(
      {
        ticker: symbol,
        side,
        quantity: shares,
        totalValue: dollars,
        payWith,
        copiedFromInvestorId: copied,
        note: thesis.note || undefined,
        wrongIf: thesis.wrongIf || undefined,
        leg: leg ?? undefined,
        via,
        planId: planId ?? undefined,
      },
      (fill) => {
        recordTrade({
          ticker: fill.ticker,
          side: fill.side,
          quantity: fill.quantity,
          pricePerShare: fill.pricePerShare,
          totalValue: fill.totalValue,
          txId: fill.txId,
          copiedFromInvestorId: copied,
          note: thesis.note || undefined,
          wrongIf: thesis.wrongIf || undefined,
          leg: leg ?? undefined,
          via,
          planId: planId ?? undefined,
          settledIn: fill.settledIn,
          settledAmount: fill.settledAmount,
        });
      },
    );
    if (result) {
      persistThesis(symbol);
      setReviewing(false);
      celebrateTrade();
      // The notify path's last step: the tap's fill landed, so the plan is done (backend §9.8).
      // Practice fills carry a reference id; live fills carry the signature.
      if (planId && sessionToken) {
        plansClient
          .done(sessionToken, planId, result.txId)
          .then(() => refreshPlans())
          .catch(() => undefined);
      }
    }
  };

  // ---- success ----------------------------------------------------------
  if (token && preIpoBuy.status === "success" && preIpoBuy.fill) {
    const fill = preIpoBuy.fill;
    return (
      <div className={`ticket ${compact ? "" : "full"}`}>
        <TicketSuccess
          title="Order filled on Solana"
          summary={
            <>
              You bought <b>{fill.amount.toFixed(4)} {token.symbol}</b> for <b>{formatCurrency(fill.dollars)}</b> ({fill.settledAmount.toFixed(fill.settledIn === "SOL" ? 4 : 2)}{" "}
              {fill.settledIn}).
            </>
          }
          rows={[
            { label: "Price per token", value: formatCurrency(fill.dollars / Math.max(fill.amount, 1e-9)) },
            {
              label: "Transaction",
              value: (
                <a href={solscanTxUrl(fill.signature)} target="_blank" rel="noreferrer">
                  {shortSig(fill.signature)} ↗
                </a>
              ),
            },
          ]}
          onAgain={resetForm}
        />
      </div>
    );
  }
  if (!token && trade.status === "success" && trade.result) {
    const result = trade.result;
    return (
      <div className={`ticket ${compact ? "" : "full"}`}>
        <TicketSuccess
          title={result.mode === "live" ? "Order filled on Solana" : "Practice order complete"}
          summary={
            <>
              You {result.side === "buy" ? "bought" : "sold"} <b>{formatCurrency(result.totalValue)}</b> of {result.ticker} (≈ <b>{formatShares(result.quantity)}</b> shares)
              {result.settledIn && result.settledAmount !== undefined && (
                <>
                  {" "}
                  {result.side === "buy" ? "for" : "and received"}{" "}
                  <b>
                    {result.settledAmount.toFixed(result.settledIn === "SOL" ? 4 : 2)} {result.settledIn}
                  </b>
                </>
              )}
              .
            </>
          }
          rows={[
            { label: "Price per share", value: formatCurrency(result.pricePerShare) },
            {
              label: result.mode === "live" ? "Transaction" : "Reference",
              value:
                result.mode === "live" ? (
                  <a href={solscanTxUrl(result.txId)} target="_blank" rel="noreferrer">
                    {shortSig(result.txId)} ↗
                  </a>
                ) : (
                  result.txId
                ),
            },
          ]}
          onAgain={resetForm}
        />
      </div>
    );
  }

  // ---- the form -----------------------------------------------------------
  const positionLine = ownedShares > 0 ? (
    <p className="ticket-pos">
      You hold{" "}
      <b>
        {token ? ownedShares.toFixed(4) : formatShares(ownedShares)} {symbol}
      </b>{" "}
      ({formatCurrency(ownedValue)})
      {owned?.gainPct !== undefined && (
        <>
          {" · "}
          <span className={owned.gainPct >= 0 ? "up" : "down"}>{pct(owned.gainPct)}</span> vs cost
        </>
      )}
    </p>
  ) : (
    <p className="ticket-pos">No position yet.</p>
  );

  return (
    <>
      <form
        className={`ticket ${compact ? "" : "full"}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !pending) setReviewing(true);
        }}
      >
        {!compact && (
          <div className="ticket-asset">
            {token ? (
              <span className="avatar" style={{ background: fillFor(COMPANIES[token.company].color, token.company) }} aria-hidden="true">
                {COMPANIES[token.company].short}
              </span>
            ) : (
              <TickerBadge ticker={info!} />
            )}
            <div>
              <h4>
                {displayName} <small>{symbol}</small>
              </h4>
              <p>
                <span className="font-mono">{formatCurrency(price)}</span> per {token ? "token" : "share"} · {priceIsLive ? "live" : "indicative"}
              </p>
            </div>
          </div>
        )}

        <fieldset disabled={pending} className="contents">
          <div className="ticket-head">
            <div className="seg" role="group" aria-label="Trade side">
              <button type="button" aria-pressed={side === "buy"} onClick={() => changeSide("buy")}>
                Buy
              </button>
              {!token && (
                <button type="button" aria-pressed={side === "sell"} onClick={() => changeSide("sell")}>
                  Sell
                </button>
              )}
            </div>
            {isLive && (
              <div className="seg" role="group" aria-label={side === "buy" ? "Pay with" : "Receive"}>
                {(["SOL", "USDC"] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={payWith === c} onClick={() => setPayWith(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {side === "buy" && refInvestor && (
            <div className="ticket-ref">
              Copying <b>{refInvestor.name}</b>&apos;s {symbol} position
              <small>Reflects their public holdings — not financial advice.</small>
            </div>
          )}

          {positionLine}

          {preIpoGate ? (
            <div className="ticket-gate">
              <p>Pre-IPO tokens are bought for real, from your wallet. Connect one and switch to live trading.</p>
              <button type="button" className="btn-primary" onClick={openConnect}>
                Connect wallet
              </button>
              <a href={jupiterSwapUrl(token!.mint)} target="_blank" rel="noreferrer">
                Or buy on Jupiter ↗
              </a>
            </div>
          ) : side === "sell" && ownedShares <= 0 ? (
            <div className="ticket-gate">
              <p>You don&apos;t own any {symbol} to sell.</p>
            </div>
          ) : (
            <>
              {plan && (
                <div className="ticket-ref ticket-plan">
                  From your plan: <q>{plan.text}</q>
                  {plan.readyAt && clock ? ` · ready since ${relTime(plan.readyAt, clock)} ago` : plan.status === "armed" ? " · still armed" : ""}
                  {planMoved && (
                    <small>
                      {symbol} has moved back to {formatCurrency(price)} — the plan&apos;s condition isn&apos;t met right now. You can still {side}, or wait; the plan stays armed.
                    </small>
                  )}
                </div>
              )}
              {!plan && prefill?.source === "agent" && (
                <div className="ticket-ref ticket-plan">
                  Prefilled by the agent
                  <small>Review it; nothing is placed until you confirm.</small>
                </div>
              )}
              <div className="ticket-amount">
                <div className="ticket-amount-row">
                  <label htmlFor={`amount-${symbol}`}>Amount</label>
                  <span className="ticket-figure">
                    <span className="muted">$</span>
                    <input
                      id={`amount-${symbol}`}
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        if (/^\d*(\.\d{0,2})?$/.test(e.target.value)) {
                          setSellFraction(null);
                          setAmount(e.target.value);
                        }
                      }}
                      aria-label={`Amount to ${side} in dollars`}
                    />
                  </span>
                </div>
                {sliderMax > 0 && (
                  <input
                    type="range"
                    className="trade-slider"
                    min={0}
                    max={sliderMax}
                    step={0.01}
                    value={Math.min(Math.max(dollars, 0), sliderMax)}
                    onChange={(e) => {
                      setSellFraction(null);
                      setAmount(e.target.value);
                    }}
                    style={sliderStyle}
                    aria-label={`Drag to set amount to ${side}`}
                  />
                )}
                <small>
                  <span>$0</span>
                  <span>
                    {isLoaded ? formatCurrency(maxAvailable) : "—"} {side === "buy" ? spendableLabel : "position"}
                  </span>
                </small>
                {side === "buy" && isLive && payWith === "SOL" && (
                  <small>
                    <span>{solBalance.toFixed(4)} SOL in wallet</span>
                    <span>{SOL_FEE_RESERVE} kept for fees</span>
                  </small>
                )}
              </div>

              <div className="quick" role="group" aria-label="Quick amounts">
                {side === "buy"
                  ? BUY_QUICK.map((q) => (
                      <button key={q} type="button" disabled={q > spendable} onClick={() => setAmount(String(q))}>
                        ${q}
                      </button>
                    ))
                  : SELL_QUICK.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setSellFraction(p / 100);
                          setAmount(((p / 100) * ownedValue).toFixed(2));
                        }}
                      >
                        {p}%
                      </button>
                    ))}
                {side === "buy" && (
                  <button type="button" disabled={spendable <= 0} onClick={() => setAmount(String(Math.floor(spendable * 100) / 100))}>
                    Max
                  </button>
                )}
              </div>

              {exceedsMax && (
                <p className="ticket-error" role="alert">
                  That&apos;s more than your {formatCurrency(maxAvailable)} {side === "buy" ? spendableLabel : "position"}.
                </p>
              )}

              <div className="quote" aria-live="polite">
                <div>
                  <small>{side === "buy" ? "You pay" : "You sell"}</small>
                  <b>{payLine}</b>
                </div>
                <div>
                  <small>{side === "buy" ? "You get" : "You receive"}</small>
                  <b>{getLine}</b>
                </div>
                <div>
                  <small>Route</small>
                  <b>{routeLine}</b>
                </div>
                <div>
                  <small>Impact · fees</small>
                  <b>{impactLine}</b>
                </div>
              </div>
              <p className="quote-src">{quoteSource}</p>

              {token && side === "buy" && (
                <div className="leg-pick">
                  <span className="eyebrow">
                    This thesis is about <em>optional</em>
                  </span>
                  <div className="seg leg" role="group" aria-label="Thesis leg">
                    <button type="button" data-leg="gap" aria-pressed={leg === "gap"} onClick={() => setLeg(leg === "gap" ? null : "gap")}>
                      The gap closes
                    </button>
                    <button type="button" data-leg="mark" aria-pressed={leg === "mark"} onClick={() => setLeg(leg === "mark" ? null : "mark")}>
                      The mark rises
                    </button>
                  </div>
                  <small className="leg-help">
                    {leg === "gap"
                      ? `Token is ${pct(token.premiumPct)} vs the mark. You are saying that number goes toward zero.`
                      : leg === "mark"
                        ? `Mark is ${formatCurrency(token.markPrice)}. You are saying the issuer re-marks higher, whatever the gap does.`
                        : "Optional. Name which move you expect; the fill carries it."}
                  </small>
                </div>
              )}

              <label className="field-label note-field">
                <span>
                  Why? <em>optional · saved on the fill</em>
                </span>
                <span className="field">
                  <textarea
                    rows={2}
                    maxLength={NOTE_MAX}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="One sentence you'd want to read back in six months…"
                  />
                </span>
              </label>
              <label className="field-label note-field">
                <span>
                  Wrong if <em>optional</em>
                </span>
                <span className="field">
                  <input type="text" maxLength={WRONG_IF_MAX} value={wrongIf} onChange={(e) => setWrongIf(e.target.value)} placeholder="The thing that would make you exit" />
                </span>
              </label>
              <label className="field-label note-field">
                <span>
                  Horizon <em>optional</em>
                </span>
                <span className="field">
                  <input type="text" maxLength={HORIZON_MAX} value={horizon} onChange={(e) => setHorizon(e.target.value)} placeholder="18 mo" />
                </span>
              </label>

              {status === "error" && error && !reviewing && (
                <p className="ticket-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className={side === "sell" ? "btn-sell" : isLive ? "btn-live" : "btn-primary"}
                disabled={!canSubmit || pending}
                aria-busy={pending || undefined}
              >
                {pending ? (isLive ? "Waiting for your wallet…" : "Filling…") : isLive ? `${side} with ${walletName}` : `${side} in practice`}
              </button>
            </>
          )}
        </fieldset>

        <p className="ticket-foot">
          {isLive ? (
            "Signed in your wallet, landed on mainnet. Solera never holds keys or funds."
          ) : (
            <>
              Simulated fill at the live price.{" "}
              <button type="button" onClick={openConnect}>
                Connect a wallet to trade for real.
              </button>
            </>
          )}
        </p>
      </form>

      {reviewing && (
        <ReviewSheet
          symbol={symbol}
          displayName={displayName}
          badge={
            token ? (
              <span className="avatar" style={{ background: fillFor(COMPANIES[token.company].color, token.company) }} aria-hidden="true">
                {COMPANIES[token.company].short}
              </span>
            ) : (
              <TickerBadge ticker={info!} />
            )
          }
          issuer={token ? token.issuer : undefined}
          side={side}
          isLive={isLive}
          dollars={dollars}
          shares={shares}
          price={price}
          priceIsLive={priceIsLive}
          payWith={payWith}
          solUsd={solUsd}
          cashBalance={cashBalance}
          investedValue={token ? 0 : computeHoldings(rawHoldings).reduce((sum, h) => sum + h.value, 0)}
          ownedValue={ownedValue}
          ownedAllocationPct={owned?.allocationPct ?? 0}
          refName={side === "buy" ? refInvestor?.name : undefined}
          thesis={{ ...thesis, leg }}
          pending={pending}
          error={status === "error" ? error : null}
          walletName={walletName}
          onConfirm={confirm}
          onClose={() => {
            if (pending) return;
            setReviewing(false);
            if (token) preIpoBuy.reset();
            else trade.reset();
          }}
        />
      )}
    </>
  );
}

function TicketSuccess({
  title,
  summary,
  rows,
  onAgain,
}: {
  title: string;
  summary: React.ReactNode;
  rows: { label: string; value: React.ReactNode }[];
  onAgain: () => void;
}) {
  return (
    <div className="ticket-success" role="status">
      <CheckCircleIcon className="h-12 w-12 text-gain" />
      <h3>{title}</h3>
      <p>{summary}</p>
      <div className="receipt">
        {rows.map((r) => (
          <div key={r.label}>
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
      </div>
      <div className="ticket-actions">
        <Link href="/portfolio" className="btn-primary">
          Go to portfolio
        </Link>
        <button type="button" className="btn-ghost" onClick={onAgain}>
          Make another trade
        </button>
      </div>
    </div>
  );
}

interface ReviewProps {
  symbol: string;
  displayName: string;
  badge: React.ReactNode;
  issuer?: string;
  side: TradeSide;
  isLive: boolean;
  dollars: number;
  shares: number;
  price: number;
  priceIsLive: boolean;
  payWith: SettlementCurrency;
  solUsd: number;
  cashBalance: number;
  investedValue: number;
  ownedValue: number;
  ownedAllocationPct: number;
  refName?: string;
  thesis: { note: string; wrongIf: string; horizon: string; leg: Leg | null };
  pending: boolean;
  error: string | null;
  walletName: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The review step as a sheet: the order, how it changes the portfolio, the
 * thesis as it will be saved, and the disclosures, verbatim, before the
 * one button that fills it.
 */
function ReviewSheet(p: ReviewProps) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { onClose, pending } = p;

  // Focus moves to the confirm button once, on open.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const isPreIpo = !!p.issuer;
  const signed = p.side === "buy" ? p.dollars : -p.dollars;
  const newInvested = p.investedValue + signed;
  const newPosition = Math.max(0, p.ownedValue + signed);
  const afterAllocation = !isPreIpo && newInvested > 1e-8 ? (newPosition / newInvested) * 100 : 0;
  const afterCash = p.cashBalance - signed;
  const hasThesis = p.thesis.note || p.thesis.wrongIf || p.thesis.horizon || p.thesis.leg;

  return (
    <div className="sheet scrim" role="presentation" onClick={() => !pending && onClose()}>
      <div className="sheet-box glass glass-era" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <p className="eyebrow">A moment of perspective</p>
            <h3 id={titleId}>Review your {p.side}.</h3>
          </div>
          <button type="button" className="btn-ghost btn-icon btn-small" aria-label="Close" onClick={onClose} disabled={pending}>
            ✕
          </button>
        </div>
        <p className="sheet-text">{p.isLive ? "Check how this order fits your portfolio." : "Check how this practice order fits your portfolio."}</p>

        <div className="review-summary">
          {p.badge}
          <div>
            <h4>
              {p.displayName} · {p.symbol}
            </h4>
            <p>{p.refName ? `Copying ${p.refName}’s holding` : p.isLive ? "Live order · settles on Solana" : "Practice order"}</p>
          </div>
        </div>
        <p className="review-amount">{formatCurrency(p.dollars)}</p>
        <p className="review-est">
          ≈ <span className="font-mono">{isPreIpo ? p.shares.toFixed(4) : formatShares(p.shares)}</span> {isPreIpo ? "tokens" : "shares"} at{" "}
          <span className="font-mono">{formatCurrency(p.price)}</span>
          {p.priceIsLive && <span className="up"> · live</span>}
        </p>

        <dl className="review-rows">
          {p.isLive && (
            <div>
              <dt>{p.side === "buy" ? "Paid in" : "Receive"}</dt>
              <dd>
                {p.payWith}
                {p.payWith === "SOL" && p.solUsd > 0 && <span className="muted"> · ≈ {(p.dollars / p.solUsd).toFixed(4)} SOL</span>}
              </dd>
            </div>
          )}
          <div>
            <dt>{p.isLive ? "To invest after order" : "Cash after order"}</dt>
            <dd>{formatCurrency(Math.max(0, afterCash))}</dd>
          </div>
          {!isPreIpo && (
            <div>
              <dt>{p.symbol} allocation</dt>
              <dd>
                {p.ownedAllocationPct.toFixed(1)}% → {afterAllocation.toFixed(1)}%
              </dd>
            </div>
          )}
          <div>
            <dt>{p.isLive ? "Fees" : "Practice fees"}</dt>
            <dd>{p.isLive ? "0.10% + network" : "$0.00"}</dd>
          </div>
        </dl>
        {!isPreIpo && <p className="disclosure">Allocation is a share of invested holdings, excluding cash.</p>}
        {!isPreIpo && afterAllocation > 40 && (
          <p className="review-warn">
            After this order, {p.symbol} would represent over 40% of invested holdings, which affects your concentration score.
          </p>
        )}

        {hasThesis && (
          <div className="review-thesis">
            {p.thesis.leg && (
              <p>
                <span className="chip mark">{p.thesis.leg === "gap" ? "The gap closes" : "The mark rises"}</span>
              </p>
            )}
            {p.thesis.note && (
              <p>
                <span className="eyebrow">Why</span>
                <br />
                {p.thesis.note}
              </p>
            )}
            {p.thesis.wrongIf && (
              <p>
                <span className="eyebrow">Wrong if</span>
                <br />
                {p.thesis.wrongIf}
              </p>
            )}
            {p.thesis.horizon && (
              <p>
                <span className="eyebrow">Horizon</span>
                <br />
                {p.thesis.horizon}
              </p>
            )}
          </div>
        )}

        <p className="disclosure">
          {isPreIpo
            ? `Real swap on Solana mainnet through Jupiter. Your wallet will ask you to sign. ${p.issuer} tokens give price exposure to the company; they are not shares and carry no ownership, votes, or place on the share register. Issued by ${p.issuer}, not Solera; availability depends on where you live. Not financial advice.`
            : p.isLive
              ? `This is a real swap through Jupiter on Solana mainnet. Your wallet will ask you to sign. The final amount can differ slightly from the estimate. ${p.symbol} is issued by a third party, not by Solera; whether you may hold it depends on where you live, and xStocks are not offered to US persons. Copying a holding does not guarantee a return.`
              : "Simulated funds and prices. No real order is placed. Copying a holding does not guarantee a return."}
        </p>
        {p.error && (
          <p role="alert" className="ticket-error mt-3">
            {p.error}
          </p>
        )}

        <div className="sheet-actions mt-4">
          <button
            ref={confirmRef}
            type="button"
            className={`${p.side === "sell" ? "btn-sell" : p.isLive ? "btn-live" : "btn-primary"} flex-1`}
            onClick={p.onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending
              ? p.isLive
                ? "Waiting for your wallet…"
                : "Placing practice order…"
              : p.isLive
                ? `Confirm ${p.side} · sign in ${p.walletName}`
                : `Confirm practice ${p.side}`}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            Edit order
          </button>
        </div>
      </div>
    </div>
  );
}
