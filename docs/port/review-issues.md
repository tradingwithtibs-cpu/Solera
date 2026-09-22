# Review issues on the port docs (Sept 22, 2026)
Two reviewers (consistency, feasibility) over docs/port/*.md. Resolutions are recorded in plan.md.

## blocker

### (pages.md) Identity model contradicts backend.md. pages.md §1.7, §5.2, §5.3, §5.6 and risk 6 use prefixed actor ids `wallet:<base58>` / `user:<uuid>`, a `lib/actor-server.

**Issue:** Identity model contradicts backend.md. pages.md §1.7, §5.2, §5.3, §5.6 and risk 6 use prefixed actor ids `wallet:<base58>` / `user:<uuid>`, a `lib/actor-server.ts actorFromHeader()` that accepts a raw Supabase JWT in Authorization, a `users_wallets` link table, and re-keying an email user's fills/notes to `wallet:<addr>` on link. backend.md §2.1–2.5 defines a bare `owner` string (base58 or auth.users.id), the UUID kept forever with `profiles.wallet` as the link attribute, rows never re-keyed, and `requireOwner()` in `lib/auth-server.ts` that accepts ONLY the HMAC session token (the Supabase access token is exchanged once at POST /api/session body B). Two implementers would build incompatible routes and tables.

**Suggestion:** Make backend.md §2 the single identity spec. In pages.md: replace every `wallet:<addr>`/`user:<uuid>` with `owner`; delete §5.6 (`actorFromHeader`, `users_wallets`) and point to `requireOwner()` / `/api/session` body B; delete risk 6's re-key step; in §1.7 say the sheet calls `signInWithPassword` then `POST /api/session { supabaseAccessToken }` and stores the HMAC token via `saveSession()`.

### (pages.md) Social/fills schema and routes contradict backend.md. pages.md §5.2 defines one `fills` table (`actor`, `mode`, `thesis jsonb`, `mint`), `votes.post_id text` ('

**Issue:** Social/fills schema and routes contradict backend.md. pages.md §5.2 defines one `fills` table (`actor`, `mode`, `thesis jsonb`, `mint`), `votes.post_id text` ('news:<id>'|'fill:<uuid>'), `comments` body 3–280, and routes `POST /api/fills` (both modes), `POST /api/vote`, `GET/POST /api/comment`, `GET /api/feed?tab=news|hot|all|mine&actors=&since=`, tape = last 6 items of `/api/feed?tab=all`. backend.md §3.5/§3.7/§5/§10 defines `practice_fills` + `live_fills` (`owner`, `note`/`wrong_if`/`leg` columns, no `mint`), a `posts` table keyed by uuid with `ref = sha256(url)` created on first vote, `votes.post_id uuid` FK, comments 1–280, routes `POST /api/practice/fill` (practice) and `POST /api/fills` (live only, on-chain verified), `POST /api/feed/vote`, `GET/POST /api/feed/comments`, `GET /api/feed?sort=hot|new&ticker=`, `GET /api/tape`. Field limits also differ (`wrongIf` 140 vs 160; `via` has `copy` only in backend; note-less fills are in the feed in pages but only on the tape in backend). Backend's `/api/feed` has no `tab=news|mine|following`, `actors=` or `since=` filters, which Discover's five tabs, the `since` card FOLLOWING row and `/investor/[id]` 'Fills on Solera' all need.

**Suggestion:** Rewrite pages.md §5.2 to reference backend §3.5/§3.7/§5.4/§10 shapes verbatim (drop the SQL there). Then extend backend §10 with what the pages need and nobody currently owns: `GET /api/feed?tab=news|hot|all|following|mine&actors=&since=&limit=` (news tab = /api/news joined with post scores; all/following/mine over the two fill tables via `/api/tape` semantics), `myVote` in the row, and comment min length 1. Align limits: wrongIf 160, via includes `copy`.

### (backend.md) Position notes have no backend. pages.md §2.3/§5.3 require a `position_notes` table (`note`, `horizon`, `wrong_if`, `wrong_hit_at`, `pinned`, `sort_order`) and

**Issue:** Position notes have no backend. pages.md §2.3/§5.3 require a `position_notes` table (`note`, `horizon`, `wrong_if`, `wrong_hit_at`, `pinned`, `sort_order`) and `GET/PUT /api/notes`, mirrored in localStorage `solera:notes`; the portfolio `positions` card's WHY/HORIZON/WRONG IF editing, hero pinned chips, the `since` card's YOU WROTE row, the ⌘K `my wrong-ifs` intent and agent-ux's wrong-if prompts all depend on it. backend.md has no such table or route, its `PlanCondition`/fills carry `note` and `wrongIf` but no `horizon`, `pinned`, `sortOrder` or `wrongHitAt`, and 'IT HAPPENED' (wrongHitAt) has nowhere to be stored.

**Suggestion:** Add to backend.md §3 a `position_notes (owner, key, note ≤280, horizon ≤24, wrong_if ≤160, wrong_hit_at, pinned, sort_order, updated_at, pk (owner,key))` table with RLS (no anon policy) and §x routes `GET /api/notes` / `PUT /api/notes` behind `requireOwner()`, plus a `tests/notes.test.mjs` row in §13; or, if it is out of scope for Thursday, say so in both docs and make pages.md §2.3 localStorage-only with the 'in this browser' label.

### (pages.md) `/api/agent` contract contradicts backend.md and agent-ux.md. pages.md §5.5: `POST /api/agent { messages, mode: "preview" | "chat", context } → { reply, tools:

**Issue:** `/api/agent` contract contradicts backend.md and agent-ux.md. pages.md §5.5: `POST /api/agent { messages, mode: "preview" | "chat", context } → { reply, tools: string[], actions: Action[] }` with actions `plan_preview` / `open_ticket` / `open_ticker` rendered inline (§3.12). backend.md §7.1: `{ messages, mode: 'practice'|'live', context?: { ticker?, page? } } → AgentResponse { model, reply, cards[], toolTrace, usage }` with card kinds plan/ticket/news/prices/plans/explain. agent-ux.md §2.1 then relies on pages.md's non-existent preview mode ('`POST /api/agent` with `mode: "preview"` semantics (a `create_plan`-only turn, pages.md §5.5)') for the Plans composer's live 'Understood:' line, and §1.4 sends `context.pendingDraft` while backend §7.6 calls it `pendingSize` and puts it 'in the reply's hidden field' that `AgentResponse` does not have.

**Suggestion:** backend.md §7.1: add `context.intent?: 'chat' | 'plan_preview'` (plan_preview = one model turn restricted to `create_plan`/text, no other tools) and `pendingDraft?: string` on both the request `context` and `AgentResponse` (rename §7.6's `pendingSize`). pages.md §5.5: replace its shape with a pointer to backend §7.1 and rename `actions` → `cards` with backend's kinds. agent-ux §2.1/§1.4: cite `context.intent: 'plan_preview'` and `pendingDraft`.

### (pages.md) Plans executor and route names contradict backend.md/agent-ux.md. pages.md §5.5 says the practical executor is `POST /api/plans/run` called from any open tab wi

**Issue:** Plans executor and route names contradict backend.md/agent-ux.md. pages.md §5.5 says the practical executor is `POST /api/plans/run` called from any open tab with a daily cron sweep and that the card foot 'must say checked while Solera is open'; §3.9's plans foot has no cadence; OQ12 and risk 10 repeat `/api/plans/run`. backend.md §8 defines `POST /api/plans/evaluate?pass=minute|daily` (pg_cron + pg_net primary, secret-gated) and `?scope=self` for the browser fallback, `GET /api/plans/health`; agent-ux §2.5 uses those and the foot 'checked about once a minute' + 'server watch: on/off'. pages.md's `PlanRow` (§5.5) also uses `executor`, `triggerOrderKey`, `filled.quantity` and omits `proposed`, where backend §3.4 has `execution`, `trigger_order_id`, `filled.shares` and `proposed`.

**Suggestion:** pages.md §5.5: delete `/api/plans/run` and the PlanRow interface; reference backend §3.4 columns and §6.3/§8.3/§8.5 routes (`GET /api/plans`, `GET /api/plans/:id`, `PATCH /api/plans/:id`, `DELETE`, `POST /api/plans/evaluate?scope=self`, `GET /api/plans/health`). pages.md §3.9 plans foot: use agent-ux §2.5's two mode feet verbatim. Resolve OQ12 and risk 10 by pointing at backend §8.

### (pages.md) §5.2–5.6 define a second, incompatible social backend: tables fills/votes/comments keyed by actor text with post_id 'news:<id>'|'fill:<uuid>', routes GET /api/f

**Issue:** §5.2–5.6 define a second, incompatible social backend: tables fills/votes/comments keyed by actor text with post_id 'news:<id>'|'fill:<uuid>', routes GET /api/feed?tab=news|hot|all|mine&actors=&since=, POST /api/fills (practice and live), POST /api/vote, GET/POST /api/comment, and the tape reading /api/feed?tab=all. backend.md §3/§5/§10 defines posts (uuid, unique (kind, ref)), practice_fills + live_fills, votes(post_id uuid), comments, GET /api/feed?sort=hot|new&ticker=, POST /api/feed/posts|vote|comments, POST /api/practice/fill (practice) + POST /api/fills (live only), GET /api/tape. pages.md says backend is authoritative 'where they overlap' but then specifies SQL and endpoint shapes anyway, so an implementer assigned the Discover feed, the tape, the investor page's 'Fills on Solera', or the since card's FOLLOWING row from pages.md will build routes that do not exist. backend's feed also has no Following/Mine tabs, no actors= or since= filters, no per-actor fill listing, and only shows news that someone already voted on and fills that carry a note, none of which pages.md's UI expects.

**Suggestion:** Delete pages.md §5.2–§5.6 and replace with a one-paragraph pointer to backend.md §3, §5, §10 plus the exact call each card makes. Then add to backend.md the three reads the pages need and cannot get today: GET /api/tape?owners=a,b&since=<ms> (per-actor fills for /investor/[id], Following, and the since card; cap owners at 40), a feed 'news' tab that joins the cached /api/news list with scores by ref (server-side, no client-supplied posts), and a 'mine' filter that uses the session owner. Drop Hot/Everyone/Following/Mine as five server tabs for Thursday: ship News (joined scores) and Everyone (backend sort=new) with Following/Mine filtered client-side from GET /api/tape?owners=.

### (pages.md) Identity contradicts backend.md in four places an implementer must pick between: (1) §1.7/§5.6 actor ids are 'wallet:<base58>' | 'user:<uuid>' vs backend §2.1 b

**Issue:** Identity contradicts backend.md in four places an implementer must pick between: (1) §1.7/§5.6 actor ids are 'wallet:<base58>' | 'user:<uuid>' vs backend §2.1 bare base58 or bare uuid with public.is_owner(); (2) §1.7 says routes accept either the wallet HMAC token OR a raw Supabase JWT in Authorization and §5.6 names lib/actor-server.ts actorFromHeader, vs backend §2.3–2.4 where email users exchange the Supabase access token at POST /api/session for the same HMAC token and lib/auth-server.ts requireOwner() reads only that; (3) §10 risk 6 says fills/notes are re-keyed from user:<id> to wallet:<addr> on link, vs backend §2.1 'rows never re-key'; (4) §1.7 says the existing anon client's persistSession must become true, vs backend §2.6 / platform-notes §7 which create a second browser client and leave the chat client alone. §5.5 also cites Jupiter Trigger v1 (/trigger/v1/createOrder, getTriggerOrders) and a different POST /api/agent contract ({messages, mode:'preview'|'chat'} → {reply, tools, actions}) while backend/agent-ux use V2 and {model, reply, cards, toolTrace}.

**Suggestion:** Strike §1.7's client/server auth mechanics, §5.5 and §5.6 from pages.md and replace with: 'identity = backend.md §2 (bare owner string, HMAC session for both kinds via POST /api/session body B, second browser client from supabase-browser.ts, no re-keying); agent = backend.md §7; plans = backend.md §6/§9 (Trigger V2)'. Keep only the sheet's fields and copy in pages.md §1.7. Add one sentence to backend.md §2.6 stating that use-auth.ts calls signUp → signInWithPassword → POST /api/session {supabaseAccessToken} → saveSession(), so the two docs name the same hook.

### (backend.md) §4.4 says signed-in practice fills bypass executeTrade()'s practice branch and 'useExecuteTrade calls recordTrade directly with the server's fill', but the live

**Issue:** §4.4 says signed-in practice fills bypass executeTrade()'s practice branch and 'useExecuteTrade calls recordTrade directly with the server's fill', but the live path is TradeScreen.tsx:127-148 → useExecuteTrade().run() → executeTrade(params) (client-priced at getEffectivePrice after a 1.4 s delay, trade.ts:85-100) → onFilled → useActivePortfolio().recordTrade({quantity, pricePerShare, totalValue, txId}). As written, the façade's recordTrade would POST /api/practice/fill with a client-computed quantity and the server would re-price from Jupiter Price v3 (§4.3 step 2) and run applyFill(), whose guard Math.abs(quantity*pricePerShare − totalValue) > 1e-7 (ledger.ts:23) rejects any pair not computed at the same price with 'This order is invalid' (400); if the implementer instead keeps the local applyFill and adds the POST, the fill applies twice (local store and server row) and the two ledgers drift. The document never says which of quantity/amountUsd the client sends or where the 1.4 s simulated delay goes.

**Suggestion:** Specify the branch explicitly and leave trade.ts untouched: in useExecuteTrade.run(), when !isLive && session.signedIn, skip executeTrade() and call a new executeServerPracticeFill({ticker, side, amountUsd | shares, note, wrongIf, leg, via, copiedFrom, expectedVersion}) in src/lib/practice-client.ts that POSTs /api/practice/fill and maps the reply to the existing TradeResult shape (mode 'practice', txId 'PRACTICE<id>'). The onFilled callback then calls the ServerPracticeStore's recordTrade, which only replaces the snapshot with the reply's portfolio (no second POST, no local applyFill). For buys send amountUsd (the dollar amount the slider holds); for sells send shares; the server derives the other from its own price so applyFill's identity check always holds. Add a test: TradeScreen practice path with a session never calls executeTrade.

## major

### (layout-engine.md) Panel class names: each doc claims the other owns them and they do not match. design-system.md §4.1 and §8 (block 6) define `.panel-grip`, `.panel-resize`, `.pa

**Issue:** Panel class names: each doc claims the other owns them and they do not match. design-system.md §4.1 and §8 (block 6) define `.panel-grip`, `.panel-resize`, `.panel-badge`, `.panel.is-dragging`, `.is-over-swap`, `.is-over-before/after`, `.is-resizing`, `.panel-ghost`, `.reset-layout` and state 'the panel class names … are the layout doc's, not the partner's ly-*'. layout-engine.md §2.1, §2.3, §4.3 and its verification log use `.ly-grip`, `.ly-resize`, `.ly-badge`, `.ly-dragging`, `.ly-over-*`, `.ly-resizing`, `.ly-ghost`, `.ly-reset`, `.ly-noselect` and state these 'are the ones defined in the companion design-system.md (sections 1.7, 4.1, 4.14, 6)'. Neither is true. Additionally design-system §10 says the layout doc 'still shows the partner's violet fallbacks (#7c3aed10, #7c3aed44)' — layout-engine §4.3 actually uses `#482efa10` and `var(--glow-action)` (the 7c3aed values are in partner terminal.css:365-367), so that risk is stale.

**Suggestion:** Adopt design-system's names (`ly-` is the partner's prefix and the audit says the partner's layout.js is replaced): rewrite layout-engine §2.1 (`class="panel-grip"`), §2.3 (`panel-resize`, `panel-badge`, `is-resizing`), §2.1 step 2/5 (`is-dragging`, `is-over-before/after/swap`), §4.3 CSS and the verification-log line. Delete the '#7c3aed' sentence from design-system §10.

### (design-system.md) Two files own `.panel` and `.panel-grid`, with different collapse mechanisms. design-system §8 block 6 defines the full `.panel` chrome and block 14 defines `.p

**Issue:** Two files own `.panel` and `.panel-grid`, with different collapse mechanisms. design-system §8 block 6 defines the full `.panel` chrome and block 14 defines `.panel-grid` (grid template, gap, padding, max-width) plus `@media (max-width: 1099px) { .panel-grid > .panel { grid-column: 1 / -1 !important; grid-row: auto !important; height: auto !important } }`. layout-engine §4.3 `panels.css` redefines `.panel` (background, border, radius, animation, container-type) and `.panel-grid` in full, and §1.5 promises placement 'so the tablet and phone media queries can override placement with ordinary later rules, no !important fight' using `@media (width < 1101px) { .panel { grid-area: auto; grid-column: 1 / -1; height: auto } }`. Whichever file loads last wins, and the `!important` block defeats layout-engine's approach. layout-engine §4.1 also says panels.css is 'imported from globals.css' but the §8 skeleton has no `@import` for it.

**Suggestion:** Split ownership explicitly: globals.css owns panel chrome (colours, head, foot, handle look) and nothing about placement; panels.css owns `.panel-grid`, `grid-area` placement, `data-sized` body scroll, phone `order`/`data-phone-hidden`, and every breakpoint collapse without `!important`. Remove `.panel-grid`, the `@media (max-width: 1099px) .panel-grid > .panel` block and the `@media (max-width: 767px) .panel-grid/.panel` block from the design-system skeleton; add `@import "../components/panels/panels.css";` after the Tailwind import; in layout-engine §4.3 drop `background/border/border-radius/animation` from `.panel` so it does not restate chrome.

### (design-system.md) Desktop breakpoint is off by one between docs. layout-engine §1.1 `DESKTOP_MIN_PX = 1101`, `matchMedia('(min-width: 1101px)')`, collapse at ≤1100px (`@media (wi

**Issue:** Desktop breakpoint is off by one between docs. layout-engine §1.1 `DESKTOP_MIN_PX = 1101`, `matchMedia('(min-width: 1101px)')`, collapse at ≤1100px (`@media (width < 1101px)`), matching partner `layout.js:15` and `terminal.css:545` (`max-width: 1100px`). design-system §4.14 says '≥ 1100px: sidenav, top bar, strip, the 12-column .panel-grid with handles', '768–1099px: sidenav gone', and its CSS uses `@media (max-width: 1099px)`; pages.md §1.2 says 'Sidenav (≥ 1100px)'. At exactly 1100px the CSS renders the sidenav and visible grips while the JS media query reports not-desktop, so the handles are drawn but inert.

**Suggestion:** Use 1100/1101 everywhere: design-system §4.14 → '≥ 1101px' / '768–1100px', and every `@media (max-width: 1099px)` in §4.1, §8 blocks 6 and 14 → `(max-width: 1100px)`; pages.md §1.2 → '≥ 1101px'.

### (pages.md) Chart-range API contradicts platform-notes.md and the audit decision wording. pages.md §4: `GET /api/price-history?range=24h|30d|180d`, 1W = last quarter of the

**Issue:** Chart-range API contradicts platform-notes.md and the audit decision wording. pages.md §4: `GET /api/price-history?range=24h|30d|180d`, 1W = last quarter of the 30d series (~28 points at ~6 h after the 120-point thinning), caches 5 min / 15 min / 6 h, store keys `"30d"|"24h"|"180d"`. platform-notes §9: `?range=24h|1w|1m|6m` mapping to `days=1|7|30|180` (1W = 169 hourly points from days=7), `unstable_cache` 300 s for 24h / 900 s for the rest plus a `Cache-Control: s-maxage` header. The decision text says '5-minute data for 1 day, daily for 180 days' and is silent on 1W. Two different route contracts and TTLs for the same file.

**Suggestion:** Pick one and state it in both docs. Recommend pages.md's three fetches (24h / 30d / 180d, lazy per ticker for 24h and 180d, keeping the boot burst at 8) with 1W derived from the 30d series; note the ~6 h resolution, and if that is unacceptable add a lazy `days=7` fetch as a fourth key. Use platform-notes' TTLs (300 s / 900 s / 900 s, or 6 h for 180d if wanted) and add the `s-maxage` header to pages.md §4.

### (pages.md) Supabase Auth browser client is designed three ways. pages.md §1.7: `src/hooks/use-auth.ts` around `getSupabaseAnon()` and 'the anon client is created with pers

**Issue:** Supabase Auth browser client is designed three ways. pages.md §1.7: `src/hooks/use-auth.ts` around `getSupabaseAnon()` and 'the anon client is created with persistSession: false today, which must become true for Auth' (i.e. mutate the shared client that `use-chat.ts:63-68` also uses for Realtime). backend.md §2.6: a new `src/lib/supabase-browser.ts` singleton with `persistSession: true, autoRefreshToken: true` and a `useAuthUser()` hook. platform-notes §7: 'Create a second browser client for auth (`getSupabaseBrowserAuth()`)'.

**Suggestion:** Adopt backend §2.6 (separate `src/lib/supabase-browser.ts`, `useAuthUser()`); pages.md §1.7 should name those and drop the persistSession flip on `getSupabaseAnon()`; platform-notes §7 should use the same function name.

### (pages.md) Rooms for email accounts: backend.md §2.7 makes `messages` owner-authored (adds `owner`, drops `wallet` NOT NULL, renames `ChatMessage.wallet` → `author`, resol

**Issue:** Rooms for email accounts: backend.md §2.7 makes `messages` owner-authored (adds `owner`, drops `wallet` NOT NULL, renames `ChatMessage.wallet` → `author`, resolves names via `/api/profile?owners=`), so email accounts can post. pages.md §3.2/§3.4 and OQ6 default to wallet-only rooms ('email accounts see Link a wallet to post in rooms') and §3.4 keeps `m.wallet === address` semantics from `chat/page.tsx:96`.

**Suggestion:** Either pages.md adopts backend §2.7 (rooms post as `owner`; the gate copy becomes 'Sign in to post'; `mine` = `m.author === owner`; remove OQ6) or backend drops the `messages` migration and `/api/chat` owner change. Recommend the former since the audit's priority 3 gives email accounts the social layer.

### (backend.md) Fills schema excludes pre-IPO tokens that pages.md records. `practice_fills.ticker` and `live_fills.ticker` are `not null check (ticker ~ '^[A-Z0-9.]{1,12}x$')`

**Issue:** Fills schema excludes pre-IPO tokens that pages.md records. `practice_fills.ticker` and `live_fills.ticker` are `not null check (ticker ~ '^[A-Z0-9.]{1,12}x$')` with no `mint` column, yet both tables have `leg in ('gap','mark')` ('pre-IPO buys only', §4.3 step 1) and `toTriggerOrder` rejects `leg`. pages.md §2.2 row 6 posts `POST /api/fills` after `usePreIpoBuy().run` (a real path today), §2.3 carries `leg`, `gapAtBuy`, `refAtBuy`, and §3.1/§2.4 render `thesis: gap closes` chips and the gap scorecard from those fills. With backend's constraints a pre-IPO live fill can never be inserted, so the `leg` column is dead and the feed/scorecard features in pages.md cannot exist.

**Suggestion:** Add `mint text`, `gap_at_buy double precision`, `ref_at_buy double precision` to `live_fills` (and `practice_fills` if OQ3 in pages.md is accepted), replace the ticker NOT NULL with `check (ticker is not null or mint is not null)` and `ticker` regex only when non-null; extend `validateFillInput` and the `/api/fills` on-chain check (fee payer = wallet still holds for a pre-IPO Ultra swap). Otherwise state in both docs that pre-IPO fills do not reach the tape for Thursday and remove the leg chip from pages.md §3.1.

### (backend.md) Notify one-tap href disagrees with agent-ux.md. backend §3.6 (`href — e.g. /asset/TSLAx?plan=<id>`), §8.3 step 4 and §9.8 use `/asset/<ticker>?plan=<id>` and sa

**Issue:** Notify one-tap href disagrees with agent-ux.md. backend §3.6 (`href — e.g. /asset/TSLAx?plan=<id>`), §8.3 step 4 and §9.8 use `/asset/<ticker>?plan=<id>` and say 'the asset page reads plan'. agent-ux §3.3, §6.11 and OQ1 use `/buy/{ticker}?plan={id}` because `/buy/[ticker]` already parses `?ref`/`?side` under Suspense (`buy/[ticker]/page.tsx:6`, `TradeScreen.tsx:29-31`), and pages.md makes `/asset/[ticker]` the markets grid on desktop.

**Suggestion:** Change backend §3.6 comment, §8.3 step 4 and §9.8 to `/buy/<ticker>?plan=<id>` and note that `TradeTicket` (pages.md §2.2) reads `plan` via the existing `useSearchParams`; close agent-ux OQ1.

### (backend.md) Routes the UI docs call are missing from the route list. agent-ux §1.6, §3.2 step 3 and §3.3 step 3 fetch `GET /api/plans/:id` (card fields, sheet reconstructio

**Issue:** Routes the UI docs call are missing from the route list. agent-ux §1.6, §3.2 step 3 and §3.3 step 3 fetch `GET /api/plans/:id` (card fields, sheet reconstruction after a Phantom hop, ticket prefill); §2.5 and backend §8.5 read `GET /api/plans/health`; §9.6 sends `PATCH /api/plans/:id { status: 'cancelled', trigger: { withdrawSignature } }`. backend §6.3 lists only `GET /api/plans` (list), `POST`, `PATCH` variants without `withdrawSignature`, and `DELETE`; §6.3 also has no way to edit a `proposed` plan's condition, so agent-ux §1.6 must POST a new plan and DELETE the old one just to attach a note.

**Suggestion:** Add to §6.3: `GET /api/plans/:id` (owner's row, 404 otherwise; anonymous read allowed only for `?plan=` links if the user wants stranger links to work — else require the session), `GET /api/plans/health → { lastEvaluatedAt, scheduledWatch: boolean }`, the `trigger.withdrawSignature` PATCH body, and `PATCH /api/plans/:id { condition, text }` allowed while `status = 'proposed'` (re-validate, recompute `summary`/`execution`). Add matching rows to §13.2.

### (agent-ux.md) Jupiter JWT handling contradicts backend.md and the two docs define different continuation shapes. backend §9.4: JWTs are 'in memory only (Jupiter: never localS

**Issue:** Jupiter JWT handling contradicts backend.md and the two docs define different continuation shapes. backend §9.4: JWTs are 'in memory only (Jupiter: never localStorage)' and its iOS continuations are `{ kind: "trigger-auth", planId, wallet, challenge }` / `{ kind: "trigger-deposit", planId, wallet, requestId, order }`. agent-ux §3.2 stores the JWT (`token`, `tokenExp`) inside the `trigger-deposit` continuation in `localStorage[solera:deeplink-pending]` for up to 15 min (necessary, since the reply lands in a new tab, `DeepLinkResumer.tsx:47-50`), adds `issuedAt`, and §3.4 adds a third `trigger-withdraw` kind that backend never defines. agent-ux flags it as OQ5; backend does not acknowledge it.

**Suggestion:** backend §9.4: adopt agent-ux's three continuation variants verbatim (`trigger-auth`, `trigger-deposit` with `token`/`tokenExp`, `trigger-withdraw`), state the 15-minute localStorage exposure and that the token is wiped on consume/expiry, and add it to §15 risks; or decide notify-only on iOS for Thursday and say so in both docs.

### (pages.md) Agent tab copy and starter chips are superseded by agent-ux.md but not updated. pages.md §3.12 lists seven prompt chips ('Who is buying what I hold?', 'Which of

**Issue:** Agent tab copy and starter chips are superseded by agent-ux.md but not updated. pages.md §3.12 lists seven prompt chips ('Who is buying what I hold?', 'Which of my wrong-ifs is closest to firing?', 'Read my TSLAx thesis back to me', 'How liquid is TSLAx right now?', 'Is the NYSE open right now?') that need `get_investors`/`get_notes`/`get_market_status` tools absent from backend §7.4; subtitle 'mock model · replies are canned'; foot 'Composed by Claude from live figures…'; `?plan=` and `?q=` behaviour. agent-ux §1.2–1.3 replaces these with the three canonical prompts + `what's NVDAx at?` / `my plans` / `buy $50 of SPYx now`, subtitle 'offline parser · no model attached yet · never signs', foot 'Composed from live figures…', and explicitly says pages.md's wording is superseded. agent-ux §1.8 also adds a mock-grammar rule (`buy $N of X now` → `place_practice_order`) that backend §7.6's table lacks.

**Suggestion:** pages.md §3.12 and §8: replace the chip table, subtitle and foot with agent-ux §1.2–1.3/§4 text and point to agent-ux as owner of the Agent surface. backend §7.6: add the `buy $N of X (now)` → `place_practice_order` row and the 'Above or below $345?' direction question to the mock table so tests pin them.

### (layout-engine.md) Storage key for the 'since you last looked' snapshot differs: layout-engine §5.1 names it `solera:last-visit`; pages.md §3.9 and §5.1 (`use-visit.ts`) and platf

**Issue:** Storage key for the 'since you last looked' snapshot differs: layout-engine §5.1 names it `solera:last-visit`; pages.md §3.9 and §5.1 (`use-visit.ts`) and platform-notes §10 use `solera:visit`. platform-notes flags the inconsistency but it is still unresolved in the source docs.

**Suggestion:** Change layout-engine §5.1 to `solera:visit` (platform-notes' recommendation) and drop the 'one inconsistency to settle' sentence from platform-notes §10 once done.

### (platform-notes.md) Server vs client `page.tsx` guidance conflicts with layout-engine.md and today's code. platform-notes §1.6 says 'Keep page.tsx files as Server Components and pu

**Issue:** Server vs client `page.tsx` guidance conflicts with layout-engine.md and today's code. platform-notes §1.6 says 'Keep page.tsx files as Server Components and push "use client" down to the interactive leaf' and §1.3 says new routes 'should read params in the server page.tsx and pass the string down'. layout-engine §4.2 shows `// src/app/portfolio/page.tsx ("use client", as today)` wrapping `<PanelGrid>`; `portfolio/page.tsx:1` and `markets/page.tsx:1` are indeed `"use client"` today, and `PanelGrid` reads localStorage so the whole grid subtree is client anyway.

**Suggestion:** Pick one and align: recommend server `page.tsx` files that `await params` and render a client `<PortfolioGrid />`/`<MarketsGrid selected={ticker} />` (satisfies platform-notes §1.3 for `/asset/[ticker]`); update layout-engine §4.2's comment and pages.md §3.3 ('/asset/[ticker] sets it from the path') to say the server page passes the ticker as a prop.

### (agent-ux.md) The plan-card and Plans-foot copy repeats the decision text 'a Jupiter Trigger order you sign once' (§1.6 What-happens paragraph, §2.5 live foot, pages.md §3.9)

**Issue:** The plan-card and Plans-foot copy repeats the decision text 'a Jupiter Trigger order you sign once' (§1.6 What-happens paragraph, §2.5 live foot, pages.md §3.9), but the documented flow needs two wallet prompts on first arm (challenge `signMessage` + deposit `signTransaction`; backend §9.3 `signatures: 2`, agent-ux §3.1 '1 sign in · 2 approve deposit') and one or two more to cancel. The audit's 'signs once' is what the user read; the UI will contradict it on the first arm.

**Suggestion:** Keep the decision's intent but make the copy true: 'one sign-in with your wallet (good for 24 hours), then one signature per order' in the What-happens paragraph and Plans foot; keep the arm sheet's two-step line. Note it in agent-ux OQs so the user confirms the phrasing (also affects pages.md §3.9).

### (layout-engine.md) Class names disagree with design-system.md, and both documents claim the other one wins. layout-engine §2.1/§2.3/§4.3 render and style .ly-grip, .ly-resize, .ly

**Issue:** Class names disagree with design-system.md, and both documents claim the other one wins. layout-engine §2.1/§2.3/§4.3 render and style .ly-grip, .ly-resize, .ly-badge, .ly-reset, .panel.ly-dragging, .ly-over-before/-after/-swap, .ly-resizing, .ly-ghost; design-system §4.1 and the §8 skeleton (block 6) style .panel-grip, .panel-resize, .panel-badge, .reset-layout, .panel.is-dragging, .is-over-before/-after/-swap, .is-resizing, .panel-ghost and say 'the layout doc's #7c3aed fallbacks are superseded'. design-system §7 risk 'Two documents, one grid' acknowledges the split but leaves it to 'whoever implements panels.css'. Two agents (one on PanelGrid.tsx, one on globals.css) will ship unstyled handles and invisible drop targets.

**Suggestion:** Adopt design-system's names everywhere (they are already in the paste-ready skeleton): find-and-replace in layout-engine.md §2.1, §2.3, §4.1, §4.3, §7 (ly-grip→panel-grip, ly-resize→panel-resize, ly-badge→panel-badge, ly-reset→reset-layout, ly-dragging→is-dragging, ly-over-*→is-over-*, ly-resizing→is-resizing, ly-ghost→panel-ghost), keep the ly-* names only in the '(partner: …)' parentheticals, and reduce panels.css §4.3 to placement-only rules (.panel-grid, .panel grid-area, data-axis variants, the < 768 flex column) so the look lives in one file.

### (layout-engine.md) Internal contradiction on 768–1100 px. §2.3 ('Tablet: width resize is off, height resize stays on'), §3.2 ('768–1100px: long-press reorder works in the single c

**Issue:** Internal contradiction on 768–1100 px. §2.3 ('Tablet: width resize is off, height resize stays on'), §3.2 ('768–1100px: long-press reorder works in the single column, height resize works'), §6 ('one column of all the route's cards in saved order, long-press reorder and height resize allowed') vs §4.3's own CSS '@media (width < 1101px) { .panel { grid-area: auto; grid-column: 1 / -1; height: auto; } .ly-grip, .ly-resize, .ly-badge, .ly-reset { display: none; } }' which hides both handles and forces height: auto (so a saved h cannot apply). design-system §4.1 ('All handles hidden under 1100px') and §8 block 14 (display: none at max-width: 1099px) agree with the CSS, not the prose. Breakpoints also differ by one pixel: design-system collapses at max-width: 1099px (1100 px shows sidenav + grid), layout-engine at width < 1101px / DESKTOP_MIN_PX 1101 (1100 px collapses), so at exactly 1100 px the sidenav renders beside a single-column grid.

**Suggestion:** Decide tablet = read-only single column for Thursday (it is what the CSS already does and what the partner does at terminal.css:545): delete the reorder/height-resize sentences in §2.3, §3.2, §6 and open question 6, and state 'no handles below the desktop gate; saved layouts apply only at ≥ desktop'. Pick one gate and write it in both docs: DESKTOP_MIN_PX = 1100 with CSS @media (width < 1100px) in panels.css and max-width: 1099px in globals.css (or 1101/1100 — either, but the same everywhere).

### (layout-engine.md) Auto-height cards have no first-paint height. §1.4 rowsOf(id) = h if numeric, else measuredRows[id] ?? spec.defaultRows ?? MIN_ROWS, and PanelSpec.defaultRows i

**Issue:** Auto-height cards have no first-paint height. §1.4 rowsOf(id) = h if numeric, else measuredRows[id] ?? spec.defaultRows ?? MIN_ROWS, and PanelSpec.defaultRows is 'number | null; null = auto', so every auto card (hero, asset, activity, compare, people) packs at MIN_ROWS = 5 rows = 152 px on the server render and on the first client frame, while its content is 383–963 px. Because .panel is height: 100% of the grid area with no overflow rule on an unsized .panel-body, the hero's content paints over the cards below it until the ResizeObserver reports (§4.2), then everything re-packs and jumps. The §5 tables carry the estimates ('auto (≈12)') but the registry type cannot store them.

**Suggestion:** Add estimateRows: number (≥ minRows) to PanelSpec for auto cards and use it in rowsOf() before measuredRows arrives (rowsOf = h ?? measured ?? estimateRows ?? MIN_ROWS); set estimateRows from the §5 tables (hero 12, asset 30, activity 8, compare 10, people 14). Add .panel:not([data-sized]) > .panel-body { overflow: visible } so a short estimate never clips, and pin a test that defaultLayout(page) packs with estimateRows (so the SSR HTML matches the screenshots).

### (backend.md) §9.5 states as fact that EXTEND is 'PATCH /orders/price/:id with a new expiresAt, no signature'. Verified today against developers.jup.ag/docs/trigger/manage-or

**Issue:** §9.5 states as fact that EXTEND is 'PATCH /orders/price/:id with a new expiresAt, no signature'. Verified today against developers.jup.ag/docs/trigger/manage-orders.md: updatable fields are triggerPriceUsd and slippageBps for single orders (trailingBps and slippageBps for trailing stops); expiresAt is not listed. agent-ux §2.3 already hedges this as risk 4, but backend presents it unhedged and the plan card spec (§9.5) and agent-ux §2.3 both ship an EXTEND button.

**Suggestion:** Remove EXTEND from backend §9.5 and agent-ux §2.3/§4 for Thursday; replace the row's copy with 'to keep it past {date}, cancel and arm again' and let arm_until mirror Jupiter's expiresAt read-only. If time remains, probe PATCH with expiresAt on a real order and re-add only on a 200.

### (agent-ux.md) §2.1 makes the Plans composer preview a debounced (400 ms) POST /api/agent with 'mode: preview semantics (a create_plan-only turn)'. backend §7.1 has no preview

**Issue:** §2.1 makes the Plans composer preview a debounced (400 ms) POST /api/agent with 'mode: preview semantics (a create_plan-only turn)'. backend §7.1 has no preview mode (mode is practice|live) and its create_plan tool creates a status='proposed' row in the plans table (§6.3/§7.4). As written, every typing pause creates a database row (housekeeping deletes them after 7 days, §8.3 step 6) and, once ANTHROPIC_API_KEY lands, every pause is a real Claude Opus 5 call with the full tool list. pages.md §3.9 has the same assumption ('POST /api/agent in preview mode'). The mock's grammar (§7.6) is the only deterministic parser and it is described as living inside mock-model.ts.

**Suggestion:** Extract the §7.6 grammar into a pure src/lib/plan-parser.ts (parsePlanSentence(text, ctx) → { condition?: PlanCondition; question?: string }) used by both MockModel and a new POST /api/plans/preview { text, mode } → { summary?, condition?, question?, execution? } that runs validateCondition + describe() (+ toTriggerOrder for live) with no row and no model. The composer debounces into /api/plans/preview; ARM IT then POSTs /api/plans with the returned condition. /api/agent stays chat-only. Add this route to backend §6.3 and §13.2, and note in agent-ux §2.1 and pages.md §3.9.

### (backend.md) §10 POST /api/feed/posts accepts { kind:'news', ref: url, title, source, publishedAt, ticker? } from any session and upserts it into the public posts table, and

**Issue:** §10 POST /api/feed/posts accepts { kind:'news', ref: url, title, source, publishedAt, ticker? } from any session and upserts it into the public posts table, and GET /api/feed renders title/url/source from that row. Any signed-in user (email sign-up is open, confirmation off) can therefore publish an invented headline with an arbitrary link into the shared Discover feed. That violates the 'no invented headlines' decision and creates a phishing surface; the design-system/pages copy promises 'never a headline not returned by /api/news'.

**Suggestion:** Make the server the only source of news post fields: POST /api/feed/vote and /comments accept { newsId | postId }; when newsId is given the route looks the item up in loadNews()'s cache (news-server.ts, already 10-min cached; re-fetch on miss), computes ref = sha256(url) itself, and upserts the post from the cached item's title/url/source/publishedAt. Delete the client-facing POST /api/feed/posts. Store only ref/title/url that came from the server-side news loader; never persist client-supplied title or url.

### (backend.md) Email sessions are silently signed out by the existing client hook. use-session.ts:69 computes token = current && address && current.wallet === address ? curren

**Issue:** Email sessions are silently signed out by the existing client hook. use-session.ts:69 computes token = current && address && current.wallet === address ? current.token : null, so useSession().signedIn is true only when a wallet is connected and matches the stored session's wallet. backend §2.2–2.3 mint an HMAC token for email users with no wallet and §4.4 selects the server practice store on useSession().signedIn; with the hook unchanged every email user reads as signed out, and StoredSession (session.ts:9-13) has no field to say which kind the token is. The doc never mentions use-session.ts or StoredSession.

**Suggestion:** Specify in §2.3: StoredSession gains kind: 'wallet' | 'user' and owner: string (wallet optional); useSession() returns the token when (kind === 'user' && no wallet connected) or (kind === 'wallet' && wallet === address), and exposes owner/kind. saveSession(null) is also called from supabase.auth.signOut() so a Supabase sign-out revokes the 30-day HMAC session on that device. Extend tests/session.test.mjs accordingly.

### (backend.md) §2.5 makes Profile.wallet 'string | null' and adds owner/kind, but the client cache keys everything by wallet: use-profiles.ts:11 profiles: Record<wallet, Profi

**Issue:** §2.5 makes Profile.wallet 'string | null' and adds owner/kind, but the client cache keys everything by wallet: use-profiles.ts:11 profiles: Record<wallet, Profile>, :55 setProfile keys on profile.wallet, :27 fetches /api/profile?wallets=, and ChatMessageRow/SidebarAccount/leaderboard call useProfile(address). An email user's saved profile would be cached under 'null'; nothing in the doc says the hook moves to ?owners= and keys by owner, and the GET route's toProfile() (profile/route.ts:24-26) has no owner field.

**Suggestion:** Add to §2.5: toProfile() emits { owner, kind, wallet, ... }; use-profiles.ts keys by owner, requestProfiles(owners) calls /api/profile?owners=, useProfile(owner) is the only lookup, and setProfile keys by profile.owner. Because wallet owners are the bare address, every existing caller that passes a wallet address keeps working unchanged. List the four call sites so the agent doing identity owns them.

### (backend.md) §2.7 renames ChatMessage.wallet → author and MessageRow.wallet → author, and changes /api/chat's insert/select. That touches the room path the decisions list as

**Issue:** §2.7 renames ChatMessage.wallet → author and MessageRow.wallet → author, and changes /api/chat's insert/select. That touches the room path the decisions list as 'kept, not rewritten': chat.ts:33-43 rowToMessage, use-chat.ts:25,39 (requestProfiles(m.wallet)), use-chat.ts:65-66 (Realtime payload.new as MessageRow), ChatMessageRow.tsx:11-16, chat/page.tsx:96 (mine = m.wallet === address), and tests/session.test.mjs's chat cases. It also conflicts with pages.md §3.2/§10 Q6 ('rooms are wallet-only; email accounts see Link a wallet to post'), so the two docs disagree on whether email users can post at all.

**Suggestion:** Make it additive: keep wallet on ChatMessage/MessageRow (nullable) and add author: string (the owner); /api/chat selects both columns and inserts { owner: session.owner, wallet: session.wallet ?? null }; ChatMessageRow uses useProfile(message.author) and shortAddress(message.wallet ?? message.author). Decide the pages.md question here: recommend email users may post (identity resolves through ?owners=), and delete pages.md open question 6.

### (pages.md) Scope beyond the binding decisions, presented as Thursday work: the 'since' card (a solera:visit snapshot store written on pagehide/60 s/2.5 s with five row kin

**Issue:** Scope beyond the binding decisions, presented as Thursday work: the 'since' card (a solera:visit snapshot store written on pagehide/60 s/2.5 s with five row kinds, one of which needs a feed-by-actors-since route that does not exist), Scorecard (needs gapAtBuy/refAtBuy fields absent from backend's fills), a position_notes table + GET/PUT /api/notes + localStorage mirror + migrate-on-sign-in, pins on the hero, pointer drag-reorder of positions inside a card, HolderHighlight, a ⌘K palette with ten intent kinds, /api/trending, PreIpoLoader, the BigChart canvas port, seven strip chips, NewsRow with votes on /news, and an extended /api/live-prices. The decisions for priority 1 name: terminal look, tape, 12-column grid with drag/resize/swap, ticket beside the market list, ⌘K, six-tab phone shell. Priority 3 names feed votes/comments and email sign-up. The thesis is 'optional, encouraged' — a note on the fill, not a notes subsystem.

**Suggestion:** Add a 'Thursday floor' table at the top of pages.md: hero (balance, KPI row, range chart), positions (HoldingRow + the fill's note read-only), plans, activity, markets, asset (head/chart/facts/held-by/news + TradeTicket), room, compare, feed (backend's shape), trending fallback only, people, agent. Move to 'after Thursday': since card (or ship a two-line version from localStorage: balance delta + top mover), Scorecard, position_notes/pins/reorder/wrongHitAt (notes live on fills per backend §5.1; editing after the fill is post-Thursday), HolderHighlight, palette intents beyond ticker/person/'reset layout', /api/trending, NewsRow votes on /news (Discover only). Keep the /api/live-prices change24h+liquidity extension (small, additive) and PreIpoLoader.

### (agent-ux.md) The live-plan surface is larger than can be tested before Thursday and stacks three new deeplink continuations (trigger-auth, trigger-deposit, trigger-withdraw)

**Issue:** The live-plan surface is larger than can be tested before Thursday and stacks three new deeplink continuations (trigger-auth, trigger-deposit, trigger-withdraw) with a Jupiter JWT persisted in localStorage[solera:deeplink-pending] onto an iOS Phantom flow the memory file says is itself untested. §3.2 needs three page loads and two Phantom hops per arm; §5 lists 18 edge cases; plus PlanEditorSheet (catalog search, 8 fields), InboxBell + InboxSheet + 30 s poll, CancelPlanSheet with a FINISH WITHDRAWAL resume path, per-row Jupiter sync requiring a wallet signMessage. Success items 8–10 also require spending real SOL, which the user's stated preference rules out.

**Suggestion:** Tier it in §0: Floor = AgentPanel, PlanCard, NewsCard, PricesCard, PlansCard, PlansPanel rows, practice ARM/cancel, mock model, browser evaluator fallback. Tier 2 = desktop ArmPlanSheet + CancelPlanSheet (Trigger V2, wallet-adapter signMessage/signTransaction), toast + Plans-row READY state instead of the inbox bell. Tier 3 (post-Thursday) = iOS Trigger arming (answer open question 5 as 'iPhone live plans are notify-only for Thursday; the arm sheet says: arm Jupiter orders from a desktop browser for now'), PlanEditorSheet (EDIT re-sends to the composer instead), InboxSheet, EXTEND. Record the demo's live segment at the Phantom challenge screen (no deposit), per the no-spending preference.

### (backend.md) The route list is incomplete for what the other documents call: agent-ux §1.6 and §3.3 fetch GET /api/plans/:id (only GET /api/plans list exists in §6.3); §8.5

**Issue:** The route list is incomplete for what the other documents call: agent-ux §1.6 and §3.3 fetch GET /api/plans/:id (only GET /api/plans list exists in §6.3); §8.5 and agent-ux §2.5 read GET /api/plans/health (not listed); §9.8 names GET /api/inbox and POST /api/inbox/read with no shapes; §9.6 PATCHes { status:'cancelled', trigger:{ withdrawSignature } } which the §6.3 PATCH table does not accept; §7.6's mock 'stores the draft in the reply's hidden pendingSize field of the next state block' but AgentResponse (§7.1) has no such field and the route is stateless, so agent-ux invents context.pendingDraft. Each is a guess an implementer would make differently.

**Suggestion:** Add to §6.3: GET /api/plans/:id → { plan } (owner-scoped, 404 otherwise); GET /api/plans/health → { lastEvaluatedAt, serverWatch: boolean } (serverWatch = lastEvaluatedAt within 3 min); PATCH accepts trigger.withdrawSignature on 'cancelled'. Add §9.8 shapes: GET /api/inbox?unread=1 → { items }, POST /api/inbox/read { ids }. Add pendingDraft?: { text: string; condition: Partial<PlanCondition> } to both AgentRequest.context and AgentResponse in §7.1 and say the client echoes it back verbatim.

## minor

### (backend.md) Future per-wallet layouts table in layout-engine §1.3 is keyed by `wallet text`, while backend's identity is the `owner` string (email users have no wallet).

**Issue:** Future per-wallet layouts table in layout-engine §1.3 is keyed by `wallet text`, while backend's identity is the `owner` string (email users have no wallet).

**Suggestion:** In layout-engine §1.3 change the sketch to `owner text not null check (public.is_owner(owner))`, `primary key (owner, page)`.

### (pages.md) Copy quoted 'exactly' does not match source: §3.2 room loading state 'Opening the room…' is 'Loading the room…' at `src/app/asset/[ticker]/chat/page.tsx:89`; §3

**Issue:** Copy quoted 'exactly' does not match source: §3.2 room loading state 'Opening the room…' is 'Loading the room…' at `src/app/asset/[ticker]/chat/page.tsx:89`; §3.2 sort option '24h change' is 'Price change' at `markets/page.tsx` (select options: Community holdings / Price change / Company name).

**Suggestion:** Fix both strings, or state that they are intentional rewrites.

### (pages.md) §3.5 says a missing Suspense boundary around `useSearchParams` makes 'the tree up to the nearest boundary client-rendered'; on a statically prerendered page `ne

**Issue:** §3.5 says a missing Suspense boundary around `useSearchParams` makes 'the tree up to the nearest boundary client-rendered'; on a statically prerendered page `next build` fails outright (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md:181`: 'otherwise the build fails with the Missing Suspense boundary with useSearchParams error'), which platform-notes §1.6 states correctly. Relevant because §3.2 adds `?sym=` reading to `/markets`, currently static.

**Suggestion:** Reword §3.5 to 'the build fails' and add the Suspense requirement to §3.2's selection paragraph.

### (pages.md) §1.6 'Order of truth for the name: claimed profile → Supabase Auth `user_metadata.display_name` → short address' conflicts with backend §2.5, where an email use

**Issue:** §1.6 'Order of truth for the name: claimed profile → Supabase Auth `user_metadata.display_name` → short address' conflicts with backend §2.5, where an email user's display name is a `profiles` row upserted on `user_id` (and `GET /api/profile?owners=` resolves it); nothing writes `user_metadata`.

**Suggestion:** Drop the `user_metadata` tier; the order is profile row (by owner) → short address / email-local part.

### (platform-notes.md) Two line citations drift: §1.1 says `void backfill()` is at `price-history/route.ts:106` (it is `:98`; the function starts at `:105`); §7 cites the GoTrue 'must

**Issue:** Two line citations drift: §1.1 says `void backfill()` is at `price-history/route.ts:106` (it is `:98`; the function starts at `:105`); §7 cites the GoTrue 'must not be trusted' notice at `GoTrueClient.d.ts:1408` (that line is the 'considered low-level' note; the security notice is `:1413`, which backend.md cites correctly). §5 cites `layout.tsx:44-48` for `viewport`; it is `:45-49`.

**Suggestion:** Correct the three line numbers.

### (platform-notes.md) §10's inventory of keys the sibling docs introduce omits agent-ux §1.4's `sessionStorage["solera:agent-thread"]` (and §10 opens with 'sessionStorage is unused',

**Issue:** §10's inventory of keys the sibling docs introduce omits agent-ux §1.4's `sessionStorage["solera:agent-thread"]` (and §10 opens with 'sessionStorage is unused', which stops being true) and backend §4.5's `localStorage["stocklana:portfolio:migrated"]`.

**Suggestion:** Add both to the §10 table with owner and shape, and change 'sessionStorage is unused' to 'unused today'.

### (agent-ux.md) §1.4 keeps the chat transcript in per-tab `sessionStorage`, but on iPhone every Phantom hop returns in a new tab (`DeepLinkResumer.tsx:47-50`), so arming a live

**Issue:** §1.4 keeps the chat transcript in per-tab `sessionStorage`, but on iPhone every Phantom hop returns in a new tab (`DeepLinkResumer.tsx:47-50`), so arming a live plan from the Agent tab (§3.2) loses the conversation and the plan card; §3.2 only reconstructs the arm sheet from `GET /api/plans/:id`.

**Suggestion:** Either mirror the thread to `localStorage["solera:agent-thread"]` with a short TTL (the same discipline as the deeplink keys) or state in §3.2 that the thread is gone after a hop and the sheet is the recovery surface.

### (design-system.md) §4.7 opens with 'All five existing dialogs' then lists four existing components plus 'the future auth sheet'. §4.14 toasts sit at `bottom: calc(var(--tabbar-h)

**Issue:** §4.7 opens with 'All five existing dialogs' then lists four existing components plus 'the future auth sheet'. §4.14 toasts sit at `bottom: calc(var(--tabbar-h) + 12px)` (= 68px + inset) while layout-engine §6 carries the partner's `calc(76px + env(safe-area-inset-bottom))` from mobile.css:46 as a rule 'to carry over'.

**Suggestion:** Say 'four existing dialogs and the new auth sheet'; in layout-engine §6 replace the 76px toast rule with a pointer to design-system §4.8.

### (layout-engine.md) §5.1 and pages.md §3.9 describe the positions card as 'drag to reorder' positions within the card (`sortOrder` in the notes store) and say 'layout-engine.md §2

**Issue:** §5.1 and pages.md §3.9 describe the positions card as 'drag to reorder' positions within the card (`sortOrder` in the notes store) and say 'layout-engine.md §2 keyboard rules apply', but the engine in §2 is a grid-of-panels state machine with no list-reorder primitive; nothing owns an intra-card row drag.

**Suggestion:** Either add a small `useListReorder` spec (pointer + keyboard, announcements) to layout-engine or drop 'drag to reorder' from the positions subtitle for Thursday and keep `sortOrder` as pin-first/value ordering.

### (platform-notes.md) §9 proposes GET /api/price-history?ticker=X&range=24h|1w|1m|6m mapping to days=1|7|30|180 (1W at hourly resolution, 169 points), while pages.md §4 specifies ran

**Issue:** §9 proposes GET /api/price-history?ticker=X&range=24h|1w|1m|6m mapping to days=1|7|30|180 (1W at hourly resolution, 169 points), while pages.md §4 specifies range=24h|30d|180d with 1W as 'the last quarter of the thinned 30d series' (~30 points at ~6 h) and a different cache policy (24h 5 min / 30d 15 min / 180d 6 h vs platform-notes 300 s / 900 s). Both docs verified the same CoinGecko behaviour (I re-ran it: days=1 → 289 @ 5 min, days=7 → 169 @ 60 min, days=180 → 181 daily) but hand the implementer two APIs.

**Suggestion:** Standardise on platform-notes' contract (four named ranges, days=7 for 1W, lazy per-(ticker, range) fetch, s-maxage headers) and edit pages.md §4 and §2.6/§3.9 to match; keep the default (no range) response byte-identical so LivePriceLoader and use-live-price-for keep working.

### (layout-engine.md) §5.1 names the visit snapshot key solera:last-visit; pages.md §3.9 names it solera:visit (platform-notes §10 already flagged it).

**Issue:** §5.1 names the visit snapshot key solera:last-visit; pages.md §3.9 names it solera:visit (platform-notes §10 already flagged it).

**Suggestion:** Use solera:visit in layout-engine §5.1 (or drop the reference, since the since card is deferred).

### (agent-ux.md) §3.3 uses /buy/[ticker]?plan=<id> for the notify one-tap ticket; backend §9.8 and its inbox href comment use /asset/<ticker>?plan=<id>. agent-ux lists it as ope

**Issue:** §3.3 uses /buy/[ticker]?plan=<id> for the notify one-tap ticket; backend §9.8 and its inbox href comment use /asset/<ticker>?plan=<id>. agent-ux lists it as open question 1 but both documents ship code paths.

**Suggestion:** Decide /buy/[ticker]?plan= (the route already reads ?ref and ?side under Suspense, buy/[ticker]/page.tsx:6) and edit backend §3.6's href comment and §9.8 to match.

### (agent-ux.md) §3.4 says 'calling cancel again is idempotent per the docs' and reopens the sheet at step 2 by re-calling cancel. The manage-orders doc says the retry is 'calli

**Issue:** §3.4 says 'calling cancel again is idempotent per the docs' and reopens the sheet at step 2 by re-calling cancel. The manage-orders doc says the retry is 'calling the confirm endpoint again with the same cancelRequestId', and the unsigned withdrawal transaction from step 1 carries a blockhash that expires in about a minute, so a FINISH WITHDRAWAL tap minutes later would submit a stale transaction.

**Suggestion:** Persist { cancelRequestId } on the plan row at step 1 (PATCH trigger.cancelRequestId); on resume, call POST /orders/price/cancel/:id again and, if Jupiter returns a fresh transaction, sign that; if it rejects because the order is already ready_to_cancel, retry confirm-cancel with the stored cancelRequestId. Show Jupiter's error verbatim either way. Mark the resume path as unverified until a $10 order exercises it.

### (design-system.md) §5.4 step 1 says 'paste the §8 skeleton … preview deploy. The app is dark.' But the skeleton deletes .app-shell, .sidebar, .desktop-nav, .mobile-nav, .demo-stri

**Issue:** §5.4 step 1 says 'paste the §8 skeleton … preview deploy. The app is dark.' But the skeleton deletes .app-shell, .sidebar, .desktop-nav, .mobile-nav, .demo-strip, .content-column and .discovery-rail while AppShell.tsx (lines 9-38), BottomNav.tsx and ModeStrip.tsx still render those classes until step 2 replaces the shell; that first preview has no navigation layout.

**Suggestion:** Keep the old shell rules in a clearly-marked /* legacy shell — delete with AppShell rewrite */ block at the end of the skeleton (recoloured with the new tokens), or merge steps 1 and 2 into one commit.

