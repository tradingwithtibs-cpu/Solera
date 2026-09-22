/**
 * The panel grid's brain, pure and unit-tested (tests/layout.test.mjs).
 * Twelve columns, 24px row tracks with an 8px gap (a 32px "row unit"), and
 * a dense first-fit packer that turns an ordered list of card footprints
 * into positions. Drag, swap, resize and keyboard moves are all functions
 * over that list; React only holds the list and paints the result.
 * Spec: docs/port/layout-engine.md with the rulings in docs/port/plan.md.
 */

export const COLS = 12;
export const GAP_PX = 8;
export const ROW_PX = 24;
/** One row unit: a card `h` rows tall is `ROW_UNIT * h - GAP_PX` px. */
export const ROW_UNIT = ROW_PX + GAP_PX;
export const MIN_COLS = 3;
export const MIN_ROWS = 5;
export const MAX_ROWS = 80;
export const DESKTOP_MIN_PX = 1101;
export const PHONE_MAX_PX = 767;
export const LONG_PRESS_MS = 300;
export const DRAG_SLOP_PX = 4;
export const DRAG_SLOP_TOUCH_PX = 8;

export type PageId = "portfolio" | "markets" | "preipo" | "discover" | "leaderboard" | "agent";
export type PhoneTab = "portfolio" | "markets" | "trade" | "discover" | "people" | "agent";

export interface PanelSpec {
  /** Stable lowercase word: the data-panel attribute and the storage id. */
  id: string;
  /** Head label, rendered as "// TITLE". */
  title: string;
  minCols: number;
  maxCols?: number;
  /** Applies whenever the card is sized. */
  minRows: number;
  /** Designed span. */
  defaultCols: number;
  /** null = auto height (content decides); a number = sized, body scrolls. */
  defaultRows: number | null;
  /** Rows assumed for an auto card before it has been measured. */
  estimateRows?: number;
  /** Where the card lives on a phone; null = never shown there. */
  phone: { tab: PhoneTab; order: number } | null;
}

export interface PanelLayout {
  id: string;
  w: number;
  /** Row units, or null for auto height. */
  h: number | null;
}

export interface PageLayout {
  v: 1;
  page: PageId;
  /** Visual order: row-major after packing (invariant, see sortByPosition). */
  order: PanelLayout[];
  savedAt: number;
}

export interface Placed extends PanelLayout {
  /** 0-based. */
  col: number;
  row: number;
  /** Height used for packing (h, or the measured/estimated rows of an auto card). */
  rows: number;
}

export type DropZone = "before" | "after" | "swap";
export type DropAxis = "x" | "y";

export type SpecOf = (id: string) => PanelSpec | undefined;
export type RowsOf = (id: string) => number;

