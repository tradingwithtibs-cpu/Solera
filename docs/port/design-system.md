# Solera port — design system

Status: design document, Sept 22 2026. Binding decisions are in `docs/partner-build-audit.md` ("Decisions taken after the audit"). This file turns the partner's terminal look into tokens, a glass recipe, a type stack, component specs, a Tailwind migration plan, motion rules and accessibility minimums, and ends with a `globals.css` skeleton to paste in. Nothing here has been applied to source yet.

Sources read: `/Users/tibet/Desktop/solerafinal/assets/{base,terminal,mobile,fonts}.css`, `engine.js` (`renderShell` 262–303, `renderHero` 305–335), `mobile.js` (`TABS`), `layout.js` (`ly-*` classes), `signals.js:275` (the strip), the seven `docs/design-reference/partner-*.png` screenshots, `public/brand/solera-mark.png`, `.claude/skills/solera-brand/SKILL.md`, the live `src/app/globals.css`, `layout.tsx`, `postcss.config.mjs`, and every `src/components/*.tsx` named below. Behaviour claims about Tailwind and `next/font` were verified against `node_modules/tailwindcss@4.3.3` (by compiling a test stylesheet with its `compile()` API) and `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`. Contrast ratios were computed (WCAG 2.x relative luminance, alpha composited over the stated background), not eyeballed. Font loading and computed styles were checked live on the served partner page. Section 11 lists every check.

Companion: `docs/port/layout-engine.md` owns the panel grid (data model, drag/resize/swap-on-drop, per-page layouts, the phone tab stacks). This document supplies the tokens it consumes, and the panel class names in 4.1 and the skeleton are the layout doc's (`.panel-grid`, `.panel-grip`, `.is-dragging` …), not the partner's `ly-*`.

## 0. What the partner build actually is (facts that shape every decision below)

- **Tokens.** `terminal.css:5-12` sets `--bg #0b0d16`, `--panel #10131f`, `--panel-2 #151a29`, `--line #232a40`, `--fg #e3e5f5`, `--muted #8a8fb3`, `--accent #9b5cf7`, `--accent-2 #4c6fff`, `--up #14f195`, `--down #ff5c7a`, `--warn #ffb020`, `--radius 0`, and `--brand: linear-gradient(135deg, #4c6fff, #9b5cf7)`. The accent is the *old* blue-violet brand gradient; per the Sept 22 decision the port swaps it for the era gradient.
- **Shape.** `terminal.css:39` forces `border-radius: 0 !important` on every control, tile, image and pill. Only the strip chips (`.chip-l`, `terminal.css:437`) are pills (`999px`); confirmed on the served page (`getComputedStyle`: `.panel` → `0px`, `.chip-l` → `999px`). Panels are `padding: 0` with a 32px `.panel-head` bar (`8px 12px`, `#121627`, bottom hairline) whose title is 10px mono, uppercase, `0.16em`, prefixed by a violet `// ` (`.panel-head h2::before`).
- **Type.** `terminal.css:9` makes *everything* IBM Plex Mono at `body { font-size: 12px }` (`terminal.css:14`). `fonts.css` (766 KB) embeds Outfit 500/600/700, IBM Plex Mono 500/600 and Fraunces 400/600 (+italics) as base64. Fraunces and Outfit are never referenced by any rule outside `fonts.css` (grep of base/terminal/mobile CSS and all JS). Verified on the served page (`http://127.0.0.1:8080`, `document.fonts` after `ready`): of 31 declared faces exactly three report `loaded` — IBM Plex Mono 500, IBM Plex Mono 600, and the *weight-less* IBM Plex Mono face (the `local(Arial)` fallback, next bullet); every Outfit and Fraunces face is `unloaded`. `body` computes to `font-weight: 400`.
- **The sans body copy in the screenshots is a bug, not a choice.** `fonts.css` also declares one face per family *without* `font-weight`, e.g. `@font-face{font-family:'IBM Plex Mono';src:local(Arial);…;size-adjust:134.59%}` (a Google-Fonts-style CLS fallback). A weight-less face is weight 400, so it is the *exact* match for every 400-weight element and beats the real 500/600 subsets. Every `<p>`, note and description in the partner build therefore renders in metric-stretched Arial; only bold/600 text and figures are Plex Mono. The port makes that split deliberate (section 3).
- **Glass is chrome-only.** `backdrop-filter` appears on `.top` (`#0b0d16f2`, blur 10), `.tabbar` (`#0b0d16f0`, blur 14), and the `.palette`/`.sheet` scrims (`#05060cb8`, blur 6). Content panels are opaque `var(--panel)`. The "liquid glass" in the brand direction is the mark's chrome lettering echoed on chrome surfaces, not blurred content cards.
- **Live app baseline.** Next 16.3.5, React 19.2.8, Tailwind 4.3.3 via `@tailwindcss/postcss` with no `tailwind.config`; `globals.css` starts with `@import "tailwindcss"` and an `@theme inline` block that maps `--font-sans`/`--font-mono` to the `next/font` variables. 66 `.tsx` files under `src`; 52 use Tailwind palette classes (`text-neutral-400` ×91, `text-neutral-500` ×86, `text-neutral-900` ×58, `text-neutral-600` ×26, `bg-neutral-100` ×26, `bg-white` ×21, `text-violet-600` ×14 …). No `dark:` variants anywhere. `globals.css:238-243` also hard-overrides `.text-neutral-400`/`.text-neutral-900` after the Tailwind import — those two rules must be deleted in the port, or they pin 149 call sites to the light-theme colours regardless of the remap.

## 1. Tokens

All tokens live on `:root` (and the color ones also inside `@theme` so Tailwind utilities exist for them, see section 8). Hex values are sRGB. Ratios are against the background named in the row unless stated.

### 1.1 Ink surfaces

| Token | Value | From | Use |
|---|---|---|---|
| `--ink-page` | `#0b0d16` | partner `--bg`; brand `--era-ink` | `body` background. Deep indigo-black, never gray. |
| `--ink-panel` | `#10131f` | partner `--panel` | Every content panel, the tape, the sidenav. |
| `--ink-head` | `#121627` | `.panel-head` | Panel title bars. |
| `--ink-raised` | `#151a29` | partner `--panel-2` | KPI tiles, quote tiles, chips at rest, segmented tracks. |
| `--ink-inset` | `#0b0d16` | `.ticket`, `.note-field textarea`, `blockquote` | Inputs, the ticket, quoted notes, code: things that sit *below* the panel. Same hex as the page on purpose. |
| `--ink-hover` | `#161b2c` | `.row:hover` | Row and list hover. |
| `--ink-selected` | `#191a33` | `.row.on` | Selected row (with the 2px inset accent bar). |
| `--ink-highlight` | `#1d1a3d` | `.row.hl` | Holder-overlap / cross-highlight. |
| `--ink-tile` | `#000000` | brand `--era-tile` | Only behind the mark. Never a surface. |
| `--ink-tooltip` | `#f2f3ff` | `.chart-tip` (terminal) | The one light surface: chart tooltip and `title`-style tips, ink text on it (≥15:1). |

### 1.2 Lines

| Token | Value | Use |
|---|---|---|
| `--line` | `#232a40` | Panel borders, segmented borders, input borders, chips. (1.3:1 vs panel: decorative, not a required-contrast boundary; the fill difference carries the edge.) |
| `--line-soft` | `#171c2e` | Row hairlines inside panels (`border-bottom` on `.row`, `.plan`, `.cmt`). |
| `--line-strong` | `#3a4266` | Hover borders, dashed "gate" boxes, grips, resize handle at rest. |
| `--line-glass` | `color-mix(in srgb, #fff 8%, transparent)` | Border of glass chrome (computes to `#1e212c` over the panel). |
| `--line-accent` | `var(--era-3)` `#0191fd` | Selected-row inset bar, focus-within borders, the 2px tab indicator. 5.7:1 vs panel, so it passes the 3:1 non-text minimum; `--era-2` (2.8:1) does not and must not be used as a thin line. |

### 1.3 Text tiers

