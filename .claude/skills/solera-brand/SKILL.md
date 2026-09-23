---
name: solera-brand
description: Solera's visual identity and voice, taken from the code. Use when designing or reviewing any Solera UI, logo, icon, share image, or copy so it stays on-brand. Pairs with the svg-design skill for drawing marks.
---

# Solera brand

Solera is a social investing app for tokenized stocks on Solana. One line: "Stocks on Solana, with the people who hold them." Practice mode is the front door; real trades happen from the user's own wallet. Solera issues nothing and custodies nothing.

Everything below is read from `src/app/globals.css`, `src/app/layout.tsx` and the components on the `redesign` branch (Sept 23, 2026). If the code and this file disagree, the code wins and this file needs updating. The full design spec is `docs/port/design-system.md`; this file is the short version.

## The idea

A trading terminal that reads like a well-set page: deep ink surfaces, one gradient, mono figures, prose in Outfit. Every screen is a grid of cards ("panels") the person can drag, resize and swap. Dark only. There is no light theme and none is planned.

## Color

Tokens are CSS variables on `:root`; components never use raw hex. Tailwind's `neutral-*`, `violet-*`, `emerald-*`, `rose-*`, `amber-*` and `sky-*` palettes are remapped in `@theme` to these values, so old utility classes render on-brand.

| Token | Value | Use |
|---|---|---|
| `--ink-page` | `#0b0d16` | The page. Deep ink, never gray-black. |
| `--ink-panel` | `#10131f` | Cards. |
| `--ink-head` | `#121627` | Card heads. |
| `--ink-raised` / `--ink-inset` | `#151a29` / `#0b0d16` | Chips, fields, inputs. |
| `--ink-hover` / `--ink-selected` | `#161b2c` / `#191a33` | Row states. |
| `--line` / `--line-soft` / `--line-strong` | `#232a40` / `#171c2e` / `#3a4266` | Hairlines. `--line-accent` is `--era-3`. |
| `--text-1` / `--text-2` / `--text-3` | `#e3e5f5` / `#8a8fb3` / `#5c6288` | Body, secondary, faint. `--text-0` is pure white for text on gradients. |
| `--text-accent` / `--text-link` | `#c9a8ff` / `#9fb3ff` | Accent text and links. |
| `--gain` / `--loss` | `#3ddc84` / `#ff5c7a` | Price moves only. Never decorative. `--gain-tint` / `--loss-tint` are 13% washes. |
| `--warn` | `#ffb020` | Practice mode, "ready to sign", inbox badge. Never `--loss` for attention. |
| `--live` | `#01eaf4` | Live mode, armed plans, the live dot. |
| `--era-1` … `--era-5` | `#d139fc` `#482efa` `#0191fd` `#01eaf4` `#05fbcf` | The mark's gradient, sampled from `public/brand/solera-mark.png`. |
| `--color-tk-1` … `--color-tk-8` | eight ink-safe fills | Ticker badges and avatars via `fillFor()` in `src/lib/palette.ts`. |

Three gradient bands, each with a fixed text colour that passes contrast:

- `--grad-action` (`#9334fb → #482efa`, white text): primary buttons, the active nav item, the practice segment.
- `--grad-live` (`--era-3 → --era-4 → --era-5`, ink text): ARM IT, SEND, live-mode actions, the mode toggle's live segment.
- `--grad-sell` (`#c93553 → #7a3ff0`, white text): sell buttons.
- `--grad-era` (all five stops) is reserved for the mark, the tab-bar indicator and the era hairline on glass boxes.
- `--grad-solana` (`#9945ff → #14f195`) appears only where Solana itself is named, as a border or icon, never under text.

Glass (`.glass`, `.glass-era`) is chrome only: the top bar, the tab bar, sheets and the palette. Cards are opaque ink. Glows (`--glow-mark`, `--glow-action`, `--glow-live`) are soft and rare.

## Type

- Display and UI: Outfit 500/600/700 via `--font-display`. Sentence case.
- Every price, balance, percentage, address, clock and eyebrow: IBM Plex Mono 500/600 via `--font-mono`.
- Card heads: `// TITLE` in mono 600 11px, `.12em` tracking, uppercase, with the `//` in `--era-3`; the subtitle beside it in `--text-2`.
- Eyebrows (`.eyebrow`): mono 10px 600, uppercase, `.12em`, `--text-2`. Rows label their fields this way (WHY, HORIZON, WRONG IF, WATCHES, DOES).
- Body: 12 to 13px, line-height 1.5 to 1.65. Headlines in the feed are Outfit 600 13 to 14px.
- Figures are tabular. Gains carry a leading `+`, losses a real minus sign `−`.

