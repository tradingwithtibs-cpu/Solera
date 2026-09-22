import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const L = load("../src/lib/layout.ts");
const { PANEL_REGISTRY, specFor } = load("../src/lib/panel-registry.ts");

const specOf = (page) => (id) => specFor(page, id);
const rowsOfFor = (order, page, measured = {}) => (id) => L.rowsFor(order.find((o) => o.id === id), specFor(page, id), measured[id]);
const cells = (placed) => placed.map((p) => `${p.id}@${p.col + 1},${p.row + 1}`);

test("packLayout: dense first-fit, row spans honoured, deterministic", () => {
  const rows = () => 4;
  const two = L.packLayout([{ id: "a", w: 6, h: 4 }, { id: "b", w: 6, h: 4 }], rows);
  assert.deepEqual(cells(two), ["a@1,1", "b@7,1"]);
  const wrap = L.packLayout([{ id: "a", w: 8, h: 4 }, { id: "b", w: 8, h: 4 }], rows);
  assert.deepEqual(cells(wrap), ["a@1,1", "b@1,5"]);
  const dense = L.packLayout([{ id: "a", w: 8, h: 4 }, { id: "b", w: 4, h: 4 }, { id: "c", w: 4, h: 4 }, { id: "d", w: 4, h: 4 }], rows);
  assert.deepEqual(cells(dense), ["a@1,1", "b@9,1", "c@1,5", "d@5,5"]);
  const full = L.packLayout([{ id: "a", w: 4, h: 4 }, { id: "b", w: 12, h: 4 }], rows);
  assert.deepEqual(cells(full), ["a@1,1", "b@1,5"]);
  // The markets page: 4×24 + 8×30 + 4×12 → (1,1) (5,1) (1,25)
  const m = L.packLayout([{ id: "markets", w: 4, h: 24 }, { id: "asset", w: 8, h: null }, { id: "room", w: 4, h: 12 }], (id) => ({ markets: 24, asset: 30, room: 12 })[id]);
  assert.deepEqual(cells(m), ["markets@1,1", "asset@5,1", "room@1,25"]);
  assert.deepEqual(cells(L.packLayout(m, (id) => ({ markets: 24, asset: 30, room: 12 })[id])), cells(m));
});

test("sortByPosition is a fixed point and same-footprint exchange is exact", () => {
  const order = [{ id: "a", w: 8, h: 4 }, { id: "b", w: 4, h: 4 }, { id: "c", w: 4, h: 4 }, { id: "d", w: 12, h: 4 }, { id: "e", w: 4, h: 4 }];
  const rows = () => 4;
  const sorted = L.sortByPosition(order, L.packLayout(order, rows));
  const again = L.sortByPosition(sorted, L.packLayout(sorted, rows));
  assert.deepEqual(again.map((o) => o.id), sorted.map((o) => o.id));
  assert.deepEqual(cells(L.packLayout(sorted, rows)), cells(L.packLayout(again, rows)));
  // exchange b and c (identical footprints): only their cells change
  const swapped = [order[0], order[2], order[1], order[3], order[4]];
  const p1 = new Map(L.packLayout(order, rows).map((p) => [p.id, `${p.col},${p.row}`]));
  const p2 = new Map(L.packLayout(swapped, rows).map((p) => [p.id, `${p.col},${p.row}`]));
  assert.equal(p2.get("b"), p1.get("c"));
  assert.equal(p2.get("c"), p1.get("b"));
  for (const id of ["a", "d", "e"]) assert.equal(p2.get(id), p1.get(id));
});

test("hitTest and resolveZone", () => {
  const rects = [
    { id: "a", left: 0, top: 0, width: 100, height: 100 },
    { id: "b", left: 200, top: 0, width: 100, height: 100 },
  ];
  assert.equal(L.hitTest(rects, { x: 50, y: 50 }, "b").overId, "a");
  assert.equal(L.hitTest(rects, { x: 50, y: 50 }, "a"), null);
  assert.equal(L.hitTest(rects, { x: 150, y: 50 }, "b"), null);
  assert.deepEqual(L.resolveZone(0.5, 0.5, true), { zone: "swap", axis: "x" });
  assert.equal(L.resolveZone(0.4, 0.4, false).zone, "before");
  assert.equal(L.resolveZone(0.6, 0.6, false).zone, "after");
  assert.deepEqual(L.resolveZone(0.1, 0.5, true), { zone: "before", axis: "x" });
  assert.deepEqual(L.resolveZone(0.9, 0.5, true), { zone: "after", axis: "x" });
  assert.deepEqual(L.resolveZone(0.5, 0.1, true), { zone: "before", axis: "y" });
  assert.deepEqual(L.resolveZone(0.5, 0.95, true), { zone: "after", axis: "y" });
  // boundary: 0.25 from centre is outside the swap box
  assert.equal(L.resolveZone(0.75, 0.5, true).zone, "after");
  assert.equal(L.resolveZone(0.74, 0.5, true).zone, "swap");
});