| Token | Value | Ratio on panel / page | Use |
|---|---|---|---|
| `--text-0` | `#ffffff` | 18.5 / 19.4 | Balance numerals, prices ≥ 24px, sheet titles. |
| `--text-1` | `#e3e5f5` | 14.8 / 15.5 | Body text, row titles, figures. |
| `--text-2` | `#8a8fb3` | 5.9 / 6.2 | Muted: eyebrows, captions, secondary copy, placeholders. Still AA at 10px/600. |
| `--text-3` | `#5c6288` | 3.1 | **Non-text only**: disabled controls (exempt), grips, resize glyph, decorative separators. Never for words or numbers someone must read. |
| `--text-tape` | `#b9bde0` | 10.1 | Ticker symbols on the tape (partner `.tape-track span b`). |
| `--text-accent` | `#c9a8ff` | 9.3 / 9.7 | Inline links, tags, the `// ` prefix, `⌘K` hints, "ask"/"note" chips. Lilac sits between `--era-1` and `--era-2`, so it reads as the mark's magenta side toned for text. |
| `--text-link` | `#9fb3ff` | 9.1 | Links inside prose where lilac would fight a magenta chip nearby (the "ahead" blue in the partner's chips). |

### 1.4 Semantic colours

| Token | Value | Ratio | Notes |
|---|---|---|---|
| `--gain` | `#3ddc84` | 10.4 on panel; 8.1 on its own tint | Leaf green, deliberately **not** the mint end of the era gradient (`#05fbcf`) and not Solana's `#14f195`, so gains never read as brand accent. Open question 3. |
| `--gain-tint` | `color-mix(in srgb, var(--gain) 13%, transparent)` (≈`#162e2c` over panel) | | Background for gain badges. |
| `--loss` | `#ff5c7a` | 6.2 on panel; 5.3 on its tint | Partner `--down`. White on it fails (3.0:1) — a loss-filled control needs ink text or the sell gradient. |
| `--loss-tint` | `color-mix(in srgb, var(--loss) 13%, transparent)` (≈`#301d2b`) | | |
| `--warn` | `#ffb020` | 10.1; ink on it 10.6 | Partner `--warn`. Also the watchlist star. |
| `--warn-tint` | `#ffb0201a` | | "you hold this", earnings row. |
| `--live` | `var(--era-4)` `#01eaf4` | 12.4 | The live dot, "LIVE" tags, the mainnet toggle glow. Distinct from `--gain` so "live" never looks like "up". |

Gains and losses always carry a sign (`+`/`−`) or arrow as well as colour; colour alone is never the message.

### 1.5 The era gradient and its bands

`--era-1…5` stay exactly as in `globals.css` today: `#d139fc`, `#482efa`, `#0191fd`, `#01eaf4`, `#05fbcf`. Sampled at 5% steps along the existing 100° gradient (stops at 0/22/50/78/100%), white text is AA (≥ 4.5:1) only for t≈0.09–0.40 (peak 6.6:1 at t=0.20–0.25, down to 1.3:1 at the mint end), and ink text only at the magenta tip (t ≤ 0.05: 5.3 → 4.5) and from t≈0.42 onward (5.1 at 0.45 rising to 14.5 at 1.0); between t≈0.05 and t≈0.42 ink fails. So the full gradient can never sit under text. The port defines three *bands* cut from it, each AA along its whole length:

| Token | Value | Text on it | Measured ratios | Use |
|---|---|---|---|---|
| `--grad-era` | `linear-gradient(100deg, var(--era-1) 0%, var(--era-2) 22%, var(--era-3) 50%, var(--era-4) 78%, var(--era-5) 100%)` | none | — | Decorative only: `.text-gradient-era` on one brand moment per screen, the followed-story ring, the tab-bar indicator, the panel resize glyph, the progress bar in launches/plans, the mark's glow, the 1px "chrome edge" on glass chrome. Never a page or panel background. |
| `--grad-action` | `linear-gradient(100deg, #9334fb 0%, #482efa 100%)` (era at t=0.10 → t=0.22) | white, 600 | 5.09 → 6.89 | Primary buttons, `.seg`/`.range` "on" segments, the Practice toggle "on", Follow, POST, SIGN UP. Closest to the violet the partner screenshots use, but from the era palette. |
| `--grad-live` | `linear-gradient(100deg, var(--era-3) 0%, var(--era-4) 60%, var(--era-5) 100%)` | ink `#0b0d16`, 600 | 5.97 → 12.99 → 14.50 | The Live · mainnet toggle "on", "armed"/"holding" plan states, the agent Run button, on-chain fill labels. Ink text is the point: it is the mark's "era" lettering reversed. |
| `--grad-sell` | `linear-gradient(100deg, #c93553 0%, #7a3ff0 100%)` | white, 600 | 5.10 → ~5.7 (mid) → 5.53 | Sell primary button. Partner used `#ff5c7a → #9b5cf7` (white on `#ff5c7a` is 2.97:1, fails). |
| `--grad-solana` | `linear-gradient(90deg, #9945ff, #14f195)` | none | white on `#14f195` ≈ 1.5:1 | Only where Solana is named, and only as a 1px border or icon tint, never under text. `OnChainBadge`/`MyWalletBadge` currently put white text on it; that changes (section 4.12). |

Rules: (1) a gradient never carries text unless it is one of the three bands above; (2) never extend a band toward `--era-3`+ under white text or toward `--era-1`/`-2` under ink text; (3) at most one `.text-gradient-era` element per screen; (4) `--grad-action` is *the* accent for "selected/primary", `--grad-live` is *the* accent for "real/on-chain/armed", and the two never appear on the same control.

### 1.6 Blooms, paper, glows, shadows

| Token | Value | Use |
|---|---|---|
| `--bloom-hero` | `radial-gradient(600px 220px at 12% 0%, #482efa1f, transparent 70%), radial-gradient(500px 200px at 90% 100%, #d139fc14, transparent 70%)` | The hero panel only (partner `.hero`, recoloured from blue/violet to era-2/era-1). |
| `--paper` | `linear-gradient(#1a2036 1px, transparent 1px), linear-gradient(90deg, #1a2036 1px, transparent 1px)` at `24px 24px` | Graph paper behind the hero and the asset chart. The partner's scanline overlay (`.hero::after`, `repeating-linear-gradient … #0000001f 3px 4px`) is **dropped** over text; it may stay on `.chart-wrap` only. |
| `--glow-mark` | `0 0 22px #482efa66, 0 0 6px #05fbcf55` | The mark (`.brand-logo`). |
| `--glow-action` | `0 8px 26px #482efa66` | Primary button hover. |
| `--glow-action-soft` | `0 0 16px #482efa55` | "On" segments, active nav icon (`drop-shadow`). |
| `--glow-live` | `0 0 8px var(--live)` | Live dot, live toggle. |
| `--glow-gain` / `--glow-loss` | `0 0 8px var(--gain)` / `0 0 8px var(--loss)` | Vote arrows when set, sparkline stroke on hover. |
| `--shadow-float` | `0 16px 40px #0008` | Toasts, palette, popovers. |
| `--shadow-sheet` | `0 -20px 80px #482efa44` | Bottom sheets. |
| `--inner-hi` | `inset 0 1px 0 #ffffff0d` | The 1px inner highlight on every panel and glass surface: the "liquid" edge. |

Glow rules: glows appear on hover/active/focus of interactive things, on the mark, on the live dot and on toasts. Static text never glows except the hero balance (`text-shadow: 0 0 22px #482efa66`, partner `.balance`).

### 1.7 Radii, sizes, layout, motion tokens

| Token | Value | Notes |
|---|---|---|
| `--radius-panel` | `0px` | Partner is square everywhere. One token so a global change is one line. Open question 1. |
| `--radius-control` | `0px` | Buttons, inputs, segments, tiles. |
| `--radius-chip` | `999px` | Strip chips only (`.chip-l`). |
| `--radius-avatar` | `0px` | Square wallet avatars with a 1px `--line-strong` border. |
| `--radius-mark` | `22%` | The mark's tile (`Logo.tsx` already does `size * 0.22`). |
| `--grid-gap` | `8px` | 12-column grid gap (`terminal.css .grid`). |
| `--pad` | `12px` | Panel body padding. |
| `--head-h` | `32px` | Panel head height. |
| `--sidenav-w` | `200px` | Desktop sidenav (partner `.app`). |
| `--grid-max` | `1520px` | Grid max width. |
| `--tabbar-h` | `56px` + `env(safe-area-inset-bottom)` | Phone tab bar. |
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | Transforms, entrances. |
| `--ease-soft` | `cubic-bezier(0.4, 0, 0.2, 1)` | Colour, opacity, shadow. |
| `--t` | `0.38s` | Default control transition. |
| `--t-fast` | `0.12s` | Active press. |

## 2. Liquid glass recipe

Glass is for **chrome**: things that float over content and are read briefly. It is never a content panel.

```css
.glass {
  background: color-mix(in srgb, var(--ink-panel) 72%, transparent);   /* composites to #0f111c over the page */
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid var(--line-glass);
  box-shadow: var(--inner-hi), var(--shadow-float);
  position: relative;
}
/* the chrome edge: a 1px era-tinted highlight along the top, like the light on the "era" letters */
.glass::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px; pointer-events: none;
  background: linear-gradient(90deg, transparent 0%, #ffffff33 35%, #ffffff33 65%, transparent 100%);
}
.glass-era::before { background: var(--grad-era); opacity: 0.55; }
.scrim { background: #05060cb8; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
```

Measured legibility on the composite (`#0f111c`): `--text-1` 15.0:1, `--text-2` 6.0:1, so muted copy is still AA on glass. The translucency is 72%, not 50%, precisely so that text stays readable over a moving tape or a chart.

**Where glass is used:** the top bar (`.top`), the phone tab bar (`.tabbar`), the strip chips (`.chip-l`, `glass` + pill), sheets and dialogs (`.sheet-box`, `glass-era`), the ⌘K palette (`.palette-box`), toasts (`.toast`), popovers (`.wallet-popover`), and the sticky `.panel-head` inside a scrolled `.panel[data-sized]`.

**Where glass is NOT used, and why:** content panels (`.panel`) are opaque `--ink-panel` with `--inner-hi` and a 1px `--line` border; rows, tables, inputs, the ticket, the hero and the asset chart are opaque. Reasons: (a) legibility — blur behind body text shifts as content scrolls beneath it and lowers effective contrast; (b) performance — each `backdrop-filter` element is its own compositing layer that re-blurs whenever anything under it repaints; a canvas chart ticking every second under twelve blurred panels is jank on a 2020 laptop and heat on a phone; (c) the partner build itself keeps panels opaque, and that is what the screenshots show.

**Fallbacks:**

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: color-mix(in srgb, var(--ink-panel) 96%, transparent); }
  .scrim { background: #05060cd9; }
}
@media (prefers-reduced-transparency: reduce) {
  .glass, .scrim { -webkit-backdrop-filter: none; backdrop-filter: none; background: var(--ink-panel); }
}
@media (max-width: 767px) {
  .glass { -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }  /* cheaper on phones */
}
@media (forced-colors: active) {
  .glass { background: Canvas; border-color: CanvasText; backdrop-filter: none; }
}
```

Safari needs the `-webkit-` prefix (kept in every rule). Do not nest glass inside glass (the chips live in the strip *below* the top bar, not inside it), do not put `overflow: hidden` + `border-radius` on an ancestor of a glass element in Safari (it drops the blur), and never add `will-change` to glass elements.

## 3. Typography

### 3.1 What the two builds do

| | Partner (terminal.css) | Live app |
|---|---|---|
| Families declared | Outfit 500/600/700, IBM Plex Mono 500/600, Fraunces 400/600 + italics, all base64 in a 766 KB `fonts.css` | Outfit 500/600/700 and IBM Plex Mono 500/600 via `next/font/google` (`layout.tsx:12-22`), self-hosted at build, `variable: --font-display` / `--font-figures` |
| Families used | Plex Mono for everything (`:root --font`); Outfit only in the light `base.css` theme; Fraunces never | Outfit for UI, Plex Mono for every figure (`font-mono`) |
| Base size | 12px body | 13–16px body, 28–38px h1 |
| What renders | 500/600 text in Plex Mono; all 400 text in metric-adjusted Arial (the weight-less `local(Arial)` face, section 0) | as declared |

### 3.2 Recommendation: keep the two families already loaded, no new bytes

- **Do not ship `fonts.css`.** Do not add Fraunces: it is unused in the partner build and would cost ~300 KB. Keep `next/font/google` exactly as configured — Outfit `['500','600','700']`, IBM Plex Mono `['500','600']` (`next/font` requires an explicit weight array for non-variable Google fonts; both are non-variable — checked in `font.md` §weight). `display` stays at its default `swap`. Zero new font payload.
- **Mono (`--font-figures`, Tailwind `font-mono`)** for: every price, %, balance, share count, address, timestamp and the clock; ticker symbols; eyebrows and panel titles; button, chip, tab and nav labels; the tape; `kbd`; tags and status pills. Always `font-variant-numeric: tabular-nums`. Weight 500 for running mono, 600 for figures and labels; mono 400 is not loaded and would be too thin on ink.
- **Outfit (`--font-display`, Tailwind `font-sans`)** for prose: sentences, theses and notes, news headlines, sheet copy, disclosures, input text, empty states. Weight 500 for body (400 is not loaded, and 500 reads better on dark ink), 600 for headings.
- This makes the partner's accidental "sans prose / mono figures" split the intended system, and matches what the screenshots show better than the partner's own CSS would.

### 3.3 Scale (px; the root stays 16px so Tailwind's rem spacing is untouched)

| Role | Family / weight | Size | Tracking / case | Colour |
|---|---|---|---|---|
| Panel title (`.panel-head h2`) | mono 600 | 10 | `0.16em`, uppercase, `// ` prefix in `--text-accent` | `--text-1` |
| Eyebrow (`.eyebrow`) | mono 600 | 10 | `0.14em`, uppercase | `--text-2` |
| Tag / status pill (`.chip`, `.pill`, `.plan-status`) | mono 600 | **10** (partner uses 8–9px; raised to the 10px floor) | `0.1em`, uppercase | varies |
| Button / segment / tab label | mono 600 | 12 (11 in `.range`, 10 in `.copy`-size) | `0.1em` (`0.08em` small), uppercase | on fill |
| Nav item | mono 600 | 11 | `0.12em`, uppercase | `--text-2` → `--text-1` |
| Caption / meta | Outfit 500 | 11 | normal, sentence case | `--text-2` |
| Body (desktop) | Outfit 500 | 12, line-height 1.5 | | `--text-1` |
| Body (phone, < 768px) | Outfit 500 | 13, line-height 1.5 | | `--text-1` |
| Row title | Outfit 600 (name) + mono 600 (symbol) | 12 | | `--text-1` |
| Figure in a row | mono 600 tabular | 12 | | `--text-1` |
| KPI figure | mono 600 | 15 | | `--text-1` |
| Ticket amount | mono 600 | 16 (input: 32–40 centred) | | `--text-0` |
| Asset price | mono 600 | 24 | | `--text-0` |
| Balance | mono 600 | 32 (26 under a 480px container) | `-0.03em`, `text-shadow` glow | `--text-0` |
| Sheet / section heading | Outfit 600 | 16–18, line-height 1.35 | `-0.01em` | `--text-0` |
| Page h1 (rare now: empty states, error page, auth) | Outfit 600 | 20–24 | `-0.02em` | `--text-0`; the period may be `--era-1` (open question 7) |
| Input text | Outfit 500 | 13 | never uppercase, `letter-spacing: 0` | `--text-1`; placeholder `--text-2` |
| Tape | mono 500 | 12 | | `--text-tape` symbols, `--text-2` prices, gain/loss deltas |

Nothing below 10px. Uppercase is done with `text-transform`, never typed, so screen readers read words rather than letters.

## 4. Component specs

Classes are the partner's names where they exist (so the screenshots stay the reference) and are implemented in `globals.css`, not per-component Tailwind strings. Values are desktop; phone deltas are noted.

### 4.1 Panel and panel head

```html
<section class="panel" id="markets" data-sized style="--col: 1; --w: 5; --row: 1; --h: 4">   <!-- placement vars per layout doc §4.3 -->
  <header class="panel-head">
    <button class="panel-grip" aria-label="Move the Markets panel">⋮⋮</button>
    <h2>Markets</h2>            <!-- renders as "// MARKETS" -->
    <div class="panel-tools">…</div>   <!-- seg tabs, counts -->
  </header>
  <div class="panel-body">…</div>
  <p class="panel-foot">prices live via Jupiter Price v3</p>
  <span class="panel-resize" aria-hidden="true"></span>
</section>
```

- `.panel`: `background: var(--ink-panel); border: 1px solid var(--line); border-radius: var(--radius-panel); box-shadow: var(--inner-hi); padding: 0; min-width: 0; container-type: inline-size; position: relative; animation: rise .9s var(--ease) both` with `nth-child` stagger of 50ms up to 9 (partner), plus `display: flex; flex-direction: column` so the layout doc's `.panel[data-sized] > .panel-body { overflow-y: auto; min-height: 0; flex: 1 1 auto }` scrolls the body inside a fixed-height card. `.panel[data-sized] > .panel-head { position: sticky; top: 0; z-index: 2 }` becomes glass (harmless when the body is the scroller, needed on phones where it is not).
- `.panel-head`: `display: flex; align-items: center; gap: 12px; height: var(--head-h); padding: 0 var(--pad); background: var(--ink-head); border-bottom: 1px solid var(--line)`; `h2` per the scale, `h2::before { content: "// "; color: var(--text-accent) }`. Tools right-aligned with `margin-left: auto`.
- `.panel-body`: `padding: var(--pad)`. Lists that want edge-to-edge rows use `.rows` with `padding: 0` and rows that pad themselves (partner: `.row { padding: 8px 12px }`).
- `.panel-foot`: `padding: 0 var(--pad) 8px; font: mono 600 10px; letter-spacing: .06em; uppercase; color: var(--text-2)`.
- Drag/resize affordances (keep, per decisions). Class names are the layout doc's (§4.3), which owns the grid; the partner's `ly-*` equivalents are in parentheses for reading `layout.js`. `.panel-grip` (`.ly-grip`: a real `<button>` so it can take focus; `color: var(--text-3)`, `cursor: grab`, `user-select: none`, `-webkit-touch-callout: none`; becomes `--text-2` on panel hover, `--text-accent` on its own hover), `.panel-resize` (`.ly-resize`: 18×18 bottom-right, the diagonal-stripes gradient recoloured to `var(--accent)`, `opacity .35 → .8` on panel hover), `.panel-badge` (`.ly-badge`: `--grad-action`, mono 10px, the "5×2" footprint while resizing), `.panel.is-dragging { opacity: .35 }`, `.panel.is-over-swap { outline: 1px dashed var(--accent); box-shadow: inset 0 0 0 999px var(--accent-wash) }`, `.panel.is-over-before::before` / `.is-over-after::after` (a 3px `--accent` insertion bar 6px outside the edge), `.panel.is-resizing { outline: 1px solid var(--accent); box-shadow: 0 0 24px #0191fd44 }`, `.panel-ghost` (the dragged copy: `opacity .9`, no glass, no animation). `--accent` is `var(--era-3)` — 5.7:1 against the panel, so a dashed drop target is a visible boundary; `--era-2` at 2.7:1 is not — and `--accent-wash` is `#0191fd12`. The layout doc's `#7c3aed10`/`#7c3aed44` fallbacks are superseded by these. All handles hidden under 1100px.
- Hero variant `.panel.hero`: `background: var(--bloom-hero), var(--paper), var(--ink-panel); background-size: auto, auto, 24px 24px, 24px 24px, auto`; no scanlines.

### 4.2 Chips, pills, tags

Three different things in the partner build; keep them distinct.

| Class | Shape | Type | Colours | Used for |
|---|---|---|---|---|
| `.chip-l` (strip chip) | pill, `padding: 7px 12px 7px 8px`, `gap: 6px`, `border: 1px solid var(--line)`, `glass` | Outfit 500 11px; the leading `i` label is mono 600 10px uppercase in its own pill | rest: `--text-2` text, `i` on `--ink-raised`; hover: border `--era-3`, `--text-1`, `translateY(-1px)`, `--glow-action-soft` | The row under the top bar: TAPE, MOST TRADED, ASK, WIDEST GAP, AHEAD. Variants recolour only the `i` label: `.live i { background: var(--grad-action); color: #fff }`, `.gap i { background: var(--gain-tint); color: var(--gain) }`, `.ahead i { background: #482efa33; color: var(--text-link) }`, `.warn i { background: var(--warn); color: var(--ink-page) }`, `.alert i { background: var(--loss); color: var(--ink-page) }`, `.ask i { background: var(--era-2); color: #fff }`, `.plan i { background: var(--grad-live); color: var(--ink-page) }`. |
| `.chip` (tag) | square (`--radius-control`), `padding: 3px 7px`, `border: 1px solid var(--line)` | mono 600 10px, `0.1em`, uppercase | `--text-2`; `.gap { color: var(--gain); border-color: #3ddc8444 }`, `.mark { color: var(--text-accent); border-color: #3a2f66 }`, `.fired { color: var(--warn); border-color: var(--warn); background: var(--warn-tint) }` | Leg tags, plan status, MARKET/POLICY/MOVE kinds on news, "practice"/"on-chain" fill labels on the tape. |
| `.pill` (session) | square, `padding: 1px 6px`, `border: 1px solid var(--line)` | mono 600 10px | `.pill-247 { background: #3ddc8422; color: var(--gain) }`, `.pill-245 { background: #482efa22; color: var(--text-accent) }` | 24/7 · 24/5 next to a symbol. |