export function storageKey(page: PageId): string {
  return `solera:layout:${page}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function maxColsOf(spec: PanelSpec): number {
  return spec.maxCols ?? COLS;
}

/** The designed layout: registry order and spans. */
export function defaultLayout(page: PageId, specs: readonly PanelSpec[], savedAt = 0): PageLayout {
  return { v: 1, page, order: specs.map((s) => ({ id: s.id, w: s.defaultCols, h: s.defaultRows })), savedAt };
}

/** Rows a card occupies when packing: its height, else the caller's measurement, else the estimate. */
export function rowsFor(item: PanelLayout, spec: PanelSpec | undefined, measured?: number): number {
  if (item.h !== null) return item.h;
  if (measured && measured > 0) return Math.max(MIN_ROWS, Math.ceil(measured));
  return Math.max(MIN_ROWS, spec?.estimateRows ?? spec?.defaultRows ?? MIN_ROWS);
}

/**
 * Dense first-fit over a growing occupancy grid, in `order`. A function of
 * the sequence of footprints only, never of ids, so two cards with the
 * same footprint that exchange indices exchange cells exactly.
 */
export function packLayout(order: readonly PanelLayout[], rowsOf: RowsOf, cols = COLS): Placed[] {
  const occupied: boolean[][] = [];
  const isFree = (row: number, col: number, w: number, rows: number) => {
    for (let r = row; r < row + rows; r++) {
      const line = occupied[r];
      if (!line) continue;
      for (let c = col; c < col + w; c++) if (line[c]) return false;
    }
    return true;
  };
  const fill = (row: number, col: number, w: number, rows: number) => {
    for (let r = row; r < row + rows; r++) {
      occupied[r] ??= [];
      for (let c = col; c < col + w; c++) occupied[r][c] = true;
    }
  };
  const out: Placed[] = [];
  for (const item of order) {
    const w = clamp(Math.round(item.w), 1, cols);
    const rows = Math.max(1, Math.round(rowsOf(item.id)));
    let placed = false;
    for (let row = 0; !placed; row++) {
      for (let col = 0; col + w <= cols; col++) {
        if (isFree(row, col, w, rows)) {
          fill(row, col, w, rows);
          out.push({ ...item, w, col, row, rows });
          placed = true;
          break;
        }
      }
      if (row > 10_000) throw new Error("packLayout: no room");
    }
  }
  return out;
}

/** Re-sorts an order by packed position (row, then col). Packing a sorted order is a fixed point. */
export function sortByPosition(order: readonly PanelLayout[], placed: readonly Placed[]): PanelLayout[] {
  const pos = new Map(placed.map((p) => [p.id, p]));
  return [...order].sort((a, b) => {
    const pa = pos.get(a.id);
    const pb = pos.get(b.id);
    if (!pa || !pb) return 0;
    return pa.row - pb.row || pa.col - pb.col;
  });
}

/** Pack and re-sort in one go: the shape every commit ends in. */
export function settle(order: readonly PanelLayout[], rowsOf: RowsOf): PanelLayout[] {
  return sortByPosition(order, packLayout(order, rowsOf));
}

function deepEqualOrder(a: readonly PanelLayout[], b: readonly PanelLayout[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.id === b[i].id && x.w === b[i].w && x.h === b[i].h);
}

/**
 * Turns whatever was in storage into a valid layout for this page:
 * unknown ids dropped, missing cards appended at their registry index with
 * default spans, spans clamped, then re-sorted by packed position.
 */
export function normalizeLayout(
  raw: unknown,
  page: PageId,
  specs: readonly PanelSpec[],
  rowsOf?: RowsOf,
): { layout: PageLayout; isCustom: boolean } {
  const fallback = defaultLayout(page, specs);
  const specOf = new Map(specs.map((s) => [s.id, s]));
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { layout: fallback, isCustom: false };
    }
  }
  if (!parsed || typeof parsed !== "object") return { layout: fallback, isCustom: false };
  const obj = parsed as Partial<PageLayout>;
  if (obj.v !== 1 || obj.page !== page || !Array.isArray(obj.order)) return { layout: fallback, isCustom: false };

  const seen = new Set<string>();
  const order: PanelLayout[] = [];
  for (const entry of obj.order as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { id?: unknown; w?: unknown; h?: unknown };
    if (typeof e.id !== "string" || seen.has(e.id)) continue;
    const spec = specOf.get(e.id);
    if (!spec) continue;
    seen.add(e.id);
    const w = typeof e.w === "number" && Number.isFinite(e.w) ? clamp(Math.round(e.w), spec.minCols, maxColsOf(spec)) : spec.defaultCols;
    const h = typeof e.h === "number" && Number.isFinite(e.h) ? clamp(Math.round(e.h), spec.minRows, MAX_ROWS) : null;
    order.push({ id: e.id, w, h });
  }
  specs.forEach((spec, index) => {
    if (seen.has(spec.id)) {
      return;
    }
    const at = Math.min(index, order.length);
    order.splice(at, 0, { id: spec.id, w: spec.defaultCols, h: spec.defaultRows });
  });
  const rows: RowsOf = rowsOf ?? ((id) => rowsFor(order.find((o) => o.id === id)!, specOf.get(id)));
  const settled = settle(order, rows);
  const layout: PageLayout = { v: 1, page, order: settled, savedAt: typeof obj.savedAt === "number" ? obj.savedAt : 0 };
  return { layout, isCustom: !deepEqualOrder(settled, fallback.order) };
}

// --- drag and drop -------------------------------------------------------

export interface Rect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Hit {
  overId: string;
  /** Pointer position inside the target, 0..1 on each axis. */
  px: number;
  py: number;
}

/** The card under a document-coordinate point, never the dragged one; null in gaps. */
export function hitTest(rects: readonly Rect[], point: { x: number; y: number }, dragId: string): Hit | null {
  for (const r of rects) {
    if (r.id === dragId) continue;
    if (point.x >= r.left && point.x <= r.left + r.width && point.y >= r.top && point.y <= r.top + r.height) {
      return { overId: r.id, px: r.width > 0 ? (point.x - r.left) / r.width : 0.5, py: r.height > 0 ? (point.y - r.top) / r.height : 0.5 };
    }
  }
  return null;
}

/** Zone from the pointer's normalised position on the target. */
export function resolveZone(px: number, py: number, compatible: boolean): { zone: DropZone; axis: DropAxis } {
  const dx = px - 0.5;
  const dy = py - 0.5;
  const centre = Math.max(Math.abs(dx), Math.abs(dy)) < 0.25;
  if (centre) {
    if (compatible) return { zone: "swap", axis: "x" };
    return { zone: dx < 0 ? "before" : "after", axis: "x" };
  }
  if (Math.abs(dx) >= Math.abs(dy)) return { zone: dx < 0 ? "before" : "after", axis: "x" };
  return { zone: dy < 0 ? "before" : "after", axis: "y" };
}

/** Each card must be allowed at the other's width; heights travel only when both are sized. */
export function isSwapCompatible(a: PanelLayout, b: PanelLayout, specOf: SpecOf): boolean {
  if (a.id === b.id) return false;
  const sa = specOf(a.id);
  const sb = specOf(b.id);
  if (!sa || !sb) return false;
  const fits = (w: number, s: PanelSpec) => w >= s.minCols && w <= maxColsOf(s);
  if (!fits(b.w, sa) || !fits(a.w, sb)) return false;
  if (a.h !== null && b.h !== null) return b.h >= sa.minRows && a.h >= sb.minRows;
  return true;
}

/** Why a swap is refused, in the announcement's words, or null when it is allowed. */
export function swapRefusal(a: PanelLayout, b: PanelLayout, specOf: SpecOf): string | null {
  if (isSwapCompatible(a, b, specOf)) return null;
  const sa = specOf(a.id);
  const sb = specOf(b.id);
  if (!sa || !sb) return "one of the cards is unknown";
  if (b.w < sa.minCols) return `${sa.title} needs at least ${sa.minCols} columns`;
  if (b.w > maxColsOf(sa)) return `${sa.title} can be at most ${maxColsOf(sa)} columns wide`;
  if (a.w < sb.minCols) return `${sb.title} needs at least ${sb.minCols} columns`;
  if (a.w > maxColsOf(sb)) return `${sb.title} can be at most ${maxColsOf(sb)} columns wide`;
  if (a.h !== null && b.h !== null) {
    if (b.h < sa.minRows) return `${sa.title} needs at least ${sa.minRows} rows`;
    if (a.h < sb.minRows) return `${sb.title} needs at least ${sb.minRows} rows`;
  }
  return "the cards do not fit each other's slot";
}

/**
 * The drop, as a new layout. Never throws: unknown ids or a self-drop
 * return the layout unchanged, and a swap for an incompatible pair
 * degrades to "after".
 */
export function applyDrop(
  layout: PageLayout,
  dragId: string,
  targetId: string,
  zone: DropZone,
  specOf: SpecOf,
  rowsOf: RowsOf,
): PageLayout {
  if (dragId === targetId) return layout;
  const from = layout.order.findIndex((o) => o.id === dragId);
  const to = layout.order.findIndex((o) => o.id === targetId);
  if (from < 0 || to < 0) return layout;
  const order = layout.order.map((o) => ({ ...o }));
  const a = order[from];
  const b = order[to];
  let effective = zone;
  if (zone === "swap" && !isSwapCompatible(a, b, specOf)) effective = "after";

  if (effective === "swap") {
    const wa = a.w;
    a.w = b.w;
    b.w = wa;
    if (a.h !== null && b.h !== null) {
      const ha = a.h;
      a.h = b.h;
      b.h = ha;
    }
    order[from] = b;
    order[to] = a;
  } else {
    order.splice(from, 1);
    const at = order.findIndex((o) => o.id === targetId) + (effective === "after" ? 1 : 0);
    order.splice(at, 0, a);
  }
  // Heights of swapped cards may have changed: pack with the new spans.
  const rows: RowsOf = (id) => {
    const item = order.find((o) => o.id === id);
    return item && item.h !== null ? item.h : rowsOf(id);
  };
  return { ...layout, order: settle(order, rows) };
}

export function moveOrSwap(
  layout: PageLayout,
  dragId: string,
  targetId: string,
  zone: DropZone,
  specOf: SpecOf,
  rowsOf: RowsOf,
  now: number,
): PageLayout {
  const next = applyDrop(layout, dragId, targetId, zone, specOf, rowsOf);
  return next === layout ? layout : { ...next, savedAt: now };
}

// --- resize --------------------------------------------------------------

/** The partner's snapping formula, on a 32px row unit. */
export function snapResize(
  rect: { width: number; height: number },
  dx: number,
  dy: number,
  colW: number,
  spec: PanelSpec,
): { w: number; h: number } {
  const w = clamp(Math.round((rect.width + GAP_PX + dx) / colW), spec.minCols, maxColsOf(spec));
  const h = clamp(Math.round((rect.height + GAP_PX + dy) / ROW_UNIT), spec.minRows, MAX_ROWS);
  return { w, h };
}

export function resizePanel(
  layout: PageLayout,
  id: string,
  w: number,
  h: number | null,
  specOf: SpecOf,
  rowsOf: RowsOf,
  now?: number,
): PageLayout {
  const spec = specOf(id);
  const index = layout.order.findIndex((o) => o.id === id);
  if (!spec || index < 0) return layout;
  const next = {
    id,
    w: clamp(Math.round(w), spec.minCols, maxColsOf(spec)),
    h: h === null ? null : clamp(Math.round(h), spec.minRows, MAX_ROWS),
  };
  const current = layout.order[index];
  if (current.w === next.w && current.h === next.h) return layout;
  const order = layout.order.map((o, i) => (i === index ? next : o));
  const rows: RowsOf = (pid) => (pid === id && next.h !== null ? next.h : rowsOf(pid));
  return { ...layout, order: settle(order, rows), savedAt: now ?? layout.savedAt };
}

// --- keyboard ------------------------------------------------------------

export type Direction = "left" | "right" | "up" | "down";

function overlapsCols(a: Placed, b: Placed): boolean {
  return Math.max(a.col, b.col) < Math.min(a.col + a.w, b.col + b.w);
}

/** The neighbour in a direction: previous/next in visual order, or the overlapping card above/below. */
export function neighbourOf(placed: readonly Placed[], id: string, dir: Direction): Placed | null {
  const index = placed.findIndex((p) => p.id === id);
  if (index < 0) return null;
  const me = placed[index];
  if (dir === "left") return index > 0 ? placed[index - 1] : null;
  if (dir === "right") return index < placed.length - 1 ? placed[index + 1] : null;
  let best: Placed | null = null;
  for (const p of placed) {
    if (p.id === id || !overlapsCols(me, p)) continue;
    if (dir === "up" && p.row + p.rows <= me.row) {
      if (!best || p.row + p.rows > best.row + best.rows || (p.row + p.rows === best.row + best.rows && p.col < best.col)) best = p;
    }
    if (dir === "down" && p.row >= me.row + me.rows) {
      if (!best || p.row < best.row || (p.row === best.row && p.col < best.col)) best = p;
    }
  }
  return best;
}

export interface KeyboardResult {
  layout: PageLayout;
  message: string;
}

/** Arrow moves (insert), Shift+arrow swaps, Home/End. Edges report "Already at…" without a change. */
export function keyboardMove(
  layout: PageLayout,
  id: string,
  dir: Direction | "home" | "end",
  swap: boolean,
  specOf: SpecOf,
  rowsOf: RowsOf,
): KeyboardResult {
  const spec = specOf(id);
  const title = spec?.title ?? id;
  const placed = packLayout(layout.order, rowsOf);
  if (dir === "home" || dir === "end") {
    const index = layout.order.findIndex((o) => o.id === id);
    if (index < 0) return { layout, message: "" };
    const order = layout.order.filter((o) => o.id !== id);
    if (dir === "home") order.unshift(layout.order[index]);
    else order.push(layout.order[index]);
    const next = { ...layout, order: settle(order, rowsOf) };
    const p = packLayout(next.order, rowsOf).find((x) => x.id === id)!;
    return { layout: next, message: `${title} moved to the ${dir === "home" ? "start" : "end"}. ${describePlacement(p)}` };
  }
  const target = neighbourOf(placed, id, dir);
  if (!target) {
    const edge = dir === "up" ? "top" : dir === "down" ? "bottom" : dir === "left" ? "start" : "end";
    return { layout, message: `Already at the ${edge}.` };
  }
  const me = layout.order.find((o) => o.id === id)!;
  const other = layout.order.find((o) => o.id === target.id)!;
  const otherTitle = specOf(target.id)?.title ?? target.id;
  if (swap) {
    const why = swapRefusal(me, other, specOf);
    if (why) return { layout, message: `Can't swap ${title} with ${otherTitle}: ${why}.` };
    const next = applyDrop(layout, id, target.id, "swap", specOf, rowsOf);
    const p = packLayout(next.order, rowsOf).find((x) => x.id === id)!;
    return { layout: next, message: `${title} swapped with ${otherTitle}. ${title} is now at ${describeCells(p)}.` };
  }
  const zone: DropZone = dir === "left" || dir === "up" ? "before" : "after";
  const next = applyDrop(layout, id, target.id, zone, specOf, rowsOf);
  const p = packLayout(next.order, rowsOf).find((x) => x.id === id)!;
  return { layout: next, message: `${title} moved ${zone} ${otherTitle}. ${describePlacement(p)}` };
}

