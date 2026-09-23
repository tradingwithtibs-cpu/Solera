# Solera port — implementation plan

Written Sept 22, 2026, 18:15 CDT, from the six design docs in this folder and the two reviews in `review-issues.md`. Deadline: **Thursday Sept 25, 2026, 4:00 pm ET (3:00 pm CDT)**. Branch: `redesign`. Every task ends with the gate:

```sh
export PATH=/Users/tibet/.local/node/bin:$PATH
cd /Users/tibet/code/stocklana
npm run typecheck && npm run lint && npm test && npm run build
```

Where the docs disagree, **this file wins**, then `backend.md` for anything server-side, `design-system.md` for tokens and class names, `layout-engine.md` for placement, `agent-ux.md` for the Agent surface, `pages.md` for per-route content, `platform-notes.md` for toolchain facts.


## Status (updated Sept 23, 02:00 CDT)

Done on branch `redesign`, gate green (63 tests):

- **F1** dark theme, palette remap, ink-safe fills (`18f438b`).
- **F3** shell: sidenav, tape, glass top bar, mode toggle, strip, ⌘K, six-tab bar; `usePreIpo` is one shared store; `/agent` placeholder route (`cc0a60d`).
- **F2** layout engine: `src/lib/layout.ts`, `panel-registry.ts`, `PanelGrid`/`Panel`, drag + swap-on-drop + resize + keyboard, persistence; the Agent placeholder is the first grid page (`b933f46`).
- **F4** chart ranges 24H/1W/1M/6M with `useHistoryRange` and `RangeSwitch` (`7fec3b3`).
- **F5** identity: `supabase/port.sql` (the whole migration), owners, two-claim sessions, `/api/session` bodies A and B, `/api/profile` by owner + wallet link, owner-authored rooms, `use-auth-user`, `supabase-browser` (`289c3b6`).
- **F6** practice ledger on the server (`/api/practice*`), fills with a thesis through trades and both ledgers, `/api/fills` (on-chain verified) and `/api/tape`, position notes (`/api/notes`, `use-notes`); `usePortfolio()` is a façade over the local and server ledgers (`6f09a64`).
- **A1** plans: `plans.ts`, `plan-parser.ts`, `plan-evaluator.ts`, `plans-server.ts`, `/api/plans` (GET, POST, `/:id` GET/PATCH/DELETE, `/preview`, `/health`, `/evaluate`) (`c72ff5e`).
- **A3** agent backend: `src/lib/agent/` (types, verbatim system prompt, strict tool schemas + a hand validator, `execute` over injected deps, `MockModel`, `AnthropicModel` on `@anthropic-ai/sdk` 0.128 with the cached system prefix and `fallbacks: "default"`, the 6-iteration run loop), `POST /api/agent` (`maxDuration = 60`, `GET` reports the model), `news-server.ts` (the loaders behind `/api/news`, called in-process by `get_news`), `HttpError` moved to `src/lib/http-error.ts` (re-exported from `auth-server`). Contract additions the UI must use: `context.intent: "chat" | "plan_preview"`, `pendingDraft` on both request context and response (echo it back verbatim), plan cards carry `condition` and `text` and have `planId: null` when signed out (the card offers SIGN IN TO ARM and re-posts the condition after sign-in).

Deviations from §4 the page tasks must know: `TopBar.tsx` keeps its name (it is the static back bar); the new top bar is `src/components/shell/Masthead.tsx`. `SegmentedControl.tsx` still exists (restyled via `.segmented-control`) and may be used or replaced per page. `BigChart` is owned by R2 (`src/components/ui/BigChart.tsx`); R1's hero uses `PriceChart` until then. `RoomPanel` (the room body as a component) is owned by R6 at `src/components/rooms/RoomPanel.tsx`; R2's room card imports it, and until R6 lands R2 may render `ChatRoomCard`. The `usePortfolio()` façade exposes `source: "local" | "server"`. Practice orders for signed-in users go through `/api/practice/fill` automatically inside `useExecuteTrade`.

- **R1–R6** all six page groups, built in parallel worktrees (run `wf_dc4c9551-efe`), reviewed, merged (`708008a`) and the reviewers' fixes applied: portfolio grid + `/activity`; markets grid with `BigChart`, the `TradeTicket` with thesis fields, options deleted; discover feed + trending + `/news`; `/pre-ipo` grid; people + `/investor/[id]` with no sample roster; rooms as `RoomPanel`, `AuthSheet` + `Sheet` (portalled), wallet sheets restyled. Shell follow-ups landed with them: tablet `grid-auto-rows: auto` in `panels.css`, six-tab bar `minmax(0,1fr)`, `.panel-tools` shrinkable, `.panel-foot.prose`, `.sheet` carries its own scrim, `HolderHighlight` mounted once in `AppShell`, LOG IN / SIGN UP and the me-pill in `Masthead`, `SidebarAccount` opens the auth sheet and has the email-account state, `/api/fills` stores `gap_at_buy` / `ref_at_buy`, `useSwapQuote` exposes `quotedAt`.

