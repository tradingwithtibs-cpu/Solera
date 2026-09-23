"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicFill } from "@/lib/fills";
import { formatCurrency, formatShares } from "@/lib/format";
import { symbolForMint } from "@/lib/catalog";
import { shortAddress } from "@/lib/investors";

type State = { status: "loading" } | { status: "ready"; fills: PublicFill[] } | { status: "error" };

const stamp = (ts: number) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * FILLS ON SOLERA (pages.md §3.8): only the fills this wallet made through
 * Solera, from GET /api/fills?owner=, each with its note. Practice fills are
 * labelled; on-chain fills link to Solscan. Mount with `key={owner}` so a
 * new wallet starts from loading.
 */
export function InvestorFills({ owner, onChain }: { owner: string; onChain: boolean }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!onChain) return; // sample profiles have no owner the route accepts
    let cancelled = false;
    fetch(`/api/fills?owner=${encodeURIComponent(owner)}&limit=50`)
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
  }, [owner, onChain]);

  const view: State = onChain ? state : { status: "ready", fills: [] };

  if (view.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading fills">
        <div className="skeleton fill-skeleton" />
        <div className="skeleton fill-skeleton" />
      </div>
    );
  }
  if (view.status === "error") {
    return <p className="people-note">Fills couldn&apos;t be read right now. Holdings above are read from the chain.</p>;
  }
  if (view.fills.length === 0) {
    return <p className="people-note">No fills on Solera yet.{onChain && " Holdings above are read from the chain."}</p>;
  }

  return (
    <ul className="fills-list">
      {view.fills.map((f) => {
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
                {f.via !== "ticket" && ` · via ${f.via}`}
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
  );
}
