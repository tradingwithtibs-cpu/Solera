# Layout engine: the React panel grid

Spec for the `PanelGrid` + `Panel` pair that replaces the partner's `assets/layout.js` (104 lines, HTML5 drag-and-drop, desktop only) and the phone shell in `assets/mobile.js` / `assets/mobile.css`, on the live Next.js 16.3.5 / React 19.2.8 app. It covers the data model, drag / resize / **swap-on-drop**, keyboard and touch, the implementation plan, the per-page default layouts, the six-tab phone shell, performance and tests.

Status: design document, no code. Every claim about the partner build cites `file:line` under `/Users/tibet/Desktop/solerafinal/assets/`; every claim about the live app cites `/Users/tibet/code/stocklana/src/`. Tokens and class names (`--grid-gap`, `--ink-panel`, `--era-3`, `.ly-grip`, `.ly-resize`, `.tabbar`…) are the ones defined in the companion `docs/port/design-system.md` (sections 1.7, 4.1, 4.14, 6), so the two documents describe one system. Verification log at the end.

## 0. What the partner built, verified

- **Cards.** Every `.grid > .panel` is a card; the shell renders `<section class="panel ${id}" id="${id}">` for each id in `PAGES[PAGE].panels` (`engine.js:291`). `PAGES` (`engine.js:48-55`): `portfolio: [hero, since, positions, plans, calendar]`, `markets: [markets, asset, room]`, `preipo: [markets, asset]`, `leaderboard: [people]`, `discover: [feed, trending]`; plugins mutate it: `markets → [markets, asset, room, signals, flows]` (`signals.js:14`), `agent: [agent]` (`plans.js:15`), `preipo → [markets, asset, ladder]` (`bounty.js:15`).
- **Grid.** 12 columns, `gap: 8px; padding: 8px 16px 24px; max-width: 1520px` (`terminal.css:49`, overriding `base.css:59`'s 20px gap). Per-page `grid-template-areas` (`terminal.css:145-148`, `:277`, `:412`, `:477`, `:543`) with `grid-auto-rows: min-content; align-items: start` (`terminal.css:150`). Sidenav is 200px (`terminal.css:122`). At 1440px that gives a column of `(1440 − 200 − 32 + 8) / 12 = 101.3px`; a 4-column card is 397px, which is exactly the Markets card in `docs/design-reference/partner-markets-desktop.png` (x 216→613).
- **Persistence.** `{ order: [id], spans: { id: n }, heights: { id: px } }` under `solera-layout-v1:<page>` (`layout.js:10-12`, `:17-18`). Default spans are parsed back out of the page's computed `grid-template-areas` (`layout.js:21-26`). A customised grid gets `.custom`: `grid-template-areas: none; grid-auto-flow: row dense; align-items: start` and every card `grid-row: auto !important` (`terminal.css:357-358`), so a designed two-row card (the markets page's `asset`, `terminal.css:146`) collapses to one row the moment the user touches anything.
- **Drag.** A `⋮⋮` grip is injected as the first child of `.panel-head`, `draggable = true` (`layout.js:48`); `dragstart` sets a drag image of the whole card (`layout.js:54`); `drop` on another card inserts before or after it by which horizontal half the pointer is in (`layout.js:62`), saves, re-applies, toasts "Layout saved for this page."
- **Resize.** Corner handle with pointer capture (`layout.js:66-80`): `span = max(3, min(12, round((rect.width + gap + dx) / colW)))` (`:72`), `height = max(160, round(h0 + dy))` px (`:73`), badge `"${span} / 12 · ${h}px"` (`:76`); `dblclick` deletes the height and toasts "Height reset — the card fits its content again." (`:81`). A sized card scrolls with a sticky head (`terminal.css:359-360`).
- **Reset.** Footer link `#ly-reset` removes the key and `location.reload()`s (`layout.js:85-90`). One-time hint toast per browser under `solera-layout-hint`, handles pulse for 6s (`layout.js:99`, `terminal.css:427-428`).
- **Gates.** Desktop means `matchMedia('(min-width: 1101px)')` (`layout.js:15`); at `≤ 1100px` every card is forced full width with `!important` (`terminal.css:545`) and the grip, handle, badge and reset link are hidden (`terminal.css:429`). Charts are re-rendered from a `ResizeObserver` on the grid (`layout.js:100`) and on every `window` resize (`:101`).
- **Phone shell.** `mobile.js:14` mounts six tabs `Portfolio, Markets, Trade, Discover, People, Agent`; `mobile.css:20` turns the grid into a flex column with `padding: 10px 12px calc(84px + env(safe-area-inset-bottom))`; `mobile.css:22-29` shows a fixed set of panel ids per tab; tapping a market row switches to the Trade tab after 120ms (`mobile.js:35`). The tab bar is `position: fixed; grid-template-columns: repeat(var(--n), 1fr); background: #0b0d16f0; backdrop-filter: blur(14px)` with a 2px indicator that slides on `--i` (`mobile.css:50-51`); labels are 9px then 8px uppercase (`mobile.css:52`, `:71`).
- **Content reflow** is by `@container` queries on `.panel { container-type: inline-size }` (`terminal.css:356`, rules at `:370-381`), not by viewport width. This is the part that makes resizable cards work and it ports as-is.

**Kept:** 12 columns, 8px gap, 1520px max, the grip in the head, the corner handle, column snapping, per-page persistence and reset, the desktop gate, the one-time hint, container-query reflow, the six phone tabs and their per-tab stacks.
**Changed:** Pointer Events instead of HTML5 DnD (touch, keyboard, announcements); a **row unit** instead of free pixel heights, so a card has a footprint; our own deterministic packer instead of `grid-auto-flow: dense` (positions are known, testable, and a designed two-row card survives customisation); reset without a reload; and the new **swap-on-drop**.

## 1. Data model

### 1.1 Constants (`src/lib/layout.ts`)

| Constant | Value | Source / reason |
|---|---|---|
| `COLS` | `12` | `terminal.css:49`, `base.css:59`, `layout.js:11` |
| `GAP_PX` | `8` | `terminal.css:49`; exposed as `--grid-gap` (design-system 1.7) |
| `ROW_PX` | `24` | one implicit row track. A **row unit** is `ROW_PX + GAP_PX = 32px`; a card `h` rows tall is `32h − 8` px. 32 is also `--head-h`, so a head is exactly one unit. |
| `MIN_COLS` | `3` | `layout.js:38`, `:72` |
| `MIN_ROWS` | `5` | `5 × 32 − 8 = 152px` ≈ the partner's 160px floor (`layout.js:73`) |
| `MAX_ROWS` | `80` | 2552px; a sanity cap for corrupt storage |
| `DESKTOP_MIN_PX` | `1101` | live grid + handles at `≥ 1101px` (`layout.js:15`); collapse at `≤ 1100px` (`terminal.css:545`) |
| `PHONE_MAX_PX` | `767` | phone shell at `≤ 767px`, the live app's existing breakpoint (`globals.css:478`, `:634`) |
| `LONG_PRESS_MS` | `300` | touch drag activation |
| `DRAG_SLOP_PX` | `4` (mouse/pen), `8` (touch) | movement before a drag starts / cancels a long-press |

`ROW_PX` and `GAP_PX` are written by `PanelGrid` as inline custom properties `--grid-row` / `--grid-gap` on the grid element, so CSS and JS cannot drift.

### 1.2 Panel registry (`src/lib/panel-registry.ts`)

```ts
export type PageId = "portfolio" | "markets" | "preipo" | "discover" | "leaderboard" | "agent";
export type PhoneTab = "portfolio" | "markets" | "trade" | "discover" | "people" | "agent";

export interface PanelSpec {
  id: string;                 // stable lowercase word; the data-panel attribute and the storage id
  title: string;              // head label; rendered as "// TITLE" (terminal.css:55)
  minCols: number;            // ≥ MIN_COLS
  maxCols?: number;           // default COLS
  minRows: number;            // ≥ MIN_ROWS; applies whenever the card is sized
  defaultCols: number;        // designed span, from the partner's grid-template-areas
  defaultRows: number | null; // null = auto height (content decides); number = sized, body scrolls
  phone: { tab: PhoneTab; order: number } | null; // where the card lives on a phone; null = never shown there
}

export const PANEL_REGISTRY: Record<PageId, readonly PanelSpec[]> = { /* section 5 */ };
```

