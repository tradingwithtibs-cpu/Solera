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
const { PANEL_REGISTRY, PHONE_TABS, specFor } = load("../src/lib/panel-registry.ts");

const EXPECTED = {
  portfolio: { hero: [1, 1], since: [9, 1], positions: [1, 13], plans: [9, 13], activity: [1, 31] },
  markets: { markets: [1, 1], asset: [5, 1], room: [1, 25] },
  preipo: { markets: [1, 1], asset: [5, 1], compare: [1, 31] },
  discover: { feed: [1, 1], trending: [9, 1] },
  leaderboard: { people: [1, 1] },
  agent: { agent: [1, 1], plans: [9, 1] },
};

test("registry invariants and the designed positions", () => {
  for (const [page, specs] of Object.entries(PANEL_REGISTRY)) {
    const ids = specs.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${page}: ids unique`);
    for (const s of specs) {
      assert.ok(L.MIN_COLS <= s.minCols && s.minCols <= s.defaultCols && s.defaultCols <= (s.maxCols ?? 12), `${page}/${s.id} cols`);
      if (s.defaultRows !== null) assert.ok(s.defaultRows >= s.minRows, `${page}/${s.id} rows`);
      if (s.phone) assert.ok(PHONE_TABS.includes(s.phone.tab), `${page}/${s.id} tab`);
    }
    const layout = L.defaultLayout(page, specs);
    const rowsOf = (id) => L.rowsFor(layout.order.find((o) => o.id === id), specFor(page, id));
    const placed = L.packLayout(layout.order, rowsOf);
    // first row fully occupied
    const firstRow = placed.filter((p) => p.row === 0).reduce((sum, p) => sum + p.w, 0);
    assert.equal(firstRow, 12, `${page}: first row spans 12 columns`);
    for (const p of placed) {
      const [col, row] = EXPECTED[page][p.id];
      assert.deepEqual([p.col + 1, p.row + 1], [col, row], `${page}/${p.id} at (${p.col + 1},${p.row + 1})`);
    }
    // phone order unique and contiguous per tab, and equal to packed order minus hidden
    const byTab = new Map();
    for (const s of specs) {
      if (!s.phone) continue;
      const list = byTab.get(s.phone.tab) ?? [];
      list.push(s);
      byTab.set(s.phone.tab, list);
    }
    for (const [tab, list] of byTab) {
      const orders = list.map((s) => s.phone.order).sort((a, b) => a - b);
      assert.deepEqual(orders, orders.map((_, i) => i + 1), `${page}/${tab}: contiguous phone order`);
      const packedIds = L.sortByPosition(layout.order, placed).map((o) => o.id).filter((id) => list.some((s) => s.id === id));
      const phoneIds = [...list].sort((a, b) => a.phone.order - b.phone.order).map((s) => s.id);
      assert.deepEqual(phoneIds, packedIds, `${page}/${tab}: phone order follows packed order`);
    }
  }
});
