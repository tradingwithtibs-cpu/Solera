"use client";

import Link from "next/link";
import { Panel } from "@/components/panels/Panel";
import { useNotes } from "@/hooks/use-notes";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { usePreviousVisit, useVisitWriter, type VisitInput } from "@/hooks/use-visit";
import { getEffectivePrice, isLivePriced } from "@/lib/live-prices";
import { XSTOCK_TOKENS } from "@/lib/tokens";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useNow } from "./use-now";
import { usePortfolioView } from "./use-portfolio-view";

const MIN_MOVE_PCT = 0.05;
const MIN_GAP_PTS = 0.3;

function rel(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 2) return "a moment ago";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

interface Row {
  key: string;
  kind: string;
  body: React.ReactNode;
  /** Where the row goes; a plain div when there is nowhere to go. */
  href?: string;
  onClick?: () => void;
}

/**
 * What changed since this browser last looked: balance, movers you hold,
 * pre-IPO gaps and your own unmarked "wrong if" lines. Every row comes
 * from a real figure; with nothing to compare the card says so.
 */
export function SincePanel({ id }: { id: string }) {
  const view = usePortfolioView();
  const { tokens } = usePreIpo();
  const { notes } = useNotes();
  const visit = usePreviousVisit();
  const now = useNow();

  // Only real numbers go into the snapshot: the loaded balance and live prices.
  const priced = view.equity.every((p) => isLivePriced(p.ticker));
  const prices: Record<string, number> = {};
  for (const t of new Set([...Object.keys(XSTOCK_TOKENS), ...view.equity.map((p) => p.ticker)])) {
    if (isLivePriced(t)) prices[t] = getEffectivePrice(t);
  }
  const gaps: Record<string, number> = {};
  for (const t of tokens) if (Number.isFinite(t.premiumPct)) gaps[t.symbol] = t.premiumPct;
  const current: VisitInput | null = view.isLoaded && priced ? { total: view.totalValue, prices, gaps } : null;
  useVisitWriter(current);

  const rows: Row[] = [];
  if (visit && now !== null && current) {
    const d = view.totalValue - visit.total;
    if (Math.abs(d) >= 0.005) {
      rows.push({
        key: "balance",
        kind: "Balance",
        body: (
          <>
            <b className={d >= 0 ? "up" : "down"}>
              {d >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(d))}
            </b>{" "}
            since {rel(now - visit.at)} · now {formatCurrency(view.totalValue)}
          </>
        ),
      });
    }
    view.equity
      .map((p) => {
        const prev = visit.prices[p.ticker];
        return prev ? { p, move: ((p.price - prev) / prev) * 100 } : null;
      })
      .filter((m): m is { p: (typeof view.equity)[number]; move: number } => m !== null && Math.abs(m.move) >= MIN_MOVE_PCT)
      .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))
      .slice(0, 3)
      .forEach(({ p, move }) =>
        rows.push({
          key: `held-${p.ticker}`,
          kind: "Held",
          href: `/asset/${p.ticker}`,
          body: (
            <>
              <b>{p.ticker}</b> moved <b className={move >= 0 ? "up" : "down"}>{formatPercent(move)}</b> · {formatCurrency(p.price)}
            </>
          ),
        }),
      );
    tokens
      .map((t) => {
        const prev = visit.gaps[t.symbol];
        return typeof prev === "number" && Number.isFinite(t.premiumPct) ? { t, d: t.premiumPct - prev } : null;
      })
      .filter((g): g is { t: (typeof tokens)[number]; d: number } => g !== null && Math.abs(g.d) >= MIN_GAP_PTS)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 2)
      .forEach(({ t, d }) =>
        rows.push({
          key: `gap-${t.symbol}`,
          kind: "Gap",
          href: "/pre-ipo",
          body: (
            <>
              <b>{t.symbol}</b> gap {d > 0 ? "widened" : "narrowed"} {Math.abs(d).toFixed(1)} pts · now{" "}
              <b className={t.premiumPct >= 0 ? "up" : "down"}>{formatPercent(t.premiumPct)}</b> vs mark
            </>
          ),
        }),
      );
  }
  view.positions
    .map((p) => ({ p, note: notes[p.key] }))
    .filter(({ note }) => note && note.wrongIf && !note.wrongHitAt)
    .slice(0, 2)
    .forEach(({ p, note }) =>
      rows.push({
        key: `wrote-${p.key}`,
        kind: "You wrote",
        onClick: () => document.getElementById(`pos-${p.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
        body: (
          <>
            <b>{p.kind === "xstock" ? p.ticker : p.symbol}</b> is wrong if “{note!.wrongIf}” — still true?
          </>
        ),
      }),
    );

  const subtitle = visit && now !== null ? `${rel(now - visit.at)} · what moved, who traded, what you wrote` : "first visit";

  return (
    <Panel id={id} title="Since you last looked" subtitle={subtitle}>
      <ul className="pf-since">
        {rows.length === 0 ? (
          <li className="pf-since-empty">
            Nothing yet. Come back after a few minutes and this fills in: balance change, movers you hold, gaps, trades by people you follow, and your
            own “wrong if” lines.
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.key}>
              {row.href ? (
                <Link href={row.href}>
                  <small>{row.kind}</small>
                  <span>{row.body}</span>
                </Link>
              ) : row.onClick ? (
                <button type="button" onClick={row.onClick}>
                  <small>{row.kind}</small>
                  <span>{row.body}</span>
                </button>
              ) : (
                <div>
                  <small>{row.kind}</small>
                  <span>{row.body}</span>
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}
