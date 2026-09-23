"use client";

import Link from "next/link";
import { TickerBadge } from "@/components/TickerBadge";
import { getTickerInfo } from "@/lib/catalog";
import { getEffectiveHistory } from "@/lib/live-prices";
import { HORIZON_MAX, NOTE_MAX, WRONG_IF_MAX, type PositionNote, type PositionNoteInput } from "@/lib/notes";
import { fillFor } from "@/lib/palette";
import { COMPANIES, PRESTOCKS_SYMBOLS, TESSERA_CODES } from "@/lib/pre-ipo";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Scorecard } from "./Scorecard";
import { Spark } from "./Spark";
import type { PositionView } from "./use-portfolio-view";

type NoteField = "note" | "horizon" | "wrongIf";

/**
 * One holding: head (grip, badge, name, size, sparkline, value, pin), the
 * scorecard, the editable WHY / HORIZON / WRONG IF fields saved on blur,
 * and Buy / Sell. The list item and its drag handlers belong to the panel.
 */
export function PositionCard({
  position,
  note,
  holders,
  liProps,
  gripProps,
  onSave,
  onTogglePin,
  onToggleWrongHit,
}: {
  position: PositionView;
  note?: PositionNote;
  holders: number | null;
  liProps: React.LiHTMLAttributes<HTMLLIElement>;
  gripProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
  onSave: (input: PositionNoteInput) => void;
  onTogglePin: () => void;
  onToggleWrongHit: () => void;
}) {
  const sym = position.kind === "xstock" ? position.ticker : position.symbol;
  const href = position.kind === "xstock" ? `/asset/${position.ticker}` : "/pre-ipo";
  const pinned = !!note?.pinned;
  const pct = position.kind === "xstock" ? position.gainPct : position.premiumPct;
  const history = position.kind === "xstock" ? getEffectiveHistory(position.ticker, "7d").slice(-40) : [];

  const commit = (field: NoteField, value: string) => {
    const previous = note?.[field] ?? "";
    if (value.trim() === previous) return;
    onSave({ key: position.key, [field]: value });
  };

  let badge: React.ReactNode;
  if (position.kind === "xstock") {
    badge = <TickerBadge ticker={getTickerInfo(position.ticker)} />;
  } else {
    const companyId = PRESTOCKS_SYMBOLS[position.symbol] ?? TESSERA_CODES[position.symbol];
    const company = companyId ? COMPANIES[companyId] : undefined;
    badge = (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[11px] font-semibold text-white"
        style={{ background: fillFor(company?.color, position.symbol) }}
      >
        {company?.short ?? position.symbol.slice(0, 3)}
      </span>
    );
  }

  return (
    <li {...liProps} id={`pos-${position.key}`} className={`pf-pos ${pinned ? "pinned" : ""} ${liProps.className ?? ""}`}>
      <div className="pf-pos-head">
        <button type="button" className="pf-grip" aria-label={`Move ${sym}. Arrow keys reorder.`} title="Drag to reorder" {...gripProps}>
          ⋮⋮
        </button>
        {badge}
        <span className="pf-pos-main">
          <b>
            <Link href={href}>{position.name}</Link> <small>{sym}</small>
          </b>
          <small>
            {position.shares.toFixed(3)} × {position.price !== undefined ? formatCurrency(position.price) : "—"}
            {position.kind === "xstock" && position.costBasis !== undefined && <> · cost {formatCurrency(position.costBasis)}</>}
            {position.kind === "preipo" && <> · {position.issuer}</>}
          </small>
        </span>
        <Spark series={history} />
        <span className="pf-pos-num">
          <b>{position.price !== undefined ? formatCurrency(position.value) : "—"}</b>
          {pct !== undefined && <small className={pct >= 0 ? "up" : "down"}>{formatPercent(pct)}</small>}
        </span>
        <button
          type="button"
          className={`pf-pin ${pinned ? "on" : ""}`}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${sym}` : `Pin ${sym} to the balance card`}
          title={pinned ? "Unpin" : "Pin to the balance card"}
          onClick={onTogglePin}
        >
          📌
        </button>
      </div>

      <Scorecard position={position} note={note} holders={holders} onToggleWrongHit={onToggleWrongHit} />

      <div className="pf-note">
        <label className="pf-note-row">
          <span className="eyebrow">Why</span>
          <textarea
            key={note?.note ?? ""}
            defaultValue={note?.note ?? ""}
            rows={2}
            maxLength={NOTE_MAX}
            placeholder="Why you hold it"
            spellCheck={false}
            onBlur={(e) => commit("note", e.currentTarget.value)}
          />
        </label>
        <div className="pf-note-row two">
          <label>
            <span className="eyebrow">Horizon</span>
            <input
              key={note?.horizon ?? ""}
              type="text"
              defaultValue={note?.horizon ?? ""}
              maxLength={HORIZON_MAX}
              placeholder="e.g. 18 mo"
              onBlur={(e) => commit("horizon", e.currentTarget.value)}
            />
          </label>
          <label>
            <span className="eyebrow">Wrong if</span>
            <input
              key={note?.wrongIf ?? ""}
              type="text"
              defaultValue={note?.wrongIf ?? ""}
              maxLength={WRONG_IF_MAX}
              placeholder="What would prove this wrong"
              onBlur={(e) => commit("wrongIf", e.currentTarget.value)}
            />
          </label>
        </div>
      </div>

      <div className="pf-pos-actions">
        {position.kind === "xstock" ? (
          <>
            <Link href={`/asset/${position.ticker}`} className="btn-secondary btn-small" aria-label={`Buy ${sym}`}>
              Buy
            </Link>
            <Link href={`/buy/${position.ticker}?side=sell`} className="btn-secondary btn-small" aria-label={`Sell ${sym}`}>
              Sell
            </Link>
          </>
        ) : (
          <Link href="/pre-ipo" className="btn-secondary btn-small" aria-label={`Open ${sym} in Pre-IPO`}>
            Pre-IPO →
          </Link>
        )}
      </div>
    </li>
  );
}