### (design-system.md) .panel and .panel-grid are declared in two files with different declarations: §8 blocks 6 and 14 (background, border, box-shadow, animation, nth-child stagger,

**Issue:** .panel and .panel-grid are declared in two files with different declarations: §8 blocks 6 and 14 (background, border, box-shadow, animation, nth-child stagger, padding: 0) and layout-engine §4.3 panels.css (grid-area, height: 100%, container-type, plus its own background/border/animation). Order-dependent duplicates are how the stagger or the sticky head silently disappears.

**Suggestion:** State the split once in both docs: globals.css owns appearance (block 6/14 minus grid-area/height); panels.css owns only grid placement, drop-state pseudo-elements with data-axis, the ghost, and the < 768 px flex column. Remove background/border/animation from the panels.css sketch.

### (pages.md) §2.3 ThesisFields { note, wrongIf ≤ 140, horizon, leg, gapAtBuy, refAtBuy } does not match backend §3.5/§5.1 columns (note ≤ 280, wrong_if ≤ 160, leg, via, plan

**Issue:** §2.3 ThesisFields { note, wrongIf ≤ 140, horizon, leg, gapAtBuy, refAtBuy } does not match backend §3.5/§5.1 columns (note ≤ 280, wrong_if ≤ 160, leg, via, plan_id, copied_from; no horizon, gapAtBuy, refAtBuy) or backend's Transaction fields (note, wrongIf, leg, via, planId). Both documents extend lib/types.ts.

