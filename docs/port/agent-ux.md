# Agent tab and standing plans — user-facing spec

Sept 22 2026. Companion to `backend.md` (routes, schema, evaluator, Trigger calls — authoritative for anything on the wire), `pages.md` §3.12 / §3.9 (where the cards sit), `layout-engine.md` §5.6 / §6 (grid and phone tabs) and `design-system.md` (tokens). This document owns **what the person sees and taps**: the chat surface, the cards, the Plans panel, the live-plan sheets, every sentence of copy, the edge cases, and what "works" means on Thursday's demo video.

Sources read for this: the partner's `plans.js` (grammar, panel, agent page), `signals.js:179-197` (Lens sheet), `agent.html` + `partner-agent-desktop.png`, the audit's plans-agent findings and the binding decisions, the live app's `TradeScreen.tsx`, `PreIpoBuySheet.tsx`, `DeepLinkResumer.tsx`, `deferred-signing.ts`, `use-execute-trade.ts`, `trade.ts`, `use-session.ts`, `ConnectWalletProvider.tsx`, and Jupiter's Trigger V2 docs plus live probes (verification log at the end).

## 0. What is fixed before this document starts

- **The agent never trades.** It reads (prices, news, catalog, the person's plans) and proposes (a plan, a practice order). Every proposal becomes a card with a button the person taps. Nothing is armed, filled or signed by the model (decision; `backend.md` §7.3 rules 4–5).
- **Practice plans execute server-side** against the Supabase practice ledger, checked about once a minute by the evaluator (`backend.md` §8) — Vercel Hobby cron runs once a day, so the minute cadence comes from Supabase pg_cron plus the open tab's own 60 s call. The copy never promises more than "about once a minute".
- **Live plans with a price condition become Jupiter Trigger V2 orders** the person signs once. Funds leave the wallet at arm time into a per-wallet vault ("a Privy-managed custodial account", Jupiter's words — verified in `dev.jup.ag/docs/trigger/deposit.md`) and stay there until fill, expiry or cancel. Anything Trigger cannot express falls back to **notify + one-tap sign** on a pre-filled ticket.
- **No invented anything.** No sample plans, no example fills, no placeholder headlines. The example chips are built from live prices, or not shown.
- **Thesis optional, encouraged.** A plan can carry a note; the fill carries it onto the position and the feed. A plan goes through without one.
- **Dark only**, ink surfaces, era gradient accent, partner voice: short, lowercase mono eyebrows, sentence case, no exclamation marks, "practice" not "paper", "wallet" not "account".

## 1. The Agent tab

### 1.1 Where it lives

- Route `/agent` (`src/app/agent/page.tsx`), sidenav item **AGENT** (partner `plans.js:14`, icon `ICON.agent`), phone tab 6 of 6 (`mobile.js:14`, `layout-engine.md` §6).
- Grid (`layout-engine.md` §5.6): `agent` card 8 columns × 24 rows, `plans` card 4 × 24 beside it. On phones: Agent tab stack = `agent`, then `plans`.
- Entry points that land here with something typed: `/agent?q=<question>` (asset-card "ASK THE AGENT" chips, the strip's ASK chip, a story sheet's "ask agent") sends the question on load; `/agent?plan=<sentence>` (the strip's PLAN chip) **prefills the composer and waits** — the partner armed it on load (`plans.js:175`), the audit calls that an order-execution vector, so no auto-arm anywhere.

### 1.2 The card

`<Panel id="agent" title="Agent" subtitle=… foot=…>` (`design-system.md` §4.1), body a flex column: message list (scrolls) → composer (sticky bottom) → chips row.

Subtitle by model, from `AgentResponse.model` (`backend.md` §7.1):

| `model` | Subtitle | Extra |
|---|---|---|
| `anthropic` | `Claude · reads live prices, news and your plans · never signs` | — |
| `mock` | `offline parser · no model attached yet · never signs` | every assistant turn carries a `.chip` **offline parser** so nobody mistakes canned text for a model (one phrase everywhere; `pages.md` §3.12's "mock model · replies are canned" is superseded by this wording) |

Foot (mono 10px, `--text-2`): `Composed from live figures. Nothing here is a forecast or a recommendation. Plans are armed only after you confirm; nothing is signed without your wallet.`

Components (`src/components/agent/`): `AgentPanel.tsx` (state, fetch), `AgentMessage.tsx` (one turn), `AgentComposer.tsx`, `PromptChips.tsx`, and the cards `PlanCard.tsx`, `TicketCard.tsx`, `NewsCard.tsx`, `PricesCard.tsx`, `PlansCard.tsx`, `ExplainCard.tsx`. Hook `useAgentChat()` in `src/hooks/use-agent-chat.ts`.

### 1.3 Empty state and starters

Empty list shows one line (`pages.md` §8): **Ask about a token, a gap, your notes, or write a plan in plain words.** — then the starters. The three canonical prompts are always the first three chips, verbatim, in this order; they are the demo script and the mock model's guaranteed vocabulary (`backend.md` §7.6):

1. `buy AAPLx if it goes over $345`
2. `show me the latest news on TSLAx`
3. `if TSLAx falls to $300 sell 5 shares` — the `$X` in the brief is rendered from the live price so it is never stale: `X = floor(price × 0.9)`; if TSLAx has no live price the chip reads `if TSLAx falls to $X sell 5 shares` with a literal X and the agent asks for the number.

Second row, only prompts the tool set can answer honestly (`backend.md` §7.4): `what's NVDAx at?` · `my plans` · `buy $50 of SPYx now` (practice only; hidden in live mode). `pages.md` §3.12's longer chip list ("Who is buying what I hold?", "Which of my wrong-ifs is closest to firing?") needs tools that are not in §7.4 (investors, feed, notes); those chips are **not shown** until their tools exist (open question 3).

Chips are `.lens-chip` (mono 10px inside a 1px `--line` box, `design-system.md` §4.5 command inputs) and clicking one sends it — chips are sentences, not fragments, so sending is the expected result.

### 1.4 Composer

The partner's prompt box (`terminal.css:478`, `.plan-form`): a 1px `--line` box on `--ink-inset`, `›` glyph in `--era-3`, mono 13px input, `SEND` (`.btn-live`, ink on `--grad-live`) inside the box. Focus ring `--live` + `#01eaf422` ("an agent prompt feels live"). Placeholder cycles between the three canonical prompts every 6 s (static under reduced motion): `› Ask, or write a plan…` is the fallback. Enter sends; Shift+Enter newlines; the input is a `textarea` that grows to 4 lines. Max 4 000 chars (route limit). While a request is in flight the composer is disabled, the last user bubble shows a 12px arc spinner, and a thinking row `…` appears under it; no fake streaming.

`useAgentChat()` sends `POST /api/agent { messages (last 12 turns, plain text), mode, context: { ticker?, page: "agent", pendingDraft? } }` with the session token when present. The transcript lives in `sessionStorage["solera:agent-thread"]` per tab (never localStorage: it holds no state that must persist) and is cleared on sign-out, wallet change, or "clear" from the panel tools. Reload keeps the thread; a new tab starts clean.

### 1.5 Message types

Every assistant turn = one text bubble (`reply`, plain text, ≤ 80 words per the system prompt) followed by `cards[]` in order. The bubble uses the partner's Lens answer style (`terminal.css:407`): 2px left border `--era-3` (the partner's `--accent`), a `#482efa12 → transparent` wash, 12px/1.65 Outfit. Above it an eyebrow **from {tools}** built from `toolTrace` names (`from live prices` · `from Finnhub` · `from your plans`), or **composed** when no tool ran. User turns are right-aligned, `--ink-raised`, no border.

| Card kind | When | What it shows | Buttons |
|---|---|---|---|
| **text** | always | the reply | — |
| **news** (`NewsCard`) | `get_news` ran | `NewsList`-style rows: headline (outbound link, `rel="noreferrer"`), source · age; ≤ 8 rows; eyebrow `{TSLAx} in the news · Finnhub` or `· Google News`. Headlines are copied from the tool result verbatim; the model's bubble may quote them but the card is the source of truth | each row opens the publisher; `open TSLAx` → `/asset/TSLAx` |
| **prices** (`PricesCard`) | `get_prices` ran | `AAPLx $231.20` rows, mono, `via Jupiter · 12:03:41Z` | row → `/asset/…` |
| **plan** (`PlanCard`) | `create_plan` returned `status: "proposed"` | §1.6 | ARM IT · EDIT · DISCARD |
| **ticket** (`TicketCard`) | `place_practice_order` returned a proposal | §1.7 | REVIEW IN TICKET · DISCARD |
| **plans** (`PlansCard`) | `list_plans` ran | one row per plan: status chip · summary · mode chip | row → highlights it in the Plans panel; `cancel` (non-trigger) → §2.6 |
| **explain** (`ExplainCard`) | `explain_plan` ran | `describe()` + status + last three log lines | — |
| **error** (inline) | route 4xx/5xx | `p[role=alert]` in `--loss` under the last user bubble: `The agent isn't available right now (502). Your plans are unaffected.`; 501 (no key and mock forced off) → `Agent isn't configured on this deployment yet.` | RETRY |

Cards come **from tool results, never from the model's prose** (`backend.md` §7.5), so a card can never claim something the server did not do.

### 1.6 The PLAN CARD

Rendered from `{ kind: "plan", planId, summary, mode, execution, status: "proposed" }`, plus a `GET /api/plans/:id` fetch for the condition so the card can show fields, not only the sentence.

```
// PLAN · PROPOSED                                   practice | live
when TSLAx is at or below $300.00 → sell 5 shares
─────────────────────────────────────────────────────
WATCHES     TSLAx · now $379.48 · trigger $300.00 (−21.0%)
DOES        sell 5 shares TSLAx (≈ $1,500.00 at today's price)
THEN        hold until target $420.00 or stop $280.00      (only when exits exist)
WRONG IF    “deliveries fall two quarters in a row”         (only when given)
UNTIL       Oct 22, 2026 (30 days)                          (arm_until)
WHAT HAPPENS
  practice: Solera fills it in practice cash on its server when the price is
            at or below $300.00, checked about once a minute.
  live · trigger: becomes a Jupiter Trigger order you sign once. Your 5 TSLAx
            move to a Jupiter vault now and stay there until it fills,
            expires, or you cancel. Jupiter's keepers watch 24/7.
  live · notify: Jupiter can't watch this one (“until deliveries miss”).
            Solera will notify you when the price is there and prefill the
            ticket; you tap once to sign.
+ add a note (optional)
[ ARM IT ]  [ EDIT ]  [ DISCARD ]
```

- Head: `// PLAN · PROPOSED` in the panel-head style; a mode `.chip` (`practice` on `--ink-raised`, `live` on `--grad-live` ink) and, for live, the executor `.chip` (`Jupiter order` / `notify + sign`).
- Sentence: `summary` from `describe()` (`backend.md` §6.1), Outfit 500 13px `--text-1`.
- Rows: mono eyebrow labels (`WATCHES`, `DOES`, `THEN`, `WRONG IF`, `UNTIL`), figures in mono. `now $379.48` comes from the client price store (`getEffectivePrice`) and refreshes with it; the trigger distance is `(trigger − now) / now`, signed. If there is no live price the row reads `now — (no live price right now)`.
- **What happens** is one of the three fixed paragraphs above, chosen by `mode` + `execution`. It is the only place the vault sentence needs to appear before the arm sheet.
- **The optional thesis field**: a collapsed link `+ add a note (optional)`; tapping it reveals a `Why?` textarea (`.field`, 280 max, `field-label` with `em` "optional · carried onto the fill") and, when the plan has none, a `Wrong if` input (160 max). Values go to `condition.note` / `condition.wrongIf` in the same POST that arms (a proposed plan is replaced: `POST /api/plans` with the edited condition, then `DELETE` of the old draft — the routes in `backend.md` §6.3 have no PATCH for the condition, and a draft is disposable). If the model's `create_plan` already carried a note (the person wrote "because …" in the sentence), the field is open and prefilled.
- **ARM IT** (`.btn-live`, ink on `--grad-live`; `.btn.armed` ring on click):
  - signed out → the button reads `SIGN IN TO ARM` and opens `AuthSheet`; the card stays.
  - practice, signed in → `PATCH /api/plans/:id { status: "armed" }` → the card head becomes `// PLAN · ARMED`, the buttons collapse to `view in plans`, toast `Armed: when TSLAx is at or below $300.00 → sell 5 shares` (`.ok`). The Plans panel row appears at the top of its list.
  - live, executor `trigger` → opens `ArmPlanSheet` (§3.1); the card follows the sheet's outcome.
  - live, executor `notify` → `PATCH { status: "armed" }` as practice, toast `Armed. You'll get a notification here when TSLAx is at or below $300.00.`
  - live but `mode` on the toggle is practice (or no wallet) → button reads `SWITCH TO LIVE TO ARM` → `setMode("live")` / `openConnect()`.
- **EDIT** opens `PlanEditorSheet` (§2.4) prefilled from the condition; saving posts a fresh proposal and the card re-renders from it. The chat bubble is not edited.
- **DISCARD** → `DELETE /api/plans/:id` (allowed for `proposed` only), the card fades to a one-line `discarded` stub, nothing else changes.

Two-plan turns (the person wrote a buy and a sell) render two cards; each arms independently.

### 1.7 The ORDER CARD (immediate practice orders)

Rendered from `{ kind: "ticket", ticker, side, amountUsd? | shares?, note?, mode }` after `place_practice_order`. It is deliberately smaller than a plan card because nothing happens until the ticket's own review step:

```
// ORDER · PRACTICE
buy $50.00 of SPYx at the live price
SPYx · now $773.83 · ≈ 0.0646 shares
[ REVIEW IN TICKET ]  [ DISCARD ]
```

- **REVIEW IN TICKET** opens `TradeTicket` (`pages.md` §2.2) as a sheet prefilled with side, amount or shares, and the note in `Why?`; the person still goes through the review step and taps `CONFIRM PRACTICE BUY`. Nothing is auto-submitted (decision; `pages.md` §3.12 `open_ticket` "never auto-submitted").
- In **live** mode the tool is still `place_practice_order`, so the model answers a "buy now" with a ticket card whose mode is `live` and the sheet is the live ticket (Ultra quote, wallet signs). The system prompt says so ("Live mode needs a connected wallet"). No card type exists that could place a live order on its own.
- Pre-IPO tokens: the practice ledger has no pre-IPO mints (`use-active-portfolio.ts:55`), so `place_practice_order` for `OPENAI` returns an error the model relays: `Pre-IPO tokens are bought for real, from your wallet. Switch to live and open the Pre-IPO card.`

### 1.8 Behaviour with no API key (`MockModel`)

`backend.md` §7.6 pins the mock. What the person sees:

- Subtitle `offline parser · no model attached yet · never signs`, the **offline parser** chip on every assistant turn.
- Prompt 1 → bubble `How much AAPLx — a dollar amount or a number of shares?` (no card); under the bubble a dim mono line `draft · buy AAPLx when at or above $345.00 · size?` so the pending draft is visible; the composer placeholder becomes `› $250, or 2 shares`. Answering `$250` → plan card + bubble `Proposed: when AAPLx is at or above $345.00, buy $250.00 (practice). Tap Arm it to start it.`
- Prompt 2 → news card + bubble listing the headlines verbatim with sources.
- Prompt 3 → plan card + bubble.
- `what's NVDAx at` → prices card. `my plans` → plans card. `cancel <n>` → cancel confirmation. `buy $50 of SPYx now` → order card (this row is an addition to §7.6's table; the mock grammar is `buy \$N of X (now)?` / `buy N shares of X (now)?` with **no direction word** → `place_practice_order`).
- Anything else → `I can set up price plans (“buy $100 of NVDAx if it drops to 170”), fetch prices and news, and list or cancel your plans.` — the mock says what it can do, in one sentence, and never pretends to reason.
- A missing direction (`buy AAPLx at 345`) → `Above or below $345?`; direction is never guessed from the current price (audit, `plans.js:38`).

When `ANTHROPIC_API_KEY` arrives the only visible change is the subtitle and the chip disappearing; the cards are identical because both models produce the same `AgentResponse`.

### 1.9 Signed-out and per-mode behaviour

| State | Chat | Plan card | Order card |
|---|---|---|---|
| Signed out | prices, news, catalog answers work | `SIGN IN TO ARM`; the bubble adds `Sign in to keep plans running while you're away.` | works (local practice ledger) |
| Signed in, practice | full | arms server-side | works |
| Signed in, live, wallet connected | full; `<state>` says live | live executor per §9.2 of `backend.md`; arm sheet | live ticket sheet |
| Email account, no wallet, live toggle | toggle cannot be live (`use-trade-mode.ts:56`); the agent is told practice | as practice; if the person asks for live: `Link a wallet to arm live plans.` | practice |

The `<state>` block the route builds carries `mode`, the wallet short address (never the full key), the ticker in view, open plans, and `pendingDraft` (`backend.md` §7.2); the UI never shows it.

## 2. The Plans panel

One component, `src/components/plans/PlansPanel.tsx`, mounted on `/portfolio` (4 × 18, `pages.md` §3.9) and `/agent` (4 × 24). Data from `usePlans()` (`GET /api/plans`, refetch every 15 s while mounted, on focus, and after every card action) and the browser evaluator call (`POST /api/plans/evaluate?scope=self` every 60 s while mounted and signed in, `backend.md` §8.5).

### 2.1 Head and composer

- Title `Plans`, subtitle `standing orders in plain words · {n} live` where `n` = armed + holding + ready (partner `plans.js:133`).
- Composer = the same prompt box as the Agent tab (`.plan-form`), placeholder `› if TSLAx falls to $300, sell 5 shares`, button `ARM IT`. Typing debounces 400 ms into `POST /api/agent` with `mode: "preview"` semantics (a `create_plan`-only turn, `pages.md` §5.5): the line under the box shows `Understood: when TSLAx is at or below $300.00 → sell 5 shares` (mono 11px, `--gain` "Understood:") or `Not yet: how much TSLAx — a dollar amount or a number of shares?` (`--warn` "Not yet:"). ARM IT is disabled until the preview is a proposed plan; it then behaves exactly like the plan card's ARM IT (§1.6), including the live arm sheet.
- Example chips (partner `EXAMPLES`, `plans.js:127`) rebuilt from live prices so they are never stale, three at most, hidden for any ticker without a price: `if TSLAx falls to ${floor(p×0.95)}, buy $250` · `sell half of NVDAx if it rises to ${ceil(p×1.08)}` · `if SPYx rises to ${ceil(p×1.03)}, buy $100, stop at ${floor(p×0.98)}`. The partner's "opens at" and "until deliveries miss" examples are dropped: "opens at" has no meaning on a 24/7 token (audit), and a human clause is still allowed but should not be the first thing a new person copies.
- Signed out: composer disabled, the body says **Sign in to keep plans running while you're away.** with a `SIGN IN` button; the list is empty (plans need an owner, `backend.md` §4.2).

### 2.2 Rows and states

List = live rows (armed · holding · ready) newest first, then eyebrow `EARLIER` and the last six finished rows (done · failed · cancelled · expired). `PlanRow.tsx`:

```
TSLAx  [ARMED] [practice]                                      cancel
“if TSLAx falls to $300 sell 5 shares”
when TSLAx is at or below $300.00 → sell 5 shares
watching TSLAx · now $379.48 · trigger $300.00 (−21.0%) · checked 12 s ago
```

- Line 1: symbol (Outfit 600 12px), status `.chip`, mode `.chip`, and for live the executor chip; the action button on the right.
- Line 2: the person's sentence in `q` quotes (`--text-1`).
- Line 3: the restatement, `summary`, mono 10px `--text-2`.
- Line 4: **the price it watches** — `watching {ticker} · now {price} · trigger {price} ({signed distance})` for `armed`; `holding · now {price} · target {p} / stop {p}` for `holding`; and the freshness: `checked {rel time} ago` from `evaluated_at` (practice/notify) or `Jupiter: {orderState} · checked {rel}` (trigger, §2.3). `em` line 5 = the last `log` message when there is one (`--gain` for fills, `--text-2` otherwise).

Status chips (`.chip`, mono 600 10px uppercase; colour never alone — the word is always there):

| Status | Label | Colour | Motion | Meaning shown on hover/tap (`title`) |
|---|---|---|---|---|
| `armed` | ARMED | `--live` on `#01eaf41a` | `pulseDot 2.4s` (0.4 Hz) | "watching the price; nothing has happened yet" |
| `holding` | HOLDING | `--gain` on `--gain-tint` | — | "bought; watching the exit levels" |
| `ready` | READY TO SIGN | `--warn` on `--warn-tint` | `pulseDot` | "the price is there; open the ticket and sign" |
| `done` | FILLED | `--text-accent` | — | "filled at {price} on {date}" |
| `failed` | FAILED | `--loss` on `--loss-tint` | — | the ledger's message verbatim, e.g. "Your available cash changed. Please review the amount." (`ledger.ts:25-33`) |
| `cancelled` | CANCELLED | `--text-2` | — | — |
| `expired` | EXPIRED | `--text-2` | — | "expired before the trigger hit" / "hold window ended, position kept" |

Expired and cancelled are neutral, not red: nothing went wrong and nothing should read as alarm on a financial surface (brand skill). `proposed` rows are never listed; they exist only as cards and the composer preview (housekeeping deletes them after 7 days).

Empty list: **No live plans. Write one above — Solera reads it, shows you the rule it understood, and only arms it when you say so.** (partner `plans.js:137`, "parses" → "reads").

### 2.3 Live rows: Trigger status and the vault line

A live row with `execution = 'trigger'` adds two things under line 3:

```
Jupiter order · open · funds in vault: 5 TSLAx · expires Oct 22 · view on Jupiter ↗
Funds are held by Jupiter until fill or cancel.
```

- The badge mirrors `trigger_state` (Jupiter `orderState`, verified list: `pending`, `open`, `executing`, `filled`, `pending_withdraw`, `cancelled`, `expired`, `failed` — `dev.jup.ag/docs/trigger/order-history.md` § Order States). Labels: `pending` → `deposit landing`, `open` → `open`, `executing` → `filling…`, `filled` → `filled`, `pending_withdraw` → `withdrawal pending`, `expired` → `expired · funds still in vault`, `failed` → `failed` with Jupiter's reason when the history event carries one.
- `funds in vault:` = the deposit amount in the deposit token (`0.25 SOL`, `50.00 USDC`, or `5 TSLAx` for a sell). `expires` = `arm_until` = Jupiter `expiresAt`.
- The sentence **Funds are held by Jupiter until fill or cancel.** is always present on a trigger row (decision text). It is not collapsible.
- Freshness: `Jupiter status checked 40 s ago` from `trigger_checked_at`. The browser refreshes it every 60 s only while it holds a Jupiter JWT for the connected wallet (`backend.md` §9.7); otherwise the row shows the last known state and a `.btn-small` **REFRESH · SIGN IN WITH WALLET** (one `signMessage`, §3.1 step 1). With no wallet connected: `Connect {short address} to refresh Jupiter status.`
- Actions: **CANCEL & WITHDRAW** (§3.4) and **EXTEND** (only while `open`; `PATCH /orders/price/:id` with a new `expiresAt` — `lifecycle.md` says expiry is editable, the `manage-orders.md` field table lists only price and slippage; if the PATCH rejects `expiresAt`, EXTEND is hidden and the foot says "to keep it past {date}, cancel and arm again" — risk 4).
- `ready` never applies to a trigger row; `holding` applies only to OTOCO orders (the child pair is live on Jupiter's side and the row reads `holding · Jupiter watching target $420.00 / stop $280.00`).

A live row with `execution = 'notify'` reads `notify + sign · Solera watching` on line 4 and, when `ready`, the action becomes **OPEN TICKET** → `/buy/{ticker}?plan={id}` (§3.3).

### 2.4 `PlanEditorSheet`

Opened by EDIT on a card or a row's `edit` (proposed only — an armed plan is cancelled and re-armed, because a Jupiter order's deposit is sized at arm time). Sheet shell from `design-system.md` §4.7, eyebrow `PLAN`, title `Edit the rule`. Fields map 1:1 to `PlanCondition` (`backend.md` §6.1):

- `Token` (catalog search, `getCatalog` filtered; shows symbol · name · live price).
- `When the price is` segment `at or above | at or below` + `$` amount input. No "now" option (a standing plan needs a price condition).
- `Do` segment `buy | sell`; buy → `$ amount | shares` toggle + input; sell → `shares | fraction (all · ½ · ⅓ · ¼)`.
- `Then hold until` (buys only): optional `target $` and `stop $`; inline validation `Your stop is above your entry.` etc. (server rules in §6.1).
- `Wrong if` (160), `Why?` (280), `Watch until` (date, default +30 days, max +30 days for live trigger — Jupiter's recommended max).
- Live only: `Pay with` `SOL | USDC` (buys), `Slippage` `2 %` (50–1000 bps; default 200 — Jupiter's default for buy-above/stop-loss is 20 %, which Solera never sends implicitly).
- Live preview line under the fields: the same `Understood:` sentence, plus for trigger the executor summary from `POST /api/plans` (`live.summary`, e.g. `Buy AAPLx with 0.25 SOL (≈ $50.00) when AAPLx is at or above $345.00. Expires Oct 22.`).
- `SAVE` → `POST /api/plans` (new proposed) + `DELETE` old; `CANCEL` closes.

### 2.5 Foot, by mode (decision text, verbatim)

- Practice: **A plan is your sentence, executed in practice cash on Solera's server when its price condition is met — checked about once a minute. Human conditions ("until deliveries miss") become the position's wrong-if for you to mark.**
- Live: **Price conditions become a Jupiter Trigger order you sign once; funds sit in Jupiter's vault until it fills or you cancel. Anything Trigger can't express waits here as "ready to sign".**
- Appended to both, from `GET /api/plans/health`: `server watch: on · last check 12 s ago` or `server watch: off · checking while this tab is open` (`backend.md` §8.5). Never "24/7" for practice; "24/7" appears only in the Jupiter paragraph.

### 2.6 Cancelling from the panel

- practice / notify: `cancel` (`.btn-small.btn-ghost`) → inline confirm `Cancel this plan?` `YES · CANCEL` / `KEEP` (no sheet; it is reversible only by re-arming) → `PATCH { status: "cancelled" }` → row moves to EARLIER, toast `Plan cancelled.` A `holding` practice plan: the confirm adds `Your position stays; Solera just stops watching its exits.`
- trigger: **CANCEL & WITHDRAW** → §3.4 (needs a signature; funds come back).

## 3. Live-plan flows, step by step

All live flows run in the browser (`src/lib/jupiter-trigger.ts`, `backend.md` §9.4); the server never holds a Jupiter JWT. Base `https://lite-api.jup.ag/trigger/v2` (keyless on the lite host, verified today: `POST /auth/challenge` 200 without `x-api-key`; every authenticated endpoint returns `401 {"error":"Unauthorized"}` without a JWT).

### 3.1 Arming a Trigger order on desktop (`ArmPlanSheet`)

Sheet (`design-system.md` §4.7), eyebrow `LIVE PLAN · JUPITER TRIGGER`, title `Arm it with your wallet`, a two-step progress line `1 sign in · 2 approve deposit`.

Body before any prompt:

```
when AAPLx is at or above $345.00 → buy $50.00
Buy AAPLx with 0.25 SOL (≈ $50.00). Expires Oct 22.

WHAT MOVES NOW    0.25 SOL → your Jupiter vault
WHEN IT FILLS     Jupiter's keeper swaps it for AAPLx and sends the AAPLx to your wallet
SLIPPAGE          up to 2 %   [change]
EXPIRES           Oct 22, 2026 · unfilled funds come back with one more signature

Your 0.25 SOL moves to a Jupiter vault now and stays there until the order
fills, expires, or you cancel. Jupiter watches the token's on-chain price in
dollars, not the stock exchange price. The fill price can differ from
$345.00 by up to 2 %. Orders can fill partially. Minimum order $10.
AAPLx is issued by Backed Finance, not by Solera; it carries price exposure,
not shareholder rights; xStocks are not offered to US persons.

[ CONTINUE WITH PHANTOM ]   [ not now ]
```

Steps on CONTINUE (wallet-adapter `signMessage` / `signTransaction`; every step's error appears inline under the progress line and the button re-enables):

1. **Challenge.** `POST /auth/challenge { walletPubkey, type: "message" }`. The sheet shows the challenge text in a `pre` (mono 10px) — `Sign this message to authenticate with Jupiter that you are the owner of 9U76…vMQd. This challenge expires at … with the nonce of …` (exact wording verified) — with the line `This proves the wallet is yours. It moves nothing.` Then `signMessage`. Button reads `Waiting for Phantom…`, `aria-busy`. `POST /auth/verify` → JWT, cached in memory for the wallet until `exp − 60 s`. Cached JWT → step 1 is skipped and the progress line shows `1 signed in ✓`.
2. **Vault.** `GET /vault`, `404` → `GET /vault/register` (no signature; first-time only). The sheet says `Setting up your Jupiter vault…` for the second it takes. The vault address appears in the sheet's foot: `vault {short address}`.
3. **Deposit craft.** `POST /deposit/craft { inputMint, outputMint, userAddress, amount, orderType: "price", orderSubType }`. A `400` is shown verbatim (`Order must be at least 10 USD (current value: 8.90 USD)` — real message, verified); `403` → `This wallet doesn't match the one that signed in. Reconnect and try again.`
4. **Deposit signature.** `signTransaction(VersionedTransaction.deserialize(base64))`. Progress `2 approve deposit`; the sheet: `Phantom will show a transfer of 0.25 SOL to {vault}. That is the deposit.` A rejected signature → `You cancelled the deposit. Nothing was moved.` (same phrasing as `use-execute-trade.ts:63`).
5. **Create.** `POST /orders/price { orderType, depositRequestId, depositSignedTx, userPubkey, inputMint, outputMint, inputAmount, triggerMint, triggerCondition, triggerPriceUsd, slippageBps, expiresAt }` → `{ id, txSignature, depositConfirmed }`. `200` means the deposit landed ("the deposit lands on-chain during the create call", lifecycle doc). The sheet: `Deposit landed · order {id short}`.
6. **Record.** `PATCH /api/plans/:id { status: "armed", trigger: { orderId, depositSignature } }`. Success → the sheet's final state:

```
✓ Armed with Jupiter
when AAPLx is at or above $345.00 → buy $50.00
0.25 SOL is in your Jupiter vault · order {id} · view on Solscan ↗ · view on Jupiter ↗
Funds are held by Jupiter until fill or cancel. You can cancel from Plans any time; that needs one signature and returns the funds.
[ DONE ]
```

`celebrateTrade()` is **not** fired here — confetti is for real fills only (brand); it fires when the fill lands (§3.5). The PATCH failing after a successful create (RPC lag) → `The order is live on Jupiter, but Solera couldn't confirm the deposit yet. It will show up in Plans within a minute; if not, tap Refresh there.` and the sheet closes; the plan row shows `deposit landing` until the §9.7 sync reconciles (risk 5 in `backend.md`).

### 3.2 Arming on iPhone (Safari → Phantom → Safari), via `DeepLinkResumer`

Same six steps, but steps 1 and 4 leave the page (`isDeferredSigner(adapter)`, `deferred-signing.ts:114`; the adapter is `PhantomDeepLinkWalletAdapter`, `phantom-deeplink-adapter.ts`). Three page loads, two Phantom hops. Two new `Continuation` variants next to `swap` / `profile` / `session`:

```ts
| { kind: "trigger-auth";    planId: string; wallet: string; challenge: string; issuedAt: number }
| { kind: "trigger-deposit"; planId: string; wallet: string; token: string; tokenExp: number;
    requestId: string; order: PriceOrderBody /* minus depositRequestId/depositSignedTx */ }
```

Sequence, as the person experiences it:

1. Tap **CONTINUE WITH PHANTOM** in the arm sheet. The sheet shows `Step 1 of 2 · sign in with Phantom` and the challenge text. `stageContinuation({ kind: "trigger-auth", … })`, then `signMessage` → Safari hands off to Phantom (the promise never settles here, adapter comment `:77-83`).
2. Phantom shows the challenge; the person approves; Phantom returns to `https://trysolera.vercel.app/agent` (or `/portfolio`, whichever page the sheet was on — `redirectLink()` drops the query string; the resumer restores it, `DeepLinkResumer.tsx:61-66`). iOS opens the reply in a new tab; the old tab reloads when the pending key clears (`:49-50`).
3. New page load: `DeepLinkResumer` pairs the result with the pending request and shows the busy card `Signing in with Jupiter…` (`busyLabel` gains the two kinds: `Signing in with Jupiter…` / `Sending your deposit to Jupiter…`). It runs `POST /auth/verify` → JWT, `GET /vault` (register if needed), `POST /deposit/craft`, then **re-opens the arm sheet** at `Step 2 of 2 · approve the deposit` (the sheet is reconstructed from `GET /api/plans/:planId`, not from React state, because the state is gone). The person reads the deposit line and taps **APPROVE DEPOSIT**.
4. `stageContinuation({ kind: "trigger-deposit", token, tokenExp, requestId, order, … })`, `signTransaction` → Phantom hop 2.
5. Return: busy card `Sending your deposit to Jupiter…` → `POST /orders/price` → `PATCH /api/plans/:id` → the resumer's outcome dialog: title `Armed with Jupiter`, body `when AAPLx is at or above $345.00 → buy $50.00. 0.25 SOL is in your Jupiter vault until it fills, expires, or you cancel.`, link `View on Solscan`. `DONE`.

Two facts the design has to state honestly:

- **The JWT crosses a page load.** `backend.md` §9.4 keeps Jupiter JWTs in memory, and Jupiter's docs say not to persist them. On iOS the token from hop 1 is needed after hop 2's fresh page load, and the reply arrives in a *new tab* (so `sessionStorage` cannot carry it). It therefore rides inside the `trigger-deposit` continuation in `localStorage[solera:deeplink-pending]` for at most `PENDING_MAX_AGE_MS` (15 min, `deferred-signing.ts:56`) and is deleted the moment the continuation is consumed or expires. Exposure if the device is compromised in that window: a JWT can cancel or edit orders but "cannot withdraw funds" or create orders without a signed deposit (Jupiter authentication doc). Stated in `docs/` and in this document's risks; not shown to the person.
- **The challenge expires in 5 minutes** (verified in the challenge text). If the person leaves Phantom open longer, `POST /auth/verify` returns `401` → outcome `That Jupiter sign-in expired. Open Plans and tap Arm it again — nothing was moved.` The plan stays `proposed`.

If the person abandons hop 2 (closes Phantom, never returns) the pending request expires after 15 minutes; the plan stays `proposed` with the card reading `Deposit not approved. Tap Arm it to try again.`; nothing has moved because `/orders/price` was never called.

### 3.3 Notify + one-tap sign (the fallback)

Applies when `POST /api/plans` returns `execution: "notify"` — a human-only condition, exits Jupiter cannot bundle, a pre-IPO leg, an order under $10, a token Jupiter rejects at craft (§5.3). The plan card says why in the **What happens** paragraph, quoting `live.reason`.

1. **Armed.** Row reads `notify + sign · Solera watching · checked 12 s ago`. The evaluator (`backend.md` §8.3 step 4) is the watcher; the row's foot repeats the cadence.
2. **Ready.** Condition met → `status 'ready'`, `inbox` row `plan_ready` with `href = /buy/{ticker}?plan={id}` (this document's choice; `backend.md` §9.8 wrote `/asset/<ticker>?plan=`, but `/buy/[ticker]` already reads `?ref` and `?side` through `useSearchParams` under `Suspense` (`TradeScreen.tsx:29-31`, `buy/[ticker]/page.tsx:6`), so `plan` is a third parameter on a route that exists — open question 4 to reconcile the two documents). Delivery is **in-app only** this week (email needs SMTP; `backend.md` §9.8):
   - **Bell** in the top bar between the clock and the wallet pill (`InboxBell.tsx`, `.btn-icon`; on phones in the top bar's right group). Badge = unread count from `GET /api/inbox` polled every 30 s while the app is open and on focus; the badge is a 16px `--warn` circle with ink digits (never `--loss`). Tapping opens `InboxSheet`.
   - **Inbox sheet**: rows `READY TO SIGN · TSLAx is at $299.40 — your plan “if TSLAx falls to $300 sell 5 shares” is ready. Open the ticket to sign.` with `OPEN TICKET`; other kinds (`plan_filled`, `plan_failed`, `plan_expired`, `plan_cancelled`) are informational rows with `view in plans`. Opening a row marks it read (`POST /api/inbox/read`). Sheet foot: `Solera notifies here, in the app. Email and push aren't wired yet.`
   - **Toast** when the poll first sees a new `plan_ready` and the app is open: `.warn` toast `TSLAx is at $299.40 — a plan is ready to sign.` with an `open` link (5 s, hover pauses).
   - The Plans row itself: READY TO SIGN chip, `OPEN TICKET` action, `em` line `ready since 2 min ago · price now $299.10`.
3. **The pre-filled ticket** at `/buy/TSLAx?plan={id}`: `TradeTicket` reads `plan`, fetches `GET /api/plans/:id`, and prefills side, shares (or amount), the note into `Why?`, and shows a banner above the amount: `From your plan: “if TSLAx falls to $300 sell 5 shares” · ready since 2 min ago`. The quote is the **current** Ultra quote, not the trigger price. If the current price no longer meets the condition (`met()` false), the banner adds `TSLAx has moved back to $302.10 — the plan's condition isn't met right now. You can still sell, or wait; the plan stays armed.` and the plan returns to `armed` after 30 minutes of the condition not holding (`backend.md` §8.3). The review step is unchanged (`TradeScreen.tsx:224-333`): disclosure paragraph, `CONFIRM SELL · SIGN IN WALLET`. On fill: `POST /api/fills { …, via: "plan", planId }` then `PATCH /api/plans/:id { status: "done", fillId }`; the row becomes FILLED with `sold 5 TSLAx at $299.62 · on-chain ↗`; confetti fires here.
4. **On iPhone** the ticket's sign is the existing deferred swap (`trade.ts:126-155`, `DeepLinkResumer.tsx:125-160`); the swap continuation's `trade` gains `planId` and `via: "plan"` (`backend.md` §5.2) so the return page load records the fill against the plan. `returnTo` keeps `?plan=` because the resumer restores the query string.
5. A `ready` plan the person ignores: it stays `ready` while the condition holds (re-checked each minute), re-arms after 30 minutes of not holding, and expires at `arm_until` like any plan. Nothing is ever signed on their behalf.

### 3.4 Cancelling a Trigger order (`CancelPlanSheet`)

Eyebrow `LIVE PLAN`, title `Cancel and withdraw`, body:

```
when AAPLx is at or above $345.00 → buy $50.00
0.25 SOL is in your Jupiter vault. Cancelling stops the order right away and
returns the SOL to your wallet; that return needs one signature.
[ CANCEL & WITHDRAW · SIGN IN WALLET ]   [ keep it ]
```

1. `POST /orders/price/cancel/:id` → the order is `ready_to_cancel` immediately, no more fills (manage-orders doc), returns `{ transaction, requestId }`. The row flips to `withdrawal pending`.
2. `signTransaction` → `POST /orders/price/confirm-cancel/:id { signedTransaction, cancelRequestId }` → `{ txSignature }`.
3. `PATCH /api/plans/:id { status: "cancelled", trigger: { withdrawSignature } }`. Toast `.ok` `Cancelled. 0.25 SOL is back in your wallet · view on Solscan`.

Interrupted after step 1 (signature declined, tab closed, Phantom hop abandoned): the row stays `withdrawal pending` with the action **FINISH WITHDRAWAL** — calling `cancel` again is idempotent per the docs, so the same sheet reopens at step 2. On iPhone step 2 is one Phantom hop with a `{ kind: "trigger-withdraw", planId, orderId, cancelRequestId, token, tokenExp }` continuation; the resumer's busy label `Returning your funds from Jupiter…`. An **expired** Jupiter order uses this exact sheet with title `Get your funds back` and button `WITHDRAW · SIGN IN WALLET` (expired deposits stay in the vault until withdrawn — lifecycle doc).

A JWT is needed for step 1; if none is cached the sheet first runs §3.1 step 1 (`Sign in with your wallet to talk to Jupiter`), so a cancel can cost two prompts. The sheet says so up front: `2 signatures: sign in, then the withdrawal.` or `1 signature`.

### 3.5 When a Trigger order fills

The browser sync (`backend.md` §9.7) sees `orderState: "filled"` → `POST /api/fills` with the fill event's signature (`via: "plan"`), server verifies the transaction touches the vault and the wallet's token account → `PATCH { status: "done" | "holding" }`. The person sees: the row becomes FILLED with `bought 0.1449 AAPLx for 0.25 SOL · Jupiter · on-chain ↗`, an inbox row `plan_filled`, a `.ok` toast `Plan filled: bought 0.1449 AAPLx at $345.20`, and `celebrateTrade()`. The fill lands on the tape with `on-chain` and `via plan` chips and the note, if any. If the sync happens while the person is away, all of this appears on the next visit with a JWT (or after the one-tap REFRESH); the copy never says "filled" until the server has verified the signature.

Partial fills (Jupiter: "Orders fill partially for optimal execution prices") show as `filling… 60 % · 0.087 AAPLx so far` while `executing`; the plan stays ARMED until `filled`.

## 4. Copy sheet

Everything below is final text. Sentence case, no exclamation marks, mono eyebrows uppercase, symbols always as `TSLAx`.

**Panel/card titles:** `Agent` · `Plans` · `// PLAN · PROPOSED` · `// PLAN · ARMED` · `// ORDER · PRACTICE` · `// ORDER · LIVE` · `EARLIER` · `Inbox`.

**Subtitles:** `Claude · reads live prices, news and your plans · never signs` · `offline parser · no model attached yet · never signs` · `standing orders in plain words · {n} live` · `{n} unread`.

**Empties:** `Ask about a token, a gap, your notes, or write a plan in plain words.` · `No live plans. Write one above — Solera reads it, shows you the rule it understood, and only arms it when you say so.` · `Nothing to sign or read. Plans that need you show up here.` (inbox) · `Sign in to keep plans running while you're away.`

**Feet:** `Composed from live figures. Nothing here is a forecast or a recommendation. Plans are armed only after you confirm; nothing is signed without your wallet.` · the two mode feet in §2.5 · `server watch: on · last check {rel}` / `server watch: off · checking while this tab is open` · `Solera notifies here, in the app. Email and push aren't wired yet.`

**Buttons:** `SEND` · `ARM IT` · `SIGN IN TO ARM` · `SWITCH TO LIVE TO ARM` · `EDIT` · `DISCARD` · `REVIEW IN TICKET` · `cancel` · `YES · CANCEL` · `KEEP` · `CANCEL & WITHDRAW · SIGN IN WALLET` · `FINISH WITHDRAWAL` · `WITHDRAW · SIGN IN WALLET` · `EXTEND` · `CONTINUE WITH {wallet name}` · `APPROVE DEPOSIT` · `OPEN TICKET` · `REFRESH · SIGN IN WITH WALLET` · `RETRY` · `DONE` · `not now` · `keep it`.

**Status chips:** `ARMED` · `HOLDING` · `READY TO SIGN` · `FILLED` · `FAILED` · `CANCELLED` · `EXPIRED` · `practice` · `live` · `Jupiter order` · `notify + sign` · `offline parser`.

**Restatements** (`describe()`): `when {SYM} is at or above ${p} → buy ${a}` · `… → buy {n} shares` · `when {SYM} is at or below ${p} → sell {n} shares` · `… → sell all` / `sell half` · `· then hold until target ${t} or stop ${s}` · `· wrong if “{text}”` · `· until {Mon D}`. Always "at or above / at or below" — the evaluator is a level check once a minute, and Jupiter's keeper "crosses above/below"; neither promises the exact print (`backend.md` §7.3 rule 7).

**Toasts:** `Armed: {summary}` · `Armed. You'll get a notification here when {SYM} is {at or above|at or below} ${p}.` · `Plan cancelled.` · `Cancelled. {amount} is back in your wallet · view on Solscan` · `Plan filled: {bought|sold} {n} {SYM} at ${p}` · `Plan could not fire: {ledger message}` · `{SYM} is at ${p} — a plan is ready to sign.` · `Note saved`.

**Disclosure sentences** (each appears on the surface named; none is collapsed or hidden behind a tap — brand skill):

| Sentence | Where |
|---|---|
| Composed from live figures. Nothing here is a forecast or a recommendation. | Agent foot |
| Plans are armed only after you confirm; nothing is signed without your wallet. | Agent foot, plan card "What happens" |
| Solera fills it in practice cash on its server when the price is {at or above/below} ${p}, checked about once a minute. | practice plan card, practice Plans foot |
| Your {amount} moves to a Jupiter vault now and stays there until the order fills, expires, or you cancel. | arm sheet, live plan card |
| Funds are held by Jupiter until fill or cancel. | every trigger row, arm success state |
| Jupiter's keepers fill it 24/7; the fill price can differ from ${p} by up to {slippage} %. Orders can fill partially. | arm sheet |
| Jupiter watches the token's on-chain price in dollars, not the stock exchange price. | arm sheet (verified: `triggerPriceUsd` is compared to `triggerMint`'s USD price) |
| Cancelling, or getting expired funds back, needs one more signature. | arm sheet, cancel sheet |
| Minimum order $10. | arm sheet; the editor's inline error |
| {SYM} is issued by {issuer}, not by Solera; it carries price exposure, not shareholder rights; xStocks are not offered to US persons. | arm sheet, the ticket's review step (existing, `TradeScreen.tsx:299-300`) |
| Solera never holds keys or funds. The vault is Jupiter's, and only your wallet can withdraw from it. | arm sheet foot (`sheet-foot`) — this is how "Solera never holds keys or funds" stays true next to a custodial vault (open question 1 in `backend.md` §15) |
| Solera will notify you when the price is there and prefill the ticket; you tap once to sign. Nothing is signed on your behalf. | notify plan card, inbox row |
| Solera notifies here, in the app. Email and push aren't wired yet. | inbox foot |
| Practice fills use practice cash. No real order is placed. | order card (practice), ticket (existing) |

**Sentences that must never appear:** "MCP server", "weekly digest", "?plan= arms", "SOLERA.agent", "demo wallet", "landed on mainnet" before a signature exists, "24/7" about practice plans, "guaranteed", any headline not returned by `/api/news`, any price not returned by a price call.

## 5. Edge cases

| Case | What the person sees | Mechanism |
|---|---|---|
| **Price feed down** (Jupiter Price v3 unreachable) | Plan cards: `now — (no live price right now)`; rows: `no live price for TSLAx right now · plan still armed`; the agent's `get_prices` errors and the model says `I couldn't fetch prices just now.` (no number is ever shown stale as if live); creating a plan still works, with the card line `We couldn't check this against today's price.` | evaluator skips the ticker and logs once per hour (`backend.md` §8.3 step 3); `validateCondition(c, { price: undefined })` skips the price-relative checks |
| **Trigger minimum $10** | editor/card inline error `Jupiter's minimum for a standing order is $10.`; if the person keeps it (a sell of a small position, or `amountUsd < 10`), the executor becomes `notify` and the card explains `Jupiter can't hold an order under $10; Solera will notify you instead.`; at craft time Jupiter's own message is shown verbatim if it disagrees with our estimate (SOL moved) | `toTriggerOrder` returns `ok:false` on `< $10` (`backend.md` §9.2); `deposit/craft` `400` verified |
| **Token not supported** — unknown | agent: `I don't know a token called XYZ. Try the symbol as it appears on Markets.`; editor: catalog search shows `No matching assets.` | `get_catalog` empty; `findCatalogToken` on the server |
| — pre-IPO (PreStocks / Tessera) | practice: `Pre-IPO tokens are bought for real, from your wallet.`; live: the plan is `notify` (`Jupiter can't watch pre-IPO tokens for a leg; Solera will notify you.`); legs are not evaluable this week (`backend.md` §6.1) | `toTriggerOrder` rejects `leg` |
| — xStock Jupiter rejects at craft (transfer-hook not whitelisted) | arm sheet inline: Jupiter's message, then `Jupiter won't hold this token in a vault. Solera can watch it and notify you instead.` with **WATCH IT FOR ME INSTEAD** → `POST /api/plans` again with `execution` forced to `notify` (the server re-validates); the deposit was never signed | AAPLx/TSLAx crafted fine today (`backend.md` §9.1); other catalog mints unverified |
| **Plan expiry** | card `UNTIL {date}`; row `expires {Mon D}`; at expiry: practice → EXPIRED, inbox `plan_expired` `Your plan on TSLAx expired before the price got there.`; trigger → Jupiter `expired`, row `expired · funds still in vault` + **WITHDRAW · SIGN IN WALLET**; `holding` past `hold_until` → EXPIRED with `hold window ended, position kept`. **EXTEND** while open (§2.3). Default 30 days; the editor caps live trigger at 30 days (Jupiter's recommended max) and allows up to 90 for practice | `arm_until` / `hold_until`; Jupiter `expiresAt` |
| **Wallet disconnected** with live plans | trigger rows keep their last state + `Connect {short} to refresh Jupiter status.`; Jupiter keeps watching regardless; cancel needs the wallet (button → `openConnect()`); notify plans still flip to READY and the inbox still fills; opening the ticket prompts connect first. A different wallet connected: those rows are read-only with `armed from {other short}` | JWT is per wallet; `plans.wallet` |
| **Practice ↔ live switch while plans are armed** | plans keep the `mode` they were made in; the panel lists both with the `practice`/`live` chips; a one-line notice at the top when the toggle differs: `2 live plans are still being watched by Jupiter.` / `1 practice plan still runs on Solera's server.`; the composer and the agent create in the toggle's current mode and say so in the preview | `mode` column; `<state>.mode` |
| **Signed out mid-way** (session expired, 30 days) | Plans panel → signed-out state, plans untouched server-side; the agent's write tools return `Sign in to create plans.` | `requireOwner()` |
| **Jupiter JWT expired** (24 h) | row: `Jupiter status checked 3 h ago` + REFRESH · SIGN IN WITH WALLET; cancel sheet says `2 signatures` | in-memory cache |
| **Challenge expired** (5 min in Phantom) | `That Jupiter sign-in expired. Tap Arm it again — nothing was moved.` | `/auth/verify` 401 |
| **Deposit landed, PATCH failed** | sheet: `The order is live on Jupiter, but Solera couldn't confirm the deposit yet…`; row shows `deposit landing` until sync | `backend.md` risk 5 |
| **Insufficient SOL for fees / balance** | craft succeeds without funds but the deposit fails on-chain → Jupiter `failed · deposit_failed`; the row reads FAILED `Deposit failed on-chain (insufficient balance). Nothing was moved.`; before that, the arm sheet pre-checks `spendable` like the ticket (`TradeScreen.tsx:94-99`, `SOL_FEE_RESERVE`) and says `That's more than your SOL available (0.01 kept for fees).` | `getUltraBalances` |
| **Price moved away after READY** | ticket banner (§3.3 step 3); re-arm after 30 min | evaluator |
| **Ledger race on fire** (person spends the cash a second before the plan fires) | FAILED with `Your available cash changed. Please review the amount.`; inbox `plan_failed` | version guard, `backend.md` §4.3 step 3 |
| **Supabase paused / evaluator down** | foot `server watch: off · checking while this tab is open`; the open tab still fires the person's own plans every 60 s | `backend.md` §8.5, risk 1 |
| **Two devices** | the same plans everywhere (server rows); the agent thread is per tab; the Jupiter JWT is per device | — |
| **`?plan=` link from a stranger** | prefills the composer only; ARM IT still needs the tap and a session | decision |
| **Reduced motion** | no pulsing chips, no arm ring, no confetti; status is the word | `design-system.md` §6 |

## 6. Success criteria for the demo video (no analytics; everything is on screen)

Recorded on the preview URL and, for the phone part, on the iPhone. Each line is a thing the camera can show.

1. **Empty Agent tab** shows the three canonical chips verbatim and the foot sentence; the subtitle says which model is attached (with no key: `offline parser · no model attached yet`).
2. **Prompt 1** (`buy AAPLx if it goes over $345`): the reply asks for a size and shows no card. Typing `$250` yields a plan card whose sentence is exactly `when AAPLx is at or above $345.00 → buy $250.00`, whose WATCHES row shows the live AAPLx price with a signed distance, and whose What-happens paragraph names the mode. No number on the card exists that a price call did not return.
3. **ARM IT** on that card flips the head to `// PLAN · ARMED` and the same row appears at the top of the Plans panel with the ARMED chip within one refetch (≤ 15 s; immediately when the panel is on the same page).
4. **Prompt 2** (`show me the latest news on TSLAx`): a news card with ≤ 8 rows, each headline a real outbound link with a source and an age; the eyebrow names Finnhub or Google News; the reply quotes headlines only from that card.
5. **Prompt 3** (`if TSLAx falls to $X sell 5 shares`, X from the chip): a plan card with `sell 5 shares` — not "sell all" (the partner's bug) — and, in practice, the ARM flow of item 3.
6. **A practice plan fires on camera**: arm `buy $25 of SPYx if it goes over ${floor(price × 0.995)}` (already at or above); within about a minute the row turns FILLED with `bought … at $…`, the fill appears on the tape with `practice` and `via plan` chips, and the practice cash in the hero drops by the amount. The `server watch` foot shows a last-check time that advanced.
7. **Signed-out honesty**: the same prompts work for prices and news; ARM IT reads `SIGN IN TO ARM` and opens the auth sheet; nothing is created.
8. **Live arm sheet (desktop)**: switching to Live with the connected wallet and tapping ARM IT on a `$10` AAPLx plan shows the vault paragraph, the Jupiter challenge text, and exactly two wallet prompts; the success state shows `Funds are held by Jupiter until fill or cancel.` and a Solscan link that opens a real deposit transaction. (Costs network fees plus the $10 deposit, returned at step 9 — the user's "no spending" preference means this is their call; open question 2.)
9. **Cancel & withdraw**: one signature, the row moves to EARLIER as CANCELLED, the toast links a Solscan withdrawal, and the wallet's SOL/USDC balance in the pill recovers.
10. **iPhone (Safari)**: the same arm reaches Phantom twice and comes back to Solera both times with the busy card labels `Signing in with Jupiter…` and `Sending your deposit to Jupiter…`; the final dialog matches item 8's copy. If the user prefers not to spend, the video stops at the challenge screen in Phantom and shows the `You cancelled…` message on return — still a real round trip.
11. **Notify fallback**: arm a live plan with a human clause (`… until deliveries miss`); the card says Jupiter can't watch it and Solera will notify; set the trigger at the current price so it flips to READY TO SIGN within a minute; the bell shows `1`; the inbox row opens `/buy/TSLAx?plan=…` with the banner `From your plan: …` and the live quote; the review step's disclosure paragraph is visible without scrolling into a collapsed section.
12. **No advice**: ask `should I buy TSLAx?` — the reply declines in one sentence and offers facts; no card.
13. **Reduced motion on**: the ARMED chip does not pulse; every state is still readable.

## 7. Open questions (only the user can decide)

1. **`/buy/[ticker]?plan=` vs `/asset/<ticker>?plan=`.** This document uses `/buy/[ticker]` (the brief; the route already parses query params). `backend.md` §9.8 and its inbox `href` comment say `/asset/`. One has to change; recommendation: `/buy/`, since on phones `/asset/` is the chart card and `/buy/` is the ticket.
2. **Spend for the live demo.** Items 8–10 move real SOL (≥ $10 deposit, returned on cancel, minus network fees). Record the live arm for real, or stop at the Phantom challenge screen?
3. **Starter chips beyond the three.** `pages.md` §3.12 lists chips ("Who is buying what I hold?", wrong-ifs, liquidity, NYSE open) that need tools not in `backend.md` §7.4. Add `get_investors`, `get_notes`, `get_market_status` tools this week (roughly a day) or ship the three canonical chips plus `what's X at` / `my plans`?
4. **Practice plan expiry cap.** 30 days everywhere (matches Jupiter) or allow 90 for practice as written in §5?
5. **The JWT-in-continuation exception on iOS** (§3.2). Accept the 15-minute localStorage window, or make iPhone live plans notify-only (one hop, no vault) for Thursday and keep Trigger for desktop?
6. **"Solera never holds keys or funds" next to a custodial vault.** The arm-sheet foot rewords it as `The vault is Jupiter's, and only your wallet can withdraw from it.` Confirm the wording (also `backend.md` §15 question 5).

## 8. Risks

1. **Three page loads on iPhone for one live plan.** The continuation design is sound and mirrors the existing swap/profile/session hops, but it has never run on the device; a real-phone pass before Thursday is mandatory (also `backend.md` risk 9).
2. **Keyless `lite-api.jup.ag/trigger/v2`** worked today for the challenge; Jupiter's docs say a key is required. If the lite host tightens during the hackathon, every live-plan surface degrades to the notify fallback; the arm sheet must show Jupiter's `403`/`429` verbatim and offer WATCH IT FOR ME INSTEAD, not hang.
3. **`trigger_state` is only as fresh as the last browser sync.** A fill that happens while the person is away shows as ARMED until they return with a JWT. The copy says `checked {rel} ago` on every trigger row so the staleness is visible, but a demo that arms and walks away will look unfilled.
4. **EXTEND** depends on `PATCH /orders/price/:id` accepting `expiresAt`, which the field table does not list. Build EXTEND last; hide it if the PATCH rejects it.
5. **Mock ≠ Claude on phrasing.** The demo script is safe only for the pinned prompts; a free-form question in the video with no key returns the "I can set up price plans…" sentence. Script the video to the chips until the key is wired.
6. **Once-a-minute practice fills can miss a spike.** Stated as "at or above/below … about once a minute" everywhere; no surface says "when it crosses".
7. **Inbox is polling, not push.** A READY plan is seen only with the app open (30 s poll) or on the next visit; the copy says so in the inbox foot. Web push/email are out of scope this week.
8. **The `$X` in canonical prompt 3 is computed from the live price.** If the price feed is down on demo day the chip shows a literal `$X` and the mock asks for a number — fine, but rehearse it.

## 9. Verification log (Sept 22 2026)

| Check | How | Result |
|---|---|---|
| Partner plan grammar, panel, agent page | read `plans.js` (177 lines), `terminal.css:475-494`, `agent.html`, `partner-agent-desktop.png`, `partner-portfolio-desktop.png`, `partner-mobile-portfolio.png` | grammar at `:30-70`; `describe()` `:72-77`; statuses armed/holding/done/failed/expired/cancelled `:85-96`, `:116`; panel copy `:133-139`; agent page = API docs + JSON snapshot `:149-171`; `?plan=` auto-arm `:175`; `.plan-form` focus `--up` `terminal.css:479`; status chip colours `:485-486` |
| Live ticket, review, success copy | `TradeScreen.tsx` | `?ref`/`?side` via `useSearchParams` `:29-31`; review disclosure `:299`; `Confirm {side} · sign in wallet` `:317`; success `Order filled on Solana` `:157`; `Waiting for your wallet…` `:314`; slider/quick amounts `:23-24`, `:112-121` |
| Pre-IPO sheet copy | `PreIpoBuySheet.tsx:103-117`, `:188-193` | connect prompt, "Or buy on Jupiter ↗", the issuer/price-exposure disclosure |
| Deferred signing | `deferred-signing.ts` (`Continuation` `:15-34`, `PENDING_MAX_AGE_MS` 15 min `:56`, `isDeferredSigner` `:114`); `DeepLinkResumer.tsx` (storage reload `:49-50`, query restore `:61-66`, `busyLabel` `:118`, `resolve` `:125`, `finishDeferredSwap` `:151`, `recordLiveTrade` `:155`); `phantom-deeplink-adapter.ts` (`deferred = true`, `redirectLink()` drops the query, `connect()` never settles) | as cited |
| Session sign-in via deeplink `signMessage` | `use-session.ts:76-95` stages `{ kind: "session" }` before `signMessage` | a message signature over the deeplink is an existing path, so Jupiter's challenge can use it |
| `useSearchParams` needs `Suspense` | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`; `buy/[ticker]/page.tsx:6` | present |
| Jupiter Trigger V2 challenge, keyless on lite | `curl -X POST https://lite-api.jup.ag/trigger/v2/auth/challenge -d '{"walletPubkey":"1111…","type":"message"}'` | 200 `{ type: "message", challenge: "Sign this message to authenticate with Jupiter that you are the owner of … This challenge expires at 2026-09-22T22:27:32Z with the nonce of …" }` (5-minute expiry visible in the text) |
| Authenticated endpoints without a JWT | `GET /trigger/v2/vault`, `POST /trigger/v2/deposit/craft` on lite | `{"error":"Unauthorized"}` |
| Trigger V2 docs | `dev.jup.ag/docs/trigger.md`, `/trigger/authentication.md`, `/trigger/deposit.md`, `/trigger/create-order.md`, `/trigger/manage-orders.md`, `/trigger/lifecycle.md`, `/trigger/order-history.md`, `/trigger/errors.md` (curl, Sept 22) | vault = "Privy-managed custodial account"; `$10` minimum at `deposit/craft` with message `Order must be at least 10 USD (current value: X USD)`; JWT 24 h, challenge 5 min, no refresh; two-step cancel (`cancel` → `ready_to_cancel` immediately → sign → `confirm-cancel`); expired deposits withdrawn via the same flow; `expiresAt` required; default slippage 20 % for stop-loss / buy-above; partial fills; "Output amount not guaranteed"; orderState set `pending, open, executing, filled, pending_withdraw, cancelled, expired, failed`; `PATCH /orders/price/{id}` fields `triggerPriceUsd`, `slippageBps` (lifecycle text also says expiry); errors carry `details` per field; `401` shape `{ error: "Unauthorized" }`; V2 "is in beta" |
| Trigger v1 (not used) | `POST lite-api.jup.ag/trigger/v1/createOrder {}` → Zod requires `inputMint, outputMint, maker, payer, params`; `GET /trigger/v1/getTriggerOrders?user=…` → `{orders, totalPages, page, totalItems, user, orderStatus}` | v1 is pool-rate "buy below / sell above" only (overview table) and cannot express "buy if it goes over $345"; V2 can (`triggerCondition: "above"`) |
| Practice starting cash | `src/lib/mock-data.ts:183` | `MY_CASH_BALANCE = 842.17` (decision: unchanged) |
| Ledger error strings | `src/lib/ledger.ts:25-33` | "This order is invalid…", "Your available cash changed…", "Your position changed…" |
| Tokens and chips | `design-system.md` §1.4, §1.5, §4.2, §4.4, §4.5, §4.7, §4.8, §6 | `--live #01eaf4`, `--gain #3ddc84`, `--loss #ff5c7a`, `--warn #ffb020`, `--text-accent #c9a8ff`; `--grad-live` for armed/holding and `.btn-live`; `pulseDot 2.4s`; toasts ≤ 3, 2.6 s / 5 s with link |
| Sibling docs read | `backend.md` §3–§9, §12, §14–§16; `pages.md` §1.4, §1.7, §1.10, §2.2, §2.3, §3.5, §3.9, §3.12, §5.5, §7, §8; `layout-engine.md` §5.6, §6 | cross-references above |
