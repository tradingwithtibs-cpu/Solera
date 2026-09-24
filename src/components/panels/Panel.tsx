"use client";

import { useEffect, useRef } from "react";
import { GAP_PX, ROW_UNIT } from "@/lib/layout";
import { usePanelSlot } from "./context";

/** A tokenized-stock symbol ("TSLAx") or a Tessera symbol ("T-OpenAI"): shown as written inside the uppercased head. */
const SYMBOL = /^#?([A-Z0-9.]{1,12}x|T-[A-Za-z]+)$/;

/** The title with its symbols wrapped so `text-transform: uppercase` leaves their case alone. */
function renderTitle(title: string): React.ReactNode {
  const parts = title.split(/(\s+)/);
  if (!parts.some((p) => SYMBOL.test(p))) return title;
  return parts.map((p, i) => (SYMBOL.test(p) ? <span key={i} className="keep-case">{p}</span> : p));
}

interface Props {
  /** Registry id; required inside a PanelGrid, ignored in static mode. */
  id?: string;
  title: string;
  subtitle?: React.ReactNode;
  /** Right side of the head. */
  tools?: React.ReactNode;
  foot?: React.ReactNode;
  /** Chrome only, no grip or handle: for full-width routes outside a grid. */
  static?: boolean;
  hero?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

/**
 * The card shell: head (grip, "// TITLE", subtitle, tools), body, foot,
 * resize handle and size badge. Inside a PanelGrid it reads its slot from
 * context and reports its content height when auto-sized.
 */
export function Panel({ id, title, subtitle, tools, foot, static: isStatic = false, hero = false, className = "", bodyClassName = "", children }: Props) {
  const slot = usePanelSlot();
  const innerRef = useRef<HTMLDivElement>(null);
  const live = !isStatic && slot && id === slot.id ? slot : null;

  // Auto-height measurement on the inner wrapper (never the card box, which equals the grid area).
  const reportRows = live?.reportRows;
  const isAuto = !!live && !live.isSized;
  const liveId = live?.id;
  useEffect(() => {
    const el = innerRef.current;
    if (!el || !isAuto || !reportRows || !liveId) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = el.closest(".panel") as HTMLElement | null;
        const head = card?.querySelector(":scope > .panel-head") as HTMLElement | null;
        const footEl = card?.querySelector(":scope > .panel-foot") as HTMLElement | null;
        const total = el.offsetHeight + (head?.offsetHeight ?? 0) + (footEl?.offsetHeight ?? 0) + 2;
        reportRows(liveId, Math.ceil((total + GAP_PX) / ROW_UNIT));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isAuto, reportRows, liveId]);

  const placed = live?.placed ?? null;
  const style = placed
    ? ({
        "--col": placed.col + 1,
        "--row": placed.row + 1,
        "--w": placed.w,
        "--h": placed.rows,
        "--phone-order": live?.phoneOrder ?? 0,
      } as React.CSSProperties)
    : undefined;

  const stateClass = [
    "panel",
    hero ? "hero" : "",
    live?.isDragging ? "is-dragging" : "",
    live?.isResizing ? "is-resizing" : "",
    live?.over?.zone === "swap" ? "is-over-swap" : "",
    live?.over?.zone === "before" ? "is-over-before" : "",
    live?.over?.zone === "after" ? "is-over-after" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={stateClass}
      data-panel={live?.id ?? id ?? undefined}
      data-sized={live?.isSized ? "" : undefined}
      data-phone-hidden={live?.phoneHidden ? "" : undefined}
      data-axis={live?.over?.axis}
      style={style}
      aria-label={title}
    >
      <div className="panel-head">
        {live?.interactive && (
          <button
            type="button"
            className="panel-grip"
            aria-label={`Move ${title}`}
            aria-pressed={live.grabbed}
            aria-describedby={live.gridHelpId}
            onPointerDown={(e) => live.onGripPointerDown(e, live.id)}
            onKeyDown={(e) => live.onGripKeyDown(e, live.id)}
          >
            ⋮⋮
          </button>
        )}
        <h2>{renderTitle(title)}</h2>
        {subtitle && <span className="muted truncate text-[11px]">{subtitle}</span>}
        {tools && <div className="panel-tools">{tools}</div>}
      </div>
      <div className={`panel-body ${bodyClassName}`}>
        <div ref={innerRef} className="panel-inner">
          {children}
        </div>
      </div>
      {foot && <p className="panel-foot">{foot}</p>}
      {live?.interactive && (
        <>
          <button
            type="button"
            className="panel-resize"
            aria-label={`Resize ${title}`}
            onPointerDown={(e) => live.onResizePointerDown(e, live.id)}
            onDoubleClick={() => live.onResizeDoubleClick(live.id)}
            onKeyDown={(e) => live.onResizeKeyDown(e, live.id)}
          />
          <span className={`panel-badge ${live.badge ? "on" : ""}`} aria-hidden="true">
            {live.badge ?? ""}
          </span>
        </>
      )}
    </section>
  );
}