**Suggestion:** Use backend's shape in pages.md §2.2/§2.3 (note 280, wrongIf 160, leg, via, planId); drop horizon for Thursday; if the Scorecard ships later, add gap_at_buy/ref_at_buy numeric columns to both fill tables then.

### (backend.md) §7.2 writes Claude Opus 5 code without the refusal fallbacks parameter the claude-api skill says to include by default for claude-opus-5 (betas: ['server-side-f

**Issue:** §7.2 writes Claude Opus 5 code without the refusal fallbacks parameter the claude-api skill says to include by default for claude-opus-5 (betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'), and does not mention that a refusal on the final response should map to the same 'I can't help with that one.' reply the loop already returns for stop_reason 'refusal'. Also §12 says bs58 'is already installed transitively'; it resolves for require('bs58') but package.json exports hide bs58/package.json, so the implementer should add it explicitly as the doc suggests rather than rely on hoisting.

**Suggestion:** Add betas: ['server-side-fallback-2026-07-01'] and fallbacks: 'default' to the AnthropicModel.complete() call (via client.beta.messages.create) and note it in §12; mention it to the user when the key is wired. Add bs58 to dependencies in step 5.

### (platform-notes.md) §7 recommends getClaims(jwt) in /api/session with getUser(jwt) as a fallback 'if the project still uses symmetric HS256 keys' (open question 2), while backend §

**Issue:** §7 recommends getClaims(jwt) in /api/session with getUser(jwt) as a fallback 'if the project still uses symmetric HS256 keys' (open question 2), while backend §2.3 specifies getUser(jwt) only. Two agents will implement it differently, and getClaims needs the project's JWKS reachable from Vercel.

**Suggestion:** Standardise on getUser(jwt) for Thursday (one network call per sign-in, no key-type question) and delete platform-notes open question 2; note getClaims as a later optimisation in backend §2.3, where it already is.

### (backend.md) §4.2 drops the MY_HOLDINGS seed (use-portfolio.ts:34) and keeps optionPositions in the stored shape; tests/portfolio.test.mjs and tests/trade.test.mjs exercise

**Issue:** §4.2 drops the MY_HOLDINGS seed (use-portfolio.ts:34) and keeps optionPositions in the stored shape; tests/portfolio.test.mjs and tests/trade.test.mjs exercise the current defaultState() and TradeResult, and the gate is 'existing portfolio/trade tests' (§14 step 2) without saying which assertions change. §4.5's 'Keep your practice history?' import sheet is also extra UI on the sign-in path.

**Suggestion:** Name the assertions that change (defaultState().holdings.length === 0) in §13.2, and for Thursday make sync-on-sign-in silent: create the row with starting cash if none exists, never import (answer open question 2 as 'start fresh'); the local store keeps serving signed-out mode on the device.

### (layout-engine.md) §4.5 recommends hand-rolled pointer handling and lists @dnd-kit/core as the fallback 'if the pointer hook misbehaves on iPad Safari in Wednesday's QA'. There is

**Issue:** §4.5 recommends hand-rolled pointer handling and lists @dnd-kit/core as the fallback 'if the pointer hook misbehaves on iPad Safari in Wednesday's QA'. There is no iPad in the QA plan (§7.2 lists 1440 px, keyboard, 1000 px, iPhone), and with tablet reorder cut (see the 768–1100 issue) the only pointer surfaces are desktop mouse/pen, which removes the main reason the fallback existed.

**Suggestion:** Delete the tablet/iPad fallback sentence and the LONG_PRESS_MS / touch section (§3.2) for Thursday, or move §3.2 under 'after Thursday'; keep touch-action: none on the handles so nothing breaks if a touch laptop drags.