## Shapes

- Panel radius `--radius-panel` 8px; control radius `--radius-control` 6px; chips and the me-pill are pills; the mark tile is `--radius-mark` 22%.
- Buttons: `.btn-primary` (action gradient, white), `.btn-secondary` (ink, hairline), `.btn-live` (live gradient, ink text), `.btn-ghost`, `.btn-small` (mono 10px uppercase), `.btn-icon`. `.btn.armed` shows a ring on click.
- Chips (`.chip`): mono 600 10px uppercase; `.live`, `.practice`, `.warn`, `.gain`, `.loss`. Status is always a word, never colour alone.
- Fields (`.field`): ink-inset boxes with a hairline; the prompt box (`.plan-form`) shows a `›` glyph in `--era-3`.
- Segments (`.seg`, `.range`, `.mode`) are hairline tracks with a gradient "on" segment.
- Sheets (`.sheet`, `.sheet-box`): centred glass box above 720px, bottom sheet on phones, era hairline on top, scrim behind. Every sheet portals to `body`.
- Cards sit on a 12-column grid with an 8px gap and a 32px row unit; on phones each tab shows its own stack.

## Motion

- `--ease-solera` `cubic-bezier(0.22, 1, 0.36, 1)`; `--t` 0.38s, `--t-fast` 0.12s.
- The tape crawls; the live dot pulses at 0.6Hz; armed chips pulse at 0.4Hz. Nothing blinks faster than 3 times a second and nothing reads as alarm on a financial decision.
- Sheets fade and rise; cards pop in with a short stagger.
- Everything is off under `prefers-reduced-motion: reduce`; the status word carries the meaning.
- Confetti (`src/lib/celebrate.ts`) fires on a filled trade and on a filled plan. Real moments only.

## Voice

Plain, short, a friend who reads the tape. Sentence case everywhere except mono eyebrows and card heads. No exclamation marks in system copy. Contractions are fine.

- Say "practice" not "paper" or "demo". Say "wallet" not "account" for wallets; an email sign-up is an "email account".
- Say "plan" for a standing order and "arm" for switching one on. A plan is "proposed" until the person taps ARM IT.
- Prices are "at or above / at or below", never "hits" or "crosses". Plans are "checked about once a minute" in practice; only Jupiter's keepers are "24/7".
- The agent "reads", "proposes" and "never signs". Never "recommends".
- Empty states say what will fill them: "No live plans. Write one above — Solera reads it, shows you the rule it understood, and only arms it when you say so."
- Nothing invented: no sample people, headlines, trades or numbers. If a source is down, say so in one sentence.

## Disclosures

Part of the brand, not a footer. On every trade surface, in one calm sentence each: who issued the token, that it carries price exposure rather than shareholder rights, and that it is not offered to US persons. Plan and agent surfaces add "Plans are armed only after you confirm; nothing is signed without your wallet." and, for Jupiter orders, "Funds are held by Jupiter until fill or cancel." They may be restyled. They are never removed, collapsed by default, or hidden behind a tap.

## Logo and icon rules

- The mark is `public/brand/solera-mark.png` (three Solana-style bars in the era gradient over "era" in chrome glass, on a black tile). `solera-mark-256.png` is what the DOM loads; the 528 KB source never goes in a page.
- It must read at 16px (favicon) and 120px (share image). Keep the black tile; never place it on a light surface.
- Wordmark: "Solera" in Outfit 600, tight tracking. The old violet period is gone.
- The app icon (`src/app/icon.tsx`), share image (`src/app/opengraph-image.tsx`), sidebar mark and `src/components/Logo.tsx` come from the same asset and gradient.

## Never

- No light surfaces, no white page, no gray-black. Ink only.
- No raw hex in components; tokens or `color-mix()` on tokens.
- No Solana gradient under text or as Solera's accent.
- No exclamation marks, no blinking, no red pulses on trade actions.
- No bar-chart-going-up or shield clichés in the mark.
- No sample data standing in for a source that is down.