Deviations recorded by the page tasks: `src/hooks/use-visit.ts` is R1's (SincePanel), not R3's; `/pre-ipo` renders its own pre-IPO list (`PreIpoRow`) rather than the shared markets component; the portfolio Buy link goes to `/asset/[ticker]` and Sell to `/buy/[ticker]?side=sell`; `use-plan-prefill.ts` in `src/components/markets/` is a no-op until A2 reads `GET /api/plans/:id`; pre-IPO iPhone continuations do not yet carry the thesis (`deferred-signing.ts`, R4 request); `use-history-range` has no failed marker, so a range whose upstream answers 502 keeps saying "loading…" (F4 request).

Not done: A2, A4, A5, S1–S3, M1, P1–P3.

## 0. Rulings on the review issues

Every blocker and major in `review-issues.md` is settled here. Implementers apply these over the docs' text.

1. **Identity** — `backend.md` §2 is the only identity spec: one bare `owner` string (base58 wallet, or the Supabase Auth user uuid), one HMAC session token with two claim kinds, `requireOwner()` in every write route, `POST /api/session` accepting either a wallet signature (body A) or a Supabase Auth JWT (body B, verified with `auth.getClaims()` and `auth.getUser()` as the fallback). `pages.md` §1.7 auth mechanics, §5.5 and §5.6 (`actorFromHeader`, `users_wallets`, `wallet:`/`user:` prefixes) are struck.
2. **Social and fills schema** — `backend.md` §3, §5, §10 own the tables and routes. `pages.md` §5.2 is struck. Added to backend's route list because the pages need them: `GET /api/feed?tab=news|hot|all|mine&since=` (news + fills merged with vote/comment counts, server-composed), `GET /api/fills?owner=<owner>&limit=` (one wallet's public fills for `/investor/[id]`), `GET /api/notes` and `PUT /api/notes` (below).
3. **Position notes** — new table `position_notes (owner, key, note ≤280, horizon ≤24, wrong_if ≤160, wrong_hit_at, pinned, sort_order, updated_at, primary key (owner, key))`, RLS with no anon policy, routes `GET /api/notes` (owner's rows) and `PUT /api/notes` (upsert one). Signed-out users keep notes in localStorage `solera:notes`; on sign-in the client uploads them once.
4. **`/api/agent` contract** — `backend.md` §7.1 shape. Add `context.intent?: 'chat' | 'plan_preview'`; `plan_preview` is one model turn restricted to `create_plan` or text. The Plans composer's debounced preview does **not** call the model: a pure `src/lib/plan-parser.ts` (`parsePlanSentence(text, ctx) → { condition?, question? }`) is used by both `MockModel` and `POST /api/plans/preview`.
5. **Plans routes** — `backend.md` §6.3 and §8. There is no `/api/plans/run`. Added: `GET /api/plans/:id` (owner-scoped; anonymous read allowed only when the row has `notify_public_token` matching `?t=`, else 404), `GET /api/plans/health → { lastEvaluatedAt, serverWatch }` (`serverWatch` = evaluated within 3 minutes). `PATCH /api/plans/:id` accepts exactly the bodies listed in §6.3.
6. **Fills schema** — add `mint text`, `gap_at_buy double precision`, `ref_at_buy double precision` to `live_fills` and `practice_fills`; the ticker check becomes `ticker is null or ticker ~ '^[A-Z0-9.]{1,12}x$'`. Practice pre-IPO fills stay out for Thursday (pre-IPO is live-only).
7. **Practice fill branch** — `trade.ts` is untouched. In `useExecuteTrade.run()`, when `!isLive && session.signedIn`, skip `executeTrade()` and call `executeServerPracticeFill()` (`POST /api/practice/fills`); otherwise the existing local path runs. `recordTrade` semantics unchanged for callers.
8. **Panel class names** — `design-system.md` names everywhere: `panel-grip`, `panel-resize`, `panel-badge`, `.panel.is-dragging`, `.is-over-swap`, `.is-over-before`, `.is-over-after`. The `ly-*` names in `layout-engine.md` are replaced. **File ownership:** `globals.css` owns panel chrome (colours, head, foot, handle look); `src/components/panels/panels.css` owns `.panel-grid`, `grid-area` placement, `data-sized` scrolling and the breakpoints. `panels.css` is imported from `PanelGrid.tsx`, not from `globals.css`.
9. **Breakpoints** — desktop is `≥ 1101px` (`@media (max-width: 1100px)` collapses). Tablet `768–1100px` is a **read-only single column** (no reorder, no resize) for Thursday. Phone `< 768px` is the tab shell.
10. **Chart ranges** — `GET /api/price-history?ticker=X&range=24h|30d|180d`. 1W is the last quarter of the 30d series (as today). 24h and 180d are fetched lazily per ticker on first use; the boot burst stays at the 8 featured tickers × 30d.
11. **Supabase browser client** — `backend.md` §2.6: `src/lib/supabase-browser.ts` (`createBrowserClient` from `@supabase/ssr`, install it), `useAuthUser()`; the existing anon client keeps `persistSession: false`; no `proxy.ts` this week.
12. **Rooms** — additive only. `messages` gains `author text` (the owner); `wallet` becomes nullable and is kept. `/api/chat` inserts `{ owner, wallet: session.wallet ?? null }` and selects both; `ChatMessage` gains `author`, keeps `wallet`. Email accounts post as `author`; the gate copy is "Sign in to post". `rowToMessage`, `use-chat.ts`, `ChatMessageRow` change only to read `author ?? wallet`.
13. **Notify one-tap link** — `/buy/<ticker>?plan=<id>` everywhere. `TradeTicket` reads `plan` with the existing `useSearchParams` and prefills side, amount, note.
14. **Trigger continuations and JWT** — `agent-ux.md`'s three deeplink continuations (`trigger-auth`, `trigger-deposit` with `token`/`tokenExp`, `trigger-withdraw`) are the spec. The Jupiter JWT lives in memory on desktop; on iPhone it rides inside the continuation in localStorage for at most 15 minutes and is deleted on resume. There is **no EXTEND**: to keep an order past its expiry, cancel and arm again; `arm_until` mirrors Jupiter's `expiresAt` read-only.
15. **Agent tab content** — `agent-ux.md` §1.2–1.3 and §4 own the chips, subtitle and foot: the three canonical prompts plus "buy $N of X now" (→ `place_practice_order`). `pages.md` §3.12's chip table is superseded.
16. **Copy that must be true** — live plan cards and the Plans foot say: "one sign-in with your wallet (good for 24 hours), then one signature per order". The vault line: "Funds for this order sit in a vault run by Jupiter until it fills or you cancel. The vault is Jupiter's, and only your wallet can withdraw from it."
17. **Storage keys** — `solera:visit` (not `solera:last-visit`); practice portfolio stays `stocklana:portfolio`; layouts `solera:layout:<page>`; notes `solera:notes`; agent thread `sessionStorage["solera:agent-thread"]` and, because iPhone hops return in a new tab, the thread is also mirrored to `localStorage["solera:agent-thread"]` for 15 minutes.
18. **`page.tsx` shape** — server components that `await params` and render one client grid component (`<PortfolioGrid />`, `<MarketsGrid selected={ticker} />`). `useSearchParams` only inside a `Suspense` boundary.
19. **Auto-height cards** — `PanelSpec.estimateRows` (≥ `minRows`) is used before measurement arrives: `rowsOf = h ?? measured ?? estimateRows ?? MIN_ROWS`.
20. **News in the feed** — the server is the only source of news fields. `POST /api/feed/vote` and `/api/feed/comments` accept `{ newsId | postId }`; for `newsId` the route looks the item up in the news cache and upserts the post row itself. Clients never send title/url/source.
21. **Sessions and profiles on the client** — `StoredSession` gains `kind: 'wallet' | 'user'` and `owner`; `useSession()` returns the token when `kind === 'user'` and no wallet is connected, or `kind === 'wallet'` and the connected wallet matches. `use-profiles.ts` is keyed by `owner`; `/api/profile?owners=` (with `wallets=` kept as an alias); `toProfile()` emits `{ owner, kind, wallet, ... }`.
22. **Practice import** — on first sign-in, if the device has `stocklana:portfolio` history, it is imported into the account silently (fills, cash, positions) and the local copy is left in place for signed-out use. No sheet.
23. **Model** — `SOLERA_AGENT_MODEL_ID` defaults to `claude-opus-5` at low effort (the `claude-api` skill's rule: never downgrade a model for cost on the user's behalf; Sonnet 5 is one env var away). `SOLERA_AGENT_MODEL=mock` forces the offline parser. No key → `MockModel`.
24. **Trending** — Thursday ships the "most held by top wallets" fallback only; `/api/trending` is after Thursday.
25. **Scope tiers** — see §3. Anything marked "after" is not started before the floor is green on a preview URL.

## 1. Design decisions taken (defaults; the user may override)

- Radius: panels 8px, controls 6px, chips full, avatars circular. Tokens `--radius-panel/--radius-control/--radius-avatar`; the partner's square corners are one line away.
- Primary band: `--grad-action` (violet→indigo, white text) for primary buttons and selected segments; `--grad-live` (blue→mint, ink text) only for live, on-chain and armed states; `--grad-sell` on sell.
- Gain green `#3ddc84`; loss and warn per `design-system.md` §1.4. Mint is never a gain colour.
- Structural labels (eyebrows, panel titles, chips, nav, buttons) uppercase mono; prose sentence case in Outfit 500. No scanlines. The violet period survives only on the few remaining headlines, in `--era-1`.
- Tape shows real fills only: live fills from the chain, practice fills from signed-in owners with a `practice` chip and a filter; the user's own always.
- Layout: 32px row unit; swap trades slots (w, and h when both sized); layouts per browser; grips always on; Discover feed sized and scrolling beside Trending; `/asset/[ticker]` on desktop is the markets grid with that ticker selected; `/buy/[ticker]` stays as the static ticket for phones, `?ref=` links and deeplink returns.
- Discover, signed out: a compact welcome panel above the grid with the two calls to action (Connect wallet / Practice). Signed in: no hero.
- Markets default selection: the user's largest position, else TSLAx. Greeting: "Good afternoon, {first name}." only with a claimed name, else "Good afternoon." Solera Score is dropped from the hero.
- Pre-IPO leg optional. Signals, Flows and the valuation ladder: registry slots reserved, not built.
- Live plan defaults in the arm sheet: slippage 200 bps, 30-day expiry, settle in SOL, all editable.
- Email accounts appear on the practice tape, not on the wallet leaderboard. Email confirmation off.

## 2. File ownership map

Two tasks that run in parallel never touch the same file. Shared files are owned by exactly one task per stage; a task needing a change in another task's file states it in its result and the owner applies it.

| Area | Files | Owner |
|---|---|---|
| Theme, tokens, palette remap | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/TickerBadge.tsx`, `src/components/Avatar.tsx`, colour maps in `src/lib/investors.ts`, `src/lib/catalog.ts`, `src/lib/mock-data.ts`, `src/lib/pre-ipo.ts`, `src/lib/celebrate.ts` | F1 |
| Layout engine | `src/lib/layout.ts`, `src/lib/panel-registry.ts`, `src/hooks/use-page-layout.ts`, `src/hooks/use-media.ts`, `src/components/panels/**`, `tests/layout.test.mjs`, `tests/panel-registry.test.mjs` | F2 |
| Shell and primitives | `src/components/AppShell.tsx`, `src/components/BottomNav.tsx`, `src/components/ModeStrip.tsx` (deleted), `src/components/MyWalletBadge.tsx`, `src/components/SidebarAccount.tsx`, `src/components/TopBar.tsx`, `src/components/Logo.tsx`, `src/components/shell/**`, `src/components/ui/**`, `src/components/SegmentedControl.tsx` (deleted) | F3 |
| Price history and charts | `src/app/api/price-history/route.ts`, `src/lib/live-prices.ts`, `src/hooks/use-live-price-for.ts`, `src/components/PriceChart.tsx`, `src/components/AssetPriceChart.tsx`, `src/components/ui/RangeSwitch.tsx` | F4 |
| Identity and auth backend | `supabase/port.sql`, `src/lib/owner.ts`, `src/lib/session.ts`, `src/lib/session-server.ts`, `src/lib/auth-server.ts`, `src/lib/supabase.ts`, `src/lib/supabase-browser.ts`, `src/hooks/use-auth-user.ts`, `src/hooks/use-session.ts`, `src/hooks/use-profiles.ts`, `src/lib/profiles.ts`, `src/app/api/session/route.ts`, `src/app/api/profile/route.ts`, `src/app/api/chat/route.ts`, `src/lib/chat.ts`, `src/hooks/use-chat.ts`, `tests/session.test.mjs`, `tests/profiles.test.mjs`, `tests/owner.test.mjs` | F5 |
| Practice ledger, fills, notes | `src/app/api/practice/**`, `src/app/api/fills/**`, `src/app/api/notes/**`, `src/lib/practice-server.ts`, `src/lib/fills.ts`, `src/lib/notes.ts`, `src/hooks/use-portfolio.ts`, `src/hooks/use-live-portfolio.ts`, `src/hooks/use-execute-trade.ts`, `src/hooks/use-notes.ts`, `src/lib/types.ts`, `src/lib/deferred-signing.ts`, `tests/practice.test.mjs`, `tests/fills.test.mjs`, `tests/notes.test.mjs` | F6 |
| Portfolio and activity | `src/app/portfolio/page.tsx`, `src/app/activity/page.tsx`, `src/components/portfolio/**`, `src/components/HoldingRow.tsx`, `src/components/TransactionRow.tsx`, `src/components/AllocationBar.tsx` | R1 |
| Markets, asset, ticket, options cut | `src/app/markets/page.tsx`, `src/app/asset/[ticker]/page.tsx`, `src/app/buy/[ticker]/page.tsx`, `src/app/options/**` (deleted), `src/components/markets/**`, `src/components/TradeScreen.tsx` (deleted), `src/components/AssetModeSection.tsx`, `src/components/AssetPosition.tsx`, `src/components/CatalogList.tsx`, `src/components/MarketRow.tsx`, `src/components/OptionsChain.tsx` (deleted), `src/components/OptionsTradeScreen.tsx` (deleted), `src/hooks/use-execute-options-trade.ts` (deleted), `src/lib/options-trade.ts` (deleted), `src/components/EffectivePriceDisplay.tsx`, `src/components/PremiumBadge.tsx`, `src/components/WatchlistStarButton.tsx` | R2 |
| Discover and news | `src/app/page.tsx`, `src/app/news/page.tsx`, `src/components/discover/**`, `src/components/Hero.tsx` (deleted), `src/components/FeedList.tsx` (deleted), `src/components/DiscoveryRail.tsx` (deleted), `src/components/NewsList.tsx`, `src/hooks/use-news.ts`, `src/hooks/use-visit.ts` | R3 |
| Pre-IPO | `src/app/pre-ipo/page.tsx`, `src/components/PreIpo.tsx`, `src/components/PreIpoBuySheet.tsx`, `src/components/preipo/**`, `src/hooks/use-pre-ipo-buy.ts` | R4 |
| People | `src/app/leaderboard/page.tsx`, `src/app/investor/[id]/page.tsx`, `src/components/people/**`, `src/components/FollowButton.tsx`, `src/components/OnChainBadge.tsx`, `src/components/InvestorCard.tsx` | R5 |
| Rooms, auth sheet, wallet sheets | `src/app/asset/[ticker]/chat/page.tsx`, `src/components/ChatMessageRow.tsx`, `src/components/ChatRoomCard.tsx`, `src/components/ProfileSheet.tsx`, `src/components/ProfileButton.tsx`, `src/components/auth/**`, `src/components/ConnectWalletProvider.tsx`, `src/components/DeepLinkResumer.tsx`, `src/components/SolanaProvider.tsx` | R6 |
| Plans backend | `src/lib/plans.ts`, `src/lib/plan-parser.ts`, `src/lib/plan-evaluator.ts`, `src/app/api/plans/**`, `tests/plans.test.mjs`, `tests/plan-parser.test.mjs`, `tests/evaluator.test.mjs` | A1 |
| Plans UI | `src/components/plans/**`, `src/hooks/use-plans.ts`, `src/components/inbox/**`, `src/hooks/use-inbox.ts` | A2 |
| Agent backend | `src/lib/agent/**`, `src/app/api/agent/route.ts`, `tests/agent.test.mjs` | A3 |
| Agent UI | `src/app/agent/page.tsx`, `src/components/agent/**` | A4 |
| Jupiter Trigger | `src/lib/jupiter-trigger.ts`, `src/lib/jupiter-trigger-map.ts`, `src/components/plans/ArmPlanSheet.tsx`, `src/components/plans/CancelPlanSheet.tsx`, `tests/trigger-map.test.mjs`, `tests/jupiter-trigger.test.mjs` | A5 |
| Feed backend | `src/app/api/feed/**`, `src/lib/feed.ts`, `src/lib/news-server.ts`, `tests/feed.test.mjs` | S1 |
| Feed UI | `src/components/discover/VoteColumn.tsx`, `src/components/discover/CommentList.tsx`, `src/components/discover/StorySheet.tsx`, `src/hooks/use-feed.ts` | S2 |
| Email auth UI | `src/components/auth/EmailForm.tsx`, `src/components/auth/LinkWalletSheet.tsx` | S3 |

## 3. Tiers

**Thursday floor** (must be on trysolera.vercel.app by 3 pm CDT Thursday): F1–F6, R1–R6, A1–A4 with practice plans and the mock model, M1, P1–P3. Live plans ship with the notify-and-sign path only.

**Tier 2** (Wednesday night if the floor is green on a preview): A5 desktop Trigger arm and cancel; swap-on-drop and keyboard layout control; S1–S3.

**After Thursday:** iPhone Trigger continuations, `/api/trending`, Signals and Flows, the valuation ladder, per-wallet layouts, `proxy.ts`.

## 4. Tasks

Format: id · title · stage · depends on · acceptance. Descriptions point at doc sections; the implementer reads those sections in full before starting.

### Stage F — foundation

**F1 · Dark theme and palette remap** · foundation · depends on nothing.
Apply `design-system.md` §8 (the `globals.css` skeleton) with the rulings in §0.8 and §1 of this file: tokens, `@theme` remap of neutral/violet/indigo/emerald/rose/amber/sky (§5.1), the `--tk-1…8` ticker/avatar tokens with `TickerBadge`/`Avatar` taking a token name and setting `style`, the colour maps in the four `src/lib` files switched to token names, `celebrate.ts` colours, wallet-adapter modal overrides, `layout.tsx` `themeColor` `#0b0d16` and `color-scheme: dark`, the glass utilities (§2), the four button variants, `.chip`, `.seg`, `.field`, `.sheet`, `.toast`, `.row`, `.badge-solana`, `.avatar`, `.verified`, panel chrome (not placement). Do the manual edits in §5.2 that are not owned by later tasks (`bg-white`, scrims, `text-white` on live fills, `rounded-full` on avatars). Do not touch `PriceChart.tsx` (F4) or the shell files (F3).
Acceptance: every route renders on ink with no white or lavender surface (check `/`, `/markets`, `/asset/AAPLx`, `/portfolio`, `/pre-ipo`, `/leaderboard` in headless Chrome at 1440 and 390 wide); contrast pairs from §7 hold; gate green.

**F2 · Layout engine** · foundation · depends on nothing (parallel with F1).
`layout-engine.md` §1–§4 and §7 with rulings §0.8, §0.9, §0.19: `layout.ts` (pure), `panel-registry.ts` (with `estimateRows`), `use-page-layout.ts`, `use-media.ts`, `PanelGrid`, `Panel` (grid and `static` modes), `usePanelDrag` (insert + swap), `usePanelResize`, `usePanelSize`, `LayoutAnnouncer`, `ResetLayoutLink`, `panels.css` imported by `PanelGrid.tsx`, the six default layouts from §5 as registry data, `PHONE_TABS` from §6. Tests from §7.2.
Acceptance: `tests/layout.test.mjs` and `tests/panel-registry.test.mjs` pass (packing determinism, normalisation, swap compatibility, keyboard moves); a demo page is not required; gate green.

**F3 · Shell and primitives** · foundation · depends on F1.
`pages.md` §1 and `design-system.md` §4.2–4.14: `AppShell` → `.sidenav` (mark at 44px, five nav items plus Agent, account block, "Built on Solana" foot), `.top` (⌘K trigger, mode toggle `.mode`, wallet pill, Log in / Sign up buttons that open the auth sheet from R6 via a context), `.strip` (chips from live data only: tape mood from 24h moves, most traded, widest pre-IPO gap; no calendar chip), `.tape` (featured prices from the live-prices store, 30s refresh, pauses on hover and under reduced motion), `.tabbar` with the six phone tabs. Primitives in `src/components/ui/`: `Chip`, `Btn`, `Field`, `Seg`, `Sheet`, `Toast`, `Row`, `Verified`, `Kbd`. `TopBar.tsx` becomes the static-route back bar in the new chrome. `ModeStrip` and `SegmentedControl` deleted (update imports in files you own; list other files needing the change in your result).
Acceptance: shell renders at 1440, 1000 and 390 wide with no horizontal scroll; ⌘K opens a palette that searches the catalog and people (routes only, no notes/plans yet); mode toggle and wallet pill behave exactly as `MyWalletBadge` does today; gate green.

**F4 · Four chart ranges** · foundation · depends on nothing.
`pages.md` §4 and `platform-notes.md` §9 with ruling §0.10: `range=24h|30d|180d` on `api/price-history` (CoinGecko `days=1|30|180`, same cache and stale-while-revalidate, lazy backfill for 24h/180d), `live-prices.ts` history keyed by window, `useLivePriceFor(ticker, window)`, `RangeSwitch` (`24H 1W 1M 6M`), `PriceChart` stroke → `currentColor`, hourly labels for 24H, weekday labels for 1W, dates for 1M/6M.
Acceptance: `/api/price-history?ticker=AAPLx&range=24h` returns ≥ 200 points, `range=180d` ≥ 150 points, the asset chart switches ranges without a fetch on 1W/1M; gate green.

**F5 · Identity, sessions, profiles, rooms (backend)** · foundation · depends on nothing.
`backend.md` §2, §3.1–3.3 (profiles/messages migration parts of `supabase/port.sql`), rulings §0.1, §0.11, §0.12, §0.21: `owner.ts`, session claims with `kind`, `POST /api/session` bodies A and B, `auth-server.ts` (`getClaims` then `getUser`), `supabase-browser.ts` + `useAuthUser()`, `/api/profile` with nullable wallet, `user_id`, `owners=` (and `wallets=` alias), linking a wallet to an email account by signature, `/api/chat` owner-authored (additive), `use-session.ts` kinds, `use-profiles.ts` by owner. Write the whole `supabase/port.sql` file (all tables from §3 plus `position_notes` from §0.3 and the fills columns from §0.6, plus the §8.4 cron block commented out with instructions) so the user runs it once.
Acceptance: `tests/owner`, `session`, `profiles` pass including a body-B verification with a signed test JWT; with `port.sql` applied, `POST /api/session` body A still returns a token, `/api/profile?owners=` returns profiles, rooms still post from a wallet session; gate green.

**F6 · Practice ledger on the server, fills, notes** · foundation · depends on F5.
`backend.md` §4, §5, rulings §0.3, §0.6, §0.7, §0.22: `/api/practice/portfolio` (GET), `/api/practice/fills` (POST, server-side `applyFill` at the live price, returns the fill), `/api/fills` (POST live fills verified against the signature on-chain, GET public tape), `/api/notes`, `use-portfolio.ts` façade (local store when signed out, server when signed in, silent import on first sign-in), `useExecuteTrade` server branch, `Transaction` gains `note`, `wrongIf`, `horizon`, `leg`, `via`, `planId`; `deferred-signing.ts` continuation carries `note`; `use-live-portfolio.ts` posts live fills to `/api/fills` after `recordLiveTrade`.
Acceptance: signed-out practice trades still work exactly as today (`tests/portfolio`, `tests/trade` unchanged and green); signed-in practice buy hits the server and shows on `GET /api/practice/portfolio`; a note survives the iOS deferred path (unit test on the continuation); gate green.

### Stage R — redesign (parallel worktrees; each depends on F1, F2, F3; R2 also on F4 and F6; R1 on F6; R6 on F5)

**R1 · Portfolio and activity** — `pages.md` §3.9, §3.10, `layout-engine.md` §5.1. Grid page `portfolio`: hero (balance, KPI row, range chart via F4, allocation bar), since (from `solera:visit`, only rows with real sources), positions (HoldingRow with the note read-only plus an inline edit through `use-notes`, scorecard when a note has `wrong_if`, pin), a `plans` registry slot rendering an empty `Panel` with the copy "Plans arrive with the Agent" until A2 replaces it, recent fills. `/activity` as a static panel with the note under each fill. No Solera Score, no options.
Acceptance: `/portfolio` matches `partner-portfolio-desktop.png` in structure at 1440 (hero 8 | since 4 / positions 8 / fills), practice and live modes both render real numbers, empty states have no invented rows; gate green.

**R2 · Markets, asset card, ticket** — `pages.md` §3.2, §3.3, §3.5, §2.2, `layout-engine.md` §5.2. Grid page `markets`: list card (All / Stocks / Pre-IPO / Watchlist tabs, sparkline per row, the full catalog with search, "not yet trading" and thin-market labels), asset card (head, facts row: reference price from Pyth, on-chain gap, liquidity; chart with `RangeSwitch`; held-by from real holders; news; `TradeTicket` beside the chart), room card (uses R6's room component through its existing import path). `TradeTicket` rewrites the form half of `TradeScreen` with the optional thesis fields, keeps `useExecuteTrade`, pay-with, live labels, Solscan link, and reads `?plan=` and `?ref=`. `/asset/[ticker]` on desktop renders the grid with the ticker selected; on phones the asset card alone. `/buy/[ticker]` is the static ticket. Delete the options chain and route (§3.13).
Acceptance: structure matches `partner-markets-desktop.png`; a practice buy and a live quote both work from the embedded ticket; `/buy/AAPLx?side=sell` still works for the deeplink return; `/options/...` returns 404; gate green.

**R3 · Discover and news** — `pages.md` §3.1, §3.11, `layout-engine.md` §5.4. Grid page `discover`: feed (news rows and real fills merged; vote and comment controls render but post nothing until S2, with the copy "Voting opens with sign-in" only when S2 is absent), trending fallback card, welcome panel when signed out. `/news` as a static panel with the same rows. Delete `Hero`, `FeedList`, `DiscoveryRail`.
Acceptance: no placeholder headlines, thumbnails hide when broken, feed scrolls inside a sized card beside Trending; gate green.

**R4 · Pre-IPO** — `pages.md` §3.6, `layout-engine.md` §5.3. Grid page `preipo`: markets card filtered to pre-IPO, asset card with the two-issuer comparison and the ticket (live-only buy through the existing `usePreIpoBuy`), comparison card. Leg optional in the ticket. Ladder slot reserved, empty.
Acceptance: both issuers' real prices and implied valuations render, buy sheet flow unchanged, disclosures present; gate green.

**R5 · People** — `pages.md` §3.7, §3.8, `layout-engine.md` §5.5. Grid page `leaderboard`: people rows (real wallets, 7-day move, top holding, follow, claimed name and handle, verified only when a profile exists), holder-hover highlight across cards. `/investor/[id]` static profile panel with "Fills on Solera" from `GET /api/fills?owner=`.
Acceptance: no sample investors anywhere; follow persists; gate green.

**R6 · Rooms, auth sheet, wallet sheets** — `pages.md` §1.7, §3.4, `design-system.md` §4.7. `AuthSheet` with Log in / Sign up tabs (email form fields present but disabled with "Email sign-up arrives Wednesday" until S3 lands) and "Continue with wallet" (opens the existing connect flow, then `ProfileSheet`); room page restyled as a static panel; `ChatRoomCard` becomes the desktop room card; `ConnectWalletProvider`, `DeepLinkResumer`, `ProfileSheet` restyled on `.sheet`.
Acceptance: connect, claim a profile, post in a room all work in the new chrome on desktop and at 390 wide; gate green.

### Stage A — agent and plans

**A1 · Plans backend and evaluator** · depends on F5, F6. `backend.md` §6, §8 with rulings §0.4, §0.5: `plans.ts` condition schema and `describe()`, `plan-parser.ts`, `/api/plans` (GET, POST, PATCH, DELETE, `/:id`, `/preview`, `/health`, `/evaluate` with `PLAN_EVALUATOR_SECRET`), `plan-evaluator.ts` (practice fills through `practice-server.ts`; notify rows into `inbox`), the browser fallback caller (60 s while a tab is open).
Acceptance: parser tests for the three canonical prompts and ten variants; evaluator test fills a practice plan when the mocked price crosses; `/api/plans/health` reports `serverWatch`; gate green.

**A2 · Plans UI and inbox** · depends on A1, R1, R2. `agent-ux.md` §2, §3.3: `PlansCard` (replaces R1's slot), rows and states, `PlanEditorSheet`, inbox badge and rows in the top bar, `?plan=` prefill hook consumed by `TradeTicket`, cancel from the panel. Live rows show the notify path only until A5.
Acceptance: arm a practice plan from the composer, see it fill when the evaluator runs (use the browser fallback), cancel one; a notify plan produces an inbox row whose link opens the prefilled ticket; gate green.

**A3 · `/api/agent` with the mock model** · depends on A1. `backend.md` §7 with ruling §0.4, §0.23: model abstraction, `MockModel`, tools with strict JSON schemas over the existing routes, the run loop with a hard cap of 6 tool calls, the system prompt verbatim, `ANTHROPIC_API_KEY` slot with `@anthropic-ai/sdk` (install; read the `claude-api` skill before writing the real model adapter).
Acceptance: `tests/agent.test.mjs` drives the three canonical prompts through the mock and asserts the proposed plan cards and the news tool call; with no key the route answers with the mock and says so; gate green.

**A4 · Agent tab** · depends on A2, A3. `agent-ux.md` §1, §4, `layout-engine.md` §5.6: `/agent` grid page with `AgentPanel` (composer, starters, message types, PLAN CARD, ORDER CARD, NEWS CARD, PRICES CARD) beside `PlansCard`; thread mirrored per §0.17.
Acceptance: each canonical prompt yields the right card and Confirm arms a practice plan; signed-out state explains sign-in; gate green.

**A5 · Jupiter Trigger (desktop)** · tier 2 · depends on A2. `backend.md` §9, `agent-ux.md` §3.1, §3.4, ruling §0.14: `jupiter-trigger.ts`, `jupiter-trigger-map.ts`, `ArmPlanSheet`, `CancelPlanSheet`, client-side sync of `triggerState`. iPhone continuations are after Thursday.
Acceptance: mapping tests for stop-entry and stop-loss; arm sheet reaches the Phantom challenge with a real wallet; cancel path tested against the docs' shapes with a mock; gate green.

### Stage S — social (tier 2)

**S1 · Feed backend** · depends on F5. `backend.md` §10 with ruling §0.20: posts, votes, comments routes, `GET /api/feed`, hot ranking, `news-server.ts` cache lookup.
**S2 · Feed UI** · depends on R3, S1. `VoteColumn`, `CommentList`, `StorySheet`, `use-feed.ts`.
**S3 · Email and password** · depends on F5, R6. `EmailForm` (sign up, log in, reset), `LinkWalletSheet`, the Supabase dashboard checklist for the user (Email provider on, confirmation off, redirect URLs).

### Stage M — mobile

**M1 · Phone shell** · depends on R1–R6. `layout-engine.md` §6, `design-system.md` §4.14: six tabs, per-tab stacks in registry order, sheets from the bottom, tape height, safe areas, no horizontal scroll at 390; verified on the user's iPhone via a preview URL.

### Stage P — polish

**P1 · Accessibility and performance** — focus order in the grid, 44px hits, reduced motion, glass fallbacks, bundle check (no `fonts.css`, no `data-bounty`), Lighthouse ≥ 90 accessibility on `/markets`.
**P2 · Copy, disclosures, brand, README, demo** — every disclosure sentence present on every trade surface; brand skill rewritten from `design-system.md`; README updated; demo-video shot list in `docs/demo.md`.
**P3 · Review and release** — a code-review workflow over the diff, then preview deploy, user check on desktop and iPhone, promotion to production.

## 5. What the user must do, and when

1. Before F6 lands on a preview: run `supabase/port.sql` in the SQL editor (F5 writes it).
2. Before A1's evaluator is live in production: set `PLAN_EVALUATOR_SECRET` in Vercel and run the pg_cron block from `backend.md` §8.4 (also in `port.sql`, commented).
3. Before S3: enable the Email provider with confirmation off; add `https://trysolera.vercel.app` and `http://localhost:3000` to the redirect URLs.
4. Whenever: `ANTHROPIC_API_KEY` in `.env.local` and Vercel.

## 6. Open questions that block nothing (defaults in §1) and the one that does

- Demo video: filming a real Trigger arm and cancel moves at least $10 into Jupiter's vault (returned on cancel). Default: the video stops at the Phantom challenge screen unless the user says spend it. Blocks nothing until A5.
