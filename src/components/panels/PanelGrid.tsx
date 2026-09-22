"use client";

import "./panels.css";
import { Children, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  COLS,
  DRAG_SLOP_PX,
  DRAG_SLOP_TOUCH_PX,
  GAP_PX,
  LONG_PRESS_MS,
  MSG_CANCELLED,
  MSG_CANCELLED_NOTHING,
  MSG_HEIGHT_RESET,
  MSG_SAVED,
  ROW_PX,
  ROW_UNIT,
  applyDrop,
  describeDrop,
  describeGrab,
  describeSize,
  hitTest,
  isSwapCompatible,
  keyboardMove,
  packLayout,
  resizePanel,
  resolveZone,
  rowsFor,
  snapResize,
  swapRefusal,
  type DropAxis,
  type DropZone,
  type PageId,
  type PageLayout,
  type PhoneTab,
  type Placed,
  type Rect,
} from "@/lib/layout";
import { specFor } from "@/lib/panel-registry";
import { usePageLayout } from "@/hooks/use-page-layout";
import { useMediaQuery } from "@/hooks/use-media";
import { PanelSlotContext, type PanelSlot } from "./context";
import { LayoutAnnouncer } from "./LayoutAnnouncer";

interface Props {
  page: PageId;
  /** Which phone tab this route is; cards registered for another tab are hidden below 768px. */
  phoneTab?: PhoneTab;
  children: React.ReactNode;
}

interface DragState {
  id: string;
  over: { id: string; zone: DropZone; axis: DropAxis } | null;
}

/**
 * The twelve-column grid. Owns drag, swap, resize and keyboard state, the
 * measured heights of auto cards, the packer's output and the live region.
 * Children are Panels; each gets its slot through context. Page content
 * elements pass through by reference, so a grid state change re-renders
 * only the shells.
 */