test("isSwapCompatible follows the spans and minima", () => {
  const s = specOf("portfolio");
  const hero = { id: "hero", w: 8, h: null };
  const since = { id: "since", w: 4, h: 12 };
  const plans = { id: "plans", w: 4, h: 18 };
  const activity = { id: "activity", w: 12, h: null };
  assert.equal(L.isSwapCompatible(since, plans, s), true); // same width, both sized, minima ok
  assert.equal(L.isSwapCompatible(hero, since, s), false); // hero needs 6 cols
  assert.equal(L.isSwapCompatible(activity, hero, s), true); // activity may be 8, hero may be 12
  assert.equal(L.isSwapCompatible(plans, activity, s), false); // activity minCols 6 > 4
  assert.equal(L.isSwapCompatible(since, since, s), false);
  assert.equal(L.isSwapCompatible({ id: "since", w: 4, h: 12 }, { id: "plans", w: 4, h: 4 }, s), false); // plans' slot is 4 rows, below since.minRows
  assert.match(L.swapRefusal(hero, since, s), /needs at least 6 columns/);
});

test("applyDrop / moveOrSwap", () => {
  const page = "portfolio";
  const s = specOf(page);
  const base = L.defaultLayout(page, PANEL_REGISTRY.portfolio);
  const rows = (layout) => rowsOfFor(layout.order, page);
  // same-span swap: since ↔ plans exchange positions and heights
  const swapped = L.moveOrSwap(base, "since", "plans", "swap", s, rows(base), 1);
  const bySwap = Object.fromEntries(swapped.order.map((o) => [o.id, o]));
  assert.equal(bySwap.since.h, 18);
  assert.equal(bySwap.plans.h, 12);
  assert.equal(swapped.savedAt, 1);
  assert.notEqual(swapped.order, base.order);
  assert.equal(base.order.find((o) => o.id === "since").h, 12, "input not mutated");
  // different-span swap exchanges w: activity ↔ hero
  const act = L.applyDrop(base, "activity", "hero", "swap", s, rows(base));
  const byAct = Object.fromEntries(act.order.map((o) => [o.id, o]));
  assert.equal(byAct.activity.w, 8);
  assert.equal(byAct.hero.w, 12);
  // before/after splice
  const before = L.applyDrop(base, "activity", "hero", "before", s, rows(base));
  assert.equal(before.order[0].id, "activity");
  // "after" on the last card: dense packing may pull the hero into a hole above activity; it is no longer first
  const after = L.applyDrop(base, "hero", "activity", "after", s, rows(base));
  const afterIds = after.order.map((o) => o.id);
  assert.notEqual(afterIds[0], "hero");
  assert.ok(afterIds.indexOf("hero") > afterIds.indexOf("positions"));
  // no-ops
  assert.equal(L.applyDrop(base, "hero", "hero", "swap", s, rows(base)), base);
  assert.equal(L.applyDrop(base, "nope", "hero", "swap", s, rows(base)), base);
  // incompatible swap degrades to after
  const degraded = L.applyDrop(base, "plans", "activity", "swap", s, rows(base));
  const ids = degraded.order.map((o) => o.id);
  const byDeg = Object.fromEntries(degraded.order.map((o) => [o.id, o]));
  assert.equal(byDeg.plans.w, 4, "no width exchange: the swap was refused");
  assert.equal(byDeg.activity.w, 12);
  assert.equal(ids.length, base.order.length);
  // result is position-sorted
  const p = L.packLayout(degraded.order, rows(degraded));
  const sortedIds = L.sortByPosition(degraded.order, p).map((o) => o.id);
  assert.deepEqual(ids, sortedIds);
});

test("resize snapping and clamps", () => {
  const spec = specFor("portfolio", "positions");
  const colW = 100;
  assert.deepEqual(L.snapResize({ width: 792, height: 568 }, 0, 0, colW, spec), { w: 8, h: 18 });
  assert.equal(L.snapResize({ width: 792, height: 383 }, 0, 0, colW, spec).h, 12);
  assert.equal(L.snapResize({ width: 792, height: 160 }, 0, 0, colW, spec).h, 5 < spec.minRows ? spec.minRows : 5);
  assert.equal(L.snapResize({ width: 792, height: 568 }, -900, 0, colW, spec).w, spec.minCols);
  assert.equal(L.snapResize({ width: 792, height: 568 }, 900, 0, colW, spec).w, 12);
  assert.equal(L.snapResize({ width: 792, height: 568 }, 0, 99999, colW, spec).h, L.MAX_ROWS);
  const base = L.defaultLayout("portfolio", PANEL_REGISTRY.portfolio);
  const rows = rowsOfFor(base.order, "portfolio");
  const auto = L.resizePanel(base, "positions", 8, null, specOf("portfolio"), rows, 5);
  assert.equal(auto.order.find((o) => o.id === "positions").h, null);
  assert.equal(auto.savedAt, 5);
  assert.equal(L.resizePanel(base, "positions", 8, 18, specOf("portfolio"), rows), base, "unchanged size returns the same layout");
});

