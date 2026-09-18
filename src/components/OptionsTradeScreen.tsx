"use client";
import { LoadingState } from "@/components/LoadingState";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getTickerInfo } from "@/lib/catalog";
import { contractCost, daysToExpiration, findOptionContract, formatExpiration, isExpired } from "@/lib/options";
import { formatCurrency } from "@/lib/format";
import { useExecuteOptionsTrade } from "@/hooks/use-execute-options-trade";
import { usePortfolio } from "@/hooks/use-portfolio";
import type { TickerSymbol } from "@/lib/types";
import { TopBar } from "./TopBar";
import { TickerBadge } from "./TickerBadge";
import { CheckCircleIcon, MinusIcon, PlusIcon } from "./icons";

/**
 * Buy-only options flow — no writing/selling, so there's no assignment risk
 * to model (see the design conversation this came out of). Structurally
 * close to TradeScreen, but contracts are a whole-number stepper rather
 * than a dollar slider, and the risk line stays visible throughout rather
 * than only appearing in review — this is real leveraged risk, not a
 * regular share purchase, and shouldn't read as one.
 */
export function OptionsTradeScreen() {
  const router = useRouter();
  const params = useParams<{ ticker: string; contractId: string }>();
  const symbol = params.ticker as TickerSymbol;
  const ticker = getTickerInfo(symbol);
  const contract = ticker ? findOptionContract(symbol, params.contractId) : undefined;

  const [reviewing, setReviewing] = useState(false);
  const [contracts, setContracts] = useState(1);
  const { status, result, error, run, reset } = useExecuteOptionsTrade();
  const { cashBalance, recordOptionsTrade, isLoaded } = usePortfolio();

  if (!ticker || !contract) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Option" />
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-400">
          We couldn&apos;t find that contract. It may have expired.
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title={symbol} />
        <LoadingState />
      </div>
    );
  }

  const expired = isExpired(contract.expiration);
  const maxContracts = Math.max(0, Math.floor(cashBalance / (contract.premium * 100)));
  const totalCost = contractCost(contract.premium, contracts);
  const canSubmit = !expired && contracts > 0 && contracts <= maxContracts;
  const label = `${symbol} ${formatCurrency(contract.strike)} ${contract.side === "call" ? "Call" : "Put"}`;

  const handleConfirm = async () => {
    if (!canSubmit || status === "pending") return;
    // No celebration effect here on purpose (see celebrateTrade on the
    // equity flow) — this is real leveraged risk, and treating a fill like
    // a win is exactly the kind of nudge that's caused real harm elsewhere.
    await run({ contract, contracts }, (fill) => {
      recordOptionsTrade({ contract, contracts: fill.contracts });
    });
  };

  if (status === "success" && result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <CheckCircleIcon className="h-16 w-16 text-emerald-500" />
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Demo order complete</h1>
          <p className="mt-1 text-sm text-neutral-500">
            You bought <span className="font-mono">{result.contracts}</span> {label} contract
            {result.contracts === 1 ? "" : "s"} for <span className="font-mono">{formatCurrency(result.totalValue)}</span>
          </p>
        </div>

        <div className="mt-2 w-full max-w-xs rounded-2xl bg-neutral-50 px-4 py-3 text-left text-xs">
          <div className="flex justify-between py-1 text-neutral-400">
            <span>Premium per share</span>
            <span className="font-mono font-medium text-neutral-600">{formatCurrency(result.premium)}</span>
          </div>
          <div className="flex justify-between py-1 text-neutral-400">
            <span>Expires</span>
            <span className="font-mono font-medium text-neutral-600">{formatExpiration(result.expiration)}</span>
          </div>
          <div className="flex justify-between py-1 text-neutral-400">
            <span>Reference</span>
            <span className="font-mono font-medium text-neutral-600">{result.txId}</span>
          </div>
        </div>

        <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
          <button type="button" onClick={() => router.push("/portfolio")} className="btn-primary w-full">
            Go to portfolio
          </button>
          <button
            type="button"
            onClick={() => {
              setReviewing(false);
              setContracts(1);
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
    const afterCash = cashBalance - totalCost;
    return (
      <div className="flex flex-1 flex-col">
        <div className="page-heading">
          <p className="eyebrow">A moment of perspective</p>
          <h1>Review your option.</h1>
          <p>Check this simulated order before confirming.</p>
        </div>
        <div className="mx-5 rounded-3xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <TickerBadge ticker={ticker} />
            <div>
              <h2 className="font-semibold">{label}</h2>
              <p className="text-xs text-neutral-500">Expires {formatExpiration(contract.expiration)}</p>
            </div>
          </div>
          <p className="mt-6 font-mono text-4xl font-semibold">{formatCurrency(totalCost)}</p>
          <p className="mt-2 text-sm text-neutral-500">
            <span className="font-mono">{contracts}</span> contract{contracts === 1 ? "" : "s"} at{" "}
            <span className="font-mono">{formatCurrency(contract.premium)}</span>/share ×100
          </p>
          <dl className="mt-6 space-y-4 border-t border-neutral-100 pt-5 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Cash after order</dt>
              <dd className="font-mono">{formatCurrency(Math.max(0, afterCash))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Days to expiration</dt>
              <dd className="font-mono">{daysToExpiration(contract.expiration)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Demo fees</dt>
              <dd className="font-mono">$0.00</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            If {symbol} doesn&apos;t move the way you&apos;re betting on by {formatExpiration(contract.expiration)},
            this contract can expire worthless — the most you can lose is the {formatCurrency(totalCost)} you paid.
          </p>
        </div>
        <div className="mt-auto p-5">
          <p className="mb-4 text-xs leading-relaxed text-neutral-500">
            Simulated funds and prices. No real order is placed.
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
            {status === "pending" ? "Placing demo order…" : "Confirm demo buy"}
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
      <TopBar heading={false} title={label} />

      <div className="flex flex-col items-center gap-1 px-5 pb-2 pt-2 text-center">
        <TickerBadge ticker={ticker} size="lg" />
        <h1 className="mt-2 text-base font-semibold text-neutral-900">
          {ticker.name} <span className="text-neutral-400">· {label}</span>
        </h1>
        <p className="text-xs text-neutral-400">
          Expires <span className="font-mono">{formatExpiration(contract.expiration)}</span> ·{" "}
          <span className="font-mono">{daysToExpiration(contract.expiration)}</span> days
        </p>
      </div>

      <p className="mx-5 mt-2 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-xs leading-relaxed text-amber-900">
        Options can expire worthless. The most you can lose on this order is what you pay for it.
      </p>

      {expired ? (
        <div className="mx-5 mt-4 rounded-2xl border border-neutral-100 p-6 text-center text-sm text-neutral-400">
          This contract has expired.
        </div>
      ) : (
        <div className="card-elevated relative mx-5 mt-4 flex flex-col items-center overflow-hidden rounded-3xl border border-neutral-100 p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Contracts to buy</p>
          <div className="mt-3 flex items-center gap-5">
            <button
              type="button"
              aria-label="Fewer contracts"
              onClick={() => setContracts((c) => Math.max(1, c - 1))}
              disabled={contracts <= 1}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 active:bg-neutral-200 disabled:opacity-40"
            >
              <MinusIcon className="h-4 w-4" />
            </button>
            <span className="w-16 text-center font-mono text-4xl font-semibold tabular-nums text-neutral-900">
              {contracts}
            </span>
            <button
              type="button"
              aria-label="More contracts"
              onClick={() => setContracts((c) => Math.min(maxContracts || 1, c + 1))}
              disabled={contracts >= maxContracts}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 active:bg-neutral-200 disabled:opacity-40"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            Premium <span className="font-mono">{formatCurrency(contract.premium)}</span>/share × 100 × {contracts}
          </p>
          <p className="mt-4 font-mono text-2xl font-semibold text-neutral-900">{formatCurrency(totalCost)}</p>
          <p className="mt-1 text-xs text-neutral-400">total cost</p>
          <p className="mt-3 text-xs text-neutral-400">
            <span className="font-mono">{formatCurrency(cashBalance)}</span> cash available ·{" "}
            <span className="font-mono">{maxContracts}</span> contract{maxContracts === 1 ? "" : "s"} max
          </p>
        </div>
      )}

      <div className="mt-auto px-5 pb-6 pt-4">
        <p className="mb-3 text-center text-xs text-neutral-500">
          Practice trade · Simulated funds · No real order is placed
        </p>
        <button
          type="button"
          onClick={() => setReviewing(true)}
          disabled={status === "pending" || !canSubmit}
          className="btn-primary w-full disabled:opacity-50"
        >
          Review order
        </button>
      </div>
    </div>
  );
}