export function PanelGrid({ page, phoneTab, children }: Props) {
  const { layout, commit } = usePageLayout(page);
  const interactive = useMediaQuery("(min-width: 1101px)");
  const helpId = useId();

  // Measured heights of auto cards, batched to one state update per frame.
  const [measuredRows, setMeasuredRows] = useState<Record<string, number>>({});
  const queued = useRef<Record<string, number>>({});
  const flushQueued = useRef(false);
  const reportRows = useCallback((id: string, rows: number) => {
    queued.current[id] = rows;
    if (flushQueued.current) return;
    flushQueued.current = true;
    requestAnimationFrame(() => {
      flushQueued.current = false;
      const batch = queued.current;
      queued.current = {};
      setMeasuredRows((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [k, v] of Object.entries(batch)) {
          if (next[k] !== v) {
            next[k] = v;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
  }, []);

  const specOf = useCallback((id: string) => specFor(page, id), [page]);
  const rowsOf = useCallback(
    (id: string, from?: PageLayout) => {
      const source = from ?? layout;
      const item = source.order.find((o) => o.id === id);
      if (!item) return 1;
      return rowsFor(item, specOf(id), measuredRows[id]);
    },
    [layout, specOf, measuredRows],
  );

  // A layout being previewed during a resize/keyboard move, before commit.
  const [pending, setPending] = useState<PageLayout | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resizing, setResizing] = useState<{ id: string; badge: string } | null>(null);
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [entered, setEntered] = useState(false);

  const shown = pending ?? layout;
  const placed = useMemo<Placed[]>(() => packLayout(shown.order, (id) => rowsOf(id, shown)), [shown, rowsOf]);

  const announce = useCallback((text: string) => {
    setMessage(text);
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // ---- drag -------------------------------------------------------------
  const gridRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    rects: Rect[];
    active: boolean;
    touch: boolean;
    timer: number | null;
    ghost: HTMLDivElement | null;
    frame: number;
    lastPoint: { x: number; y: number };
    over: DragState["over"];
  } | null>(null);

  const rectsNow = useCallback((): Rect[] => {
    const grid = gridRef.current;
    if (!grid) return [];
    return Array.from(grid.querySelectorAll<HTMLElement>(":scope > .panel[data-panel]")).map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.panel!, left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
    });
  }, []);

  const endDrag = useCallback(
    (commitDrop: boolean) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.timer) window.clearTimeout(d.timer);
      cancelAnimationFrame(d.frame);
      d.ghost?.remove();
      dragRef.current = null;
      setDrag(null);
      if (!d.active) return;
      if (!commitDrop) {
        announce(MSG_CANCELLED);
        return;
      }
      const over = d.over;
      if (!over) {
        announce(MSG_CANCELLED_NOTHING);
        return;
      }
      const a = layout.order.find((o) => o.id === d.id);
      const b = layout.order.find((o) => o.id === over.id);
      if (!a || !b) return;
      // A centre drop that could not swap explains itself.
      const refusal = over.zone !== "swap" && over.axis === "x" ? swapRefusal(a, b, specOf) : null;
      const next = applyDrop(layout, d.id, over.id, over.zone, specOf, (id) => rowsOf(id));
      if (next === layout) return;
      commit({ ...next, savedAt: Date.now() });
      const p = packLayout(next.order, (id) => rowsOf(id, next)).find((x) => x.id === d.id);
      if (p) announce(describeDrop(specOf(d.id)?.title ?? d.id, over.zone, specOf(over.id)?.title ?? over.id, p, refusal));
    },
    [layout, commit, specOf, rowsOf, announce],
  );

  const activateDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d || d.active) return;
    d.active = true;
    navigator.vibrate?.(10);
    const source = gridRef.current?.querySelector<HTMLElement>(`:scope > .panel[data-panel="${d.id}"]`);
    const rect = source?.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "panel-ghost";
    ghost.style.width = `${rect?.width ?? 240}px`;
    ghost.style.height = `${ROW_UNIT}px`;
    ghost.innerHTML = `<div class="panel-head"><span class="panel-grip">⋮⋮</span><h2>${specOf(d.id)?.title ?? d.id}</h2></div>`;
    document.body.appendChild(ghost);
    d.ghost = ghost;
    setDrag({ id: d.id, over: null });
    announce(`Moving ${specOf(d.id)?.title ?? d.id}.`);
  }, [specOf, announce]);

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
      if (!interactive || e.button !== 0) return;
      e.preventDefault();
      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Some engines reject capture for synthetic or already-released pointers; the gesture still works.
      }
      const card = target.closest(".panel") as HTMLElement | null;
      const r = card?.getBoundingClientRect();
      const touch = e.pointerType === "touch";
      dragRef.current = {
        id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: r ? e.clientX - r.left : 0,
        offsetY: r ? e.clientY - r.top : 0,
        rects: rectsNow(),
        active: false,
        touch,
        timer: touch ? window.setTimeout(activateDrag, LONG_PRESS_MS) : null,
        ghost: null,
        frame: 0,
        lastPoint: { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY },
        over: null,
      };

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d || ev.pointerId !== d.pointerId) return;
        const moved = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY);
        if (!d.active) {
          if (d.touch) {
            if (moved > DRAG_SLOP_TOUCH_PX && d.timer) {
              window.clearTimeout(d.timer);
              d.timer = null;
              target.releasePointerCapture(d.pointerId);
              cleanup();
              dragRef.current = null;
            }
            return;
          }
          if (moved < DRAG_SLOP_PX) return;
          activateDrag();
        }
        d.lastPoint = { x: ev.clientX + window.scrollX, y: ev.clientY + window.scrollY };
        if (d.ghost) d.ghost.style.transform = `translate3d(${ev.clientX - d.offsetX}px, ${ev.clientY - d.offsetY}px, 0)`;
        cancelAnimationFrame(d.frame);
        d.frame = requestAnimationFrame(() => {
          const dd = dragRef.current;
          if (!dd || !dd.active) return;
          // Auto-scroll near the viewport edges.
          const edge = 56;
          const y = ev.clientY;
          if (y < edge) window.scrollBy(0, -Math.min(14, (edge - y) / 3));
          else if (window.innerHeight - y < edge) window.scrollBy(0, Math.min(14, (edge - (window.innerHeight - y)) / 3));
          const hit = hitTest(dd.rects, dd.lastPoint, dd.id);
          let next: DragState["over"] = null;
          if (hit) {
            const a = layout.order.find((o) => o.id === dd.id);
            const b = layout.order.find((o) => o.id === hit.overId);
            const compatible = !!a && !!b && isSwapCompatible(a, b, specOf);
            const z = resolveZone(hit.px, hit.py, compatible);
            next = { id: hit.overId, zone: z.zone, axis: z.axis };
          }
          const prev = dd.over;
          if (prev?.id !== next?.id || prev?.zone !== next?.zone || prev?.axis !== next?.axis) {
            dd.over = next;
            setDrag({ id: dd.id, over: next });
          }
        });
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== dragRef.current?.pointerId) return;
        cleanup();
        endDrag(true);
      };
      const onCancel = () => {
        cleanup();
        endDrag(false);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") onCancel();
      };
      const cleanup = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onCancel);
        target.removeEventListener("lostpointercapture", onCancel);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("blur", onCancel);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onCancel);
      target.addEventListener("lostpointercapture", onCancel);
      window.addEventListener("keydown", onKey);
      window.addEventListener("blur", onCancel);
    },
    [interactive, rectsNow, activateDrag, endDrag, layout, specOf],
  );

  // ---- resize -----------------------------------------------------------
  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
      if (!interactive || e.button !== 0) return;
      e.preventDefault();
      const spec = specOf(id);
      const grid = gridRef.current;
      const target = e.currentTarget;
      const card = target.closest(".panel") as HTMLElement | null;
      if (!spec || !grid || !card) return;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Some engines reject capture for synthetic or already-released pointers; the gesture still works.
      }
      const cs = getComputedStyle(grid);
      const colW = (grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + GAP_PX) / COLS;
      const rect = card.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const snapshot = layout;
      let last = { w: -1, h: -1 };
      let working = layout;
      document.body.classList.add("select-none");
      const onMove = (ev: PointerEvent) => {
        const { w, h } = snapResize(rect, ev.clientX - startX, ev.clientY - startY, colW, spec);
        if (w === last.w && h === last.h) return;
        last = { w, h };
        working = resizePanel(snapshot, id, w, h, specOf, (pid) => rowsOf(pid, snapshot));
        setPending(working);
        setResizing({ id, badge: `${w} / ${COLS} · ${h} rows · ${h * ROW_UNIT - GAP_PX} px` });
      };
      const finish = (save: boolean) => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        document.body.classList.remove("select-none");
        setPending(null);
        setResizing(null);
        if (save && working !== snapshot) {
          commit({ ...working, savedAt: Date.now() });
          const item = working.order.find((o) => o.id === id);
          if (item) announce(describeSize(spec.title, item.w, item.h ?? rowsOf(id, working)));
        } else if (!save) {
          announce(MSG_CANCELLED);
        }
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") onCancel();
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey);
    },
    [interactive, specOf, layout, rowsOf, commit, announce],
  );

  const onResizeDoubleClick = useCallback(
    (id: string) => {
      const item = layout.order.find((o) => o.id === id);
      if (!item || item.h === null) return;
      commit({ ...resizePanel(layout, id, item.w, null, specOf, (pid) => rowsOf(pid)), savedAt: Date.now() });
      announce(MSG_HEIGHT_RESET);
    },
    [layout, commit, specOf, rowsOf, announce],
  );

  const onResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
      const item = layout.order.find((o) => o.id === id);
      const spec = specOf(id);
      if (!item || !spec) return;
      const h = item.h ?? rowsOf(id);
      let next: PageLayout | null = null;
      if (e.key === "ArrowLeft") next = resizePanel(layout, id, item.w - 1, h, specOf, (pid) => rowsOf(pid));
      else if (e.key === "ArrowRight") next = resizePanel(layout, id, item.w + 1, h, specOf, (pid) => rowsOf(pid));
      else if (e.key === "ArrowUp") next = resizePanel(layout, id, item.w, h - 1, specOf, (pid) => rowsOf(pid));
      else if (e.key === "ArrowDown") next = resizePanel(layout, id, item.w, h + 1, specOf, (pid) => rowsOf(pid));
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onResizeDoubleClick(id);
        return;
      } else return;
      e.preventDefault();
      if (!next || next === layout) return;
      commit({ ...next, savedAt: Date.now() });
      const after = next.order.find((o) => o.id === id)!;
      announce(describeSize(spec.title, after.w, after.h ?? rowsOf(id, next)));
    },
    [layout, specOf, rowsOf, commit, announce, onResizeDoubleClick],
  );

  // ---- keyboard move ----------------------------------------------------
  const snapshotRef = useRef<PageLayout | null>(null);
  const focusGrip = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const grip = gridRef.current?.querySelector<HTMLButtonElement>(`:scope > .panel[data-panel="${id}"] .panel-grip`);
      grip?.focus({ preventScroll: true });
      grip?.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const onGripKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
      const spec = specOf(id);
      if (!spec) return;
      const isGrabbed = grabbed === id;
      if (!isGrabbed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          snapshotRef.current = layout;
          setGrabbed(id);
          announce(describeGrab(spec.title));
        }
        return;
      }
      const current = pending ?? layout;
      const dirs: Record<string, "left" | "right" | "up" | "down"> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
      if (e.key === "Escape") {
        e.preventDefault();
        setPending(null);
        setGrabbed(null);
        announce(MSG_CANCELLED);
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (pending) commit({ ...pending, savedAt: Date.now() });
        setPending(null);
        setGrabbed(null);
        announce(MSG_SAVED);
        return;
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const r = keyboardMove(current, id, e.key === "Home" ? "home" : "end", false, specOf, (pid) => rowsOf(pid, current));
        setPending(r.layout);
        announce(r.message);
        focusGrip(id);
        return;
      }
      if (e.altKey && e.key === "0") {
        e.preventDefault();
        const item = current.order.find((o) => o.id === id)!;
        setPending(resizePanel(current, id, item.w, null, specOf, (pid) => rowsOf(pid, current)));
        announce(MSG_HEIGHT_RESET);
        return;
      }
      const dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();
      if (e.altKey) {
        const item = current.order.find((o) => o.id === id)!;
        const h = item.h ?? rowsOf(id, current);
        const w = item.w + (dir === "right" ? 1 : dir === "left" ? -1 : 0);
        const nh = h + (dir === "down" ? 1 : dir === "up" ? -1 : 0);
        const next = resizePanel(current, id, w, nh, specOf, (pid) => rowsOf(pid, current));
        setPending(next);
        const after = next.order.find((o) => o.id === id)!;
        announce(describeSize(spec.title, after.w, after.h ?? nh));
        return;
      }
      const r = keyboardMove(current, id, dir, e.shiftKey, specOf, (pid) => rowsOf(pid, current));
      if (r.layout !== current) setPending(r.layout);
      announce(r.message);
      focusGrip(id);
    },
    [grabbed, layout, pending, specOf, rowsOf, commit, announce, focusGrip],
  );

  // Dropping focus while grabbed counts as a drop.
  useEffect(() => {
    if (!grabbed) return;
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as HTMLElement | null;
      if (next && gridRef.current?.contains(next) && next.classList.contains("panel-grip")) return;
      if (pending) commit({ ...pending, savedAt: Date.now() });
      setPending(null);
      setGrabbed(null);
    };
    const grid = gridRef.current;
    grid?.addEventListener("focusout", onFocusOut);
    return () => grid?.removeEventListener("focusout", onFocusOut);
  }, [grabbed, pending, commit]);

  // ---- render -----------------------------------------------------------
  const ordered = useMemo(() => {
    const byId = new Map<string, React.ReactElement>();
    Children.toArray(children).forEach((child) => {
      if (isValidElement(child)) {
        const props = child.props as { id?: string };
        if (props.id) byId.set(props.id, child);
      }
    });
    return placed.map((p) => ({ placed: p, element: byId.get(p.id) })).filter((x): x is { placed: Placed; element: React.ReactElement } => !!x.element);
  }, [children, placed]);

  return (
    <section
      ref={gridRef}
      className="panel-grid"
      data-page={page}
      data-entered={entered ? "" : undefined}
      data-dragging={drag?.id}
      style={{ "--grid-row": `${ROW_PX}px`, "--grid-gap": `${GAP_PX}px` } as React.CSSProperties}
    >
      <LayoutAnnouncer message={message} helpId={helpId} />
      {ordered.map(({ placed: p, element }) => {
        const spec = specOf(p.id);
        const slot: PanelSlot = {
          page,
          id: p.id,
          title: spec?.title ?? p.id,
          placed: p,
          isSized: p.h !== null,
          isDragging: drag?.id === p.id || grabbed === p.id,
          isResizing: resizing?.id === p.id,
          over: drag?.over?.id === p.id ? { zone: drag.over.zone, axis: drag.over.axis } : null,
          grabbed: grabbed === p.id,
          phoneOrder: spec?.phone?.order ?? null,
          phoneHidden: !!phoneTab && !!spec?.phone && spec.phone.tab !== phoneTab,
          gridHelpId: helpId,
          interactive,
          badge: resizing?.id === p.id ? resizing.badge : null,
          reportRows,
          onGripPointerDown,
          onGripKeyDown,
          onResizePointerDown,
          onResizeDoubleClick,
          onResizeKeyDown,
        };
        return (
          <PanelSlotContext.Provider key={p.id} value={slot}>
            {element}
          </PanelSlotContext.Provider>
        );
      })}
    </section>
  );
}