test("neighbourOf and keyboardMove", () => {
  const page = "portfolio";
  const s = specOf(page);
  const base = L.defaultLayout(page, PANEL_REGISTRY.portfolio);
  const rows = rowsOfFor(base.order, page);
  const placed = L.packLayout(base.order, rows);
  assert.equal(L.neighbourOf(placed, "since", "left").id, "hero");
  assert.equal(L.neighbourOf(placed, "since", "right").id, "positions");
  assert.equal(L.neighbourOf(placed, "since", "down").id, "plans");
  assert.equal(L.neighbourOf(placed, "plans", "up").id, "since");
  assert.equal(L.neighbourOf(placed, "hero", "up"), null);
  assert.equal(L.neighbourOf(placed, "activity", "up").id, "positions");
  const edge = L.keyboardMove(base, "hero", "up", false, s, rows);
  assert.equal(edge.layout, base);
  assert.equal(edge.message, "Already at the top.");
  const moved = L.keyboardMove(base, "since", "left", false, s, rows);
  assert.equal(moved.layout.order[0].id, "since");
  assert.match(moved.message, /^Since you last looked moved before Balance\. Row 1, columns 1 to 4\./);
  const swap = L.keyboardMove(base, "since", "down", true, s, rows);
  assert.match(swap.message, /swapped with Plans/);
  const refused = L.keyboardMove(base, "hero", "right", true, s, rows);
  assert.equal(refused.layout, base);
  assert.match(refused.message, /Can't swap Balance with Since you last looked: Balance needs at least 6 columns\./);
  const end = L.keyboardMove(base, "hero", "end", false, s, rows);
  const endIds = end.layout.order.map((o) => o.id);
  assert.notEqual(endIds[0], "hero");
  assert.ok(endIds.indexOf("hero") > endIds.indexOf("positions"));
  assert.match(end.message, /moved to the end/);
});

test("normalizeLayout repairs anything", () => {
  const page = "portfolio";
  const specs = PANEL_REGISTRY.portfolio;
  const def = L.defaultLayout(page, specs);
  assert.deepEqual(L.normalizeLayout("{not json", page, specs).layout.order, def.order);
  assert.deepEqual(L.normalizeLayout({ v: 2, page, order: [] }, page, specs).layout.order, def.order);
  assert.deepEqual(L.normalizeLayout({ v: 1, page: "markets", order: [] }, page, specs).layout.order, def.order);
  const raw = { v: 1, page, order: [{ id: "ghost", w: 4, h: 4 }, { id: "since", w: 99, h: "12" }, { id: "hero", w: 1, h: 999 }], savedAt: 3 };
  const { layout, isCustom } = L.normalizeLayout(raw, page, specs);
  const ids = layout.order.map((o) => o.id);
  assert.ok(!ids.includes("ghost"));
  assert.deepEqual([...ids].sort(), ["activity", "hero", "plans", "positions", "since"]);
  const since = layout.order.find((o) => o.id === "since");
  assert.equal(since.w, 12);
  assert.equal(since.h, null);
  const hero = layout.order.find((o) => o.id === "hero");
  assert.equal(hero.w, 6);
  assert.equal(hero.h, L.MAX_ROWS);
  assert.equal(isCustom, true);
  assert.equal(L.normalizeLayout(JSON.stringify(def), page, specs).isCustom, false);
});

test("storage keys and announcement helpers", () => {
  const keys = ["portfolio", "markets", "preipo", "discover", "leaderboard", "agent"].map(L.storageKey);
  assert.equal(keys[0], "solera:layout:portfolio");
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(L.describeSize("Balance", 7, 12), "Balance is 7 of 12 columns wide, 12 rows tall.");
  assert.equal(L.describeGrab("Balance"), "Grabbed Balance. Arrow keys move it, Shift plus arrow swaps with a neighbour, Alt plus arrow resizes, Enter drops, Escape cancels.");
  const p = { id: "hero", w: 8, h: null, col: 0, row: 1, rows: 12 };
  assert.equal(L.describeDrop("Balance", "before", "Your positions", p), "Balance moved before Your positions. Row 2, columns 1 to 8.");
  assert.equal(L.describeDrop("Balance", "swap", "Since you last looked", { ...p, w: 4, col: 8, row: 0 }), "Balance swapped with Since you last looked. Balance is now at row 1, columns 9 to 12.");
  assert.equal(
    L.describeDrop("Balance", "after", "Since you last looked", p, "Balance needs at least 6 columns"),
    "Can't swap Balance with Since you last looked: Balance needs at least 6 columns. Moved after Since you last looked instead.",
  );
});
