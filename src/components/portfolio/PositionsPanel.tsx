"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/panels/Panel";
import { useInvestors } from "@/hooks/use-investors";
import { useNotes } from "@/hooks/use-notes";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { PositionNoteInput } from "@/lib/notes";
import { PositionCard } from "./PositionCard";
import { usePortfolioView, type PositionView } from "./use-portfolio-view";

const TOAST_MS = 2_600;

/**
 * Every holding as a PositionCard, in the person's own order (drag the
 * grip, or arrow keys on it), with the scorecard and the editable note
 * under each. Notes save through use-notes: the account when signed in,
 * this browser otherwise.
 */
export function PositionsPanel({ id }: { id: string }) {
  const view = usePortfolioView();
  const { notes, save } = useNotes();
  const { investors, source } = useInvestors();

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // The designed order is by value; once the person has reordered, sortOrder (1-based) wins.
  const customised = view.positions.some((p) => (notes[p.key]?.sortOrder ?? 0) > 0);
  const ordered: PositionView[] = customised
    ? view.positions
        .map((p, i) => ({ p, i, order: notes[p.key]?.sortOrder || Number.MAX_SAFE_INTEGER }))
        .sort((a, b) => a.order - b.order || a.i - b.i)
        .map((x) => x.p)
    : view.positions;

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    next.forEach((p, i) => {
      if ((notes[p.key]?.sortOrder ?? 0) !== i + 1) void save({ key: p.key, sortOrder: i + 1 });
    });
  };

  // Native drag, armed from the grip only so text in the note fields still selects.
  const [armed, setArmed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const endDrag = () => {
    setArmed(null);
    setDragging(null);
    setOver(null);
  };

  const onSave = (input: PositionNoteInput) => {
    void save(input);
    announce("Note saved");
  };
  const togglePin = (p: PositionView) => {
    const sym = p.kind === "xstock" ? p.ticker : p.symbol;
    const next = !notes[p.key]?.pinned;
    void save({ key: p.key, pinned: next });
    announce(next ? `${sym} pinned to the balance card` : `${sym} unpinned`);
  };
  const toggleWrongHit = useCallback(
    (p: PositionView) => {
      const hit = notes[p.key]?.wrongHitAt ?? null;
      void save({ key: p.key, wrongHitAt: hit ? null : Date.now() });
      announce(hit ? "Unmarked." : "Marked: your wrong-if happened. Nothing else changes — that is your call.");
    },
    [notes, save, announce],
  );

  const holdersOf = (p: PositionView): number | null =>
    p.kind === "xstock" && source === "chain" ? investors.filter((i) => i.holdings.some((h) => h.ticker === p.ticker)).length : null;

  const subtitle = (
    <>
      <b className="text-fg">{formatCurrency(view.invested)}</b> invested · {formatCurrency(view.cashBalance)} cash
      {view.hasBasis && (
        <>
          {" · "}
          <b className={view.performancePct >= 0 ? "up" : "down"}>P/L {formatPercent(view.performancePct)}</b>
        </>
      )}
      {" · "}
      {view.positions.length} open · drag to reorder · 📌 pins to the balance card
    </>
  );

  return (
    <Panel id={id} title="Your positions" subtitle={view.isLoaded ? subtitle : undefined} foot="Every fill carries its note. Edit inline.">
      {!view.isLoaded ? (
        <div className="pf-skeleton" role="status" aria-label="Loading your positions" aria-busy="true">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      ) : ordered.length === 0 ? (
        <div className="empty-state">
          <h2>{view.isLive ? "This wallet holds no tokenized stocks yet." : "No positions yet."}</h2>
          <p>
            <Link href="/markets" className="text-accent-text underline underline-offset-[3px]">
              Buy something from Markets →
            </Link>
          </p>
        </div>
      ) : (
        <ul className="pf-pos-list">
          {ordered.map((p, i) => (
            <PositionCard
              key={p.key}
              position={p}
              note={notes[p.key]}
              holders={holdersOf(p)}
              onSave={onSave}
              onTogglePin={() => togglePin(p)}
              onToggleWrongHit={() => toggleWrongHit(p)}
              liProps={{
                className: `${dragging === i ? "dragging" : ""} ${over === i && dragging !== i ? "over" : ""}`,
                draggable: armed === i,
                onDragStart: (e) => {
                  if (armed !== i) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(i);
                },
                onDragOver: (e) => {
                  if (dragging === null) return;
                  e.preventDefault();
                  if (over !== i) setOver(i);
                },
                onDragLeave: () => {
                  if (over === i) setOver(null);
                },
                onDrop: (e) => {
                  e.preventDefault();
                  if (dragging !== null) move(dragging, i);
                  endDrag();
                },
                onDragEnd: endDrag,
              }}
              gripProps={{
                onPointerDown: () => setArmed(i),
                onPointerUp: () => {
                  if (dragging === null) setArmed(null);
                },
                onKeyDown: (e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(i, i - 1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(i, i + 1);
                  }
                },
              }}
            />
          ))}
        </ul>
      )}
      <div className="toasts" role="status" aria-live="polite">
        {toast && <div className="toast glass ok in">{toast}</div>}
      </div>
    </Panel>
  );
}
