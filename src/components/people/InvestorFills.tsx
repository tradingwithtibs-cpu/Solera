"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PublicFill } from "@/lib/fills";
import { mergeWalletHistory } from "@/lib/activity";
import { formatCurrency, formatShares } from "@/lib/format";
import { symbolForMint } from "@/lib/catalog";
import { shortAddress } from "@/lib/investors";

type Source = { status: "loading" } | { status: "ready"; fills: PublicFill[] } | { status: "error" };

const stamp = (ts: number) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function useFills(url: string | null): Source {
  const [state, setState] = useState<Source>({ status: "loading" });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { fills?: PublicFill[] };
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", fills: data.fills ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

/**
 * TRADES (pages.md §3.8): the fills this wallet made through Solera, each
 * with its note, merged with the tokenized-stock swaps it made anywhere,
 * read from its recent transactions on the chain (GET /api/activity). Most
 * wallets on the leaderboard have never touched Solera, so the on-chain
 * rows are usually the whole story. Practice fills are labelled; every
 * on-chain row links to Solscan. Mount with `key={owner}` so a new wallet
 * starts from loading.
 */
export function InvestorFills({ owner, onChain }: { owner: string; onChain: boolean }) {
  const solera = useFills(onChain ? `/api/fills?owner=${encodeURIComponent(owner)}&limit=50` : null);
  const chain = useFills(onChain ? `/api/activity?wallets=${encodeURIComponent(owner)}` : null);

  const fills = useMemo(
    () => mergeWalletHistory(solera.status === "ready" ? solera.fills : [], chain.status === "ready" ? chain.fills : []),
    [solera, chain],
  );

  if (!onChain) return <p className="people-note">No trades on Solera yet.</p>;

  const loading = solera.status === "loading" || chain.status === "loading";
  if (loading && fills.length === 0) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading trades">
        <div className="skeleton fill-skeleton" />
        <div className="skeleton fill-skeleton" />
      </div>
    );
  }
  if (fills.length === 0) {
    if (solera.status === "error" && chain.status === "error") {
      return <p className="people-note">Trades couldn&apos;t be read right now. Holdings above are read from the chain.</p>;
    }
    return (
      <p className="people-note">
        No tokenized-stock swaps in this wallet&apos;s recent transactions, and none on Solera yet. Holdings above are read from the chain.{" "}
        <a href={`https://solscan.io/account/${owner}`} target="_blank" rel="noreferrer">
          Every transaction on Solscan ↗
        </a>
      </p>
    );
  }

  return (
    <>
      <ul className="fills-list">
        {fills.map((f) => {
          const sym = f.ticker ?? (f.mint ? (symbolForMint(f.mint) ?? shortAddress(f.mint)) : "—");
          const sig = f.signature;
          return (
            <li key={f.id} className="fill-row" data-sym={sym}>
              <div className="fill-main">
                <b>
                  {f.side === "buy" ? "Bought" : "Sold"} {formatShares(f.quantity)} {f.ticker ? <Link href={`/asset/${f.ticker}`}>{sym}</Link> : sym}
                </b>
                <small>
                  {formatCurrency(f.totalValue)} · {formatCurrency(f.pricePerShare)} each · {stamp(f.createdAt)}
                  {f.via === "chain" ? " · read from the chain" : f.via !== "ticket" && ` · via ${f.via}`}
                </small>
              </div>
              <span className="fill-chips">
                {f.leg && <span className={`chip ${f.leg}`}>{f.leg}</span>}
                {f.mode === "practice" ? (
                  <span className="chip practice">practice</span>
                ) : sig ? (
                  <a className="chip live" href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer">
                    on-chain {shortAddress(sig)} ↗
                  </a>
                ) : (
                  <span className="chip live">on-chain</span>
                )}
              </span>
              {f.note && <p className="fill-note">&ldquo;{f.note}&rdquo;</p>}
              {f.wrongIf && (
                <p className="fill-note">
                  <b>Wrong if:</b> &ldquo;{f.wrongIf}&rdquo;
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {chain.status === "error" && <p className="people-note">On-chain history couldn&apos;t be read right now; these are the trades made through Solera.</p>}
      {chain.status === "loading" && <p className="people-note">Reading this wallet&apos;s recent transactions…</p>}
    </>
  );
}