Rules:
- Registry order is the default `order`. Default `(col, row)` is not stored; it is what the packer (1.4) produces from the default order and spans. Section 5 tabulates the result and a test pins it.
- Any card can be **auto** (`h: null`, box = content) or **sized** (`h` rows, body scrolls). `defaultRows` only sets the initial state; double-click on the handle returns any card to auto (the partner's `dblclick` semantics, `layout.js:81`).
- Titles are fixed strings. Only the `asset` and `room` cards carry data in the title (the selected ticker, e.g. `TSLAx room`), which is real data.
- Ids are unique per page; the same id on two pages (`markets`, `asset`, `plans`) is the same component with an independent saved layout per page.

### 1.3 Persisted layout

```ts
export interface PanelLayout { id: string; w: number; h: number | null }   // h in row units; null = auto
export interface PageLayout {
  v: 1;                    // schema version; anything else is discarded
  page: PageId;
  order: PanelLayout[];    // visual order: row-major after packing (invariant, 1.4)
  savedAt: number;         // Date.now()
}
```

- **Key:** `solera:layout:<page>`, e.g. `solera:layout:portfolio`. This sits beside the app's existing keys `solera:trade-mode` (`use-trade-mode.ts:7`), `solera:live-trades` (`use-live-portfolio.ts:14`), `solera:deeplink-pending` / `solera:deeplink-result` (`deferred-signing.ts:53-54`), `solera:phantom-deeplink` (`phantom-deeplink-adapter.ts:38`) and the older `stocklana:*` keys. One more key, `solera:layout:hint = "1"`, records that the first-visit hint was shown (partner: `solera-layout-hint`, `layout.js:99`). The partner's `solera-layout-v1:*` blobs are never read: the shape differs (pixel heights) and nothing shipped with them.
- **Store:** `src/hooks/use-page-layout.ts`, the module-level `useSyncExternalStore` pattern the app already uses in `use-watchlist.ts:17-38`: snapshot read once at module load, `getServerSnapshot` returns `defaultLayout(page)`, one post-mount nudge (`use-watchlist.ts:63-65`), `try/catch` around every storage call. `localStorage` is browser-only, so this is Client Component territory (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:26`).
- **Normalise on read** (`normalizeLayout(raw, specs): PageLayout`, pure, tested):
  1. Unparsable JSON, `v !== 1`, or `page` mismatch → default.
  2. Drop entries whose `id` is not in the registry.
  3. Append registry panels missing from `order` at their registry index, with default spans (adding a card later never wipes a saved layout).
  4. Clamp `w` to `[minCols, maxCols ?? COLS]`; numeric `h` to `[minRows, MAX_ROWS]`; anything non-numeric → `null`.
  5. Re-sort by packed position (1.4) so a hand-edited blob still satisfies the invariant.
  6. `isCustom = !deepEqual(result, defaultLayout(page))` (a layout dragged back to the design is not "custom").
- **Write:** on drop (pointer or keyboard), on pointer-up of a resize, on double-click reset of a height, and on reset. Never during a move.
- **Reset:** `removeItem(key)`, snapshot ← default, announce "Layout reset to the designed layout." No reload (the partner reloads, `layout.js:88`). Surfaced as the footer "Reset layout" link (`.ly-reset`, only while `isCustom`, partner `layout.js:85-90`) and as a ⌘K command "Reset layout for this page".
- **Cross-tab:** subscribe to the `window` `storage` event for this page's key and re-read, so two tabs cannot clobber each other.
- **Not for Thursday:** per-wallet persistence. The store interface (`read / write / reset`) is the only seam. The table, when wanted:
  ```sql
  create table if not exists layouts (
    wallet     text        not null,
    page       text        not null,
    layout     jsonb       not null,
    updated_at timestamptz not null default now(),
    primary key (wallet, page)
  );
  ```
  Vercel Hobby needs nothing for the client-only version: no function, no cron.

### 1.4 Packing: order + spans → positions

The heart of the engine, a pure function, exhaustively tested:

```ts
export interface Placed extends PanelLayout { col: number; row: number; rows: number }  // 0-based; rows = height used for packing
export function packLayout(order: PanelLayout[], rowsOf: (id: string) => number, cols = COLS): Placed[]
// rowsOf(id) = h if numeric, else measuredRows[id] ?? spec.defaultRows ?? MIN_ROWS
```

Algorithm: dense first-fit over a growing boolean occupancy grid, in `order`. For each item scan `row = 0…`, `col = 0…cols − w`, and take the first free `w × rows` rectangle. It is what `grid-auto-flow: row dense` does, done in JS so that (a) positions are known for hit-testing, keyboard neighbours and announcements, (b) it is unit-testable, (c) DOM order can follow visual order, (d) row spans exist, so the markets page's tall `asset` card keeps its two-row footprint after customisation (the partner's collapses, `terminal.css:358`).

**Invariant:** after every commit, `order` is re-sorted by `(row, col)` of the packed result (`sortByPosition`). Re-packing a sorted order is a fixed point (a test asserts it), so DOM order = visual order = tab order on desktop. A dense fill can pull a small card into a hole above a larger one on the *first* pack after an edit; the re-sort makes that the new order and the announcement names the resulting row and column, so nothing moves silently.

**Determinism:** packing is a function of the *sequence of footprints* `(w, rows)` only, never of ids. Two cards with identical footprints that exchange indices therefore exchange cells exactly, and nothing else moves. Section 2.2 leans on this.

### 1.5 Placement → CSS

`Panel` writes `--col`, `--row`, `--w`, `--h` (1-based, from `Placed`) inline; the stylesheet does the placement with the `grid-area` shorthand:

```css
.panel { grid-area: var(--row) / var(--col) / span var(--h) / span var(--w); }
```

Only the custom properties are inline, so the tablet and phone media queries (4.3) can override placement with ordinary later rules, no `!important` fight.

## 2. Interaction spec (pointer)

All pointer work uses Pointer Events with `setPointerCapture` on the handle, as the partner already did for resize (`layout.js:70`). No HTML5 DnD anywhere. The grip and the resize handle carry `touch-action: none; user-select: none; -webkit-touch-callout: none`; the rest of the card scrolls and selects normally.

### 2.1 Drag by the head grip

Handle: `<button type="button" class="ly-grip" aria-label="Move {title}" aria-pressed={grabbed} aria-describedby={gridHelpId}>⋮⋮</button>`, the first child of `.panel-head` (partner glyph and placement, `layout.js:48`). Rest colour `--line-strong`, `--text-2` on card hover, `--text-accent` on its own hover (design-system 4.1); `cursor: grab` / `grabbing`. On `pointer: coarse` the hit area is 44×44 (padding), glyph unchanged.

Sequence:
1. `pointerdown` on the grip, primary button only: `setPointerCapture`; record the pointer's document coordinates, the grab offset inside the card, and **`rectsAtStart`**: every card's `getBoundingClientRect()` converted to document coordinates (`top + scrollY`, `left + scrollX`). Snapshot the layout for cancel.
2. Activation: mouse/pen when the pointer has moved ≥ `DRAG_SLOP_PX`; touch after `LONG_PRESS_MS` with < 8px of movement (moving earlier releases capture and lets the page scroll). On activation: `navigator.vibrate?.(10)` (no-op on iOS), the grid gets `data-dragging="{id}"`, the source card gets `.ly-dragging` (opacity .35, `terminal.css:366`), the **ghost** appears, the live region says "Moving Balance."
3. Ghost: one `position: fixed; pointer-events: none` element the size of the source card, containing only the card's head (grip glyph + `// TITLE`), on `--ink-panel` with `outline: 1px solid var(--era-3)` and `--glow-action`. It follows the pointer through `transform: translate3d()` written straight to the node from a ref inside `requestAnimationFrame`. No React state per move. (The partner used `setDragImage(p, 40, 20)`, `layout.js:54`, which HTML5 DnD provides for free; a head-only ghost is what we can draw cheaply without cloning React subtrees.)
4. Hit-test per animation frame, **pure and against `rectsAtStart`**, not the live DOM: `hitTest(rectsAtStart, pointerDoc, dragId): { overId, zone } | null` (zones in 2.2). Testing against the start snapshot means the preview in step 5 can move cards under the pointer without the target flickering (the classic drag-and-drop oscillation). State `{ overId, zone }` is set only when it changes.
5. Preview: with a pending `{ overId, zone }`, the grid renders `applyDrop(layout, dragId, overId, zone)` (2.2) instead of `layout`, so the other cards slide to where they will land and the source card's slot is drawn as a dashed placeholder. The target card also gets `.ly-over-before` / `.ly-over-after` (a 3px `--era-3` bar on its left / right edge, or top / bottom for a vertical zone) or `.ly-over-swap` (dashed `--era-3` outline + inset wash, `terminal.css:367`, plus a small `⇄ SWAP` chip in its head). If time is short, ship step 5 as the target highlight only; the hit-test does not change.
6. Auto-scroll: pointer within 56px of the viewport top or bottom scrolls `window` by up to 14px per frame, eased by distance. Because hit-testing is in document coordinates, scrolling needs no re-measurement.
7. `pointerup`: commit `moveOrSwap(...)`, re-sort, save, announce, remove ghost and classes. No `overId` → nothing changes, announce "Move cancelled, nothing under the pointer."
8. Cancel: `Escape`, `pointercancel`, `lostpointercapture` without an up, `window` `blur` → restore the snapshot, no save, announce "Move cancelled."

Optional, last: a FLIP transition on commit and on preview changes (`usePanelFlip`): read each card's rect in a layout effect before the change, animate `transform` from the delta to none over 180ms with `--ease`. Off under `prefers-reduced-motion: reduce` (the partner disables all motion there, `base.css:261`; the design-system's reduced-motion block does the same).

### 2.2 Swap-on-drop (new)

**Zones** on the target card. With `px = (pointerX − rect.left) / rect.width` and `py = (pointerY − rect.top) / rect.height`, both in `[0, 1]`, and `dx = px − 0.5`, `dy = py − 0.5`:

| Condition | Zone | Result |
|---|---|---|
| `max(abs(dx), abs(dy)) < 0.25` (the centre half in both axes) and `isSwapCompatible(dragged, target)` | `swap` | the two cards exchange slots |
| centre but not compatible | `before` if `dx < 0` else `after` | insert, and the announcement says why it did not swap |
| outside the centre, `abs(dx) ≥ abs(dy)` | `before` (left) / `after` (right) | the partner's half rule (`layout.js:62`) |
| outside the centre, `abs(dy) > abs(dx)` | `before` (top) / `after` (bottom) | reading order on a tall card |

`resolveZone(px, py, compatible): DropZone` is pure and tested. There is no "above/below" in the model itself: `before` and `after` are positions in `order`; the packer decides rows.

**Compatible, precisely.** Let `a` be the dragged card and `b` the target, each `{ id, w, h }` with specs `sa`, `sb`:

```ts
export function isSwapCompatible(a: PanelLayout, b: PanelLayout, specOf: (id: string) => PanelSpec): boolean {
  if (a.id === b.id) return false;
  const sa = specOf(a.id), sb = specOf(b.id);
  const fits = (w: number, s: PanelSpec) => w >= s.minCols && w <= (s.maxCols ?? COLS);
  if (!fits(b.w, sa) || !fits(a.w, sb)) return false;            // each card must be allowed at the other's width
  if (a.h !== null && b.h !== null)                              // heights travel with the slot only when both are sized
    return b.h >= sa.minRows && a.h >= sb.minRows;
  return true;                                                   // an auto card keeps its own height either way
}
```

Three cases:
- **Same footprint** (`a.w === b.w` and `a.h === b.h`, both auto or both sized to the same rows): always compatible. The swap is an exact exchange of cells; by 1.4's determinism nothing else moves.
- **Swappable spans** (different `w` and/or `h`, both cards allowed at the other's size): compatible. The cards trade *slots*: `w` is exchanged, and `h` is exchanged when both are sized. The slot is the thing being swapped and the card adapts to it, which is what makes "put this card where that one is" true. When both are sized the footprint sequence is unchanged and the exchange is again exact. When one card is auto it keeps its content height, so the packer reflows the cards below; the announcement states where each ended up.
- **Mismatched** (one card's `minCols`, `maxCols` or `minRows` rejects the other's slot): not compatible. The drop is an insert (`before`/`after` by the rules above) and the live region explains: *"Can't swap Balance with Since you last looked: Balance needs at least 6 columns. Moved after Since you last looked instead."* This is the safety property: a chart card is never crushed into a sidebar slot by a drop.

Worked examples on the portfolio page (spans from section 5): `since (4×12)` onto the centre of `plans (4×18)` → swap; since becomes 18 rows at plans' slot, plans 12 rows at since's slot, exact exchange. `hero (8, min 6)` onto `since (4)` → mismatched, insert. `activity (12, min 6)` onto `hero (8)` → compatible (activity may be 8 wide, hero may be 12): activity takes the 8-wide slot beside `since`, hero becomes 12 wide on the last row; both auto, so the rows reflow. `plans (4)` onto `activity (12)` → mismatched (`activity.minCols = 6 > 4`), insert.

Commit:

```ts
export type DropZone = "before" | "after" | "swap";
export function moveOrSwap(layout: PageLayout, dragId: string, targetId: string, zone: DropZone, specOf): PageLayout
// swap:   exchange the two entries' indices; if w differs, exchange w; if both h are numeric, exchange h
// before: remove dragId, splice it at index(targetId)
// after:  remove dragId, splice it at index(targetId) + 1
// then:   order = sortByPosition(packLayout(order, rowsOf)); savedAt = Date.now()
```

`moveOrSwap` never throws: unknown ids or `dragId === targetId` return the layout unchanged, and a stale `swap` for an incompatible pair degrades to `after`. `applyDrop` is the same function without the `savedAt` bump, used for the preview.

### 2.3 Resize by the corner handle

Handle: `<button type="button" class="ly-resize" aria-label="Resize {title}">` absolutely positioned bottom-right, 18×18 (28×28 and always faintly visible under `pointer: coarse`), `cursor: nwse-resize`, the partner's diagonal-stripe gradient (`terminal.css:362`) recoloured to `--era-3` (design-system 4.1), opacity .35 → .8 on card hover.

Sequence (`layout.js:66-80` semantics, with snapped rows):
1. `pointerdown`: `setPointerCapture`; read `colW = (grid.clientWidth − paddingLeft − paddingRight + GAP_PX) / COLS` (the partner's formula, `layout.js:68`); record the card's rect, `w0`, `h0`; the card gets `.ly-resizing` (`terminal.css:365`), `body` gets `.ly-noselect` (`terminal.css:382`). Snapshot for cancel.
2. `pointermove`:
   `w = clamp(round((rect.width + GAP_PX + dx) / colW), minCols, maxCols ?? COLS)`
   `h = clamp(round((rect.height + GAP_PX + dy) / (ROW_PX + GAP_PX)), minRows, MAX_ROWS)`
   State updates only when the snapped `w` or `h` changes (a handful per gesture). The grid re-packs live so neighbours slide. The badge (`.ly-badge`, `terminal.css:364`, on `--grad-action`) reads `7 / 12 · 12 rows · 376 px`. Resizing always produces a sized card, as in the partner (`layout.js:75`).
3. `dblclick` on the handle: `h = null` (auto), announce "Height reset — the card fits its content again." (the partner's copy, `layout.js:81`).
4. `pointerup`: save, announce "Balance is 7 of 12 columns wide, 12 rows tall."
5. `Escape` / `pointercancel`: restore the snapshot.

A sized card gets `data-sized`; its `.panel-body` becomes the scroll container (`overflow-y: auto; scrollbar-width: thin`) and the head stays put because it is outside the scroller. This replaces the partner's whole-card scroll with a sticky head (`terminal.css:359-360`) and looks the same. Content reflows to the card's width through the `@container` rules each panel ports with its body (`terminal.css:370-381`); that work belongs to the panel ports, not to this engine.

Tablet (768–1100px): width resize is off (every card is full width), height resize stays on.

### 2.4 Feedback policy

- One visually-hidden `role="status" aria-live="polite"` region per `PanelGrid` (`LayoutAnnouncer`). Each event replaces the message; it is cleared after 3s so a repeated message re-announces. Exact strings in 3.1.
- No toast on every drop (the partner toasts "Layout saved for this page.", `layout.js:62`): the footer's "Reset layout" link appearing is the visible signal, the live region the audible one.
- First visit at `≥ 1101px`, once per browser (`layout.js:99`): toast "Every card is a widget: drag it by ⋮⋮, resize it from the corner. Layouts save per page." plus the handle pulse for 4s (`body.ly-hint`, `terminal.css:427-428`; design-system 6 shortens it from 6s), then `solera:layout:hint = "1"`.

## 3. Keyboard and touch

### 3.1 Keyboard

The grip and the resize handle are real `<button>`s in the tab order, in visual order (1.4 invariant). The focus ring is the app's existing `:focus-visible` rule (3px `#6d5eea`, `globals.css:217-219`), restyled by the design-system doc.

**Grip focused, not grabbed:** `Enter` / `Space` → grab: `aria-pressed="true"`, layout snapshot, grid `data-keyboard-drag="{id}"`, card `.ly-dragging`.

**Grabbed** (each key commits to state, not storage; `Escape` restores the snapshot):

| Key | Action |
|---|---|
| `←` / `→` | insert before the previous / after the next card in visual order |
| `↑` / `↓` | insert before the card **above** / after the card **below** (definition follows); none → "Already at the top." / "Already at the bottom." |
| `Shift + arrow` | swap with that neighbour if `isSwapCompatible`, else announce the reason and do nothing |
| `Alt + ←` / `Alt + →` | `w − 1` / `w + 1`, clamped |
| `Alt + ↑` / `Alt + ↓` | `h − 1` / `h + 1`; an auto card first becomes sized at its measured rows |
| `Alt + 0` | height back to auto |
| `Home` / `End` | move to first / last |
| `Enter` / `Space` | drop: save, announce, `aria-pressed="false"` |
| `Escape` | cancel: restore, announce |
| `Tab` (focus leaves) | treated as drop |

Above/below, precisely (0-based `Placed`): `above(a)` is the card `b` with `b.row + b.rows ≤ a.row` and column overlap `max(a.col, b.col) < min(a.col + a.w, b.col + b.w)`, choosing the largest `b.row + b.rows`, ties by smallest `col`. `below(a)` is symmetric with `b.row ≥ a.row + a.rows`, choosing the smallest `b.row`. Pure `neighbourOf(placed, id, dir)`, tested.

**Resize handle focused:** arrows resize without `Alt` (`← →` width, `↑ ↓` height), `Enter` saves, `Escape` restores, `Delete` / `Backspace` = auto height.

Focus retention: React reorders keyed children with `insertBefore`, which removes and re-inserts the node and blurs it in every engine. After each keyboard move `PanelGrid` re-focuses the grabbed grip in a layout effect (`focus({ preventScroll: true })`) and `scrollIntoView({ block: "nearest" })`.

Announcements (exact strings, asserted by tests through `describe*` helpers):
- "Grabbed Balance. Arrow keys move it, Shift plus arrow swaps with a neighbour, Alt plus arrow resizes, Enter drops, Escape cancels."
- "Balance moved before Your positions. Row 2, columns 1 to 8."
- "Balance swapped with Since you last looked. Balance is now at row 1, columns 9 to 12."
- "Can't swap Balance with Since you last looked: Balance needs at least 6 columns. Moved after Since you last looked instead."
- "Balance is 7 of 12 columns wide, 12 rows tall."
- "Layout saved." · "Move cancelled." · "Height reset — the card fits its content again." · "Layout reset to the designed layout." · "Already at the top."

### 3.2 Touch

- A 300ms long-press on the grip starts a drag (2.1 step 2); moving more than 8px before that lets the page scroll instead. Only the grip and the resize handle have `touch-action: none`.
- `pointer: coarse` → grip hit area 44×44, resize handle 28×28 at opacity .5 without hover.
- Pointer capture keeps the gesture alive when the finger leaves the card; `pointercancel` (iOS gesture interruption) cancels cleanly.
- Below 768px there is no grid and no handle (section 6). 768–1100px: long-press reorder works in the single column, height resize works.
- iOS Safari: `-webkit-touch-callout: none` and `user-select: none` on the grip, or the callout menu wins the long-press. Must be verified in Safari and inside Phantom's in-app browser (the deeplink flow the app already supports).

## 4. Implementation plan

### 4.1 Files

| File | Role |
|---|---|
| `src/lib/layout.ts` | pure: constants, types, `defaultLayout`, `normalizeLayout`, `packLayout`, `sortByPosition`, `hitTest`, `resolveZone`, `isSwapCompatible`, `moveOrSwap` / `applyDrop`, `resizePanel`, `keyboardMove`, `neighbourOf`, `describePlacement` and friends, `storageKey(page)` |
| `src/lib/panel-registry.ts` | `PANEL_REGISTRY` (section 5) and `PHONE_TABS` (section 6); pure data, tested for invariants |
| `src/hooks/use-page-layout.ts` | localStorage store per page (`useSyncExternalStore`): `{ layout, isCustom, commit, reset }` |
| `src/hooks/use-media.ts` | `useMediaQuery(query)` via `useSyncExternalStore` on `matchMedia` (server snapshot `false`); gates interactions only, never changes the DOM |
| `src/components/panels/PanelGrid.tsx` | `"use client"`. Owns drag / resize / keyboard state, measured rows, packing, the announcer; renders `<section class="panel-grid">` and one `PanelSlot` context per child |
| `src/components/panels/Panel.tsx` | the card shell: head (grip, `// TITLE`, subtitle, `tools`), `.panel-body` → `.panel-inner`, `.panel-foot`, resize handle, badge. Reads its slot context; `static` mode for non-grid routes |
| `src/components/panels/usePanelDrag.ts`, `usePanelResize.ts` | the two pointer state machines from section 2; ghost and auto-scroll live in `usePanelDrag` |
| `src/components/panels/usePanelSize.ts` | `{ width, height }` of this card's `.panel-body`, one `ResizeObserver` per caller, throttled to a frame; for chart panels |
| `src/components/panels/LayoutAnnouncer.tsx` | the live region |
| `src/components/panels/ResetLayoutLink.tsx` | footer link, rendered only while `isCustom` |
| `src/components/panels/panels.css` | imported from `globals.css`: grid, card chrome, states, breakpoints (4.3) |
| `tests/layout.test.mjs`, `tests/panel-registry.test.mjs` | `node:test` with the repo's `ts.transpileModule` loader (`tests/portfolio.test.mjs:8-14`) |

No new dependency (4.5).

### 4.2 Component API

```tsx
// src/app/portfolio/page.tsx ("use client", as today)
<PanelGrid page="portfolio">
  <Panel id="hero" title="Balance" tools={<RangeSwitch />}>…</Panel>
  <Panel id="since" title="Since you last looked" subtitle={sinceLabel}>…</Panel>
  <Panel id="positions" title="Your positions" subtitle={`${n} open`} foot="Every fill carries its note.">…</Panel>
  <Panel id="plans" title="Plans">…</Panel>
  <Panel id="activity" title="Recent fills">…</Panel>
</PanelGrid>
```

- `PanelGrid` collects children by their `id` prop (`Children.toArray`; dev warning for an id missing from the registry; registry ids with no child are skipped). It renders them in packed order, each inside `<PanelSlot.Provider value={slot}>` where `slot` is memoised per card: `{ placement, isDragging, overZone, grabbed, isSized, reportRows, handlers, phone, gridHelpId }`. Page content elements are passed through by reference, so a `PanelGrid` state change re-renders the `Panel` shells (they read the context) but React bails out of their unchanged `children` elements. No `React.memo` on page content is needed.
- `Panel` renders `<section class="panel" data-panel={id} data-sized={h !== null || undefined} data-phone-hidden={…} style={{ "--col": col + 1, "--row": row + 1, "--w": w, "--h": rows, "--phone-order": order }}>`. The card is a flex column stretched to its grid area (`height: 100%`); `.panel-body { flex: 1 1 auto; min-height: 0 }`.
- **Auto-height measurement.** One `ResizeObserver` per auto card on `.panel-inner` (never on the card box, which equals the grid area and would feed back), reporting `rows = ceil((inner.offsetHeight + headH + footH + GAP_PX) / (ROW_PX + GAP_PX))` through `reportRows(id, rows)` only when it changes. `PanelGrid` keeps `measuredRows` in a ref and bumps a version state, batched to one bump per frame. Convergence: the card's width is fixed by its column span, the content's height depends on that width only, so the measured rows settle in one pass; a card whose data arrives later grows once and neighbours re-pack once.
- Sized cards are not observed: their box is `h` rows and the body scrolls.
- `static` mode (`<Panel static title="Activity" action={<Back />}>`): chrome only, no grip, no handle, no context needed; used by the routes in 5.7.

### 4.3 CSS skeleton (`panels.css`)

```css
.panel-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: var(--grid-row); gap: var(--grid-gap); padding: 8px 16px 24px; max-width: var(--grid-max); margin: 0 auto; align-items: stretch; }
.panel { grid-area: var(--row) / var(--col) / span var(--h) / span var(--w); min-width: 0; height: 100%; display: flex; flex-direction: column; position: relative; container-type: inline-size; background: var(--ink-panel); border: 1px solid var(--line); border-radius: var(--radius-panel); animation: rise .9s var(--ease) both; }
.panel-grid[data-entered] .panel { animation: none; }            /* set after first paint; reorders re-insert nodes and would replay the entrance */
.panel-body { flex: 1 1 auto; min-height: 0; }
.panel[data-sized] > .panel-body { overflow-y: auto; scrollbar-width: thin; }
.panel.ly-dragging { opacity: .35; }
.panel.ly-over-swap { outline: 1px dashed var(--era-3); box-shadow: inset 0 0 0 999px #482efa10; }
.panel.ly-over-before::before, .panel.ly-over-after::after { content: ""; position: absolute; top: 0; bottom: 0; width: 3px; background: var(--era-3); }
.panel.ly-over-before::before { left: -6px; }  .panel.ly-over-after::after { right: -6px; }
.panel.ly-over-before[data-axis="y"]::before { inset: -6px 0 auto 0; width: auto; height: 3px; }
.panel.ly-over-after[data-axis="y"]::after  { inset: auto 0 -6px 0; width: auto; height: 3px; }
.panel.ly-resizing { outline: 1px solid var(--era-3); box-shadow: var(--glow-action); transition: none; }
.ly-ghost { position: fixed; z-index: 60; pointer-events: none; opacity: .9; will-change: transform; }
.ly-grip, .ly-resize { touch-action: none; user-select: none; -webkit-touch-callout: none; }
@media (width < 1101px) { .panel { grid-area: auto; grid-column: 1 / -1; height: auto; } .ly-grip, .ly-resize, .ly-badge, .ly-reset { display: none; } }
@media (pointer: coarse) { .ly-grip { padding: 12px; margin: -12px; } .ly-resize { width: 28px; height: 28px; opacity: .5; } }
@media (width < 768px) { .panel-grid { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px calc(84px + env(safe-area-inset-bottom)); max-width: none; } .panel { order: var(--phone-order, 0); animation-duration: .6s; } .panel[data-phone-hidden] { display: none; } .panel[data-sized] > .panel-body { overflow: visible; } }
@media (prefers-reduced-motion: reduce) { .panel, .ly-ghost { animation: none; transition: none; } }
```

Grip, handle, badge and state colours are exactly the design-system 4.1 definitions (`.ly-grip`, `.ly-resize`, `.ly-badge`, `.panel.ly-dragging`, `.ly-over`, `.ly-resizing`), so this file only adds the `-before` / `-after` / `-swap` variants, the ghost, and the breakpoints. The `< 1101px` rule deliberately drops every saved desktop placement (partner `terminal.css:545`) so a customised layout can never leak into a narrow viewport.

### 4.4 One DOM for every width; hydration

The grid is rendered once, in packed desktop order, for every viewport; CSS collapses it (4.3) and JS media queries only gate interactions after mount. There is no client/server branch in the markup, so no `next/dynamic` with `ssr: false` (which is only allowed inside Client Components anyway, `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md:66`, `:94-95`) and no `useEffect`-then-render flash. The one cost: on a **hard load with a customised layout**, the HTML carries the designed layout and the saved one applies in the post-hydration nudge, at most one frame, under the entrance animation. Client navigations never flash because the store is already read. The inline-script technique in `02-guides/preventing-flash-before-hydration.md` (it sets a `data-theme` attribute before paint, `:246-255`) could remove even that frame by writing per-card custom properties before hydration; it is not worth its complexity for Thursday.

### 4.5 Library: `@dnd-kit` vs `react-grid-layout` vs hand-rolled

Checked on npm today (`npm view … version dist.unpackedSize peerDependencies dependencies`); none is installed (`node_modules/@dnd-kit` absent).

| Package | Version | Unpacked | Peer React | What it gives / lacks |
|---|---|---|---|---|
| `@dnd-kit/core` | 6.3.1 | 1.07 MB | `>=16.8` | pointer sensor with delay, keyboard sensor (moves by pixels; cells need a custom `coordinateGetter`), collision detection, `DragOverlay`, announcements. No grid model, no resize, no packer, no swap semantics. |
| `@dnd-kit/sortable` | 10.0.0 | 234 kB | core `^6.3` | a 1-D sortable list; no column spans. |
| `@dnd-kit/react` | 0.5.0 | 240 kB | `^18 \|\| ^19` | the rewrite, pre-1.0, API still moving. |
| `react-grid-layout` | 2.2.4 | 448 kB, pulls `react-draggable`, `react-resizable`, `prop-types`, `fast-equals` | `>=16.3` | x/y/w/h layout, drag, resize, vertical compaction, responsive breakpoints. Positions items with absolute `transform`s, not CSS grid; no keyboard support, no announcements; its live push-on-drag logic would have to be fought to get swap-on-drop. |

What the hand-rolled path costs: one pointer-capture state machine shared by drag and resize (~120 lines), a ghost, auto-scroll, and the pure module in `src/lib/layout.ts` (~350 lines) that we need under any library: packer, hit-test, `isSwapCompatible`, `moveOrSwap`, keyboard model, announcement strings. `@dnd-kit/core` would replace only the first ~120 lines and add its own overlay and sensor concepts; `react-grid-layout` conflicts with the brief's CSS-grid placement and has no keyboard story.

**Recommendation: hand-rolled**, no new dependency. The non-DOM half is fully unit-tested with the existing `node --test` harness; the DOM half is small and shares one primitive. Fallback if the pointer hook misbehaves on iPad Safari in Wednesday's QA: `@dnd-kit/core@6.3.1` (peer range covers React 19.2.8) for the sensors only, keeping `src/lib/layout.ts` unchanged.

### 4.6 Order of work

1. `layout.ts` + `panel-registry.ts` + tests (pure; half a day).
2. `use-page-layout.ts`, `PanelGrid`, `Panel`, `panels.css`, default layouts on all six pages, static panels on the rest. Desktop looks like the screenshots with no interaction yet.
3. Resize (it exercises packing, measurement and persistence with the simplest gesture).
4. Drag with insert + target highlight; then swap; then the preview and FLIP if time allows.
5. Keyboard + announcer.
6. Phone shell: six tabs, per-tab stacks, sizing rules from `mobile.css`.

Steps 1–3 and 6 are the Thursday floor; 4's swap and 5 are the next tier; preview/FLIP last.

## 5. Pages → grid: default layouts

Heights are in row units (32px). `(col, row)` are 1-based and are what the packer produces from registry order; a test pins them. `auto` cards list an estimate used only for this table. Partner areas are cited so the port matches `docs/design-reference/partner-*-desktop.png`.

### 5.1 `portfolio` — `/portfolio` (partner `terminal.css:145`: `hero 8 | since 4 / positions 8 | calendar 4 / plans 12`; calendar is cut, plans takes its slot, activity is added)

| id | title | w | h | minCols | minRows | default (col,row) | phone |
|---|---|---|---|---|---|---|---|
| `hero` | Balance | 8 | auto (≈12) | 6 | 8 | (1,1) | portfolio · 1 |
| `since` | Since you last looked | 4 | 12 | 3 | 5 | (9,1) | portfolio · 2 |
| `positions` | Your positions | 8 | 18 | 5 | 6 | (1,13) | portfolio · 3 |
| `plans` | Plans | 4 | 18 | 3 | 6 | (9,13) | portfolio · 4 |
| `activity` | Recent fills | 12 | auto (≈8) | 6 | 5 | (1,31) | portfolio · 5 |

Content: `hero` = today's balance block (`portfolio/page.tsx:95-127`: total, `PerformanceBadge`, `MyWalletBadge`, `PriceChart`, cash line) plus the KPI tiles and the 24H / 1W / 1M / 6M range switch fed by the extended `api/price-history` (today it serves 30 days thinned to 120 points, `route.ts:23-24`); `positions` = `HoldingRow` list plus pre-IPO positions (`:154-222`), options (`:224-263`) are cut with the options chain; `activity` = `TransactionRow` list (`:265-279`) linking to `/activity`; `since` is built only from real data (a `solera:last-visit` snapshot of prices and the user's own fills and notes) and shows "First visit — this card fills in next time" otherwise; no greeting persona (the partner's "Good afternoon, Lorenzo", `engine.js:316`, is invented data). "Not yet in your portfolio" (`:281-298`) is dropped; Markets covers it. The "Portfolio perspective" score block (`:130-153`) folds into `hero`'s KPI row.

### 5.2 `markets` — `/markets`, and `/asset/[ticker]` on desktop (partner `terminal.css:146`: `markets 4 | asset 8 / room 4 | asset`)

| id | title | w | h | minCols | minRows | default | phone |
|---|---|---|---|---|---|---|---|
| `markets` | Markets | 4 | 24 | 3 | 8 | (1,1) | markets · 1 |
| `asset` | {Name} · {SYM} | 8 | auto (≈30) | 6 | 10 | (5,1) | trade · 1 |
| `room` | {SYM} room | 4 | 12 | 3 | 6 | (1,25) | markets · 2 |

`asset` spans both rows because it is auto and tall; `room` packs under `markets` once the 24 rows end. It holds the chart (`AssetPriceChart`), the facts row, held-by (`AssetModeSection.tsx:50-78`), ticker news (`asset/[ticker]/page.tsx:73-77`) and the **ticket beside the chart** (decision: "ticket beside the market list"), fed by `useExecuteTrade` / `usePreIpoBuy` as the audit prescribes. Selection is client state (`solera:selected-ticker`, default `TSLAx`) mirrored in `?sym=`; `/asset/[ticker]` on desktop renders this same `<PanelGrid page="markets">` with the ticker selected, so the two routes share one layout key (open question 4). `room` = the live per-ticker Supabase room (`ChatRoomCard` → `/asset/[ticker]/chat` today). Signals and flows, if ported later, append as `signals` (12, auto) and `flows` (12, auto), phone `markets · 3 / 4` (`signals.js:14`, `mobile.css:27`).

### 5.3 `preipo` — `/pre-ipo` (partner `terminal.css:147`, `:277`: `markets 4 | asset 8 / ladder 12`; ladder deferred)

| id | title | w | h | minCols | minRows | default | phone |
|---|---|---|---|---|---|---|---|
| `markets` | Markets · Pre-IPO | 4 | 24 | 3 | 8 | (1,1) | markets · 1 |
| `asset` | {Name} · {SYM} | 8 | auto (≈30) | 6 | 10 | (5,1) | trade · 1 |
| `compare` | Same company, two issuers | 12 | auto (≈10) | 6 | 5 | (1,31) | markets · 2 |

`markets` here is the same component with the Pre-IPO filter preselected (partner `PAGES.preipo.marketTab`, `engine.js:52`); `compare` = `CompanyComparisonCard` (`pre-ipo/page.tsx:35-48`, real Jupiter / issuer data). The valuation ladder (`bounty.js`) is not on the Thursday list; if added it is `ladder` (12, auto, phone `trade · 2`, `mobile.css:27`).

### 5.4 `discover` — `/` (partner `terminal.css:543`: `feed 8 | trending 4`)

| id | title | w | h | minCols | minRows | default | phone |
|---|---|---|---|---|---|---|---|
| `feed` | Discover (News · Hot · Everyone · Following · Mine) | 8 | 24 | 6 | 8 | (1,1) | discover · 1 |
| `trending` | Trending | 4 | 24 | 3 | 6 | (9,1) | discover · 2 |

24 rows = 760px. The partner caps the feed at 660px elsewhere (`base.css:281`) and uncaps it on the discover page (`terminal.css:497`); we default to a sized, scrolling feed so `trending` sits beside it, and the user can double-click the handle for a page-long feed. `feed` = `FeedList` + `NewsList` (News tab) with the Supabase votes and comments of priority 3; `trending` = `DiscoveryRail`'s community favourites (`DiscoveryRail.tsx:26-50`) plus real Jupiter trending. The marketing `Hero` (`Hero.tsx:55-84`) has no panel; see open question 5.

### 5.5 `leaderboard` — `/leaderboard` (partner `terminal.css:148`: `people 12`)

| id | title | w | h | minCols | minRows | default | phone |
|---|---|---|---|---|---|---|---|
| `people` | People | 12 | auto (≈14) | 6 | 6 | (1,1) | people · 1 |

Rows = the rank cards (`leaderboard/page.tsx:77-105`, real wallets), with the Solera Score / move toggle (`:35-43`) in the head's `tools`. The partner's stories strip above the grid is invented people and is dropped.

### 5.6 `agent` — `/agent`, new route (partner `terminal.css:477`: `agent 12`; the API-docs card is cut, the tab becomes a chat)

| id | title | w | h | minCols | minRows | default | phone |
|---|---|---|---|---|---|---|---|
| `agent` | Agent | 8 | 24 | 6 | 10 | (1,1) | agent · 1 |
| `plans` | Plans | 4 | 24 | 3 | 6 | (9,1) | agent · 2 |

`plans` is the same component as on `portfolio`; layouts are per page so it can sit differently on each.

### 5.7 Routes that are not grids

`/buy/[ticker]`, `/investor/[id]`, `/asset/[ticker]/chat`, `/activity` and `/news` render one full-width `Panel` in `static` mode (chrome, no grip or handle, the existing `TopBar` back action as the head's `tools`) inside a `.panel-grid` with a single 12-column slot, so they share the card chrome and the phone padding. `/options/*` is cut. A page that needs a new card adds it to the registry; saved layouts pick it up through normalise step 3.

## 6. The phone shell (< 768px)

- `.panel-grid` becomes a flex column (4.3); each card is full width, auto height, no internal scroll (`mobile.css:20-21`, `:41`); handles hidden; bottom padding leaves room for the bar (`mobile.css:20`: `calc(84px + env(safe-area-inset-bottom))`); entrance `rise .6s` with an 80ms stagger capped at three (`mobile.css:21`, `:30`).
- **Membership and order come from the registry's `phone` field**, not from the saved layout: a card whose `phone.tab` is not the current route's tab gets `data-phone-hidden`; the rest are ordered by CSS `order: var(--phone-order)`. The DOM stays in desktop order (4.4). On a real phone the layout was never customised (no handles below 1101px), so DOM order = default order = phone order (a registry test enforces that the phone order equals the default packed order minus hidden cards). The only way to get tab order ≠ visual order is a desktop browser that customised the layout and was then narrowed to phone width; accepted.
- **Bottom bar:** `BottomNav.tsx`'s five `TABS` (`:5-11`) become the partner's six (`mobile.js:14`) with the partner's icons (`mobile.js:6-13`) and the design-system 4.14 styling (glass, six equal columns, the sliding 2px `--grad-era` indicator on `--i`, labels raised from 8px to 10px because the audit flagged the 8px text). Active-route logic extends `BottomNav.tsx:20-23`:

| Tab | `href` | active when `pathname` |
|---|---|---|
| Portfolio | `/portfolio` | `/portfolio`, `/activity` |
| Markets | `/markets` | `/markets`, `/pre-ipo` |
| Trade | `/asset/{selected}` (`solera:selected-ticker`, default `TSLAx`; SSR renders the default) | `/asset/*`, `/buy/*` |
| Discover | `/` | `/`, `/news` |
| People | `/leaderboard` | `/leaderboard`, `/investor/*` |
| Agent | `/agent` | `/agent` |

- **Per-tab stacks:** Portfolio → hero, since, positions, plans, activity · Markets (`/markets`) → markets, room (+ signals, flows if ported) · Markets (`/pre-ipo`) → markets, compare · Trade (`/asset/[ticker]`) → asset (+ ladder if ported) · Discover → feed, trending · People → people · Agent → agent, plans. This is `mobile.css:22-27` with the calendar removed, Trade pointing at a real route, and the pre-IPO route lighting the Markets tab. Tapping a market row is the existing `Link` to `/asset/[ticker]` (`markets/page.tsx:110`), which is what `mobile.js:35` simulated with a 120ms tab switch.
- Sizing rules to carry over from `mobile.css:32-46`: hero chart 200px (`:33`), balance 30px (`:34`), KPIs two-up with the last spanning (`:35`), 44px minimum row height on every list row (`:42`), segmented buttons `7px 10px` (`:44`), toasts above the bar at `bottom: calc(76px + env(safe-area-inset-bottom))` (`:46`), the ticket under the chart instead of beside it (`:38`).
- 768–1100px (tablet): one column of **all** of the route's cards in saved `order`, the tab bar for navigation (the partner leaves this range with no nav at all: sidenav hidden at `base.css:257`, tab bar only on `mobile.html`), long-press reorder and height resize allowed, no width handle.

## 7. Performance notes and tests

### 7.1 Performance

- **No React state on pointer move.** Ghost position, auto-scroll and the hit-test run in one `requestAnimationFrame` loop over refs; state changes only when `(overId, zone)` or a snapped `(w, h)` changes. Page content elements are reused across `PanelGrid` re-renders (4.2), so a drag re-renders card shells only.
- **No layout reads during a drag.** Hit-testing uses `rectsAtStart` in document coordinates (2.1 step 4); the only DOM read per frame is `scrollY` for auto-scroll. No `elementFromPoint`, no `getBoundingClientRect` in the loop, so the preview cannot cause layout thrash.
- **Measurement.** One `ResizeObserver` per auto card on `.panel-inner`, reporting only on change, batched to one version bump per frame. With the defaults in section 5 the auto cards are `hero`, `asset`, `activity`, `compare` and `people`; every list card is sized and unobserved. The partner observed the whole grid and re-rendered every canvas on any change (`layout.js:100`); we observe only what can change height.
- **Packing** is O(items × cells) on ≤ 6 items and 12 columns: microseconds. It runs on commit, on a measurement change and on each resize snap.
- **Entrance animation** is switched off after first paint (`data-entered`, 4.3) because React's reorder re-inserts nodes and a `rise` on every drop would look like a bug.
- **Charts.** The live `PriceChart` is an SVG with a fixed `viewBox` and `preserveAspectRatio="none"` (`PriceChart.tsx:30`): it stretches for free but distorts strokes in a wide card. Chart panels read `usePanelSize()` (one observer on their own `.panel-body`, throttled to a frame) and either render at pixel size or add `vector-effect: non-scaling-stroke`. A canvas chart, if the partner's `drawChart` is ported, redraws on that size change. This replaces `rerenderCharts()` (`layout.js:41-43`, `:100-101`) and `mobile.js:30`.
- **Storage** is written on commit only. **Layout effects** run only for focus retention and the optional FLIP.
- **Hydration.** No client/server branch in the DOM (4.4); `matchMedia` gates interactions after mount, the same way `celebrate.ts:11` already checks `prefers-reduced-motion`.
- **Vercel Hobby / Supabase free tier.** Nothing server-side in this engine.

### 7.2 Tests to write

`tests/layout.test.mjs` (`node:test`, the `ts.transpileModule` loader from `tests/portfolio.test.mjs:8-14`, importing `src/lib/layout.ts` and `src/lib/panel-registry.ts`):

1. `packLayout`: two 6-col cards share a row; 8 + 8 wraps; 8 + 4 + 4 + 4 packs `(1,1) (9,1) (9,r) (1,r)` densely; a 12-col card always starts a row; row spans are honoured (a tall left card pushes later cards right, then below); a 4×24 + 8×30 + 4×12 sequence gives `(1,1) (5,1) (1,25)` (the markets page); output is deterministic across calls.
2. `sortByPosition(pack(order))` is a fixed point: packing the sorted order reproduces the same positions.
3. Determinism corollary: exchanging two entries with identical `(w, rows)` and re-packing exchanges exactly their cells and moves nothing else.
4. `hitTest`: returns the card whose rect contains the point, never the dragged card, `null` in gaps; `resolveZone` maps the centre box to `swap` when compatible and to `before`/`after` by the dominant axis otherwise, with the boundary values `0.25` / `0.75` on both axes.
5. `isSwapCompatible`: same footprint → true; different `w` with both minima satisfied → true; `hero (8, min 6)` vs `since (4)` → false; both sized with a `minRows` violation → false; auto vs sized ignores heights → true; self → false; `maxCols` respected.
6. `moveOrSwap`: same-span swap exchanges positions and keeps `w`; different-span swap exchanges `w` (and `h` when both numeric); `before` / `after` splice correctly at either end; unknown ids and self-drop are no-ops; a `swap` for an incompatible pair degrades to `after`; result is position-sorted; `savedAt` updated; input not mutated.
7. `resizePanel`: clamps to `[minCols, maxCols]` and `[minRows, MAX_ROWS]`; auto reset returns `null`; the snapping formula for `(rect, dx, dy, colW)` matches the partner's for width and rounds rows to the 32px unit (e.g. 383px → 12 rows, 160px → 5).
8. `keyboardMove` / `neighbourOf`: `←` / `→` insert around neighbours in visual order; `↑` / `↓` pick the overlapping-column neighbour (a 4-col card at column 9 moves above the 8-col card only when their columns overlap); `Shift + arrow` swaps or returns a reason string; `Home` / `End`; edges return the "Already at" message without changing the layout.
9. `normalizeLayout`: malformed JSON → default; wrong `v` or `page` → default; unknown ids dropped; missing ids appended at registry index; `w` / `h` clamped; `h: "12"` → `null`; a layout equal to the default reports `isCustom: false`.
10. `storageKey("portfolio") === "solera:layout:portfolio"`; every `PageId` yields a distinct key.
11. `describePlacement` and the other announcement helpers return the exact strings in 3.1.

`tests/panel-registry.test.mjs`:

12. Ids unique per page; `MIN_COLS ≤ minCols ≤ defaultCols ≤ maxCols ?? 12`; numeric `defaultRows ≥ minRows`; the first row of each page's default packing is fully occupied (all 12 columns; catches a registry edit that breaks the designed layout); the computed `(col, row)` defaults equal the tables in section 5; per page and tab, `phone.order` values are unique and contiguous from 1; every `phone.tab` is one of `PHONE_TABS`; the phone order for a route equals the default packed order with hidden cards removed (section 6's promise).

Manual QA (no browser runner in the repo; done on `http://localhost:3000` and the Vercel preview on the user's iPhone):

- 1440px: drag `since` onto the centre of `plans` → swap, both cards trade height; drag `hero` onto `since` → inserted, the live region explains; resize `positions` to 6 columns → `plans` slides up beside it; double-click the handle → height resets; reload → layout persists; footer "Reset layout" → designed layout, link disappears, no reload.
- Keyboard only: Tab to a grip, Space, arrows, Shift + arrow, Alt + arrow, Enter; VoiceOver reads each announcement; focus stays on the moved grip.
- 1000px (tablet): one column, long-press reorder works, no width handle, tab bar present.
- iPhone (Safari and Phantom's in-app browser): six tabs, correct stacks per route, no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`), the bar clears the home indicator, tapping a market row lands on Trade, a long-press on a grip (none should exist) never fires.
- `prefers-reduced-motion`: no entrance, no FLIP, no handle pulse.

## 8. Open questions and risks

Open questions (decisions only the user can make):
1. Row unit of 32px (24px track + 8px gap) instead of the partner's free pixel heights: heights snap to 32px steps. It is what makes "same footprint" well defined. Acceptable?
2. Swap semantics: the cards trade *slots* (width, and height when both are sized), not just positions. The alternative, "keep my size and reflow", is simpler to explain but never yields an exact exchange. Which?
3. Layouts stay per browser (localStorage) for Thursday; per-wallet in Supabase later? (Default: per browser.)
4. `/asset/[ticker]` on desktop renders the Markets grid with that ticker selected (one layout key for both routes), and `/buy/[ticker]` folds into the asset card's ticket. Keep the separate `/buy` route on desktop instead?
5. Discover's marketing `Hero` ("Own a little of what's next", `Hero.tsx:55-84`): fold its two calls to action into the feed's signed-out empty state, or keep it as a static card above the grid? (Default: empty state.)
6. Tablet 768–1100px: one reorderable column with the tab bar (spec) or a narrower live grid?
7. Signals, Flows and the valuation ladder: reserved registry slots only, or in scope for Thursday? (Default: out.)
8. Always-on grips (partner) or an explicit "Edit layout" mode? (Default: always-on; the grip is the only drag surface, so accidental drags are unlikely, and a mode adds a control to explain.)
9. Feed on Discover: sized and scrolling by default (spec, so Trending sits beside it) or page-long as on the partner's discover page (`terminal.css:497`)?

Risks:
- Auto-height cards re-pack when their content loads, which can shift neighbours a few rows after first paint; mitigated by making every list card sized and keeping auto only for bounded content, with honest `defaultRows` estimates.
- Moving a focused grip in the DOM blurs it; the re-focus layout effect must be verified in Safari and Firefox, not just Chrome.
- iOS Safari long-press: without `-webkit-touch-callout: none` and `user-select: none` on the grip the callout menu wins; also verify inside Phantom's in-app browser.
- One-frame layout flash on hard loads with a customised layout (4.4); acceptable, visible only if the entrance animation is later shortened.
- CSS `order` on phones can diverge tab order from visual order when a desktop layout was customised in the same browser (6); accepted, documented.
- Every ported panel body needs `@container` reflow rules for narrow spans; that cost lands on the panel ports, not on this engine, but it is where a resized card will look wrong first.
- Scope: swap-on-drop is ~40 lines of pure code on top of drag / insert, and the preview and FLIP are cosmetic; if time runs short, ship resize + drag/insert first and add swap last without touching the persisted schema.

## Verification log

- Partner: `layout.js` read in full (104 lines); `mobile.js` (41) and `mobile.css` (79) in full; `terminal.css` in full (560 lines) with every `grid-template-areas` and `.panel` / `.ly-*` rule located by line; `engine.js` 30-80 and 260-320 (`PAGES`, `resolvePage`, `renderShell`) plus `grep -n PAGES` across `signals.js:14-15,279`, `plans.js:15-16`, `bounty.js:15-16`; `base.css:20-21`, `:59-66`, `:255-261`, `:268-284`.
- Screenshots read: `partner-portfolio-desktop.png`, `partner-markets-desktop.png`, `partner-discover-desktop.png`, `partner-agent-desktop.png`, `partner-preipo-desktop.png`, `partner-leaderboard-desktop.png`, `partner-mobile-portfolio.png`, `live-portfolio-desktop.png`, `live-markets-desktop.png`, `live-discover-desktop.png` (`live-asset-desktop.png` is blank). Column check at 1440: `(1440 − 200 − 32 + 8) / 12 = 101.3px`; the 4-col markets card measures 397px (x 216→613) and the 8-col asset card 800px (x 623→1423), matching `4 × 101.3 − 8` and `8 × 101.3 − 8`. Row estimates in section 5 come from the same screenshots (hero 383px → 12–13 rows, markets 773px → 24, room 387px → 12, asset 963px → 30, trending 813px → 25).
- Audit: decisions section (`docs/partner-build-audit.md:3-20`) and the layout findings at lines 722-726 (drag/resize gated at 1101px, HTML5 DnD), 728-730 (`mobile.html` has no persistence), 735-738 (fixed widths and the single 1100px breakpoint), 791-792 (port gap table).
- Design system: `docs/port/design-system.md` sections 1.7 (layout tokens), 4.1 (panel chrome and `.ly-*` affordances), 4.14 (tab bar), 6 (motion table incl. the 4s layout hint).
- Live app: `AppShell.tsx`, `BottomNav.tsx`, `layout.tsx`, `globals.css` (`:174-240`, `:465-540`, `:630-660`), all `src/app/**/page.tsx`, `Hero.tsx`, `DiscoveryRail.tsx`, `FeedList.tsx` head, `ChatRoomCard.tsx`, `AssetModeSection.tsx`, `TradeScreen.tsx` head, `TopBar.tsx`, `ModeStrip.tsx`, `use-watchlist.ts`, `use-trade-mode.ts` head, `PriceChart.tsx`, `AssetPriceChart.tsx`, `api/price-history/route.ts` head, `tests/portfolio.test.mjs` loader, `package.json` (Next 16.3.5, React 19.2.8, no drag-and-drop packages); localStorage keys via `grep -rn STORAGE_KEY`; `matchMedia` use at `celebrate.ts:11`.
- Next.js docs (`node_modules/next/dist/docs`): `01-app/01-getting-started/05-server-and-client-components.md:26` (browser-only APIs such as `localStorage` → Client Components); `01-app/02-guides/lazy-loading.md:66`, `:94-95` (`ssr: false` only inside Client Components); `01-app/02-guides/preventing-flash-before-hydration.md:1-16`, `:246-255` (inline-script technique, judged unnecessary here).
- npm (network, today): `@dnd-kit/core` 6.3.1 (1,066,148 B unpacked, peer `react >=16.8.0`), `@dnd-kit/sortable` 10.0.0 (peer core `^6.3.0`), `@dnd-kit/react` 0.5.0 (peer `^18 || ^19`), `@dnd-kit/modifiers` 9.0.0, `react-grid-layout` 2.2.4 (447,579 B; deps `react-draggable`, `react-resizable`, `prop-types`, `fast-equals`, `resize-observer-polyfill`). `node_modules/@dnd-kit` does not exist in the repo.
- Servers: `http://localhost:3000/` and `http://127.0.0.1:8080/index.html` both answered 200; not otherwise used, the screenshots are the ground truth.