Existing `PerformanceBadge` (gain/loss %) becomes `.chip` with `--gain-tint`/`--loss-tint` fills, mono 600 12px, not uppercase (it is a figure).

### 4.3 The tape

DOM from `renderShell`: `<div class="tape" aria-hidden="true"><div class="tape-track">` with one `<span data-tape="TSLAx"><b>TSLAx</b> <i>$379.48</i> <em class="up">+1.6%</em></span>` per item, content duplicated once so `translateX(-50%)` loops seamlessly.

- `.tape`: `display: block; overflow: hidden; white-space: nowrap; height: 30px; background: var(--ink-panel); border-bottom: 1px solid var(--line); font: mono 500 12px`.
- `.tape-track`: `display: inline-flex; gap: 32px; padding: 8px 0; animation: crawl 60s linear infinite` (40s on phones). `b { color: var(--text-tape) }`, `i { font-style: normal; color: var(--text-2); margin: 0 6px }`, `em.up/.down { color: var(--gain)/var(--loss) }`.
- Hover pauses (`animation-play-state: paused`) so a number can be read. Under `prefers-reduced-motion` the animation stops, the duplicate half is hidden (`.tape-track > span:nth-child(n+N+1) { display: none }` via a `--n` variable) and the track becomes `overflow-x: auto` so it can still be scrolled.
- Content is real: live prices for the featured list, and fills (practice fills carry a `.chip` "practice", on-chain fills a `.chip` "on-chain" with the tx short-hash). No random trades.
- The tape is `aria-hidden` (it duplicates the Markets list); the live region for fills is the feed, not the tape.

### 4.4 Buttons

Base `.btn`: `display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 36px (44px on phones); padding: 0 14px; border-radius: var(--radius-control); border: 1px solid transparent; font: mono 600 12px; letter-spacing: .1em; text-transform: uppercase; transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease-soft), filter var(--t) var(--ease-soft), background-color var(--t) var(--ease-soft), color var(--t) var(--ease-soft), border-color var(--t) var(--ease-soft)`. `:active { transform: scale(.98); transition-duration: var(--t-fast) }`. `:disabled { opacity: .35; filter: grayscale(.6); cursor: not-allowed; transform: none; box-shadow: none }`.

| Variant | Fill / text | Hover | Notes |
|---|---|---|---|
| `.btn-primary` | `background: var(--grad-action); color: #fff` | `translateY(-1px)`, `box-shadow: var(--glow-action)`, `filter: brightness(1.08)` | Buy in practice, Continue, Sign up, Post, Follow. Keep the existing class name; 20 call sites restyle for free. |
| `.btn-primary[data-side="sell"]`, `.btn-sell` | `background: var(--grad-sell); color: #fff` | same, glow `#c9355366` | Sell. |
| `.btn-live` | `background: var(--grad-live); color: var(--ink-page)` | glow `#01eaf455` | Run (agent), Arm plan, Sign in wallet, Buy · sign in wallet. |
| `.btn-secondary` | `background: transparent; border-color: var(--line); color: var(--text-1)` | `border-color: var(--era-3); background: #482efa14` | Keep the class name (15 sites). Replaces the white-with-violet-text secondary. |
| `.btn-ghost` | no border, `color: var(--text-2)` | `color: var(--text-1); background: var(--ink-hover)` | Cancel, Close, "Not now". |
| `.btn-small` | `min-height: 28px; padding: 0 10px; font-size: 10px; letter-spacing: .08em` | | COPY, FOLLOWING, IT HAPPENED (partner `.copy`, `.follow.on`, `.tiny`). |
| `.btn-icon` | `width: 36px; padding: 0` (44 on phones) | | Back arrow, close ✕, star. |
| `.btn.armed` | `animation: arm .6s var(--ease)` (an expanding `0 → 14px` ring in `#482efaaa → 00`) | | After a plan is parsed. |

Loading state: label swaps to "Waiting for Phantom…" / "Filling…" and the button gets `aria-busy="true"` and a 12px mono spinner drawn with a 2px `--era-4` arc; never change width (reserve with `min-width`).

### 4.5 Inputs

- `.field` (wrapper, keep the name; 4 sites): `border: 1px solid var(--line); background: var(--ink-inset); border-radius: var(--radius-control); transition: border-color, box-shadow`. `:focus-within { border-color: var(--era-3); box-shadow: 0 0 0 3px #0191fd33 }`. Inner `input/textarea { background: transparent; padding: 9px 12px; font: Outfit 500 13px; color: var(--text-1); outline: none }`; `::placeholder { color: var(--text-2) }`.
- `.field-label`: eyebrow style (mono 600 10px `.12em` uppercase `--text-2`), with an optional `em { text-transform: none; letter-spacing: 0; font: Outfit 500 11px; color: var(--text-2) }` for "required · saved on the fill" / "optional" (partner `.note-field em`).
- Error: `p[role="alert"]` in `--loss`, Outfit 500 12px, under the field; the field border also turns `--loss`. Help text `--text-2` 11px.
- Amount input (ticket): `input[inputmode="decimal"]` `font: mono 600 32px (40px on the trade page); text-align: center; background: transparent; border: 0; color: var(--text-0)`, `$` prefix in `--text-2`.
- Range slider (`.trade-slider`, keep): track `height: 4px; background: var(--line)`, fill via the existing inline `--thumb-color`/gradient mechanism but with `--grad-action` (buy) / `--grad-sell` (sell); thumb `20px; background: var(--ink-page); border: 3px solid var(--era-2); box-shadow: 0 0 10px #482efa88`, `:hover { transform: scale(1.2) }`. Focus: the thumb gets the standard ring.
- Command/prompt inputs (`.lens-form`, `.plan-form`, `.agent-try`): a 1px `--line` box on `--ink-inset` with a `›` prompt glyph in `--era-3`, transparent input in mono 500 13px, and the action button inside the box on the right (`padding: 6px 6px 6px 12px`). `:focus-within` border `--era-3` (plan form: `--live` with `#01eaf422` ring, so an agent prompt feels "live").
- Search button (`.search-btn`, top bar): `glass`, `width: min(520px, 100%)`, `padding: 9px 14px`, mono 600 11px `.06em` uppercase `--text-2`, a `⌕` icon, and a `kbd` (`mono 10px; padding: 2px 6px; border: 1px solid var(--line); background: var(--ink-panel)`) reading `⌘K`. Hover: border `--era-3`, `--text-1`, `0 0 0 3px #0191fd22`.

### 4.6 Segmented tabs

One implementation for `.seg` (panel tabs: All / Stocks / Pre-IPO / Watchlist), `.range` (24H / 1W / 1M / 6M), `.mode` (Practice / Live · mainnet) and the existing `SegmentedControl` (rename its root class from `segmented-control` to `seg`).

- Track: `display: inline-flex; gap: 2px; padding: 3px; background: var(--ink-panel); border: 1px solid var(--line); border-radius: var(--radius-control)`; `role="group"` + `aria-label`.
- Segment: `padding: 5px 11px` (`.range`: `4px 10px`; phones: `7px 10px`); mono 600 12px (`.range` 11px), `.06em`, uppercase, `color: var(--text-2)`; hover `color: var(--text-1); background: #1c2235`; `aria-pressed="true"` → `background: var(--grad-action); color: #fff; box-shadow: var(--glow-action-soft)`.
- `.mode` only: `[data-mode="live"][aria-pressed="true"] { background: var(--grad-live); color: var(--ink-page); box-shadow: var(--glow-live) }`. Clicking Live with no wallet calls `openConnect()` and stays on Practice (audit decision); the Live segment is never "on" without `connected`.
- `.seg.leg` (two big choice tiles: `grid-template-columns: 1fr 1fr; padding: 8px 10px; text-align: center`) keeps the partner's gap/mark split: gap-leg on = `--grad-live` ink, mark-leg on = `--grad-action` white.
- Keyboard: arrow keys move within the group, each segment is a real `<button>`.

### 4.7 Sheets and dialogs

All five existing dialogs (`PreIpoBuySheet`, `ProfileSheet`, `ConnectWalletProvider` mobile prompt, `DeepLinkResumer`, and the future auth sheet) share one shell:

```html
<div class="sheet" role="presentation">            <!-- .scrim, fixed inset-0, z 70, display grid -->
  <div class="sheet-box glass glass-era" role="dialog" aria-modal="true" aria-labelledby="…">
    <header class="sheet-head"><p class="eyebrow">Wallet</p><h3 id="…">Claim your profile</h3><button class="btn-icon btn-ghost" aria-label="Close">✕</button></header>
    <div class="sheet-body">…</div>
    <div class="sheet-actions">…</div>
    <p class="sheet-foot">…</p>
  </div>
</div>
```

- `.sheet`: `place-items: end center` (bottom sheet) under 720px, `place-items: center` above; `padding: 16px` on phones so the box never touches the screen edge; `animation: fadeIn .3s var(--ease-soft)`.
- `.sheet-box`: `width: min(520px, 100%)` (auth: 440px; story/thread: 760px, `max-height: 92vh; overflow-y: auto`); `padding: 20px 22px 18px`; `border-radius: var(--radius-panel)`; `box-shadow: var(--inner-hi), var(--shadow-sheet)`; `animation: sheetUp .5s var(--ease)` (`translateY(24px) → 0`, opacity). `h3` Outfit 600 16px; `.sheet-text` Outfit 500 12px `--text-2` with `b { color: var(--text-1) }`; `.sheet-actions { display: flex; flex-wrap: wrap; gap: 8px }`; `.sheet-foot` 10px `--text-2`.
- Behaviour: focus moves to the first control on open, is trapped inside, and returns to the opener on close; `Escape` closes; clicking the scrim closes unless a wallet signature is pending. Bottom sheets on phones respect `env(safe-area-inset-bottom)`.
- The `@solana/wallet-adapter-react-ui` modal (`styles.css` is imported in `SolanaProvider.tsx:15`) is a third dialog family; override `.wallet-adapter-modal-wrapper`, `.wallet-adapter-modal-title`, `.wallet-adapter-button`, `.wallet-adapter-modal-list li button` to `--ink-panel`, `--line`, `--text-1`, `--grad-action` so it does not appear in the library's own purple.

### 4.8 Toasts

- Container `.toasts`: fixed `right: 24px; bottom: 24px; gap: 8px; z-index: 50`; on phones `left/right: 12px; bottom: calc(var(--tabbar-h) + 12px)`. `role="status" aria-live="polite"`; at most 3 visible, oldest removed first.
- `.toast`: `glass`, `border-color: var(--era-3)`, `padding: 12px 16px`, Outfit 500 13px `--text-1`, `max-width: 420px`, enter `opacity 0, translateY(12px) scale(.96) → 1/none` over `.55s var(--ease)`; exit reverse. `.ok { border-color: var(--gain); background: color-mix(in srgb, var(--gain) 10%, var(--ink-panel) ) }` with `--gain` text; `.warn { border-color: var(--warn) }` with `--warn` text. Links inside are underlined `--text-accent`.
- Auto-dismiss after 2.6s (5s when it contains a link, e.g. "view on Solscan"); hover pauses the timer. Errors that block a task are shown inline with `role="alert"` as well; a toast is never the only place an error appears.

### 4.9 Rows and tables

- `.rows`: `display: flex; flex-direction: column; padding: 0`. `.row`: `display: grid; grid-template-columns: minmax(0,1fr) 56px auto auto auto; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line-soft); text-align: left; width: 100%; transition: background-color var(--t) var(--ease-soft), transform var(--t) var(--ease)`. Hover `background: var(--ink-hover); transform: translateX(2px)`; `.on { background: var(--ink-selected); box-shadow: inset 2px 0 0 var(--era-3) }`; `.closed { opacity: .55 }` (24/5 market outside its window; hover `.85`). Phones: `min-height: 44px`, `transform: none` on hover.
- Cells: `.row-main b` Outfit 600 12px + symbol mono, `small` 10px `--text-2` truncated; `.row-num` mono 600 12px right-aligned with the delta in `--gain`/`--loss` 10px beneath; `.gap` (pre-IPO "vs mark") mono 10px in a 1px `--line` box, coloured by sign; `.star` `--text-3` → `--warn` when on (with `text-shadow: 0 0 10px #ffb02066`).
- Container queries (partner): `@container (max-width: 560px)` drops `.liq` and narrows the spark to 56px; `@container (max-width: 420px)` drops the spark.
- Tables (`.lt-head`/`.lt-row`, launches, ladder): header cells are eyebrows (mono 600 9→10px `.12em` uppercase `--text-2`), rows `padding: 8px 6px` with `--line-soft` hairlines and `--ink-hover` on hover; numeric columns right-aligned mono tabular. Under 760px the header hides and each row becomes a 2-column key/value grid.
- The live `MarketRow`/`market-list` become `.rows/.row`; `HoldingRow`, `TransactionRow`, leaderboard rows and `.person` follow the same grid with their own column templates (`.person: 28px auto 1fr auto auto`).

### 4.10 Sparklines and charts

- `.spark`: `56×18` in rows, `48×14` in feed trails, `80×22` in signal tiles, `72×24` on the markets page. SVG `path { fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round }`, the element coloured `--gain` or `--loss` by first-vs-last. `filter: drop-shadow(0 0 3px currentColor)` **only** on `.row:hover .spark` and in panels with ≤ 12 rows; a filter on 40+ sparklines is a paint cost on every price tick.
- `PriceChart.tsx` hard-codes `#059669`/`#e11d48`; change to `var(--gain)`/`var(--loss)` via `currentColor` and drop the 16% fill in list contexts (keep it for the asset chart).
- Big charts (hero, asset): line `#f2f3ff` 1.5px on the paper; grid `--line`; crosshair `#f2f3ff99`; y-labels mono 500 10px `--text-2`; current-price tag `--ink-tooltip` with ink text; dotted reference line for the exchange price. Tooltip `.chart-tip { background: var(--ink-tooltip); color: var(--ink-page); font: mono 600 11px; padding: 6px 9px; box-shadow: var(--shadow-float) }`.
- Allocation bar `.alloc { height: 6px; background: var(--line) }` with per-ticker segments (`--tk-n` colours, section 5.3) and a legend in Outfit 500 11px `--text-2` with 8px square swatches.

### 4.11 Avatars for wallets

No photos (the invented people are gone). A wallet is an initials tile:

