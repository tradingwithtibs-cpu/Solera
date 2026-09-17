"use client";

import { useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { COMPANIES, formatValuation, jupiterSwapUrl, type PreIpoToken } from "@/lib/pre-ipo";
import { formatCurrency } from "@/lib/format";
import { solscanTxUrl } from "@/lib/jupiter";
import { SOL_FEE_RESERVE, type SettlementCurrency } from "@/lib/tokens";
import { usePreIpoBuy } from "@/hooks/use-pre-ipo-buy";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { celebrateTrade } from "@/lib/celebrate";
import { CheckCircleIcon } from "./icons";

const QUICK_AMOUNTS = [5, 25, 100, 250];

/**
 * Buy a pre-IPO token for real, right here. Same swap engine and same
 * "pay with SOL or USDC" choice as the xStock trade screen, in a sheet so
 * the comparison the user was reading stays behind it. Without a live
 * wallet the sheet explains what's needed and still offers Jupiter's site
 * as the way out, rather than pretending with a practice fill.
 */
export function PreIpoBuySheet({ token, onClose }: { token: PreIpoToken; onClose: () => void }) {
  const company = COMPANIES[token.company];
  const [amount, setAmount] = useState("25");
  const [payWith, setPayWith] = useState<SettlementCurrency>("SOL");
  const { status, fill, error, run, isLive } = usePreIpoBuy();
  const { solBalance, usdcBalance, solUsd, isLoaded } = useActivePortfolio();
  const { setVisible } = useWalletModal();

  const dollars = Math.max(0, Number(amount) || 0);
  const estimate = token.tokenPrice > 0 ? dollars / token.tokenPrice : 0;
  const spendable = payWith === "SOL" ? Math.max(0, solBalance - SOL_FEE_RESERVE) * solUsd : usdcBalance;
  const exceeds = isLive && dollars > spendable;
  const canSubmit = isLive && dollars > 0 && !exceeds && status !== "pending";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Buy ${token.symbol}`}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {status === "success" && fill ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircleIcon className="h-14 w-14 text-emerald-500" />
            <h2 className="text-lg font-semibold text-neutral-900">Order filled on Solana</h2>
            <p className="text-sm text-neutral-500">
              You bought <span className="font-mono">{fill.amount.toFixed(4)}</span> {token.symbol} for{" "}
              <span className="font-mono">{formatCurrency(fill.dollars)}</span> (
              <span className="font-mono">
                {fill.settledAmount.toFixed(fill.settledIn === "SOL" ? 4 : 2)} {fill.settledIn}
              </span>
              ).
            </p>
            <a
              href={solscanTxUrl(fill.signature)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-violet-600 underline"
            >
              {fill.signature.slice(0, 8)}…{fill.signature.slice(-6)} on Solscan ↗
            </a>
            <button type="button" onClick={onClose} className="btn-primary mt-2 w-full">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">{token.issuer}</p>
                <h2 className="text-lg font-semibold text-neutral-900">
                  Buy {company.name} <span className="text-neutral-400">· {token.symbol}</span>
                </h2>
                <p className="text-xs text-neutral-500">
                  <span className="font-mono">{formatCurrency(token.tokenPrice)}</span> per token · implies{" "}
                  {formatValuation(token.impliedValuation)}
                </p>
              </div>
              <button type="button" onClick={onClose} className="text-sm text-neutral-400" aria-label="Close">
                ✕
              </button>
            </div>

            {!isLive ? (
              <div className="mt-5 space-y-3 rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-600">
                <p>Pre-IPO tokens are bought for real, from your wallet. Connect one and switch to live trading.</p>
                <button type="button" onClick={() => setVisible(true)} className="btn-primary w-full">
                  Connect wallet
                </button>
                <a
                  href={jupiterSwapUrl(token.mint)}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center text-xs font-semibold text-violet-600"
                >
                  Or buy on Jupiter ↗
                </a>
              </div>
            ) : (
              <fieldset disabled={status === "pending"} className="mt-5 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Pay with</span>
                  <div className="flex rounded-full bg-neutral-100 p-0.5 font-semibold">
                    {(["SOL", "USDC"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPayWith(c)}
                        className={`rounded-full px-3 py-1 ${payWith === c ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-100 p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Amount to invest</p>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <span className="font-mono text-2xl font-semibold text-neutral-300">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => /^\d*(\.\d{0,2})?$/.test(e.target.value) && setAmount(e.target.value)}
                      aria-label="Amount to invest in dollars"
                      className="w-32 border-none bg-transparent text-center font-mono text-3xl font-semibold tabular-nums text-neutral-900 outline-none"
                    />
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    ≈ <span className="font-mono">{estimate.toFixed(4)}</span> {token.symbol}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {QUICK_AMOUNTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={q > spendable}
                        onClick={() => setAmount(String(q))}
                        className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600 disabled:opacity-40"
                      >
                        ${q}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-neutral-400">
                    <span className="font-mono">{isLoaded ? formatCurrency(spendable) : "—"}</span> in {payWith} available
                  </p>
                </div>
                {exceeds && <p className="text-center text-xs text-rose-500">That&apos;s more than your {payWith} balance.</p>}
                {error && (
                  <p role="alert" className="text-center text-xs text-rose-600">
                    {error}
                  </p>
                )}
                <p className="text-[11px] leading-relaxed text-neutral-400">
                  Real swap on Solana mainnet through Jupiter. Your wallet will ask you to sign. {token.issuer} tokens are
                  not shares; see the issuer&apos;s terms. Not financial advice.
                </p>
                <button
                  type="button"
                  className="btn-primary w-full disabled:opacity-50"
                  disabled={!canSubmit}
                  onClick={async () => {
                    const result = await run(token, dollars, payWith);
                    if (result) celebrateTrade();
                  }}
                >
                  {status === "pending" ? "Waiting for your wallet…" : `Buy ${token.symbol} · sign in wallet`}
                </button>
              </fieldset>
            )}
          </>
        )}
      </div>
    </div>
  );
}