// --- announcements -------------------------------------------------------

export function describeCells(p: Placed): string {
  const last = p.col + p.w;
  return `row ${p.row + 1}, columns ${p.col + 1} to ${last}`;
}

export function describePlacement(p: Placed): string {
  const cells = describeCells(p);
  return cells.charAt(0).toUpperCase() + cells.slice(1) + ".";
}

export function describeSize(title: string, w: number, h: number): string {
  return `${title} is ${w} of ${COLS} columns wide, ${h} rows tall.`;
}

export function describeGrab(title: string): string {
  return `Grabbed ${title}. Arrow keys move it, Shift plus arrow swaps with a neighbour, Alt plus arrow resizes, Enter drops, Escape cancels.`;
}

export function describeDrop(title: string, zone: DropZone, otherTitle: string, p: Placed, refusal?: string | null): string {
  if (zone === "swap") return `${title} swapped with ${otherTitle}. ${title} is now at ${describeCells(p)}.`;
  if (refusal) return `Can't swap ${title} with ${otherTitle}: ${refusal}. Moved ${zone} ${otherTitle} instead.`;
  return `${title} moved ${zone} ${otherTitle}. ${describePlacement(p)}`;
}

export const MSG_SAVED = "Layout saved.";
export const MSG_CANCELLED = "Move cancelled.";
export const MSG_CANCELLED_NOTHING = "Move cancelled, nothing under the pointer.";
export const MSG_HEIGHT_RESET = "Height reset — the card fits its content again.";
export const MSG_LAYOUT_RESET = "Layout reset to the designed layout.";