- `.avatar`: sizes `xs 22` (tape, comments), `sm 26` (people rows), `md 32` (stories, sheet header), `lg 40` (profile page); `display: grid; place-items: center; border-radius: var(--radius-avatar); border: 1px solid var(--line-strong); font: mono 600 (10/11/12/14px); color: var(--text-0)`.
- Fill: deterministic from the address (keep `avatarColorFor(address)` in `src/lib/investors.ts` but return a `--tk-n` token, not a Tailwind class): `--tk-1 #5b3df5` (6.1), `--tk-2 #2456f0` (5.7), `--tk-3 #0d78a0` (5.0), `--tk-4 #0c7a5f` (5.3), `--tk-5 #a12ee0` (5.3), `--tk-6 #b0355f` (6.0), `--tk-7 #935d0d` (5.5), `--tk-8 #3d4a8a` (8.3). All eight hold white text ≥ 4.5:1 (computed ratios in parentheses; an earlier draft's `#0f8f72` and `#a86a10` measured 4.0 and 4.4 and were darkened) and sit inside the era hue family plus two warm outliers so a page of avatars is not one colour. The darker fills sit near 3.3–3.7:1 against the panel, which is fine for a fill with a `--line-strong` border and initials on it, but none of the eight may be used as a *text* colour. The same list is `TickerBadge`'s palette (`catalog.ts colorFor`).
- Initials: 2 characters, from the profile name or the first two base58 characters. Profiles with a claimed handle show `@handle` mono 11px under the name; unclaimed wallets show the short address in mono.
- Following ring (stories row on Leaderboard): `.ring { padding: 2px; background: var(--line) }`, `.following .ring { background: var(--grad-era) }`, image/tile inside with a 2px `--ink-panel` gap. Stories hover `translateY(-2px)`.
- Own avatar in the top bar (`.me-pill`): `sm` tile + name (mono 600 11px) + short address (mono 9→10px `--text-2`) in a 1px `--line` box; hover border `--era-3`.

### 4.12 Verified badge and the on-chain badge

- `.verified`: `inline-grid; place-items: center; width: 14px; height: 14px; border-radius: var(--radius-control); background: var(--era-2); color: #fff; font-size: 9px; margin-left: 4px; vertical-align: 1px` with an SVG check (not the glyph), `role="img" aria-label="Verified wallet"` and `title`. White-on-`--era-2` is 6.9:1; the tile is a fill, so its 2.8:1 edge against ink is fine. Shown only for a profile that was claimed with a wallet signature through `/api/profile` — it means "this handle is this wallet", nothing else.
- `OnChainBadge` / `MyWalletBadge` today put white text on `--grad-solana` (≈1.5:1 at the mint end). New spec: `.badge-solana { border: 1px solid transparent; background: linear-gradient(var(--ink-panel), var(--ink-panel)) padding-box, var(--grad-solana) border-box; color: var(--text-1); font: mono 600 10px; padding: 3px 8px }` with the chain icon tinted `#14f195`. The Solana gradient is named, visible, and never under text.

### 4.13 Mode toggle and wallet pill

- `.mode` is a `.seg` (4.6) with two segments: `Practice` and `Live · mainnet` (phones: `Live`, `max-width: 64px`, ellipsis). Practice "on" = `--grad-action`; Live "on" = `--grad-live` + `--glow-live`. It binds to `useTradeMode().setMode`; with no wallet, Live routes to `openConnect()` (audit decision) and the visual state does not change until `connected` is true.
- `.wallet-pill`: `inline-flex; gap: 6px; padding: 5px 9px; border: 1px solid var(--line); font: mono 500 10px; letter-spacing: .06em; color: var(--text-1)` with a 6px `i` dot: `background: var(--live); box-shadow: var(--glow-live)` when connected and live, `var(--warn)` when connected but in practice, hidden when disconnected (the pill then reads "Connect wallet" as a `.btn-secondary.btn-small`). Hover border `--era-3`. Contains the short address and, when known, the SOL balance in `small` `--text-2`.
- The body carries `data-mode="practice|live"`; `[data-mode="live"] .masthead` reads "Mainnet edition" only when a wallet is actually connected.
- The demo-wallet concept, the "Keep the demo wallet" action and any `DemoW4LLet…` address do not exist in the port.

### 4.14 Shell pieces

- **Sidenav** (`.sidenav`, ≥ 1100px): `width: var(--sidenav-w); background: var(--ink-panel); border-right: 1px solid var(--line); padding: 14px 12px; position: sticky; top: 0; height: 100vh`. Mark 40px (`/brand/solera-mark-256.png`, 52 KB, as `Logo.tsx:12` already loads it; the 528 KB `solera-mark.png` is the source asset and never goes in the DOM) with `--glow-mark` and `border-radius: var(--radius-mark)`; tagline eyebrow "A little more perspective."; items `padding: 10px 12px; font: mono 600 11px; .12em; uppercase; color: var(--text-2)` with a 16px icon; hover `background: var(--ink-hover); color: var(--text-1); transform: translateX(3px)`; `[aria-current="page"] { background: linear-gradient(90deg, #482efa33, transparent); color: #fff; box-shadow: inset 2px 0 0 var(--era-3) }` and its icon `color: var(--era-4); filter: drop-shadow(0 0 6px #01eaf4aa)`. Foot card `.side-foot` (1px `--line`, 10px mono uppercase `--text-2`, "Built on Solana ↗" in a Solana text gradient, the one place `.text-gradient-solana` survives) and the account block.
- **Top bar** (`.top`): `glass`, `position: sticky; top: 0; z-index: 30; display: grid; grid-template-columns: auto 1fr auto; gap: 12px; padding: 10px 16px; height: 56px`. Left: mark (32px) on phones, masthead on desktop; middle: `.search-btn`; right: `.mode`, `.clock` (mono 12px `--text-2`, tabular; hidden on phones), `.wallet-pill`, `.auth` (LOG IN `.btn-secondary.btn-small` + SIGN UP `.btn-primary.btn-small`) or `.me-pill`.
- **Tab bar** (`.tabbar`, < 1100px): `glass` (blur 14), `position: fixed; inset: auto 0 0 0; z-index: 40; display: grid; grid-template-columns: repeat(6, 1fr); padding: 6px 6px calc(6px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line)`. The six tabs from `mobile.js`: Portfolio, Markets, Trade, Discover, People, Agent. Button `padding: 8px 4px 6px; font: mono 600 9→10px; .06em; uppercase; color: var(--text-2)`, 20px icon; `.on { color: #fff }` with the icon `--era-4` + drop-shadow and `translateY(-2px)`. Indicator `::before`: a 2px `--grad-era` bar, `width: calc(100%/6 - 12px)`, `left` driven by `--i`, `transition: left .45s var(--ease)`, `box-shadow: 0 0 12px #482efaaa`. Each tab is ≥ 48px tall.
- **Strip** (`.strip`): `padding: 8px 16px 0; max-width: var(--grid-max)`; horizontal scroll, hidden scrollbar, a 48px right-edge fade to `--ink-page`; children are `.chip-l`.
- **Skip link**, **empty state** (`.empty-state`: dashed 1px `--line-strong`, Outfit 600 16px title, 12px `--text-2` body), **skeleton** (`.skeleton { background: linear-gradient(90deg, var(--ink-raised), #1c2235, var(--ink-raised)); background-size: 200% 100%; animation: shimmer 1.4s linear infinite }`; static `--ink-raised` under reduced motion), **live dot** (`.live-dot { 8px; background: var(--live); box-shadow: var(--glow-live); animation: pulse 1.6s infinite }` – an expanding ring, 0.6 Hz), **scrollbars** (`scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent`), and `:root { color-scheme: dark }` so native selects, date pickers and scrollbars go dark.
- **Breakpoints, stated once.** ≥ 1100px: sidenav, top bar, strip, the 12-column `.panel-grid` with handles. 768–1099px: sidenav gone, tab bar shown, every panel forced full width (layout doc §4.3), handles hidden. < 768px: phone sizing (13px body, 44px rows, 2-up KPIs, per-tab panel stacks per layout doc §6). The partner has no navigation at all between 768 and 1100 (`terminal.css:545` hides the sidenav; the tab bar exists only in `mobile.html` via `mobile.css`) — the port shows the tab bar there.
- **No horizontal page scroll, at any width.** The partner's phone screenshot overflows to the right (the Live segment, the strip chips and the positions list are cut at 390px). Rules: `html, body { overflow-x: clip }` as a guard (`clip`, not `hidden`, so `position: sticky` keeps working and no scroll container is created); every grid track that holds text is `minmax(0, 1fr)`, never bare `1fr` or `auto`; `.top` is `grid-template-columns: auto minmax(0, 1fr) auto` with `.top-right { flex-wrap: wrap; min-width: 0 }` and the Live segment truncated under 768px; the strip and the tape are the only horizontal scrollers and both sit inside a `min-width: 0` parent; long addresses always render the short form (`shortAddress()`), never the full base58 string.

## 5. Migration strategy for the ~70 live components

### 5.1 Step one: flip the palette in `@theme` (one commit, zero component edits)

Verified with Tailwind 4.3.3's `compile()`: a user `@theme { --color-neutral-400: #8a8fb3 }` overrides the `@theme default` value and the emitted utility is `.text-neutral-400 { color: var(--color-neutral-400) }`, so every existing class flips with the token. Two caveats, also read off the compiled output: (a) opacity modifiers follow the remap but keep their light-theme *meaning* — `bg-neutral-900/40` compiles to `background-color: color-mix(in srgb, #e3e5f5 40%, transparent)` with an `@supports (color: color-mix(in lab, red, red))` block that upgrades it to `color-mix(in oklab, var(--color-neutral-900) 40%, transparent)`; both paths use the remapped value, so a scrim that meant "40% dark ink over the page" becomes a 40% wash of near-white. Every `/nn` class therefore needs a hand edit even though the colour technically tracks the token; (b) `rounded-full` is `calc(infinity * 1px)`, not a theme token, so pills cannot be remapped, whereas `rounded-2xl` compiles to `var(--radius-2xl)` and `shadow-sm` to `var(--tw-shadow-color, <value>)`, so `--radius-xl/2xl/3xl` and `--shadow-sm/xl` can.

The remap (semantic inversion: what was a light fill becomes an ink fill, what was dark text becomes light text):

| Legacy token | New value | Why |
|---|---|---|
| `neutral-50` | `#151a29` (`--ink-raised`) | `bg-neutral-50` ×9 were pale fills → raised ink |
| `neutral-100` | `#171c2e` | `bg-neutral-100` ×26 quick-amount pills/tracks, `border-neutral-100` ×13 and `divide-neutral-100` ×11 hairlines |
| `neutral-200` | `#232a40` (`--line`) | `border-neutral-200` ×12, `ring-neutral-200` |
| `neutral-300` | `#3a4266` (`--line-strong`) | guest avatar, `$` prefix |
| `neutral-400` | `#8a8fb3` (`--text-2`) | ×91 muted text |
| `neutral-500` | `#9a9fc4` (7.2:1) | ×86 "slightly less muted" text keeps its rank above 400 |
| `neutral-600` | `#b9bde0` | ×26 body-ish copy |
| `neutral-700` / `800` | `#cfd2ea` / `#dcdff0` | |
| `neutral-900` | `#e3e5f5` (`--text-1`) | ×58 headings and figures |
| `neutral-950` | `#ffffff` | |
| `violet-50` / `100` | `#1b184b` / `#241c6b` (era-2 at 20% / 35% over panel) | `bg-violet-50` ×7 Buy links, copy-trade banner |
| `violet-200` | `#3a2f66` | `border-violet-200` ×5 |
| `violet-400` / `500` / `600` / `700` | `#b9a3ff` / `#c9a8ff` / `#c9a8ff` / `#dcccff` | the period, links, "Connect a wallet →" (8.3:1 on the violet-50 fill) |
| `indigo-600` | `#9fb3ff` | ×5 links |
| `emerald-50` / `200` | `#162e2c` / `#1f5a44` | gain tint / border |
| `emerald-500` / `600` / `700` / `900` | `#3ddc84` | ×19 gain text |
| `rose-50`, `red-50` | `#301d2b` | loss tint |
| `rose-500` / `600`, `red-600` | `#ff5c7a` | ×11 loss text |
| `rose-700` | `#ff8099` | |
| `amber-50` | `#2a1e08` | warning boxes |
| `amber-400` / `600` / `700` / `800` / `900` | `#ffb020` (400–700), `#ffc65c` (800–900) | star, premium %, warning text (≈8.9:1 on amber-50) |
| `sky-50` / `700` | `#0f1f2e` / `#5ec8ff` | |
| `--radius-xl`, `--radius-2xl`, `--radius-3xl` | `var(--radius-panel)` | `rounded-2xl` ×24 + `rounded-3xl` ×14 + `rounded-xl` ×7 become panels/tiles in one line |
| `--radius-lg` | `var(--radius-control)` | |
| `--shadow-sm` | `inset 0 1px 0 rgb(255 255 255 / 0.05)` | ×6 "lifted" segments become the inner highlight |
| `--shadow-xl` | `0 16px 40px rgb(0 0 0 / 0.5)` | ×5 dialogs |

**Not remapped, on purpose:** `--color-white`. `bg-white` (×21) would want the panel colour but `text-white` (×11) sits on gradient buttons and must stay white; remapping one breaks the other. `bg-white` is edited by hand instead.

Also in step one: delete the `.text-neutral-400`/`.text-neutral-900` overrides and the light `:root` block in `globals.css`; set `body { background: var(--ink-page); color: var(--text-1) }`; set `viewport.themeColor` in `layout.tsx` to `#0b0d16`; restyle the shared classes in place (`btn-primary` ×20, `btn-secondary` ×15, `eyebrow` ×15, `page-heading` ×8, `field` ×4, `card-elevated` ×3 → no-op, `segmented-control` ×1 → alias of `.seg`, `wallet-popover` ×2 → glass, `search-field` ×2, `empty-state` ×2, `rank-card`/`investor-card`/`rail-card`/`portfolio-balance`/`welcome-guide`/`holdings-preview`/`holding-row`/`market-*` → ink panels and rows). After this commit the app is dark and coherent, if not yet the terminal layout.

### 5.2 Step two: the manual edits (grouped so they can be done file by file)

| What | Count | Edit |
|---|---|---|
| `bg-white` | 21 | → `bg-panel` (utility from `--color-panel` in `@theme`) |
| `bg-white/70`, `bg-white/90` | 3 (`TopBar`, two banners) | → `glass` |
| `bg-neutral-900/40` scrims | 4 (`PreIpoBuySheet`, `ProfileSheet`, `ConnectWalletProvider`, `DeepLinkResumer`) | → `sheet` shell (4.7) |
| `text-white` | 11 | keep where the parent is `--grad-action`/`--grad-sell`; change to `text-page` (ink) on any `--grad-live` fill; the Solana badges become `.badge-solana` |
| `rounded-full` | 49 | avatars → `.avatar`; buttons/segments/quick amounts (~30) → `.btn`/`.seg` classes; badges → `.chip`; leave pills only on `.chip-l` and the live dot |
| `bg-gradient-brand` | 4 (`FollowButton`, `Hero` wash, 2 others) | → `bg-grad-action`; the Hero wash → `--bloom-hero` |
| `bg-gradient-solana` / `text-gradient-solana` | 4 / 1 | → `.badge-solana`; the sidenav "Built on Solana" keeps the text gradient |
| Ticker/avatar colour classes in `src/lib/mock-data.ts` (12), `investors.ts` (8), `pre-ipo.ts` (8), `catalog.ts colorFor` | 29 | → `--tk-n` tokens set via `style={{ background: `var(${color})` }}`; `TickerBadge`/`Avatar` take a token name instead of a class. Without this, `bg-violet-500` would become lilac with white initials (≈1.6:1). |
| `PriceChart.tsx` stroke hex | 2 | → `currentColor` |
| `celebrate.ts` confetti colours | 1 | → `["#482efa", "#0191fd", "#05fbcf", "#d139fc"]` |
| `desktop-nav` / `mobile-nav` / `demo-strip` / `status-dot` | shell | replaced by `.sidenav`, `.tabbar`, `.mode` + `.wallet-pill` (the shell is rebuilt, not patched) |
| Wallet-adapter modal | 1 stylesheet | overrides in `globals.css` (4.7) |

Files by edit weight (occurrences of `(text|bg|border|ring|divide|placeholder)-(neutral|violet|indigo|emerald|rose|amber|sky|red|white)[-shade][/opacity]` per file): `TradeScreen.tsx` 57, `app/portfolio/page.tsx` 42, `OptionsTradeScreen.tsx` 42 (cut — the practice options chain is dropped), `PreIpo.tsx` 39, `PreIpoBuySheet.tsx` 33, `ProfileSheet.tsx` 18, `app/asset/[ticker]/chat/page.tsx` 15, `app/leaderboard/page.tsx` 14, `MyWalletBadge.tsx` 13, `ChatRoomCard.tsx` 11, `OptionsChain.tsx` 10 (cut), `Hero.tsx` 10, `DeepLinkResumer.tsx` 10, `CatalogList.tsx` 10, `app/investor/[id]/page.tsx` 9, `app/asset/[ticker]/page.tsx` 9, then 36 files with ≤ 9. Because the redesign rebuilds screens on the 12-column grid anyway, most of these files are rewritten rather than patched; the remap in 5.1 keeps them presentable in the meantime.

### 5.3 New tokens exposed to Tailwind

Declared in `@theme` (not `inline`, so utilities reference the variable): `--color-page`, `--color-panel`, `--color-head`, `--color-raised`, `--color-inset`, `--color-hover`, `--color-selected`, `--color-line`, `--color-line-soft`, `--color-line-strong`, `--color-fg`, `--color-muted`, `--color-faint`, `--color-accent-text`, `--color-link`, `--color-gain`, `--color-loss`, `--color-warn`, `--color-live`, `--color-era-1…5`, `--color-tk-1…8`, `--radius-panel`, `--radius-control`, `--radius-chip`, `--radius-avatar`, `--shadow-float`, `--shadow-sheet`, `--ease-solera`, `--ease-soft`. That yields `bg-panel`, `text-muted`, `border-line`, `text-gain`, `bg-raised`, `rounded-panel`, `shadow-float` and so on for new code, so no new component needs a `neutral-*` class ever again. Gradients are `.bg-grad-action`, `.bg-grad-live`, `.bg-grad-sell`, `.bg-gradient-era`, `.text-gradient-era` utilities in plain CSS (Tailwind's `bg-linear-*` cannot express the fixed stops). Plain aliases `--panel`, `--line`, `--accent`, `--accent-wash` and `--ease` exist on `:root` so the layout engine's `panels.css` (layout doc §4.3) compiles as written against this token set; `--grid-row` is defined by the layout doc.

### 5.4 Order of work

1. `globals.css` skeleton (section 8) + `layout.tsx` theme colour → typecheck/lint/test → preview deploy. The app is dark.
2. Shell: `AppShell` → `.sidenav` / `.top` / `.strip` / `.tabbar`; `ModeStrip` → `.mode` + `.wallet-pill`.
3. Primitives as shared components: `Panel`, `Chip`, `Btn` (variants), `Field`, `Seg`, `Sheet`, `Toast`, `Row`, `Avatar`, `Verified`, `Tape`.
4. Screens in decision order (portfolio, markets + ticket, discover, leaderboard, pre-IPO, agent), each replacing its Tailwind palette strings with the primitives.
5. Delete `OptionsChain.tsx`, `OptionsTradeScreen.tsx`, `app/options/**` (cut), and any class the census shows at zero uses.

## 6. Motion and reduced motion

| Motion | Spec | Frequency check |
|---|---|---|
| Control transitions | one rule: `transition: background-color, color, border-color, box-shadow, opacity var(--t) var(--ease-soft), transform var(--t) var(--ease)` on `button, .row, .chip, .chip-l, .seg button, .tabbar button, .field, .avatar, .star`. `filter`/`text-shadow` transitions only on `.btn`, `.chip-l`, `.spark:hover` (the partner transitions `filter` on every row, which is a paint cost). | — |
| Press | `:active { transform: scale(.97); transition-duration: var(--t-fast) }` | — |
| Panel entrance | `rise` `.9s var(--ease)`: `opacity 0, translateY(12px) → 1, none`; stagger 50 ms × index, capped at 9; on phones `.6s` and stagger 80 ms capped at 3 | one-shot |
| Tape crawl | `translateX(0 → -50%)` linear, 60 s desktop / 40 s phone, paused on hover | continuous, sub-1 Hz |
| Feed row arrival | `tmIn .7s` (`translateY(-10px)`, opacity) then `tmFade 2.4s` from `#241c6b` to transparent | one-shot |
| Price flash | `flashUp/flashDown .9s ease-out`: colour from `--gain`/`--loss` to inherit | one-shot per tick, never more than once per second per cell |
| Live dot | `pulse 1.6s`: expanding ring `0 → 8px` transparent | 0.6 Hz |
| Status dot / armed plan | `pulseDot 2.4s`: opacity 1 → .35 | 0.4 Hz |
| Layout hint (first visit) | `handlePulse 1.2s`: opacity 1 → .4 on grips/handles for 4 s | 0.8 Hz |
| Button arm | `arm .6s`: ring `0 → 14px` `#482efaaa → 00` | one-shot |
| Sheet / palette / toast | `sheetUp .5s`, `pop .55s` (`translateY(20px) scale(.96)`), toast `.55s` | one-shot |
| Tab indicator | `left .45s var(--ease)` | one-shot |
| Balance / KPI numbers | tween 420 ms (partner `tweenText`) | one-shot |
| Allocation / progress bars | `width .9s var(--ease)` | one-shot |
| Confetti | `celebrateTrade()` on a real fill only, already gated on reduced motion; colours from the era palette | one-shot |
| Brand cursor blink (`.brand-word::after`, 1 Hz `steps(1)`) | **dropped** (a hard on/off blink next to the logo, and the mark stands alone) | — |
| Skeleton shimmer | `1.4s linear infinite` | 0.7 Hz |

Nothing cycles faster than 1 Hz (WCAG 2.3.1 threshold is 3 Hz), nothing red pulses on a trade control, and no animation runs on a static number.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }
  .tape-track { animation: none; transform: none; overflow-x: auto; }   /* static, scrollable, duplicate half hidden */
  .skeleton { animation: none; background: var(--ink-raised); }
  .live-dot, .status-dot, .plan.armed .plan-status { animation: none; }
}
```

(`0.001ms` rather than `none` so `animationend` handlers still fire and one-shot entrances resolve to their final state.) Confetti and number tweens check `matchMedia` in JS, as `celebrate.ts` already does.

## 7. Accessibility minimums

**Contrast (computed; AA is 4.5:1 for text under 24px/18.7px-bold, 3:1 for large text and UI boundaries):**

| Pair | Ratio | Verdict |
|---|---|---|
| `--text-1` on panel / page / raised / hover / glass | 14.8 / 15.5 / 13.9 / 13.7 / 15.0 | AAA |
| `--text-0` on panel / page | 18.5 / 19.4 | AAA |
| `--text-2` on panel / page / raised / head / hover / glass | 5.9 / 6.2 / 5.5 / 5.7 / 5.4 / 6.0 | AA everywhere, including 10px eyebrows |
| `--text-2` on selected / highlight rows | 5.4 / 5.3 | AA |
| `--text-tape`, `--text-accent`, `--text-link` on panel | 10.1 / 9.3 / 9.1 | AAA |
| `--gain` on panel / on gain tint | 10.4 / 8.1 | AAA |
| `--loss` on panel / page / on loss tint | 6.2 / 6.5 / 5.3 | AA |
| `--warn` on panel; ink on `--warn` | 10.1 / 10.6 | AAA |
| `--live` on panel | 12.4 | AAA |
| white on `--grad-action` (start → end) | 5.1 → 6.9 | AA along the band |
| ink on `--grad-live` (start → end) | 6.0 → 14.5 | AA along the band |
| white on `--grad-sell` (start → mid → end) | 5.1 → ~5.7 → 5.5 | AA along the band |
| ink on `--ink-tooltip` | ≥ 15 | AAA |
| `--era-3` as a line/indicator vs panel | 5.7 | passes 3:1 |
| `--era-2` as a line vs page | 2.8 | **fails 3:1 → fill only** |
| white on partner `#4c6fff → #9b5cf7` | 4.2 → 4.0 | fails at 12px (why the band changed) |
| white on `#14f195` (Solana badge today) | ≈1.5 | fails (why the badge changed) |
| `--text-3` on panel | 3.1 | non-text only |

