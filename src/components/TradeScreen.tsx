"use client";
import { SegmentedControl } from "./SegmentedControl";
import { LoadingState } from "@/components/LoadingState";

import { useState, type CSSProperties } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { INVESTORS, TICKERS } from "@/lib/mock-data";
import { computeHoldings } from "@/lib/portfolio";
import { formatCurrency, formatShares } from "@/lib/format";
import { useExecuteTrade } from "@/hooks/use-execute-trade";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { solscanTxUrl } from "@/lib/jupiter";
import { celebrateTrade } from "@/lib/celebrate";
import { SOL_FEE_RESERVE, type SettlementCurrency } from "@/lib/tokens";
import type { TickerSymbol, TradeSide } from "@/lib/types";
import { TopBar } from "./TopBar";
import { TickerBadge } from "./TickerBadge";
import { CheckCircleIcon } from "./icons";

const BUY_QUICK_AMOUNTS = [25, 50, 100, 250];
const SELL_QUICK_PERCENTS = [25, 50, 75, 100];

export function TradeScreen() {
  const router = useRouter();
  const params = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const refId = searchParams.get("ref");
  const initialSide: TradeSide = searchParams.get("side") === "sell" ? "sell" : "buy";

  const symbol = params.ticker as TickerSymbol;
  const ticker = TICKERS[symbol];
  const { price: livePrice, isLive: isLivePrice } = useEffectivePrice(symbol);
  const refInvestor = refId ? INVESTORS.find((i) => i.id === refId) : undefined;

  const [reviewing, setReviewing] = useState(false);
  const [sellFraction, setSellFraction] = useState<number | null>(null);
  const [side, setSide] = useState<TradeSide>(initialSide);
  // $0 by default whenever the amount wasn't suggested by context (copying
  // someone, or selling) — $100 only for a cold-start "just browsing" buy.
  const [amount, setAmount] = useState(initialSide === "sell" || refInvestor ? "0" : "100");
  // Live trades settle in SOL by default — it's what every Solana wallet holds.
  const [payWith, setPayWith] = useState<SettlementCurrency>("SOL");
  const { status, result, error, run, reset, isLive } = useExecuteTrade();
  const { cashBalance, solBalance, usdcBalance, solUsd, holdings: rawHoldings, recordTrade, isLoaded } =
    useActivePortfolio();

  if (!ticker) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Trade" />
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-400">
          We couldn&apos;t find that asset.
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    // Avoid validating against a stale cash/position before a returning
    // visitor's real (localStorage-restored) numbers take over.
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title={`${symbol}`} />
        <LoadingState />
      </div>
    );
  }

  const ownedPosition = computeHoldings(rawHoldings).find((h) => h.ticker === symbol);
  const ownedShares = ownedPosition?.shares ?? 0;
  const ownedValue = ownedPosition?.value ?? 0;

  const changeSide = (nextSide: TradeSide) => {
    setSide(nextSide);
    setSellFraction(null);
    setAmount(nextSide === "sell" || refInvestor ? "0" : "100");
  };

  const numericAmount =
    side === "sell" && sellFraction !== null ? ownedValue * sellFraction : Math.max(0, Number(amount) || 0);
  const estimatedShares =
    side === "sell" && sellFraction !== null
      ? ownedShares * sellFraction
      : livePrice > 0
        ? numericAmount / livePrice
        : 0;
  // What a buy can be capped at, in dollars: in live mode only the chosen
  // settlement currency counts (SOL keeps a small reserve for network fees);
  // in practice mode it's the practice cash balance.
  const spendable = !isLive
    ? cashBalance
    : payWith === "SOL"
      ? Math.max(0, solBalance - SOL_FEE_RESERVE) * solUsd
      : usdcBalance;
  const spendableLabel = !isLive ? "cash available" : payWith === "SOL" ? "in SOL available" : "in USDC available";
  const maxAvailable = side === "buy" ? spendable : ownedValue;
  const exceedsMax = numericAmount > maxAvailable;
  const canSubmit =
    Number.isFinite(numericAmount) && numericAmount > 0 && !exceedsMax && (side === "buy" || ownedShares > 0);

  // Slider bounds: buy can start at $0, sell starts at $1 (selling "$0"
  // isn't a meaningful action). The card wash behind it (a two-color
  // gradient) intensifies toward a side-specific palette as the slider
  // approaches the max you can actually afford/hold — a visual sense of
  // "how big a bet is this." The slider itself is a single solid color per
  // side, deliberately not a second gradient, so the two don't visually
  // fight each other.
  const sliderMin = 0;
  const sliderMax = Math.max(0, Math.floor(maxAvailable * 100) / 100);
  const sliderPct =
    sliderMax > sliderMin ? (Math.min(numericAmount, sliderMax) - sliderMin) / (sliderMax - sliderMin) : 0;
  const [gradientFrom, gradientTo] = side === "buy" ? ["#4c6fff", "#9b5cf7"] : ["#f59e0b", "#e11d48"];
  const sliderColor = side === "buy" ? "#5b4fd6" : "#9f3545";
  const sliderTrackStyle = {
    background: `linear-gradient(to right, ${sliderColor} 0%, ${sliderColor} ${sliderPct * 100}%, #e5e7eb ${sliderPct * 100}%, #e5e7eb 100%)`,
    "--thumb-color": sliderColor,
  } as CSSProperties;

  const handleConfirm = async () => {
    if (!canSubmit || status === "pending") return;
    const tradeResult = await run(
      { ticker: symbol, side, quantity: estimatedShares, totalValue: numericAmount, payWith },
      (fill) => {
        recordTrade({
          ticker: fill.ticker,
          side: fill.side,
          quantity: fill.quantity,
          pricePerShare: fill.pricePerShare,
          totalValue: fill.totalValue,
          txId: fill.txId,
          copiedFromInvestorId: side === "buy" ? refInvestor?.id : undefined,
        });
      },
    );
    if (tradeResult) {
      celebrateTrade();
    }
  };

  if (status === "success" && result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <CheckCircleIcon className="h-16 w-16 text-emerald-500" />
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            {result.mode === "live" ? "Order filled on Solana" : "Practice order complete"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            You {result.side === "buy" ? "bought" : "sold"}{" "}
            <span className="font-mono">{formatCurrency(result.totalValue)}</span> of {result.ticker} (≈{" "}
            <span className="font-mono">{formatShares(result.quantity)}</span> shares)
            {result.settledIn && result.settledAmount !== undefined && (
              <>
                {" "}
                {result.side === "buy" ? "for" : "and received"}{" "}
                <span className="font-mono">
                  {result.settledAmount.toFixed(result.settledIn === "SOL" ? 4 : 2)} {result.settledIn}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="mt-2 w-full max-w-xs rounded-2xl bg-neutral-50 px-4 py-3 text-left text-xs">
          <div className="flex justify-between py-1 text-neutral-400">
            <span>Price per share</span>
            <span className="font-mono font-medium text-neutral-600">
              {formatCurrency(result.pricePerShare)}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-1 text-neutral-400">
            <span>{result.mode === "live" ? "Transaction" : "Reference"}</span>
            {result.mode === "live" ? (
              <a
                href={solscanTxUrl(result.txId)}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono font-medium text-violet-600 underline"
              >
                {result.txId.slice(0, 8)}…{result.txId.slice(-6)} ↗
              </a>
            ) : (
              <span className="font-mono font-medium text-neutral-600">{result.txId}</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push("/portfolio")}
            className="btn-primary w-full"
          >
            Go to portfolio
          </button>
          <button
            type="button"
            onClick={() => {
              setReviewing(false);
              setSellFraction(null);
              setAmount(side === "sell" || refInvestor ? "0" : "100");
              reset();
            }}
            className="rounded-full py-3 text-sm font-semibold text-neutral-500"
          >
            Make another trade
          </button>
        </div>
      </div>
    );
  }

  if (reviewing) {
    const investedValue = computeHoldings(rawHoldings).reduce((sum, h) => sum + h.value, 0);
    const newInvestedValue = investedValue + (side === "buy" ? numericAmount : -numericAmount);
    const newPositionValue = Math.max(0, ownedValue + (side === "buy" ? numericAmount : -numericAmount));
    const afterAllocation = newInvestedValue > 1e-8 ? (newPositionValue / newInvestedValue) * 100 : 0;
    const afterCash = cashBalance + (side === "buy" ? -numericAmount : numericAmount);
    return (
      <div className="flex flex-1 flex-col">
        <div className="page-heading">
          <p className="eyebrow">A moment of perspective</p>
          <h1>Review your {side}.</h1>
          <p>{isLive ? "Check how this order fits your portfolio." : "Check how this practice order fits your portfolio."}</p>
        </div>
        <div className="mx-5 rounded-3xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <TickerBadge ticker={ticker} />
            <div>
              <h2 className="font-semibold">
                {ticker.name} · {symbol}
              </h2>
              <p className="text-xs text-neutral-500">
                {side === "buy" && refInvestor
                  ? `Copying ${refInvestor.name}’s holding`
                  : isLive
                    ? "Live order · settles on Solana"
                    : "Practice order"}
              </p>
            </div>
          </div>
          <p className="mt-6 font-mono text-4xl font-semibold">{formatCurrency(numericAmount)}</p>
          <p className="mt-2 text-sm text-neutral-500">
            ≈ <span className="font-mono">{formatShares(estimatedShares)}</span> shares at{" "}
            <span className="font-mono">{formatCurrency(livePrice)}</span>
            {isLivePrice && <span className="text-emerald-600"> · live</span>}
          </p>
          <dl className="mt-6 space-y-4 border-t border-neutral-100 pt-5 text-sm">
            {isLive && (
              <div className="flex justify-between gap-3">
                <dt>{side === "buy" ? "Paid in" : "Receive"}</dt>
                <dd className="font-mono">
                  {payWith}
                  {payWith === "SOL" && solUsd > 0 && (
                    <span className="text-neutral-500"> · ≈ {(numericAmount / solUsd).toFixed(4)} SOL</span>
                  )}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt>{isLive ? "To invest after order" : "Cash after order"}</dt>
              <dd className="font-mono">{formatCurrency(Math.max(0, afterCash))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>{symbol} allocation</dt>
              <dd className="font-mono">
                {(ownedPosition?.allocationPct ?? 0).toFixed(1)}% → {afterAllocation.toFixed(1)}%
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>{isLive ? "Fees" : "Practice fees"}</dt>
              <dd className="font-mono">{isLive ? "0.10% + network" : "$0.00"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-neutral-500">
            Allocation is a share of invested holdings, excluding cash.
          </p>
          {afterAllocation > 40 && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              After this order, {symbol} would represent over 40% of invested holdings, which affects your
              concentration score.
            </p>
          )}
        </div>
        <div className="mt-auto p-5">
          <p className="mb-4 text-xs leading-relaxed text-neutral-500">
            {isLive
              ? "This is a real swap through Jupiter on Solana mainnet. Your wallet will ask you to sign. The final amount can differ slightly from the estimate. Copying a holding does not guarantee a return."
              : "Simulated funds and prices. No real order is placed. Copying a holding does not guarantee a return."}
          </p>
          {error && (
            <p role="alert" className="mb-4 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            className="btn-primary w-full disabled:opacity-50"
            onClick={handleConfirm}
            disabled={!canSubmit || status === "pending"}
          >
            {status === "pending"
              ? isLive
                ? "Waiting for your wallet…"
                : "Placing practice order…"
              : isLive
                ? `Confirm ${side} · sign in wallet`
                : `Confirm practice ${side}`}
          </button>
          <button
            className="btn-secondary mt-3 w-full"
            disabled={status === "pending"}
            onClick={() => {
              setReviewing(false);
              reset();
            }}
          >
            Edit order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar heading={false} title={`${side === "buy" ? "Buy" : "Sell"} ${symbol}`} />

      <div className="flex flex-col items-center gap-1 px-5 pb-2 pt-2 text-center">
        <TickerBadge ticker={ticker} size="lg" />
        <h1 className="mt-2 text-base font-semibold text-neutral-900">
          {ticker.name} <span className="text-neutral-400">· {symbol}</span>
        </h1>
        <p className="text-xs text-neutral-400">
          <span className="font-mono">{formatCurrency(livePrice)}</span> per share{" "}
          {isLivePrice ? <span className="font-medium text-emerald-600">· live</span> : "(simulated)"}
        </p>
      </div>

      <fieldset disabled={status === "pending"} className="contents">
        <div className="mx-5 mt-2">
          <SegmentedControl
            label="Trade side"
            value={side}
            onChange={changeSide}
            options={[
              { value: "buy", label: "Buy" },
              { value: "sell", label: "Sell" },
            ]}
          />
        </div>

        {isLive && (
          <div className="mx-5 mt-3 flex items-center justify-between gap-3 text-xs">
            <span className="text-neutral-500">{side === "buy" ? "Pay with" : "Receive"}</span>
            <div className="flex rounded-full bg-neutral-100 p-0.5 font-semibold">
              {(["SOL", "USDC"] as const).map((currency) => (
                <button
                  key={currency}
                  type="button"
                  onClick={() => setPayWith(currency)}
                  className={`rounded-full px-3 py-1 ${payWith === currency ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
                >
                  {currency}
                </button>
              ))}
            </div>
          </div>
        )}

        {side === "buy" && refInvestor && (
          <div className="mx-5 mb-2 mt-2 rounded-xl bg-violet-50 px-4 py-2.5 text-center text-xs text-violet-700">
            <p>
              Copying <span className="font-semibold">{refInvestor.name}</span>&apos;s {symbol} position
            </p>
            <p className="mt-1 text-violet-400">Reflects their public holdings — not financial advice.</p>
          </div>
        )}

        {side === "sell" && ownedShares === 0 ? (
          <div className="mx-5 mt-4 rounded-2xl border border-neutral-100 p-6 text-center text-sm text-neutral-400">
            You don&apos;t own any {symbol} to sell.
          </div>
        ) : (
          <div className="card-elevated relative mx-5 mt-2 flex flex-col items-center overflow-hidden rounded-3xl border border-neutral-100 p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                opacity: 0.04 + sliderPct * 0.08,
              }}
            />
            <p className="relative text-xs font-medium uppercase tracking-wide text-neutral-400">
              {side === "buy" ? "Amount to invest" : "Amount to sell"}
            </p>
            <div className="relative mt-2 flex items-center justify-center gap-1">
              <span className="font-mono text-3xl font-semibold text-neutral-300">$</span>
              <input
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
                className="w-full max-w-64 border-none bg-transparent text-center font-mono text-4xl font-semibold tabular-nums text-neutral-900 outline-none"
              />
            </div>
            <p className="relative mt-1 text-xs text-neutral-400">
              ≈ <span className="font-mono">{formatShares(estimatedShares)}</span> shares of {symbol}
            </p>

            {sliderMax > sliderMin && (
              <div className="relative mt-4 w-full px-1">
                <input
                  type="range"
                  className="trade-slider"
                  min={sliderMin}
                  max={sliderMax}
                  step={0.01}
                  value={Math.min(Math.max(numericAmount, sliderMin), sliderMax)}
                  onChange={(e) => {
                    setSellFraction(null);
                    setAmount(e.target.value);
                  }}
                  style={sliderTrackStyle}
                  aria-label={`Drag to set amount to ${side}`}
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-neutral-400">
                  <span>{formatCurrency(sliderMin)}</span>
                  <span>{formatCurrency(sliderMax)}</span>
                </div>
              </div>
            )}

            <div className="relative mt-3 flex flex-wrap justify-center gap-2">
              {side === "buy"
                ? BUY_QUICK_AMOUNTS.map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      disabled={quick > spendable}
                      onClick={() => setAmount(String(quick))}
                      className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-xs font-semibold text-neutral-600 active:bg-neutral-200"
                    >
                      ${quick}
                    </button>
                  ))
                : SELL_QUICK_PERCENTS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setSellFraction(pct / 100);
                        setAmount(((pct / 100) * ownedValue).toFixed(2));
                      }}
                      className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-xs font-semibold text-neutral-600 active:bg-neutral-200"
                    >
                      {pct}%
                    </button>
                  ))}
              {side === "buy" && (
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.floor(spendable * 100) / 100))}
                  className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-xs font-semibold text-neutral-600 active:bg-neutral-200"
                >
                  Max
                </button>
              )}
            </div>
            <p className="relative mt-3 text-xs text-neutral-400">
              <span className="font-mono">{formatCurrency(maxAvailable)}</span>{" "}
              {side === "buy" ? spendableLabel : "position value"}
              {side === "buy" && isLive && payWith === "SOL" && (
                <span className="block">
                  <span className="font-mono">{solBalance.toFixed(4)} SOL</span> in wallet · 0.01 kept for fees
                </span>
              )}
            </p>
          </div>
        )}
      </fieldset>
      {exceedsMax && (
        <p className="mx-5 mt-3 text-center text-xs text-rose-500">
          That&apos;s more than your <span className="font-mono">{formatCurrency(maxAvailable)}</span>{" "}
          {side === "buy" ? spendableLabel : "position"}.
        </p>
      )}
      {status === "error" && (
        <p className="mx-5 mt-3 text-center text-xs text-rose-500">
          {error ?? "Something went wrong. Please try again."}
        </p>
      )}

      <div className="mt-auto px-5 pb-6 pt-4">
        <p className="mb-3 text-center text-xs text-neutral-500">
          {isLive
            ? `Live trade · Settles on Solana via Jupiter · ${side === "buy" ? "Paid in" : "Receive"} ${payWith}`
            : "Practice trade · Simulated funds · No real order is placed"}
        </p>
        <button
          type="button"
          onClick={() => setReviewing(true)}
          disabled={status === "pending" || !canSubmit}
          style={{ background: sliderColor }}
          className="flex w-full items-center justify-center rounded-full py-3.5 text-sm font-semibold text-white transition active:opacity-90 disabled:opacity-50"
        >
          {status === "pending" ? "Placing order…" : `Review ${symbol} ${side}`}
        </button>
      </div>
    </div>
  );
}
