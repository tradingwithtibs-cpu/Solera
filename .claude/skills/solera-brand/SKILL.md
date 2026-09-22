---
name: solera-brand
description: Solera's visual identity and voice, taken from the code. Use when designing or reviewing any Solera UI, logo, icon, share image, or copy so it stays on-brand. Pairs with the svg-design skill for drawing marks.
---

# Solera brand

Solera is a social investing app for tokenized stocks on Solana. One line: "Stocks on Solana, with the people who hold them." Practice mode is the front door; real trades happen from the user's own wallet. Solera issues nothing and custodies nothing.

Everything below is read from `src/app/globals.css`, `src/app/layout.tsx`, and the components. If the code and this file disagree, the code wins and this file needs updating.

## Direction change, Sept 22 2026

The team adopted a new mark (`public/brand/solera-mark.png`): three Solana-style bars in a magenta-to-mint gradient over the word "era" in chrome glass, on a black tile. The mark reads as the whole name. Tokens sampled from it live in `globals.css` as `--era-1` … `--era-5` (`#d139fc`, `#482efa`, `#0191fd`, `#01eaf4`, `#05fbcf`), with `--era-tile` `#000000` and `--era-ink` `#0b0d16`; use `.bg-gradient-era` and `.text-gradient-era`. The desktop redesign being ported from the partner's build is dark (deep ink, not gray-black) and uses this gradient as Solera's own accent, with liquid-glass surfaces (translucent panels, soft inner highlights, chrome edges) echoing the "era" lettering. Until the port lands, the light theme below is what ships; the "never use the Solana gradient as Solera's accent" rule is retired.

## Color

| Token | Value | Use |
|---|---|---|
| `--background` | `#f2effc` | Page. Soft lavender, never white. |
| `--foreground` | `#211b3d` | Body text. Deep indigo, never pure black. |
| `--surface` | `#ffffff` | Cards. |
| `--line` | `#e3def7` | Hairlines and card borders. |
| `--brand-from` | `#4c6fff` | Start of the brand gradient (blue). |
| `--brand-to` | `#9b5cf7` | End of the brand gradient (violet). |
| `--accent` | `#5b4fd6` | Solid ink where a gradient would hurt legibility: nav labels, focus rings, small text. |
| muted text | `#756e93` | Eyebrows, captions, secondary copy. |
| active nav / secondary button text | `#4c3fa0` | On `#ece7fb` tint. |
| `--solana-from` / `--solana-to` | `#9945ff` / `#14f195` | Only where Solana itself is named (on-chain badge, "built on Solana"). Never as Solera's own accent. |
| gain / loss | emerald (`#22c55e` dot, emerald-700 text on emerald-50) / red | Never used decoratively. |

The brand gradient runs `linear-gradient(135deg, var(--brand-from), var(--brand-to))`. It appears on primary buttons, the brand mark, active states, the balance card, and one blurred decorative wash in the hero. It is never a full-page background.

Dark mode does not exist yet. When it is added, the page should be a deep indigo, not gray-black, and the lavender-violet relationship should hold.

## Type

- Display and UI: Outfit, weights 500, 600, 700, via `--font-display`. Rounder and warmer than a plain grotesk.
- Every price, balance, percentage, and wallet address: IBM Plex Mono, weights 500, 600, via `--font-figures` (`font-mono`).
- Page headings: 28 to 38px, weight 600, letter-spacing -0.045em, line-height 1.14.
- Eyebrows (`.eyebrow`): 10px, weight 600, uppercase, letter-spacing 0.12em, muted color. Every page opens with one: "STOCKS ON SOLANA", "YOUR LONG VIEW", "PRIVATE COMPANIES, PUBLIC PRICES".
- Body: 13 to 16px, line-height 1.5 to 1.65.

## The violet period

Every headline ends with a period colored `text-violet-500`: "Own a little of what's next<span>.</span>", "Your portfolio.", "Markets.", "Pre-IPO." It is the closest thing Solera has to a mark today. Any logo should either use this dot or deliberately echo it. Do not add exclamation marks; the period is the personality.

## Shapes

- Buttons are pills (`border-radius: 999px`), 40px min height, 12px text, weight 600. Primary is the gradient with white text. Secondary is white with `#4c3fa0` text and a `#ded6f7` border.
- Cards: white, 1px `--line` border, radius 20 to 24px, padding 20 to 22px. Flat by default. `.card-elevated` adds one soft colorless shadow and is reserved for the balance card and tappable feed cards.
- Segmented controls sit in a `#ece7fb` pill track with a white active segment.
- Nav items: 12px radius, active tint `#ece7fb`.
- Focus ring: 3px `#6d5eea`, offset 3px. Never remove it.
- Ticker avatars are colored circles with 2 to 4 letter marks.

## Motion

- Transitions 160ms ease on color and border.
- The "pumping" badge pulses at about 0.6Hz. Nothing may blink faster than 3 times per second (WCAG 2.3.1), and nothing should read as alarm on a financial decision.
- Every animation is disabled under `prefers-reduced-motion: reduce`.
- Confetti (`src/lib/celebrate.ts`) fires on a filled trade. Use it for real moments only.

## Voice

Warm, plain, a friend explaining. Sentence case everywhere. Contractions are fine.

- Hero: "Own a little of what's next."
- Portfolio: "A clear picture of your practice investments."
- Markets: "Familiar companies. A new way to explore them."
- Pre-IPO: "Tokenized exposure to companies that haven't listed yet."

Say "practice" not "paper" or "demo". Say "wallet" not "account". Say "own a slice" rather than "buy" when the moment is emotional, "Buy" when it is a control.

## Disclosures

These are part of the brand, not a footer. On every trade surface, in one calm sentence each: who issued the token, that it carries price exposure rather than shareholder rights, and that it is not offered to US persons. They may be restyled and made friendlier. They are never removed, collapsed by default, or hidden behind a tap.

## Logo and icon rules

- The mark must read at 16px (favicon) and 120px (share image) with no detail lost.
- Color: the brand gradient blue to violet, or solid `--accent` in one-color contexts. A mint dot (`#9fe1cb` family) is acceptable as the single secondary accent, echoing gains.
- Provide a dark variant for any colored mark, per the svg-design skill.
- Wordmark: "Solera" in Outfit 600, tight tracking, ending in the violet period.
- The app icon (`src/app/icon.tsx`), share image (`src/app/opengraph-image.tsx`), sidebar `.brand-symbol`, and `src/components/Logo.tsx` must all be generated from the same mark and the same gradient. As of September 2026 the icon and share image still use an older purple-to-teal gradient and an older tagline; they are out of date, not a second brand.

## Never

- No white page background. No gray-black dark mode.
- No Solana gradient as Solera's accent.
- No exclamation marks in system copy.
- No blinking, no red pulses on trade actions.
- No bar-chart-going-up or shield clichés in the mark.