**Focus.** `:focus-visible { outline: 2px solid var(--live); outline-offset: 2px }` on every interactive element (the partner's 1px violet outline is too thin and 2.8:1). On gradient fills use `box-shadow: 0 0 0 2px var(--ink-page), 0 0 0 4px var(--live)` so the ring is visible against the fill. Never `outline: none` without a replacement; `.field` moves the ring to its wrapper as today.

**Hit sizes.** 44×44 CSS px on touch for every control (rows `min-height: 44px`, tab bar buttons ≥ 48px tall, icon buttons 44px, the star gets `padding: 10px`); 36px minimum on desktop pointer; ≥ 24px spacing between adjacent small targets (vote arrows are 22px tall with 4px between them in the partner; make them 24px with 8px). Sliders' thumbs are 20px visual with a 44px transparent hit area.

**Text.** 10px floor, uppercase only via CSS, tracking never above `0.16em`, line-height ≥ 1.45 for prose. Truncation with `text-overflow: ellipsis` also sets `title`.

**Semantics.** Toggles are `<button aria-pressed>`; segmented groups are `role="group"` with a label; nav uses `aria-current="page"`; dialogs are `role="dialog" aria-modal="true"` with a labelled title, focus trap, `Escape`, and focus return; toasts are `role="status"`; blocking errors are inline `role="alert"`; the tape is `aria-hidden`; decorative gradients, grips and handles are `aria-hidden`; the verified badge is `role="img"` with a label; sparklines are `aria-hidden` with the figure in text next to them; every price change also appears as text (no colour-only signals); live regions are polite and throttled (one announcement per fill, none per price tick).

**Preferences.** `prefers-reduced-motion` (section 6), `prefers-reduced-transparency` and `forced-colors` (section 2), `color-scheme: dark`, `theme-color #0b0d16`, `viewport-fit=cover` with safe-area padding on the tab bar and toasts, `-webkit-text-size-adjust: 100%`, no `user-scalable=no`, and no horizontal page scroll at any width (4.14).

**Removed from the partner build for accessibility:** scanlines over text, 8–9px labels, the blinking cursor, `filter: grayscale` on people (no photos anyway), 1px focus outlines, the `button:focus-visible` rule that only covered buttons.

## 8. `globals.css` skeleton

Paste over `src/app/globals.css`. Component rules that merely restate section 4 are abbreviated with `…` where the values above are unambiguous; everything token-level is complete.

```css
@import "tailwindcss";

/* ---------- 1. Theme: tokens Tailwind should know about (utilities emit var() refs) ---------- */
@theme {
  /* ink surfaces */
  --color-page: #0b0d16;   --color-panel: #10131f;   --color-head: #121627;   --color-raised: #151a29;
  --color-inset: #0b0d16;  --color-hover: #161b2c;   --color-selected: #191a33; --color-highlight: #1d1a3d;
  --color-tooltip: #f2f3ff;
  /* lines */
  --color-line: #232a40;   --color-line-soft: #171c2e; --color-line-strong: #3a4266;
  /* text */
  --color-fg: #e3e5f5;     --color-muted: #8a8fb3;   --color-faint: #5c6288;  --color-tape: #b9bde0;
  --color-accent-text: #c9a8ff; --color-link: #9fb3ff;
  /* semantic */
  --color-gain: #3ddc84;   --color-loss: #ff5c7a;    --color-warn: #ffb020;   --color-live: #01eaf4;
  /* era */
  --color-era-1: #d139fc; --color-era-2: #482efa; --color-era-3: #0191fd; --color-era-4: #01eaf4; --color-era-5: #05fbcf;
  /* ticker / avatar fills (white text ≥ 4.5:1 on each) */
  --color-tk-1: #5b3df5; --color-tk-2: #2456f0; --color-tk-3: #0d78a0; --color-tk-4: #0c7a5f;
  --color-tk-5: #a12ee0; --color-tk-6: #b0355f; --color-tk-7: #935d0d; --color-tk-8: #3d4a8a;

  /* legacy palette remap: flips the 52 files still on neutral/violet/… (section 5.1) */
  --color-neutral-50: #151a29;  --color-neutral-100: #171c2e; --color-neutral-200: #232a40; --color-neutral-300: #3a4266;
  --color-neutral-400: #8a8fb3; --color-neutral-500: #9a9fc4; --color-neutral-600: #b9bde0; --color-neutral-700: #cfd2ea;
  --color-neutral-800: #dcdff0; --color-neutral-900: #e3e5f5; --color-neutral-950: #ffffff;
  --color-violet-50: #1b184b;  --color-violet-100: #241c6b; --color-violet-200: #3a2f66; --color-violet-400: #b9a3ff;
  --color-violet-500: #c9a8ff; --color-violet-600: #c9a8ff; --color-violet-700: #dcccff;
  --color-indigo-600: #9fb3ff;
  --color-emerald-50: #162e2c; --color-emerald-200: #1f5a44; --color-emerald-500: #3ddc84; --color-emerald-600: #3ddc84;
  --color-emerald-700: #3ddc84; --color-emerald-900: #3ddc84;
  --color-rose-50: #301d2b; --color-rose-500: #ff5c7a; --color-rose-600: #ff5c7a; --color-rose-700: #ff8099;
  --color-red-50: #301d2b;  --color-red-600: #ff5c7a;
  --color-amber-50: #2a1e08; --color-amber-400: #ffb020; --color-amber-600: #ffb020; --color-amber-700: #ffb020;
  --color-amber-800: #ffc65c; --color-amber-900: #ffc65c;
  --color-sky-50: #0f1f2e;  --color-sky-700: #5ec8ff;

  /* radii */
  --radius-panel: 0px; --radius-control: 0px; --radius-chip: 999px; --radius-avatar: 0px;
  --radius-lg: var(--radius-control); --radius-xl: var(--radius-panel); --radius-2xl: var(--radius-panel); --radius-3xl: var(--radius-panel);
  /* shadows */
  --shadow-sm: inset 0 1px 0 rgb(255 255 255 / 0.05);
  --shadow-xl: 0 16px 40px rgb(0 0 0 / 0.5);
  --shadow-float: 0 16px 40px rgb(0 0 0 / 0.5);
  --shadow-sheet: 0 -20px 80px rgb(72 46 250 / 0.27);
  /* easing */
  --ease-solera: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-soft: cubic-bezier(0.4, 0, 0.2, 1);
}
@theme inline {
  --font-sans: var(--font-display);
  --font-mono: var(--font-figures);
}

/* ---------- 2. Root tokens not needed as utilities ---------- */
:root {
  color-scheme: dark;
  --era-1: #d139fc; --era-2: #482efa; --era-3: #0191fd; --era-4: #01eaf4; --era-5: #05fbcf;
  --era-tile: #000000; --era-ink: #0b0d16;
  --ink-page: var(--color-page); --ink-panel: var(--color-panel); --ink-head: var(--color-head); --ink-raised: var(--color-raised);
  --ink-inset: var(--color-inset); --ink-hover: var(--color-hover); --ink-selected: var(--color-selected); --ink-tooltip: var(--color-tooltip);
  --line: var(--color-line); --line-soft: var(--color-line-soft); --line-strong: var(--color-line-strong);
  --line-glass: color-mix(in srgb, #fff 8%, transparent); --line-accent: var(--era-3);
  --text-0: #ffffff; --text-1: var(--color-fg); --text-2: var(--color-muted); --text-3: var(--color-faint);
  --text-tape: var(--color-tape); --text-accent: var(--color-accent-text); --text-link: var(--color-link);
  --gain: var(--color-gain); --loss: var(--color-loss); --warn: var(--color-warn); --live: var(--color-live);
  --gain-tint: color-mix(in srgb, var(--gain) 13%, transparent); --loss-tint: color-mix(in srgb, var(--loss) 13%, transparent); --warn-tint: #ffb0201a;

  --grad-era: linear-gradient(100deg, var(--era-1) 0%, var(--era-2) 22%, var(--era-3) 50%, var(--era-4) 78%, var(--era-5) 100%);
  --grad-action: linear-gradient(100deg, #9334fb 0%, #482efa 100%);          /* white text: 5.1 → 6.9 */
  --grad-live: linear-gradient(100deg, var(--era-3) 0%, var(--era-4) 60%, var(--era-5) 100%); /* ink text: 6.0 → 14.5 */
  --grad-sell: linear-gradient(100deg, #c93553 0%, #7a3ff0 100%);            /* white text: 5.1 → 5.5 */
  --grad-solana: linear-gradient(90deg, #9945ff, #14f195);                    /* border/icon only */
  --bloom-hero: radial-gradient(600px 220px at 12% 0%, #482efa1f, transparent 70%), radial-gradient(500px 200px at 90% 100%, #d139fc14, transparent 70%);
  --paper: linear-gradient(#1a2036 1px, transparent 1px), linear-gradient(90deg, #1a2036 1px, transparent 1px);

  --glow-mark: 0 0 22px #482efa66, 0 0 6px #05fbcf55;
  --glow-action: 0 8px 26px #482efa66; --glow-action-soft: 0 0 16px #482efa55;
  --glow-live: 0 0 8px var(--live); --glow-gain: 0 0 8px var(--gain); --glow-loss: 0 0 8px var(--loss);
  --inner-hi: inset 0 1px 0 #ffffff0d;
  --shadow-float: 0 16px 40px #0008; --shadow-sheet: 0 -20px 80px #482efa44;

  --radius-mark: 22%;
  --grid-gap: 8px; --pad: 12px; --head-h: 32px; --sidenav-w: 200px; --grid-max: 1520px;
  --tabbar-h: calc(56px + env(safe-area-inset-bottom));
  --ease: var(--ease-solera); --t: 0.38s; --t-fast: 0.12s;
  /* aliases consumed by docs/port/layout-engine.md panels.css (--line and --ease above; --grid-row is set there) */
  --panel: var(--ink-panel); --accent: var(--era-3); --accent-wash: #0191fd12;
}

/* ---------- 3. Base ---------- */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; overflow-x: clip; }
body {
  margin: 0; overflow-x: clip; background: var(--ink-page); color: var(--text-1);
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; font-weight: 500; font-size: 12px; line-height: 1.5;
  -webkit-font-smoothing: antialiased; overscroll-behavior-y: none;
}
@media (max-width: 767px) { body { font-size: 13px; } }
a { color: inherit; text-decoration: none; }
button, input, textarea, select { font: inherit; color: inherit; }
button { cursor: pointer; background: none; border: 0; padding: 0; }
button:disabled { cursor: not-allowed; }
button, a, input, select { -webkit-tap-highlight-color: transparent; }
.font-mono, .mono, kbd, code, [data-figure] { font-family: var(--font-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; }
:where(a, button, input, select, textarea, [tabindex]):focus-visible { outline: 2px solid var(--live); outline-offset: 2px; }
.btn-primary:focus-visible, .btn-live:focus-visible, .btn-sell:focus-visible, .seg button[aria-pressed="true"]:focus-visible {
  outline: none; box-shadow: 0 0 0 2px var(--ink-page), 0 0 0 4px var(--live);
}
.field input:focus-visible, .field textarea:focus-visible { outline: none; }
::selection { background: #482efa66; color: #fff; }
.skip-link { position: fixed; top: -100px; left: 16px; z-index: 100; background: var(--ink-panel); padding: 12px; border: 1px solid var(--era-3); }
.skip-link:focus { top: 12px; }

/* ---------- 4. Type utilities ---------- */
.eyebrow { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-2); margin: 0; }
.eyebrow em { font-style: normal; text-transform: none; letter-spacing: 0; font-family: var(--font-sans); font-weight: 500; font-size: 11px; }
.figure { font-family: var(--font-mono); font-weight: 600; font-variant-numeric: tabular-nums; }
.up { color: var(--gain); } .down { color: var(--loss); } .warn { color: var(--warn); } .muted { color: var(--text-2); }
.text-gradient-era { background-image: var(--grad-era); -webkit-background-clip: text; background-clip: text; color: transparent; }
.text-gradient-solana { background-image: var(--grad-solana); -webkit-background-clip: text; background-clip: text; color: transparent; }
.bg-gradient-era { background-image: var(--grad-era); }
.bg-grad-action { background-image: var(--grad-action); color: #fff; }
.bg-grad-live { background-image: var(--grad-live); color: var(--ink-page); }
.bg-grad-sell { background-image: var(--grad-sell); color: #fff; }

/* ---------- 5. Glass ---------- */
.glass { position: relative; background: color-mix(in srgb, var(--ink-panel) 72%, transparent); -webkit-backdrop-filter: blur(14px) saturate(140%); backdrop-filter: blur(14px) saturate(140%); border: 1px solid var(--line-glass); box-shadow: var(--inner-hi), var(--shadow-float); }
.glass::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 1px; pointer-events: none; background: linear-gradient(90deg, transparent, #ffffff33 35%, #ffffff33 65%, transparent); }
.glass-era::before { background: var(--grad-era); opacity: 0.55; }
.scrim { background: #05060cb8; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: color-mix(in srgb, var(--ink-panel) 96%, transparent); } .scrim { background: #05060cd9; }
}
@media (prefers-reduced-transparency: reduce) { .glass, .scrim { backdrop-filter: none; -webkit-backdrop-filter: none; background: var(--ink-panel); } }
@media (max-width: 767px) { .glass { -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); } }

/* ---------- 6. Panel ---------- */
.panel { position: relative; min-width: 0; display: flex; flex-direction: column; container-type: inline-size; background: var(--ink-panel); border: 1px solid var(--line); border-radius: var(--radius-panel); box-shadow: var(--inner-hi); padding: 0; animation: rise 0.9s var(--ease) both; }
/* grid placement (--col/--w/--row/--h), .is-* drop states and .panel-ghost are in panels.css (layout doc §4.3); the handles' look is here */
.panel:nth-child(2) { animation-delay: .05s } .panel:nth-child(3) { animation-delay: .1s } .panel:nth-child(4) { animation-delay: .15s } .panel:nth-child(5) { animation-delay: .2s } .panel:nth-child(6) { animation-delay: .25s } .panel:nth-child(7) { animation-delay: .3s } .panel:nth-child(8) { animation-delay: .35s } .panel:nth-child(n+9) { animation-delay: .4s }
.panel-head { display: flex; align-items: center; gap: 12px; height: var(--head-h); padding: 0 var(--pad); background: var(--ink-head); border-bottom: 1px solid var(--line); }
.panel-head h2 { margin: 0; font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-1); }
.panel-head h2::before { content: "// "; color: var(--text-accent); }
.panel-tools { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.panel-body { padding: var(--pad); }
.panel-foot { margin: 0; padding: 0 var(--pad) 8px; font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); }
.panel[data-sized] > .panel-body { overflow-y: auto; scrollbar-width: thin; min-height: 0; flex: 1 1 auto; }
.panel[data-sized] > .panel-head { position: sticky; top: 0; z-index: 2; }
.panel.hero { background: var(--bloom-hero), var(--paper), var(--ink-panel); background-size: auto, auto, 24px 24px, 24px 24px, auto; }
.panel-grip { color: var(--text-3); cursor: grab; font-size: 12px; letter-spacing: -2px; user-select: none; -webkit-touch-callout: none; touch-action: none; transition: color var(--t); }
.panel:hover .panel-grip { color: var(--text-2); } .panel-grip:hover { color: var(--text-accent); } .panel-grip:active { cursor: grabbing; }
.panel-resize { position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize; z-index: 3; opacity: .35; touch-action: none; transition: opacity var(--t); background: linear-gradient(135deg, transparent 50%, var(--accent) 50%, var(--accent) 60%, transparent 60%, transparent 75%, var(--accent) 75%, var(--accent) 85%, transparent 85%); }
.panel:hover .panel-resize, .panel.is-resizing .panel-resize { opacity: .8; }
.panel-badge { position: absolute; right: 10px; bottom: 10px; z-index: 4; font-family: var(--font-mono); font-size: 10px; padding: 3px 7px; background: var(--grad-action); color: #fff; opacity: 0; pointer-events: none; transition: opacity var(--t); }
.panel-badge.on { opacity: 1; }
.panel.is-resizing { outline: 1px solid var(--accent); box-shadow: 0 0 24px #0191fd44; transition: none; user-select: none; }
.panel.is-dragging { opacity: .35; } .panel.is-over-swap { outline: 1px dashed var(--accent); box-shadow: inset 0 0 0 999px var(--accent-wash); }
.panel.is-over-before::before, .panel.is-over-after::after { content: ""; position: absolute; top: 0; bottom: 0; width: 3px; background: var(--accent); }
.panel.is-over-before::before { left: -6px; } .panel.is-over-after::after { right: -6px; }
.panel-ghost { position: fixed; z-index: 60; pointer-events: none; opacity: .9; animation: none; }
@media (max-width: 1099px) { .panel-grip, .panel-resize, .panel-badge, .reset-layout { display: none; } }

/* ---------- 7. Chips, pills, tags ---------- */
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid var(--line); border-radius: var(--radius-control); font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--text-2); }
.chip.gap { color: var(--gain); border-color: #3ddc8444; } .chip.mark { color: var(--text-accent); border-color: #3a2f66; }
.chip.fired, .chip.warn { color: var(--warn); border-color: var(--warn); background: var(--warn-tint); }
.chip.gain { color: var(--gain); background: var(--gain-tint); border-color: transparent; text-transform: none; letter-spacing: 0; font-size: 12px; }
.chip.loss { color: var(--loss); background: var(--loss-tint); border-color: transparent; text-transform: none; letter-spacing: 0; font-size: 12px; }
.pill { font-family: var(--font-mono); font-size: 10px; font-weight: 600; padding: 1px 6px; border: 1px solid var(--line); color: var(--text-2); }
.pill-247 { background: #3ddc8422; color: var(--gain); } .pill-245 { background: #482efa22; color: var(--text-accent); }
.chip-l { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px 7px 8px; border-radius: var(--radius-chip); font-size: 11px; color: var(--text-2); white-space: nowrap; animation: rise .6s var(--ease) both; }
.chip-l i { font-style: normal; font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; background: var(--ink-raised); color: var(--text-2); }
.chip-l b { color: var(--text-1); } .chip-l em { font-style: normal; font-family: var(--font-mono); }
.chip-l:hover { border-color: var(--era-3); color: var(--text-1); transform: translateY(-1px); box-shadow: var(--inner-hi), var(--glow-action-soft); }
.chip-l.live i { background: var(--grad-action); color: #fff; } .chip-l.gap i { background: var(--gain-tint); color: var(--gain); }
.chip-l.ahead i { background: #482efa33; color: var(--text-link); } .chip-l.warn i { background: var(--warn); color: var(--ink-page); }
.chip-l.alert i { background: var(--loss); color: var(--ink-page); } .chip-l.ask i { background: var(--era-2); color: #fff; }
.chip-l.plan i { background: var(--grad-live); color: var(--ink-page); } .chip-l.note { font-style: italic; }
.strip { position: relative; padding: 8px 16px 0; max-width: var(--grid-max); width: 100%; margin: 0 auto; }
.strip::after { content: ""; position: absolute; right: 16px; top: 8px; bottom: 0; width: 48px; background: linear-gradient(90deg, transparent, var(--ink-page)); pointer-events: none; }
.strip-track { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; } .strip-track::-webkit-scrollbar { display: none; }

/* ---------- 8. Tape ---------- */
.tape { display: block; overflow: hidden; white-space: nowrap; height: 30px; background: var(--ink-panel); border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 12px; font-weight: 500; }
.tape-track { display: inline-flex; gap: 32px; padding: 8px 0; animation: crawl 60s linear infinite; }
.tape:hover .tape-track { animation-play-state: paused; }
.tape-track b { color: var(--text-tape); } .tape-track i { font-style: normal; color: var(--text-2); margin: 0 6px; } .tape-track em { font-style: normal; }
@media (max-width: 767px) { .tape-track { animation-duration: 40s; } }
@keyframes crawl { to { transform: translateX(-50%); } }

/* ---------- 9. Buttons ---------- */
.btn, .btn-primary, .btn-secondary, .btn-live, .btn-sell, .btn-ghost {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 36px; padding: 0 14px;
  border-radius: var(--radius-control); border: 1px solid transparent;
  font-family: var(--font-mono); font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; line-height: 1;
  transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease-soft), filter var(--t) var(--ease-soft), background-color var(--t) var(--ease-soft), color var(--t) var(--ease-soft), border-color var(--t) var(--ease-soft);
}
.btn-primary { background: var(--grad-action); color: #fff; }
.btn-primary:hover { transform: translateY(-1px); box-shadow: var(--glow-action); filter: brightness(1.08); }
.btn-sell, .btn-primary[data-side="sell"] { background: var(--grad-sell); color: #fff; } .btn-sell:hover { box-shadow: 0 8px 26px #c9355366; }
.btn-live { background: var(--grad-live); color: var(--ink-page); } .btn-live:hover { transform: translateY(-1px); box-shadow: 0 8px 26px #01eaf455; }
.btn-secondary { background: transparent; border-color: var(--line); color: var(--text-1); }
.btn-secondary:hover { border-color: var(--era-3); background: #482efa14; }
.btn-ghost { color: var(--text-2); } .btn-ghost:hover { color: var(--text-1); background: var(--ink-hover); }
.btn-small { min-height: 28px; padding: 0 10px; font-size: 10px; letter-spacing: .08em; }
.btn-icon { width: 36px; padding: 0; }
:is(.btn, .btn-primary, .btn-secondary, .btn-live, .btn-sell, .btn-ghost):active { transform: translateY(0) scale(.98); transition-duration: var(--t-fast); }
:is(.btn, .btn-primary, .btn-secondary, .btn-live, .btn-sell, .btn-ghost):disabled { opacity: .35; filter: grayscale(.6); transform: none !important; box-shadow: none !important; }
.btn.armed { animation: arm .6s var(--ease); }
@keyframes arm { 0% { box-shadow: 0 0 0 0 #482efaaa; } 100% { box-shadow: 0 0 0 14px #482efa00; } }
@media (max-width: 767px) { .btn, .btn-primary, .btn-secondary, .btn-live, .btn-sell, .btn-ghost { min-height: 44px; } .btn-icon { width: 44px; } .btn-small { min-height: 36px; } }

/* ---------- 10. Inputs ---------- */
.field { display: flex; align-items: center; border: 1px solid var(--line); background: var(--ink-inset); border-radius: var(--radius-control); transition: border-color var(--t) var(--ease-soft), box-shadow var(--t) var(--ease-soft); }
.field:focus-within { border-color: var(--era-3); box-shadow: 0 0 0 3px #0191fd33; }
.field[data-invalid="true"] { border-color: var(--loss); }
.field input, .field textarea { width: 100%; min-width: 0; background: transparent; border: 0; padding: 9px 12px; font-family: var(--font-sans); font-weight: 500; font-size: 13px; color: var(--text-1); }
.field input::placeholder, .field textarea::placeholder { color: var(--text-2); }
.field-label { display: flex; flex-direction: column; gap: 4px; }
.field-label > span:first-child { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--text-2); }
.field-error { margin: 4px 0 0; font-size: 12px; color: var(--loss); }
.amount-input { width: 100%; background: transparent; border: 0; text-align: center; font-family: var(--font-mono); font-weight: 600; font-size: 32px; color: var(--text-0); font-variant-numeric: tabular-nums; }
.trade-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 0; background: var(--line); outline: none; }
.trade-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--ink-page); border: 3px solid var(--thumb-color, var(--era-2)); box-shadow: 0 0 10px #482efa88; cursor: pointer; transition: transform .25s var(--ease); }
.trade-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
.trade-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: var(--ink-page); border: 3px solid var(--thumb-color, var(--era-2)); box-shadow: 0 0 10px #482efa88; cursor: pointer; }
.prompt-form { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; border: 1px solid var(--line); background: var(--ink-inset); padding: 6px 6px 6px 12px; }
.prompt-form:focus-within { border-color: var(--era-3); box-shadow: 0 0 0 3px #0191fd22; }
.prompt-form.live:focus-within { border-color: var(--live); box-shadow: 0 0 0 3px #01eaf422; }
.prompt-form .prompt { color: var(--era-3); font-weight: 700; } .prompt-form input { background: transparent; border: 0; outline: 0; font-family: var(--font-mono); font-size: 13px; padding: 8px 0; }
.search-btn { display: inline-flex; align-items: center; gap: 10px; width: min(520px, 100%); padding: 9px 14px; font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); }
.search-btn:hover { border-color: var(--era-3); color: var(--text-1); box-shadow: var(--inner-hi), 0 0 0 3px #0191fd22; }
.search-btn kbd { margin-left: auto; font-size: 10px; padding: 2px 6px; border: 1px solid var(--line); background: var(--ink-panel); }

/* ---------- 11. Segmented ---------- */
.seg, .range, .mode, .segmented-control { display: inline-flex; gap: 2px; padding: 3px; background: var(--ink-panel); border: 1px solid var(--line); border-radius: var(--radius-control); }
:is(.seg, .range, .mode, .segmented-control) > button { position: relative; padding: 5px 11px; border-radius: var(--radius-control); font-family: var(--font-mono); font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); transition: background-color var(--t) var(--ease-soft), color var(--t) var(--ease-soft), box-shadow var(--t) var(--ease-soft); }
.range > button { padding: 4px 10px; font-size: 11px; }
:is(.seg, .range, .mode, .segmented-control) > button:hover { color: var(--text-1); background: #1c2235; }
:is(.seg, .range, .mode, .segmented-control) > button:is(.on, [aria-pressed="true"]) { background: var(--grad-action); color: #fff; box-shadow: var(--glow-action-soft); }
.mode > button[data-mode="live"]:is(.on, [aria-pressed="true"]) { background: var(--grad-live); color: var(--ink-page); box-shadow: var(--glow-live); }
.seg.leg { display: grid; grid-template-columns: 1fr 1fr; } .seg.leg > button { padding: 8px 10px; text-align: center; }
.seg.leg > button[data-leg="gap"]:is(.on, [aria-pressed="true"]) { background: var(--grad-live); color: var(--ink-page); }
@media (max-width: 767px) { :is(.seg, .range, .mode, .segmented-control) > button { padding: 7px 10px; } .mode > button[data-mode="live"] { max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }

/* ---------- 12. Sheets, palette, popovers, toasts ---------- */
.sheet { position: fixed; inset: 0; z-index: 70; display: grid; place-items: end center; padding: 16px; animation: fadeIn .3s var(--ease-soft); }
@media (min-width: 720px) { .sheet { place-items: center; } }
.sheet-box { width: min(520px, 100%); padding: 20px 22px 18px; border-radius: var(--radius-panel); box-shadow: var(--inner-hi), var(--shadow-sheet); animation: sheetUp .5s var(--ease); }
.sheet-box.narrow { width: min(440px, 100%); } .sheet-box.wide { width: min(760px, 100%); max-height: 92vh; overflow-y: auto; scrollbar-width: thin; padding: 0; }
.sheet-head { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
.sheet-box h3 { margin: 6px 0 8px; font-family: var(--font-sans); font-size: 16px; font-weight: 600; line-height: 1.35; color: var(--text-0); }
.sheet-text { margin: 0 0 14px; color: var(--text-2); font-size: 12px; line-height: 1.55; } .sheet-text b { color: var(--text-1); }
.sheet-actions { display: flex; flex-wrap: wrap; gap: 8px; } .sheet-foot { margin: 12px 0 0; font-size: 10px; color: var(--text-2); }
.palette { position: fixed; inset: 0; z-index: 60; display: grid; place-items: start center; padding-top: 12vh; }
.palette-box { width: min(620px, 92vw); overflow: hidden; animation: pop .55s var(--ease); }
.palette-box input { width: 100%; padding: 18px 20px; border: 0; border-bottom: 1px solid var(--line); background: transparent; font-family: var(--font-mono); font-size: 13px; letter-spacing: .06em; text-transform: uppercase; outline: 0; }
.palette-box ul { list-style: none; margin: 0; padding: 8px; max-height: 50vh; overflow: auto; }
.palette-box li { display: grid; grid-template-columns: 60px 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; font-size: 14px; cursor: pointer; }
.palette-box li.on, .palette-box li:hover { background: #1c1a3a; box-shadow: inset 2px 0 0 var(--era-3); }
.wallet-popover { position: fixed; inset: 0; margin: auto; max-width: min(360px, calc(100vw - 32px)); padding: 24px; border-radius: var(--radius-panel); }
.wallet-popover::backdrop { background: #05060cb8; }
.toasts { position: fixed; right: 24px; bottom: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 50; }
.toast { padding: 12px 16px; border-color: var(--era-3); border-radius: var(--radius-panel); font-family: var(--font-sans); font-size: 13px; color: var(--text-1); max-width: 420px; opacity: 0; transform: translateY(12px) scale(.96); transition: opacity .55s var(--ease), transform .55s var(--ease); }
.toast.in { opacity: 1; transform: none; }
.toast.ok { border-color: var(--gain); background: color-mix(in srgb, var(--gain) 10%, var(--ink-panel)); color: var(--gain); }
.toast.warn { border-color: var(--warn); color: var(--warn); }
.toast a { text-decoration: underline; color: var(--text-accent); }
@media (max-width: 767px) { .toasts { left: 12px; right: 12px; bottom: calc(var(--tabbar-h) + 12px); } .toast { max-width: none; } .palette { padding: 12px; } .palette-box { width: 100%; } }
@keyframes fadeIn { from { opacity: 0; } } @keyframes sheetUp { from { transform: translateY(24px); opacity: 0; } } @keyframes pop { from { opacity: 0; transform: translateY(20px) scale(.96); } } @keyframes rise { from { opacity: 0; transform: translateY(12px); } }

/* ---------- 13. Rows, sparklines, avatars, badges ---------- */
.rows { display: flex; flex-direction: column; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) 56px auto auto auto; gap: 10px; align-items: center; width: 100%; padding: 8px 12px; border-bottom: 1px solid var(--line-soft); text-align: left; transition: background-color var(--t) var(--ease-soft), transform var(--t) var(--ease), opacity var(--t) var(--ease-soft); }
.row:hover { background: var(--ink-hover); transform: translateX(2px); }
.row.on { background: var(--ink-selected); box-shadow: inset 2px 0 0 var(--era-3); }
.row.closed { opacity: .55; } .row.closed:hover { opacity: .85; }
.row-main { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
.row-main b { display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-main small { font-size: 10px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-num { display: flex; flex-direction: column; align-items: flex-end; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.row-num b { font-size: 12px; font-weight: 600; } .row-num small { font-size: 10px; color: var(--text-2); }
.gap, .liq { font-family: var(--font-mono); font-size: 10px; padding: 4px 8px; border: 1px solid var(--line); white-space: nowrap; }
.star { color: var(--text-3); font-size: 16px; padding: 10px; } .star:hover { color: var(--text-accent); } .star.on { color: var(--warn); text-shadow: 0 0 10px #ffb02066; }
@container (max-width: 560px) { .row { grid-template-columns: minmax(0, 1fr) 56px auto auto auto; } .row .liq { display: none; } }
@container (max-width: 420px) { .row { grid-template-columns: minmax(0, 1fr) auto auto auto; } .row .spark { display: none; } }
@media (max-width: 767px) { .row, .person, .tape-row, .news-item, .plan { min-height: 44px; } .row:hover { transform: none; } }
.spark { width: 56px; height: 18px; flex-shrink: 0; } .spark.trail { width: 48px; height: 14px; } .spark.tile { width: 80px; height: 22px; }
.spark path { fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }
.row:hover .spark path { filter: drop-shadow(0 0 3px currentColor); }
.avatar { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: var(--radius-avatar); border: 1px solid var(--line-strong); font-family: var(--font-mono); font-weight: 600; font-size: 12px; color: var(--text-0); background: var(--tk, var(--color-tk-8)); }
.avatar.xs { width: 22px; height: 22px; font-size: 10px; } .avatar.sm { width: 26px; height: 26px; font-size: 11px; } .avatar.lg { width: 40px; height: 40px; font-size: 14px; }
.ring { display: inline-block; padding: 2px; background: var(--line); } .following .ring { background: var(--grad-era); } .ring > .avatar { border: 2px solid var(--ink-panel); }
.verified { display: inline-grid; place-items: center; width: 14px; height: 14px; border-radius: var(--radius-control); background: var(--era-2); color: #fff; margin-left: 4px; vertical-align: 1px; }
.verified svg { width: 9px; height: 9px; }
.badge-solana { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 1px solid transparent; background: linear-gradient(var(--ink-panel), var(--ink-panel)) padding-box, var(--grad-solana) border-box; color: var(--text-1); font-family: var(--font-mono); font-size: 10px; font-weight: 600; }
.badge-solana svg { color: #14f195; }
.live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--live); box-shadow: var(--glow-live); animation: pulse 1.6s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 #01eaf480; } 100% { box-shadow: 0 0 0 8px transparent; } }
.wallet-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--line); font-family: var(--font-mono); font-size: 10px; letter-spacing: .06em; color: var(--text-1); cursor: pointer; }
.wallet-pill i { width: 6px; height: 6px; background: var(--live); box-shadow: var(--glow-live); } .wallet-pill i.practice { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
.wallet-pill small { color: var(--text-2); } .wallet-pill:hover { border-color: var(--era-3); }
.skeleton { background: linear-gradient(90deg, var(--ink-raised), #1c2235, var(--ink-raised)); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
.empty-state { padding: 40px 24px; border: 1px dashed var(--line-strong); text-align: center; }
.empty-state h2 { font-family: var(--font-sans); font-size: 16px; font-weight: 600; color: var(--text-0); } .empty-state p { margin-top: 8px; font-size: 12px; color: var(--text-2); line-height: 1.6; }

/* ---------- 14. Shell ---------- */
.app { min-height: 100dvh; display: grid; grid-template-columns: var(--sidenav-w) minmax(0, 1fr); }
.content { min-width: 0; display: flex; flex-direction: column; }
.sidenav { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; padding: 14px 12px; background: var(--ink-panel); border-right: 1px solid var(--line); }
.brand-logo { display: block; border-radius: var(--radius-mark); box-shadow: var(--glow-mark); }
.side-brand .brand-logo { width: 40px; height: 40px; } .top .brand-logo { width: 32px; height: 32px; }
.side-tag { margin: 6px 0 20px; font-family: var(--font-mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--text-2); }
.sidenav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.sidenav li a { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--text-2); transition: background-color var(--t) var(--ease-soft), color var(--t) var(--ease-soft), transform var(--t) var(--ease); }
.sidenav li a svg { width: 16px; height: 16px; flex-shrink: 0; transition: color var(--t), filter var(--t); }
.sidenav li a:hover { background: var(--ink-hover); color: var(--text-1); transform: translateX(3px); }
.sidenav li a[aria-current="page"] { background: linear-gradient(90deg, #482efa33, transparent); color: #fff; box-shadow: inset 2px 0 0 var(--era-3); }
.sidenav li a[aria-current="page"] svg { color: var(--era-4); filter: drop-shadow(0 0 6px #01eaf4aa); }
.side-foot { margin-top: auto; padding: 16px; border: 1px solid var(--line); font-family: var(--font-mono); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); line-height: 1.5; }
.side-foot b { color: var(--text-1); }
.top { position: sticky; top: 0; z-index: 30; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px 16px; min-height: 56px; border-left: 0; border-right: 0; border-top: 0; }
.top-mid { display: flex; justify-content: center; min-width: 0; } .top-right { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 14px; min-width: 0; }
.clock { font-family: var(--font-mono); font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; }
.panel-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: var(--grid-row); gap: var(--grid-gap); padding: 8px 16px 24px; max-width: var(--grid-max); width: 100%; margin: 0 auto; align-items: stretch; }  /* --grid-row and per-panel placement: panels.css */
.foot { padding: 20px 32px 32px; font-family: var(--font-mono); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-2); text-align: center; }
.tabbar { display: none; }
@media (max-width: 1099px) {
  .app { grid-template-columns: 1fr; } .sidenav { display: none; } .top .brand { display: inline-flex; } .clock { display: none; }
  .panel-grid > .panel { grid-column: 1 / -1 !important; grid-row: auto !important; height: auto !important; }
  .panel-grid { padding-bottom: calc(var(--tabbar-h) + 28px); }
  .tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: grid; grid-template-columns: repeat(var(--n, 6), 1fr); padding: 6px 6px calc(6px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); border-left: 0; border-right: 0; border-bottom: 0; }
  .tabbar::before { content: ""; position: absolute; top: -1px; height: 2px; width: calc(100% / var(--n, 6) - 12px); left: calc(var(--i, 0) * (100% / var(--n, 6)) + 6px); background: var(--grad-era); box-shadow: 0 0 12px #482efaaa; transition: left .45s var(--ease); }
  .tabbar a, .tabbar button { display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 48px; padding: 8px 4px 6px; font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); }
  .tabbar svg { width: 20px; height: 20px; transition: transform .4s var(--ease), color var(--t), filter var(--t); }
  .tabbar [aria-current="page"] { color: #fff; } .tabbar [aria-current="page"] svg { color: var(--era-4); transform: translateY(-2px); filter: drop-shadow(0 0 8px #01eaf4aa); }
  .foot { padding-bottom: calc(var(--tabbar-h) + 24px); }
}
@media (max-width: 767px) {
  .panel-grid { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px calc(var(--tabbar-h) + 28px); max-width: none; }
  .panel { order: var(--phone-order, 0); } .panel[data-phone-hidden] { display: none; } .panel[data-sized] > .panel-body { overflow: visible; }
}

/* ---------- 15. Third-party: wallet-adapter modal in our ink ---------- */
.wallet-adapter-modal-wrapper { background: var(--ink-panel) !important; border: 1px solid var(--line); border-radius: var(--radius-panel) !important; box-shadow: var(--inner-hi), var(--shadow-sheet) !important; font-family: var(--font-sans) !important; }
.wallet-adapter-modal-title { color: var(--text-0) !important; font-weight: 600 !important; }
.wallet-adapter-modal-list li button { background: var(--ink-inset) !important; border: 1px solid var(--line) !important; border-radius: var(--radius-control) !important; color: var(--text-1) !important; }
.wallet-adapter-modal-list li button:hover { border-color: var(--era-3) !important; }
.wallet-adapter-button-trigger, .wallet-adapter-modal-list-more { background: var(--grad-action) !important; color: #fff !important; border-radius: var(--radius-control) !important; font-family: var(--font-mono) !important; text-transform: uppercase; letter-spacing: .1em; font-size: 12px !important; }
.wallet-adapter-modal-overlay { background: #05060cb8 !important; }

/* ---------- 16. Motion preferences and forced colours ---------- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }
  .tape-track { animation: none; transform: none; overflow-x: auto; }
  .skeleton { animation: none; background: var(--ink-raised); }
  .live-dot, .wallet-pill i { animation: none; }
}
@media (forced-colors: active) {
  .glass, .panel, .sheet-box, .toast { background: Canvas; border-color: CanvasText; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .btn-primary, .btn-live, .btn-sell, :is(.seg, .range, .mode) > button[aria-pressed="true"] { forced-color-adjust: none; background: Highlight; color: HighlightText; }
}
```

Things that leave `globals.css` in this rewrite: the light `:root`, `--brand-from/to` and `.bg-gradient-brand`/`.text-gradient-brand` (replaced by the bands; `--brand-*` may stay for one release so `opengraph-image.tsx` compiles), the `.text-neutral-*` overrides, the pump-badge keyframes (the badge is reworked as a `.chip` with the live dot's pulse), the light `.desktop-nav`/`.mobile-nav`/`.demo-strip`/`.app-shell` shell, `.welcome-guide`'s lavender gradient, and every hard-coded `#756e93`/`#ece7fb`/`#4c3fa0`.

## 9. Open questions (only the user can decide)

1. **Radius.** The partner is square everywhere (`border-radius: 0 !important`), and the screenshots are the stated target; the brand direction speaks of liquid glass, which usually implies soft corners. This doc ships square with every radius behind a token (`--radius-panel`, `--radius-control`, `--radius-avatar`), so changing to 4–6px later is one line. Square, or soft?
2. **Which era band is "primary".** Recommended: `--grad-action` (violet → indigo, white text) for primary buttons and selected segments, `--grad-live` (blue → mint, ink text) reserved for live/on-chain/armed states. The alternative — mint-end primary buttons with ink text everywhere — is louder and closer to the mark, but then "live" has no colour of its own.
3. **Gain green.** Recommended `#3ddc84` (leaf green) so gains never look like the brand's mint accent. The partner used Solana's `#14f195`. Keep the partner's, or take the distinct green?
4. **Uppercase mono labels vs "sentence case everywhere".** The terminal look uppercases every button, nav item, chip and eyebrow; the brand skill says sentence case everywhere. This doc uppercases structural labels (eyebrows, panel titles, chips, nav, buttons) and keeps prose in sentence case. If accepted, the brand skill's Voice section needs the exception written in.
5. **Scanlines.** Dropped over text; optional over the hero chart only. Keep them anywhere?
6. **Body typeface.** Recommended Outfit 500 for prose (already loaded, zero new bytes), which makes the screenshots' sans/mono split deliberate. The partner's CSS *intended* mono-everything; if the user prefers that, set `body { font-family: var(--font-mono) }` and accept that theses and disclosures read as code.
7. **The violet period.** Headlines mostly disappear in the terminal layout. For the few that remain (auth sheet, empty states, error page), keep the trailing period in `--era-1` magenta, or drop the device?
8. **Fills over the tape.** The tape shows real practice and on-chain fills with a label. Should practice fills be on the tape at all on the Live edition, or only the user's own?

## 10. Risks

- **The `@theme` remap flips 52 files at once.** Verified to work for solid colours, but any place that relied on a *light* fill for meaning (e.g. `bg-neutral-100` as a "disabled" look) now reads as a normal ink tile; the preview deploy needs a screen-by-screen pass. Opacity-modified colours (`/40`, `/70`, `/90`) do track the token but invert their meaning (a dark scrim becomes a pale wash), hence the manual list.
- **Ticker and avatar colours** are Tailwind classes in `src/lib` today; if the palette remap lands before the `--tk-n` change, badges show lilac tiles with white initials (≈1.6:1). Land both in the same commit.
- **Gradient contrast is only guaranteed on the specified stops.** Someone "extending" `--grad-action` toward `--era-3` under white text, or `--grad-live` toward `--era-2` under ink text, breaks AA silently. The bands are named for that reason; do not build gradients inline.
- **`backdrop-filter` cost.** Glass is limited to chrome, blur is 10px on phones, and there is a `prefers-reduced-transparency` path, but a mid-range Android with the tape moving under a glass top bar still needs a real-device check. Safari drops the blur when an ancestor has `overflow: hidden` + `border-radius`; the sticky top bar must not be inside such a wrapper.
- **`min-height: 44px` and the 10px type floor** widen the partner's dense rows on phones; the six-tab phone shell will show fewer rows per screen than the partner's phone screenshot.
- **`color-mix()` and container queries** are used throughout (the partner already relies on both). They are in every evergreen browser since 2023; there is no fallback for older Safari (< 16.2).
- **`next/font` weights**: Outfit 400 and Plex Mono 400 are not loaded; any `font-weight: 400`/`font-normal` in components will synthesise or fall back to 500. That is intended (500 reads better on ink) but `font-normal` should be treated as a lint error in new code.
- **The wallet-adapter modal overrides use `!important`** against the library stylesheet; a library upgrade that renames classes will silently revert it to purple. Pin `@solana/wallet-adapter-react-ui` and re-check on upgrade.
- **The brand skill is now out of date** on the light palette, the "Solana gradient never as accent" rule, sentence-case voice, and the mark rules; it should be rewritten from this document once the open questions are answered.
- **Two documents, one grid.** This file and `layout-engine.md` were written in parallel; the class names were reconciled here (4.1, section 8 block 6 and 14) but the layout doc still shows the partner's violet fallbacks (`#7c3aed10`, `#7c3aed44`) in its `panels.css` sketch. Whoever implements `panels.css` takes the token names from here and the placement rules from there.

## 11. Verification log

What was checked, and how, so a reader can re-run it:

- **Partner CSS.** `terminal.css` read in full (560 lines): tokens `:5-13`, body size `:14`, chrome `:24-37`, the `border-radius: 0 !important` list `:39`, toggles `:41-46`, panels `:51-57`, hero `:59-68`, rows `:70-79`, ticket/buttons `:81-91`, feed/toasts/palette `:93-119`, sidenav `:121-131`, chart tip `:134-142`, page compositions `:145-162`, wallet pill / sheet `:168-180`, chips `:328-329`, layout handles `:355-382`, strip `:433-448`, plans/agent `:474-494`, auth `:549-560`. `base.css:1-120` and grep of the rest; `mobile.css` in full (79 lines). `fonts.css`: `@font-face` census by grep (Outfit 500/600/700 ×2 each, Plex Mono 500/600 ×5 each, Fraunces 400/600 ± italic ×3 each, plus one weight-less `local()` face per family).
- **Partner JS.** `engine.js:255-335` (`badge`, `sessionPill`, `renderShell`, `renderHero`); `mobile.js:14` (`TABS`); `index.html` / `mobile.html` heads (stylesheet order, `theme-color #0b0d16`).
- **Served partner page** (`http://127.0.0.1:8080`, via the browser tool): `document.fonts` after `ready` → 31 faces, `loaded` only for `IBM Plex Mono 500`, `IBM Plex Mono 600` and the weight-less `IBM Plex Mono` face; `body` `font-weight: 400`; `.top` `rgba(11,13,22,0.95)` + `backdrop-filter: blur(10px)`; `.panel` `rgb(16,19,31)`, `border-radius: 0px`; `.chip-l` `border-radius: 999px`.
- **Screenshots.** `partner-portfolio-desktop.png`, `partner-markets-desktop.png`, `partner-mobile-portfolio.png` read (sans prose + mono figures, square corners, pill strip chips, `//` panel heads, violet-gradient "on" states; the phone shot overflows horizontally at 390px).
- **Live app.** `globals.css` in full (`@theme inline` at `:26`, era tokens `:13-19`, `.text-neutral-*` overrides `:238-243`, pump keyframes `:130-171`); `layout.tsx` (fonts `:12-22`, `themeColor: "#ffffff"`); `postcss.config.mjs`; `package.json` (`next 16.3.5`, `react 19.2.8`, `tailwindcss ^4` → installed 4.3.3, no `tailwind.config.*`); `src/lib/investors.ts:33` and `catalog.ts:75` (Tailwind class palettes), `PriceChart.tsx:27` (`#059669`/`#e11d48`), `celebrate.ts:11,18`, `SolanaProvider.tsx:15`, `Logo.tsx:12,17`, `OnChainBadge.tsx:12,24`, `MyWalletBadge.tsx:59,74`, `SegmentedControl.tsx:14`, `BottomNav.tsx:5-11` (five tabs today), `Avatar.tsx:18`, `TickerBadge.tsx:12`; `public/brand/` (`solera-mark.png` 528 KB, `solera-mark-256.png` 52 KB, `solera-mark.webp` 56 KB).
- **Class census** (grep over `src/**/*.tsx`, 66 files): 52 files match the palette regex in 5.2; top classes `text-neutral-400` 91, `text-neutral-500` 86, `text-neutral-900` 58, `text-neutral-600` 26, `bg-neutral-100` 26, `bg-white` 21, `text-violet-600` 14, `border-neutral-100` 13, `border-neutral-200` 12, `text-white` 11, `divide-neutral-100` 11; `rounded-full` 49, `rounded-2xl` 24, `rounded-3xl` 14, `rounded-xl` 7, `shadow-sm` 6, `shadow-xl` 5, `font-normal` 2; shared classes `btn-primary` 20, `btn-secondary` 15, `eyebrow` 15, `page-heading` 8, `field` 6 (4 as a wrapper), `card-elevated` 3, `wallet-popover` 2, `search-field` 2, `empty-state` 2, `segmented-control` 1; zero `dark:` variants.
- **Tailwind 4.3.3** (`compile()` from `node_modules/tailwindcss`, test sheet = `@import "tailwindcss"` + a user `@theme` block): `.text-neutral-400 { color: var(--color-neutral-400) }` with the `:root` definition taking the user value (only one `--color-neutral-400:` in the output); `.bg-neutral-900/40` → `color-mix(in srgb, <literal> 40%, transparent)` + `@supports … { color-mix(in oklab, var(--color-neutral-900) 40%, transparent) }`; `.rounded-full { border-radius: calc(infinity * 1px) }`; `.rounded-2xl { border-radius: var(--radius-2xl) }`; `.shadow-sm { --tw-shadow: inset 0 1px 0 var(--tw-shadow-color, rgb(255 255 255 / 0.05)) … }`; `.bg-panel { background-color: var(--color-panel) }` from a new `--color-panel`; `@theme inline { --font-sans: var(--font-display) }` → `.font-sans { font-family: var(--font-display) }`.
- **`next/font`** (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`): `weight` is an array for non-variable Google fonts (`:117`, `:127`), `display` defaults to `swap` (`:174`), `preload` defaults to `true` (`:186`).
- **Contrast.** Every ratio in 1.3, 1.4, 1.5, 4.11 and 7 was computed with a 30-line script (sRGB → linear → WCAG relative luminance; 8-digit hex alpha composited over the named background; gradient bands sampled at 5% steps by linear interpolation between the CSS stops). Values are rounded to one decimal in the tables.
- **Audit.** `docs/partner-build-audit.md:3-20` (the decisions) read in full; `layout-engine.md` §4.3, §6 and its verification log read for the class-name and breakpoint reconciliation.
