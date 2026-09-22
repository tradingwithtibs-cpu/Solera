# Solera port — page-by-page map

Sept 22, 2026. Third of the port documents. `design-system.md` owns tokens, chrome and component styling; `layout-engine.md` owns the 12-column card grid, the panel registry and the phone tab shell. This document says, route by route, **what goes in every card, where its data comes from in the live app, which existing component is reused, rewritten or cut, what is new, what the copy says, what an empty state says, and how practice and live differ.** It also names every place the partner build shows fabricated data and the real replacement. Line numbers are as read on Sept 22 (partner: `/Users/tibet/Desktop/solerafinal/assets`; live: `/Users/tibet/code/stocklana/src`).

The binding decisions are the "Decisions taken after the audit" section of `docs/partner-build-audit.md`. Where this document says "cut", "kept" or "new" it is applying those decisions, not making new ones; where it has to choose, the choice is listed in section 9 for the user.

Conventions used below:

- **Panel ids** are the `layout-engine.md` §1.2 registry ids (`hero`, `since`, `positions`, `plans`, `activity`, `markets`, `asset`, `room`, `compare`, `feed`, `trending`, `people`, `agent`). `<Panel id title subtitle tools foot>` and `<PanelGrid page>` are the §4.2 API; static routes use `<Panel static>`.
- **Titles** render as `// TITLE` (design-system 4.1). "Subtitle" is the muted head line the partner puts in `.panel-head .muted`. "Eyebrow" is the 10px mono uppercase label inside a body.
- **Class** of each panel, from the audit's port-gap key: (a) live data exists · (b) UI port over live data · (c) needs new backend · (d) cut.
- **Copy** is quoted exactly. The partner's voice is terse, lowercase-sentence, mono labels in caps; sentence case for prose (design-system open question 4). No exclamation marks (brand skill).

---

## 0. Route inventory

| Route | Today (live app) | After the port | Grid page (`layout-engine.md` §5) |
|---|---|---|---|
| `/` | `Hero` + "Today in markets" + `FeedList` of investor cards (`src/app/page.tsx:9-19`) | **Discover**: feed (news + fills, votes, comments) beside Trending | `discover` |
| `/markets` | heading + search + featured 8 + `CatalogList` (`markets/page.tsx`) | **Markets** list card, selected asset card with the ticket beside the chart, ticker room card | `markets` |
| `/asset/[ticker]` | separate detail page (`asset/[ticker]/page.tsx`) | desktop: the `markets` grid with that ticker selected; phone: the asset card alone (Trade tab) | `markets` |
| `/asset/[ticker]/chat` | full-screen room (`asset/[ticker]/chat/page.tsx`) | static full-width room panel (phone / deep link); on desktop the same component is the `room` card | static |
| `/buy/[ticker]` | `TradeScreen` (`buy/[ticker]/page.tsx`) | static full-width **ticket** (phone, `?ref=` copy links, iOS deeplink returns); the asset card embeds the same `TradeTicket` on desktop | static |
| `/pre-ipo` | heading + comparisons + issuer list (`pre-ipo/page.tsx`) | markets card (Pre-IPO tab), selected pre-IPO asset card with ticket, comparison card | `preipo` |
| `/leaderboard` | ranked cards with Score/move toggle (`leaderboard/page.tsx`) | **People** card | `leaderboard` |
| `/investor/[id]` | profile + holdings (`investor/[id]/page.tsx`) | static profile panel + "Fills on Solera" | static |
| `/portfolio` | balance card, perspective, holdings, pre-IPO, options, activity, "not yet in your portfolio" (`portfolio/page.tsx`) | hero, since, positions (with thesis + scorecard), plans, recent fills | `portfolio` |
| `/activity` | `TransactionRow` list (`activity/page.tsx`) | static "Recent fills" panel, full history, note under each fill | static |
| `/news` | segmented news lists (`news/page.tsx`) | static news panel using the Discover news rows (vote + comments) | static |
| `/agent` | does not exist | **new**: Claude chat card beside the Plans card | `agent` |
| `/options/[ticker]/[contractId]` | practice options ticket (`options/[ticker]/[contractId]/page.tsx`) | **cut** (decision) — route returns `notFound()` | — |

The partner's `signals.html`, `launches.html`, `rewind.html`, `portfolio.html`, `news.html` are 0-byte redirect stubs (audit, pages-render "Redirect stubs") and get no route. `mobile.html` is the phone shell, which the live app already has as `BottomNav`.

---

## 1. The shell (every route)

Partner reference: `renderShell` `engine.js:262-303`, `NAV_ITEMS` `:57` + `plans.js:13`, strip `signals.js:255-277`, tape `engine.js:301`, wallet/mode `:865-876`, `:949-969`, `:1029`, auth `:892-947`, palette `:972-999`, `:1035-1039`, clock `:1040`, footer `:293`. Live reference: `AppShell.tsx:9-38`, `BottomNav.tsx:5-31`, `ModeStrip.tsx:13-43`, `MyWalletBadge.tsx:19-123`, `SidebarAccount.tsx:12-38`, `DiscoveryRail.tsx:9-56`, `TopBar.tsx:6-34`, `layout.tsx:51-63`. Styling for all of this is design-system 4.13–4.14; this section is about what each piece *contains* and *binds to*.

### 1.1 Frame

`AppShell.tsx` stays the one frame component but its body changes from the 3-column `.app-shell` (`globals.css:244`, sidebar / content / `discovery-rail`) to the partner's two columns: `<SideNav />` then `.content` = `<Tape />`, `<TopBar />`, `<Strip />`, `{children}` (each route renders its own `PanelGrid` or static `Panel`), `<Foot />`. `DiscoveryRail` is deleted: its "Your practice portfolio" card is the portfolio `hero`, its "Community favorites" card is the `trending` card's fallback list (§3.1), and its disclaimer sentence ("Profiles, holdings, and returns are examples. Nothing here places a real trade.", `DiscoveryRail.tsx:51-54`) is **false** for real wallets and live trades and is dropped. `layout.tsx:55-58` keeps `SolanaProvider` → `LivePriceLoader` → `CatalogLoader` → `AppShell`; add `<PreIpoLoader />` beside `CatalogLoader` (§5.1) so the tape, markets card, strip and asset card share one `/api/pre-ipo` poll instead of each mounting `usePreIpo()` (`use-pre-ipo.ts:16-46` polls per mount every 30 s). Overlays mount once in `AppShell`: `<Toasts />`, `<Palette />`, `<SheetHost />` (design-system 4.7/4.8), and `celebrateTrade()` (`lib/celebrate.ts`) stays the confetti.

### 1.2 Sidenav (≥ 1100px)

Six items, in the partner's order, mono uppercase: **Portfolio** `/portfolio` · **Discover** `/` · **Markets** `/markets` · **Pre-IPO** `/pre-ipo` · **Leaderboard** `/leaderboard` · **Agent** `/agent`. Icons: the live `icons.tsx` set already has `WalletIcon`, `FeedIcon`, `MarketsIcon`, `RocketIcon`, `TrophyIcon`; add `AgentIcon` (the partner's `plans.js:12` robot outline, 1.8px stroke). Active-route rules extend `BottomNav.tsx:20-23`: Markets is active for `/markets` and `/asset/*`; Portfolio for `/portfolio`, `/activity`, `/buy/*`; Discover for `/` and `/news`; Leaderboard for `/leaderboard` and `/investor/*`. Component: `SideNav.tsx` replaces `BottomNav desktop` (`AppShell.tsx:18`); the mark is `Logo.tsx` at 40px (it already loads `/brand/solera-mark-256.png`, `Logo.tsx:12`); the tagline eyebrow "A little more perspective." (`AppShell.tsx:17`) stays; the foot card keeps "Built for the long view." / "People, portfolios, and the thinking behind them." / "Built on Solana ↗" (`AppShell.tsx:20-26`, partner `engine.js:270`) and the account block is `SidebarAccount` restyled (§1.6).

### 1.3 Tape

Partner: `[...TICKERS, ...TICKERS]` with `usd(price)` and `pct(chg24)` (`engine.js:301`), fed by the random walk until Jupiter answers — the 24h figure is invented until then (`tick()` `:830-846` rewrites `chg24` from synthetic history).

Port, real only:

- **Items:** the eight featured xStocks (`XSTOCK_TOKENS` keys, `lib/tokens.ts:30-39`) followed by the PreStocks tokens from `/api/pre-ipo` (eight today: ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET, SPACEX — verified against `https://prestocks.com/api/prestocks` on Sept 22). Tessera tokens are left off the tape (same companies twice) but stay in Markets. Sixteen entries, duplicated once for the loop (design-system 4.3).
- **Price:** `getEffectivePrice(ticker)` from the live store (`lib/live-prices.ts:105-107`), fed every 5 s by `LivePriceLoader` (`LivePriceLoader.tsx:12,39-55`); pre-IPO `token.tokenPrice` from the shared pre-IPO store.
- **24h change:** the live store has no 24h figure for featured tickers today (`api/live-prices/route.ts:190-204` keeps only `usdPrice`). Jupiter Price v3 returns `priceChange24h` and `liquidity` per mint (verified Sept 22: keys `createdAt, liquidity, usdPrice, blockId, decimals, priceChange24h, stockData` for the TSLAx and SPYx mints). Extend the route's response with `change24h: Partial<Record<TickerSymbol, number>>` and `liquidity: Partial<Record<TickerSymbol, number>>`, add `setChange24h`/`setLiquidity` to `lib/live-prices.ts`, and read them in the tape, the markets rows and the asset facts. Pre-IPO rows already carry `change24hPct` (`api/pre-ipo/route.ts:91`). Until the first fetch lands the tape renders the symbol and `—`, never a placeholder number.
- **Fills** on the tape (decision: "The tape shows real fills, practice fills labelled as practice, on-chain trades labelled as such") are the last 6 items of `/api/feed?tab=all` (§5.2), rendered after the prices as `<b>{actor}</b> bought 0.42 TSLAx <chip>practice</chip>` / `<chip>on-chain a1b2…c3d4</chip>`. With no fills yet the tape is prices only.
- `aria-hidden` (duplicates Markets); pauses on hover; reduced-motion fallback per design-system 4.3.

### 1.4 Top bar

Left → right, as the partner (`engine.js:274-288`):

1. **Masthead**: today's date (`Intl.DateTimeFormat weekday long, month long, day`) and the edition label. Partner toggles "Practice edition" / "Mainnet edition" on `state.mode` even with the fake demo wallet (`:867`, `:1029`). Port: "Practice edition" when `useTradeMode().mode === "practice"`, "Mainnet edition" only when `mode === "live"` (which already requires `connected`, `use-trade-mode.ts:56`). Phones: mark 32px instead of the masthead.
2. **⌘K button**: "Search tickers, people, notes" + `kbd ⌘K`; opens the palette (§1.8). Phones: icon-only 36px.
3. **Mode segment** `Practice | Live · mainnet`. Binds to `useTradeMode()`: `setMode("practice")`; `setMode("live")` when `connected`, else `openConnect()` from `useConnectWallet()` (`ConnectWalletProvider.tsx:33-39`, which already routes iPhone Safari to the Phantom deeplink sheet). The segment shows Live as "on" only when `mode === "live"`. The partner's demo wallet (`:1029` sets `DemoW4LLet…`) and the gate sheet's "Keep the demo wallet" (`:958`) do not exist.
4. **Clock**: `HH:MM:SS` 24h, 1 s tick (`:1040`), hidden on phones.
5. **Wallet pill**: `MyWalletBadge` restyled to `.wallet-pill` (design-system 4.13). It already has the connect button, the short address, the SOL balance polled every 20 s, and a popover with the Live/Practice switch, the full address and Disconnect (`MyWalletBadge.tsx:53-122`). Keep all of it; the popover's two sentences ("Trades are real swaps on Solana mainnet through Jupiter…" / "Trades are simulated with practice funds. Nothing touches this wallet…", `:83-85`) are the honest replacement for `ModeStrip`'s status line. Dot colour: live = `--live`, connected-but-practice = `--warn`, none = pill reads "Connect wallet".
6. **Auth**: signed out → `LOG IN` (`.btn-secondary.btn-small`) + `SIGN UP` (`.btn-primary.btn-small`), both opening `AuthSheet` (§1.7). Signed in → `.me-pill`: avatar (initials, `Avatar.tsx`, colour `avatarColorFor(address)` or a hash of the user id), display name, and `small` = short address (wallet accounts) or `@handle` (email accounts with a profile) — never the email in a `title` attribute (partner `:896` leaks it unescaped). Click → the account sheet (§1.7).

`ModeStrip.tsx` (`globals.css:313 .demo-strip`) is deleted. Its three states map to: live → masthead "Mainnet edition" + green pill dot; practice-by-choice → "Practice edition" + amber dot; practice-because-no-wallet → "Practice edition" + "Connect wallet" pill. Its call to action "Connect a wallet to trade for real" survives in two places that need it: the ticket foot in practice mode (§2.2) and the portfolio hero eyebrow line (§3.9).

The existing `TopBar.tsx` (back arrow + title, `TopBar.tsx:19-33`) is not the partner's top bar. Rename it `BackBar` and use it only as the `action`/head of static panels (`/activity`, `/news`, `/investor/[id]`, `/buy/[ticker]`, `/asset/[ticker]/chat`) on phones, where a back affordance is needed.

### 1.5 Strip (chips under the top bar)

Partner `chips()` `signals.js:255-269` mixes live readings, an invented "Paused" chip (`sessionInfo`, audit: invented 24/5 session logic), an "Ahead" chip from the hand-written calendar (cut), Lens questions and a plan example. Port, one row, horizontal scroll, `.chip-l` per design-system 4.2:

| Chip | Source | Shown when |
|---|---|---|
| `WIDEST GAP` `OPENAI +52.1% vs mark` | pre-IPO store: token with the largest `Math.abs(premiumPct)` | pre-IPO loaded |
| `MOST HELD` `NVDAx · 14 wallets` | `computeTrendingTickers(useInvestors().investors)[0]` (`lib/portfolio.ts:127`) — real wallets from `/api/investors` | `source === "chain"` |
| `MOST TRADED` `SPCXx +1.0%` | `/api/trending` if built (§5.4; Jupiter `tokens/v2/search` stats24h — verified shape) | route exists and answered |
| `ASK` `What moved while I slept?` ×2 | rotating sample from the Agent prompt list (§3.12); click → `/agent?q=` | always |
| `PLAN` `if TSLAx falls to 3xx, buy $250…` | example built from the live TSLAx price (the partner does this too, `:267`); click → `/agent?plan=` (prefilled, **not armed**) | TSLAx priced |
| `SINCE` `−$2.74 since 14 min ago` | the visit snapshot (§3.9 `since`) | a previous visit exists and the balance moved |
| `NYSE CLOSED` `pricing vs the stock resumes at open` | any featured `underlying.stale === true` (`lib/live-prices.ts:125-129`, Pyth publish time) | stale |

Dropped: `STREET`, `TAPE Balanced`, `BREADTH` (need the 5 MB universe fetch; audit: "cut or add /api/universe"), `PAUSED` (invented), `AHEAD` (calendar cut). No chip is ever rendered from a placeholder number; the row can be empty on first paint.

### 1.6 Sidenav account block

`SidebarAccount.tsx:18-38` already does the right two states (connected → avatar + profile name or short address + mode line; else "Guest · Connect a wallet →"). Add a third: email account without a wallet → avatar from the account's display name, name, and the line "Email account · practice" with a "Link a wallet →" action calling `openConnect()`. Order of truth for the name: claimed profile (`useProfile(address)`, signature-verified) → Supabase Auth `user_metadata.display_name` → short address.

### 1.7 Log in / Sign up / account sheet (new, class c)

Partner sheet markup `engine.js:912-925` is the skin: tabs `Log in | Sign up`, title, one sentence, fields, primary button, "or", a wallet button, a foot note. Behaviour is rebuilt on Supabase Auth (`@supabase/auth-js 2.116.0` ships `signUp(`, `signInWithPassword(`, `signOut(`, `getUser(`, `onAuthStateChange(` — grep of `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts` on Sept 22). The identity model is the audit decision: wallet is the trading identity; an email account can browse, practice, vote and comment, and links a wallet to trade live.

- **Sign up** fields: Display name (2–40 chars, same `NAME_MAX` as profiles, `lib/profiles.ts:26`), Email, Password (min 8). Copy: title "Create an account", text "A name people see on the tape, and a way back in. Practice cash to start; nothing here moves real money until you link a wallet." The partner's "Practice cash is $5,000" (`:915`) is wrong for us — the practice balance stays `MY_CASH_BALANCE` from `lib/mock-data.ts` (decision: unchanged) and the sheet quotes it via `formatCurrency(MY_CASH_BALANCE)` rather than a literal.
- **Log in** fields: Email, Password. Title "Welcome back". Error strings come from Supabase, mapped to two sentences: wrong credentials → "That email and password don't match."; unconfirmed → n/a (decision: email confirmation off for the hackathon).
- **Wallet path**: the "Continue with wallet" button is `openConnect()`; once connected, the sheet closes and identity is the wallet (profiles are claimed with `ProfileSheet`, unchanged, `ProfileSheet.tsx:26-168`). No message is signed at sign-up (the partner requests and discards one, `:941`); the existing 30-day session signature (`use-session.ts:76-95`) is asked for only when the wallet first posts or votes.
- **Account sheet** (signed in): name, identity line ("Signed in with Phantom · 9U76…vMQd" or "Email account · you@…" shown once, in the sheet, not in the top bar), "Link a wallet" (email accounts), "Edit profile" (`ProfileButton`), Log out (`supabase.auth.signOut()` or `disconnect()`).
- **Client:** `src/hooks/use-auth.ts` — module store around `getSupabaseAnon()` (`lib/supabase.ts:18-22`; the anon client is created with `persistSession: false` today, which must become `true` for Auth) with `onAuthStateChange`. Server routes that need an identity accept `Authorization: Bearer <token>` where token is either the wallet session (`sessionFromHeader`, `lib/session-server.ts:62-65`) or a Supabase JWT (`getSupabaseService().auth.getUser(token)`); §5.6 gives the helper. Actor ids: `wallet:<base58>` or `user:<uuid>`.
- Every HTML-string sink the partner used for names (`engine.js:316`, `:653`, `:896`) is JSX in the port; display names are additionally length- and charset-checked server-side (audit critic "Stored XSS").

### 1.8 ⌘K palette

`Palette.tsx`, mounted in `AppShell`, opened by the top-bar button, `⌘K`/`Ctrl+K`, closed by `Esc`, first result on `Enter` (partner `:1035-1039`). Rows: `small` kind · label · right-aligned figure. Sources, all real:

| Kind | Source | Go |
|---|---|---|
| Ticker | `getAllTickerInfos()` (`lib/catalog.ts:113-119`: featured 8 then the 737-token catalog) + pre-IPO tokens; figure = `getEffectivePrice` | select in the markets grid (`/markets?sym=`) |
| Person | `useInvestors().investors` (real wallets; profile names when claimed) | `/investor/[id]` |
| Note | the position-notes store (§2.3) matched on note/wrong-if text | `/portfolio` with that position expanded |
| Intent `who holds X` | investors whose `computeHoldings` include X, sorted by allocation (partner `:993` over fake `WALLETS`) | `/investor/[id]` |
| Intent `X gap` / `gaps` | pre-IPO store, `premiumPct` (partner `:994`) | `/pre-ipo?sym=` |
| Intent `my wrong-ifs` / `my notes` | notes store (partner `:995-996`) | `/portfolio` |
| Intent `go live` / `practice` | `setMode` / `openConnect` (partner `:997`) | — |
| Intent `following` | `useFollowedInvestors()` ids resolved through investors (partner `:998`) | `/investor/[id]` |
| Intent `ask …` / `lens …` | (partner `signals.js:289`) | `/agent?q=` |
| Intent `plan …` / `if …` / `buy …` / `sell …` | (partner `plans.js:176` armed it from the palette) → the port only **previews**: opens `/agent?plan=` with the sentence in the composer | `/agent` |
| Command `Reset layout for this page` | `layout-engine.md` §1.3 | — |

The empty-query hint row: `Try · "who holds nvda" · "openai gap" · "my wrong-ifs" · "go live" · "ask what moved while I slept"` (the partner's `"liquidity"` example depended on the universe fetch and is dropped).

### 1.9 Footer

Partner (`:293`): "prices simulate from Sep 21 2026 levels until Jupiter answers · portraits and headlines are placeholders · practice funds; the demo build never submits a transaction." — all three clauses are false for the port. Replacement, mono 10px uppercase:

`prices live via Jupiter Price v3 · {n} tokens · underlying via Pyth · refreshed {HH:MM:SS}` — `n` = keys in `getLivePrices().prices` + pre-IPO tokens priced; timestamp from a new `lastFetchedAt` set by `LivePriceLoader`. Then ` · issued by xStocks (Backed), PreStocks and Tessera, not by Solera · not financial advice`. The `Reset layout` link appears here only while the page layout is customised (`layout-engine.md` §1.3).

### 1.10 Phone shell (< 768px)

`BottomNav.tsx` becomes the six-tab bar of `layout-engine.md` §6 (Portfolio, Markets, Trade, Discover, People, Agent; `mobile.js:14`). Trade → `/asset/{selected}` where selected = `solera:selected-ticker` (default `TSLAx`). Tapping a market row navigates (`Link`, as `markets/page.tsx:110` does today) instead of the partner's simulated tab switch (`mobile.js:35`). Per-tab card stacks are the registry's `phone` field; this document lists, per route, which cards land on which tab.

### 1.11 What survives untouched

`SolanaProvider`, `ConnectWalletProvider` (iPhone Safari → Phantom deeplink sheet, `ConnectWalletProvider.tsx:16-49`), `DeepLinkResumer` (finishes swap / profile / session on the return page load, `DeepLinkResumer.tsx:120-121,152-160,189-195`), `LivePriceLoader`, `CatalogLoader`, `use-trade-mode`, `use-active-portfolio`, `use-live-portfolio`, `use-portfolio`, `use-session`, `use-profiles`, `use-chat`, `use-investors`, `use-watchlist`, `use-followed-investors`, `lib/trade.ts`, `lib/jupiter.ts`, every `api/` route (extended, not rewritten). The audit's "must survive" list (port-gap intro) is honoured in full except the practice options chain (cut by decision).

---

## 2. Cross-page primitives (new or rewritten components)

These appear on more than one route. Each is listed once here and referenced by name below.

### 2.1 `Panel` / `PanelGrid`

From `layout-engine.md` §4.2. Every card in this document is `<Panel id=… title=… subtitle=… tools=… foot=…>`. Card drag/resize with swap-on-drop is kept (decision).

### 2.2 `TradeTicket` (rewrites the form half of `TradeScreen.tsx`)

The partner ticket (`engine.js:397-414`, screenshot `partner-markets-desktop.png` right column) is the skin; the live app's execution stays. One component, two placements: inline in the `asset` card (desktop, `.asset-grid` right column, sticky) and full-width on `/buy/[ticker]`. Props: `{ target: { kind: "xstock"; ticker } | { kind: "pre-ipo"; token: PreIpoToken }, initialSide?, refInvestorId?, compact? }`.

Rows, top to bottom (partner order):

1. `Buy | Sell` segment (`TradeScreen.tsx:352-361`), `SOL | USDC` segment — live mode only, as today (`:363-379`); in practice the second segment is hidden, not disabled.
2. Position line: "You hold **1.1 TSLAx** ($417.56) · **+52.8%** vs cost" from `useActivePortfolio().holdings` + `computeHoldings` (`gainPct` needs `costBasis`, which live holdings only have for Solera-made trades, `use-live-portfolio.ts:121-129`; when absent print "You hold 1.1 TSLAx ($417.56)" and no percentage — the chain does not know what was paid). Else "No position yet."
3. Amount: label + figure, the range slider with the side-coloured track (`:112-121`, `:428-448`), quick amounts `$25 $50 $100 $250 Max` / `25% 50% 75% 100%` (`:23-24`, `:450-485`), and the availability line (`:486-495`). Practice cap = `cashBalance`; live cap = SOL (minus `SOL_FEE_RESERVE`) × `solUsd` or USDC (`:92-101`). The partner's `$10` floor and `step 5` are dropped for the live app's `$0`/`0.01` (`:112-114`).
4. Quote block, 2×2: `You pay` / `You get` / `Route` / `Impact · fees`.
   - Practice: pay = `$250.00`, get = `≈ 0.6570 TSLAx` at `getEffectivePrice`, route = `Practice fill · live price`, impact/fees = `0.00% · $0.00`. Foot: "Simulated fill at the live Solana price. Switch to Live to route through Jupiter."
   - Live: `useSwapQuote({ inputMint, outputMint, amountBaseUnits })` (`use-swap-quote.ts:39-92`, debounced 400 ms, Ultra `/order` with `taker`) → pay = `settledAmount SOL` from `inAmount`/`inUsdValue`, get = `outAmount` in token decimals, route = `Jupiter Ultra`, impact/fees = `priceImpactPct` and `feeBps/100 %` (`UltraOrder` `lib/jupiter.ts:13-31` has no hop labels; the partner's `hops.join(' → ')` came from the swap/v1 route plan and is not shown). Foot: "Routed quote from Jupiter Ultra · {HH:MM:SS}". The partner's `quoteFor()` impact formula and `SOL_USD = 214.5` (`engine.js:428-436`) are replaced by the real quote and `getSolPrice()`.
5. **Thesis fields** (§2.3): `Why?` textarea, `Wrong if` input, `Horizon` input, and for a pre-IPO buy the `This thesis is about` leg segment (`The gap closes | The mark rises`) with the partner's helper sentences (`engine.js:400`), computed from `token.premiumPct` and `token.markPrice`.
6. Primary button: practice `BUY IN PRACTICE` / `SELL IN PRACTICE`; live `BUY WITH {walletName}` (adapter name from `useWallet().wallet.adapter.name`) → opens the **review step** (`TradeScreen.tsx:224-333`) as a sheet, which keeps the allocation before/after, fee line and the jurisdiction/issuer disclosure (`:297-301`; brand skill: disclosures are never removed or collapsed). Confirm → `useExecuteTrade().run` (`use-execute-trade.ts:26-50`) or `usePreIpoBuy().run` (`use-pre-ipo-buy.ts:37-84`), then `recordTrade` (`use-active-portfolio.ts:24-32`) with the thesis fields, then `POST /api/fills` (§5.2) when an identity exists, then `celebrateTrade()`. Success state = `TradeScreen.tsx:152-222` restyled (Solscan link for live).
7. Ticket foot: practice "Simulated fill at the live price. Connect a wallet to trade for real." (link → `openConnect`); live "Signed in your wallet, landed on mainnet. Solera never holds keys or funds."

Pre-IPO target in practice mode: the live app has no practice ledger for pre-IPO mints (`use-active-portfolio.ts:55` returns `{}`), so the ticket shows the existing `PreIpoBuySheet.tsx:103-117` copy in place of rows 3–6: "Pre-IPO tokens are bought for real, from your wallet. Connect one and switch to live trading." + `Connect wallet` + "Or buy on Jupiter ↗". Whether to add practice pre-IPO fills is open question 3.

iOS deeplink: the swap continuation (`lib/deferred-signing.ts:15-33`) gains `thesis?: ThesisFields` on `trade`, staged before `signTransaction`, and `DeepLinkResumer.tsx:152-160` writes it with `recordLiveTrade` on the return (audit ticket-trading "Deferred fills … no place for the note").

### 2.3 Thesis fields and position notes (new, class c)

Type, added to `lib/types.ts`:

```ts
export interface ThesisFields {
  note?: string;        // "Why?" — optional, encouraged (decision)
  wrongIf?: string;
  horizon?: string;     // free text, e.g. "18 mo"
  leg?: "gap" | "mark"; // pre-IPO only
  gapAtBuy?: number;    // token.premiumPct at fill
  refAtBuy?: number;    // token.markPrice (pre-IPO) or underlying.price (xStock) at fill
}
```

`Transaction` (`lib/types.ts:77-91`) gets `thesis?: ThesisFields` and `mode: "practice" | "live"`, `via?: "ticket" | "plan" | "agent"`; `HoldingPosition` (`:29-41`) keeps `thesis?: string` for the sample investors and gains `notes?: PositionNote` for the user's own positions. Practice ledger: `applyFill` (`lib/ledger.ts:18-68`) copies the fields onto the holding on a buy and keeps them on a partial sell (partner `engine.js:473-480`). Live ledger: `recordLiveTrade` (`use-live-portfolio.ts:46-54`) stores them per wallet.

Editable after the fill (partner `renderPositions` `:673-674`, blur-save `:681`): `PositionNote = { ticker|mint, note, horizon, wrongIf, wrongHitAt?: number, pinned: boolean, sortOrder: number }` in a `position_notes` table (§5.3) via `GET/PUT /api/notes` for identities, mirrored in localStorage `solera:notes` for signed-out practice users. The partner's `contenteditable` paragraphs become labelled `textarea`/`input` (audit critic: accessibility).

Length limits: note 280, wrongIf 140, horizon 24 — enforced client and server.

### 2.4 `Scorecard` (partner `engine.js:694-707`)

Two sentences and an optional wrong-if line under each position:

- Line 1: xStock — "Price is **{pl}** vs your cost and **{gapToRef}** vs the exchange reference." where `gapToRef` = `getPremiumPct(ticker)` (Pyth, only when fresh; when stale: "and the exchange is closed, so no reference gap right now"). Without `costBasis` (live holding bought elsewhere): "Bought outside Solera, so no cost to compare. Token is {gapToRef} vs the exchange reference." Pre-IPO with leg gap: "You said the **gap would close**. It has narrowed **2.2 pts** since ({g0} → {g1})." (`gapAtBuy` vs `token.premiumPct`); leg mark: "You said the **mark would rise**. The issuer mark is **{d}** since ({r0} → {r1}); the token is {gap} against it."; no leg: "No leg named on this one. Token is {gap} vs the mark; price {pl} vs your cost."
- Line 2 — the partner's "3 of 5 holders on the tape are still in · 2 sold" is computed from `WALLETS` and the random tape (`:696-698`), i.e. invented. Real replacement: "**{n}** of the top on-chain wallets hold this." from `useInvestors()` (`api/investors` top holders, real), or "No tracked wallet holds this." Sells by those wallets are not observable and are not claimed.
- Wrong-if line: `Wrong if: "…" — not marked [IT HAPPENED]` / `— you marked it happened Sep 21 [undo]` (`wrongHitAt`).

### 2.5 `FeedRow`, `NewsRow`, `VoteColumn`, `CommentList`, `StorySheet` (partner `engine.js:540-551`, `562-569`, `583-662`)

Rendered on Discover (§3.1), `/news`, `/investor/[id]` and the portfolio `activity` card. Data = `FeedItem` (§5.2). Vote column `▲ score ▼` binds to `POST /api/vote`; the comment count opens `StorySheet` (news) or the trade thread (fill) with `CommentList` + composer (`POST /api/comment`). Signed out: the vote buttons and composer render disabled with a tooltip "Sign in to vote" that opens `AuthSheet`. The `Copy` button on a fill → `/buy/{ticker}?ref={actor}` (the existing copy-trade path, `investor/[id]/page.tsx:82`); the note is *not* prefilled with "Copying @x — same thesis" (partner `:790`; audit: defeats the point of the note) — the ticket shows "Copying {name}'s position" as today (`TradeScreen.tsx:381-388`) and leaves `Why?` empty.

`StorySheet` for a news item: head (kind tag from the scope, source, age, vote column), headline linking to `item.url` (real, `NewsList.tsx:39-42`), `item.image` if any, **"What it is"** = `item.summary` when Finnhub provides one (`lib/news.ts:17`), else omitted; **"Who it touches"** = the tickers/companies the item was fetched for, with live price and 24h/gap figures; the partner's hand-written "Worth watching" bullets are cut; foot "Source: {source} · read ↗"; the "Descriptive only. What moved, who it touches, what to watch — never what to do." line stays; comments beneath. Buttons: `ask agent` → `/agent?q=What does "{headline}" mean for {ticker}?`, `open {ticker}`.

### 2.6 `Sparkline`, `BigChart`, `RangeSwitch`

`PriceChart.tsx` becomes the sparkline (`currentColor` instead of the hard-coded `#059669/#e11d48`, design-system 4.10). `BigChart` is a new canvas component porting `drawChart`/`bindChart` (`engine.js:178-237`: right-gutter y labels, x ticks, area fill, last-price tag, dotted reference line, crosshair) with `pointermove` so it works on touch (the partner is `mousemove` only, `:228`). `RangeSwitch` = `24H | 1W | 1M | 6M` bound to a `solera:chart-range` store shared by the hero and asset cards (partner keeps one `state.range` for both, `:333`). Data per range is §4.

### 2.7 `HolderHighlight`

Partner `:1027-1028`: hovering a person highlights every row of a ticker they hold. Port: rows carry `data-sym`, people rows carry `data-holder={id}`; a document-level pointerover in `AppShell` reads the investor's holdings from the `useInvestors` store and toggles `.hl`. Pure UI, real data.

---

## 3. Route by route

Each entry: partner reference → grid → cards (data, components, cut/new) → copy → empty states → practice vs live → fabricated → real.

### 3.1 `/` — Discover

**Partner:** `discover.html` (`partner-discover-desktop.png`): `feed 8 | trending 4` (`terminal.css:543`), `PAGES.discover` `engine.js:54` with `feedTab: 'hot'`; feed `renderFeed` `:630-638`, rows `newsRow` `:540-551` / `feedRow` `:647-662`, hot `:511`, votes `:520-524`, comments `:553-558`, story sheet `:583-618`; trending `signals.js:220-252`.
**Live today:** `src/app/page.tsx:9-19` (marketing `Hero`, "Today in markets" `NewsList limit 4`, `FeedList` of investor cards).

**Grid:** `discover` — `feed` (8 cols, sized 24 rows, phone Discover·1) · `trending` (4 cols, sized 24, phone Discover·2). The marketing `Hero` (`Hero.tsx:55-84`) has no card; its two calls to action move into the feed's signed-out empty state (layout-engine open question 5, default taken).

**`feed` card** — title `Discover`, a `.live-dot` after the title while `/api/feed` is polling; tools = segment `News · {n} | Hot | Everyone | Following | Mine` (partner `:634`; default `Hot`).

| Tab | Rows | Source |
|---|---|---|
| News | `NewsRow` | `/api/feed?tab=news` = `/api/news` general (Finnhub or Google News, `api/news/route.ts:109-113`) plus per-ticker news for the user's held tickers (`useActivePortfolio().holdings`) merged and deduped (`lib/news.ts:33-49`), each with its vote score and comment count |
| Hot | `NewsRow` + `FeedRow` | `/api/feed?tab=hot`: news with a score plus fills that carry a note, ranked `score / (ageHours + 2)^1.4` (partner `:511`, computed server-side) |
| Everyone | `FeedRow` + `NewsRow`, newest first | `/api/feed?tab=all` — every fill posted to Solera (practice labelled, on-chain labelled) |
| Following | `FeedRow` | `/api/feed?tab=all&actors=` with `useFollowedInvestors()` ids (localStorage `stocklana:followed-investors`, `use-followed-investors.ts:5`) |
| Mine | `FeedRow` | signed in: `/api/feed?tab=mine` (server filters by the token's actor); signed out: the local ledger (`useActivePortfolio().transactions`) rendered with the same row, labelled "only in this browser" |

`FeedRow` cells (partner `:649-661`): vote column · avatar (`Avatar` initials, `avatarColorFor(actor)`) · "**{name}** bought **0.42 TSLAx** at $379.60 · 9m ago · `practice` / `on-chain a1b2…c3d4 ↗`" · blockquote of the note or `no note` · `thesis: gap closes` chip when `leg` · `via plan` chip when `via !== "ticket"` · trail sparkline `[fillPrice, …last 11 points of the 7d history]` with the since-fill % (`getEffectivePrice` vs `pricePerShare`, sign flipped for sells) · ticker badge · `Copy` (not on my own fills) · comment count.

`NewsRow` (partner `:540-551`): vote column · `MARKET` kind tag (kind = scope: `market` for general, the ticker for ticker news, `pre-ipo` for company news; the partner's POLICY/MOVE/EARNINGS kinds were hand-labelled and are not inferred) · source · age · ticker chips · `you hold this` when held · headline (opens `StorySheet`; `↗` to `item.url`) · image (`item.image`, `onError` hides, as `NewsList.tsx:45-57`) · actions `{n} comments` / `ask agent` / `open {ticker}`.

Reuse: `NewsList.tsx` fetch logic (`use-news.ts`) folds into `/api/feed`; `NewsList` itself survives for the asset card and `/news` sections where votes are not wanted (compact list). `FeedList.tsx` (search + investor cards) and `InvestorCard.tsx` are **not** on Discover any more; `InvestorCard` is kept for `/leaderboard`'s phone layout if wanted, otherwise deleted.

**`trending` card** — title `Trending`, subtitle `{n} tokens · live · Jupiter` (when `/api/trending` exists) or `by value held · top on-chain wallets` (fallback). Body per partner `:236-247`: window segment `1h | 6h | 24h`, view segment `Most traded | Biggest moves | New holders | Net buyers | Liquidity flow`, issuer segment `All issuers | xStocks | PreStocks`, and a ranked list `01 SPCXx SpaceX $51.2M −0.7%`. Source: `/api/trending` (§5.4; Jupiter `tokens/v2/search?query=xStock|PreStocks`, verified Sept 22 to return 20 tokens per query with `stats1h/6h/24h.{priceChange, holderChange, liquidityChange, buyVolume, sellVolume, numTraders, numNetBuyers}` and `holderCount`, `liquidity`). If the route is not built by Thursday the card shows only the **fallback list**: `computeTrendingTickers(investors)` from real wallets (`DiscoveryRail.tsx:35-45` today) with `holderCount` wallets and `formatCurrency(totalValue)` held, under the eyebrow `MOST HELD BY TOP WALLETS`, and no window/view segments (nothing to window). Beneath, two mini lists from `/api/feed`: `ON THE TAPE, LAST HOUR` (fills grouped by ticker) and `PEOPLE YOU FOLLOW` (last 3 fills by followed actors), with the partner's empties `quiet hour` and `follow someone on Leaderboard`. The `About trending ⓘ` tooltip text stays: "Ranked from Jupiter's per-token stats for the chosen window. Solera adds nothing: no boost, no paid placement, no picks."

**Copy.** No page heading (the card head is the heading). `feed` foot: none. `trending` foot: none.

**Empty states.**
- Signed out, Hot/Everyone with no fills yet: title "Nothing on the tape yet.", body "Fills land here with their notes — yours and everyone's. Practice fills are labelled; on-chain fills link to Solscan.", actions `Connect wallet` (`openConnect`) and `Explore in practice mode` (→ `/markets`) — the two `Hero.tsx:69-76` buttons.
- News tab, feed down: `/api/news` error string as today (`NewsList.tsx:32`), e.g. "News unavailable right now".
- Following, nobody followed: "Follow someone on Leaderboard and their fills show up here."
- Mine, nothing: "Your fills land here with their notes." (partner `:635`).
- Trending fallback, investors not loaded: skeleton rows + "Reading the largest wallets on Solana…" (`FeedList.tsx:63`).

**Practice vs live.** Identical layout. `you hold this` and "Mine" read from `useActivePortfolio()` (practice localStorage or wallet balances). A live fill row shows the Solscan link (`solscanTxUrl`, `lib/jupiter.ts:117`); a practice row shows the `practice` chip.

**Fabricated → real.** `NEWS` (8 invented headlines credited to Reuters/Bloomberg/CNBC/CoinDesk/The Block/"Solera Wire", `data.js:60-93`) → `/api/news` (Finnhub with key, Google News RSS without); `streamTrade` random trades from `WALLETS` with random `NOTES` and random tx hashes (`engine.js:849-862`) → `fills` table written on real fills; `seedScore`/`SEED_COMMENTS` (`:510`, `:526-533`) → `votes`/`comments` tables starting at zero; `picsum.photos` images (`:547`) → `item.image` or nothing; `i.pravatar.cc` faces (`:13`) → initials avatars; the `Trending` "On the tape" and "People you follow" lists (from the random tape) → `/api/feed`.

### 3.2 `/markets` — Markets

**Partner:** `markets.html` (`partner-markets-desktop.png`): `markets 4 | asset 8 / room 4 | asset / signals 12 / flows 12` (`terminal.css:146`); `renderMarkets` `engine.js:340-357`; room `:761-769`; signals/flows `signals.js:62-96`.
**Live today:** `markets/page.tsx` (heading `:43-49`, search `:51-60`, All/Watchlist `:61-69`, sort `:75-84`, featured rows `:107-145`, `CatalogList` `:150`).

**Grid:** `markets` — `markets` (4, sized 24, phone Markets·1) · `asset` (8, auto, phone Trade·1) · `room` (4, sized 12, phone Markets·2). Signals and Flows are **not** in the Thursday layout (audit: "cut or add /api/universe"; layout-engine §5.2 reserves `signals`/`flows` ids). If `/api/universe` is built later, both cards return exactly as `signals.js:62-96` describe them minus Session Clock and minus the fabricated Street Index ramp sparkline (`:68`, audit "sparkline is a fabricated ramp").

**Selection:** `solera:selected-ticker` (localStorage, default `TSLAx`) mirrored to `?sym=`; a row click sets it (partner `select()` `:779-783`); `/asset/[ticker]` sets it from the path. On phones a row click navigates to `/asset/[ticker]` (§1.10).

**`markets` card** — title `Markets`; tools = segment `All | xStocks | Pre-IPO | Watchlist` (partner `:343` says "Stocks"; ours says xStocks because that is the issuer family; the audit found GOOGLx/METAx are xStocks mints mislabelled "Ondo Stocks · 24/5" in `data.js:14-15`) plus a search field (`SearchIcon` input, the existing `markets/page.tsx:51-60` behaviour) and the existing sort select (`Community holdings | 24h change | Company name`, `:75-84`, plus `Liquidity` for the catalog).

Rows (`.row`, design-system 4.9), in this order: the featured eight (`TICKER_LIST`), then the catalog by liquidity (`CatalogList.tsx:28-35` filter: priced tokens, or any match when searching), then — on the Pre-IPO tab — the pre-IPO tokens sorted by implied valuation (`pre-ipo/page.tsx:15-17`). Row cells:

| Cell | Featured xStock | Catalog xStock | Pre-IPO |
|---|---|---|---|
| badge | `TickerBadge` | `TickerBadge` (generated colour, `lib/catalog.ts:75-79`) | `CompanyBadge` (`PreIpo.tsx:36-44`) |
| main `b` | `TSLAx` + `●` live tag when `isLivePriced` | `AMDx` + `●` when priced | `OPENAI` + `IssuerPill` |
| main `small` | `Tesla · xStocks (Backed)` | `{name} · xStocks (Backed)` (catalog = CoinGecko `-xstock` ids, `lib/catalog-server.ts:5-11`) | `OpenAI · PreStocks · mark $965.91` |
| spark | `getEffectiveHistory(t)` 7d (real once `/api/price-history` lands; `isLiveHistory` false → no spark, never the placeholder series) | none until opened (`use-live-price-for.ts:30-40` loads it) | none (no history source; §4) |
| num | `formatCurrency(getEffectivePrice)` + `{change24h} 24h` (§1.3 extension) | `usdPrice` + `change24hPct` (`CatalogToken`) | `tokenPrice` + `change24hPct` |
| trailing | `{liquidity} liq` (§1.3 extension) | `{liquidityUsd} liq` + `Thin market` chip under `THIN_LIQUIDITY_USD` (`lib/catalog.ts:27`) / `Not yet trading` (`CatalogList.tsx:79`) | `.gap` chip `−26.2% vs mark` (`premiumPct`) |
| star | `WatchlistStarButton` | same | same (watchlist keys accept pre-IPO symbols) |

The partner's `24/7` / `24/5` session pills and `reopens Sun 8pm ET` (`:347`) are cut (invented). `PremiumBadge compact` (the live "Live +0.12%" line, `markets/page.tsx:123-127`) moves into the asset card's facts; the row keeps only the 24h figure. The "N sample wallets · $X held" meta line (`:132-141`) is dropped from rows (it is the sort key, not row content) — the palette's "who holds" and the asset card's "Held by" carry it.

Foot: `prices live via Jupiter Price v3 · {tradeable} of {tokens.length} tokenized stocks trading` where both numbers come from `useCatalog()` (`CatalogList.tsx:34` computes `tradeable`) — the partner's literal `8 of 737` (`:353`) is replaced by the computed pair; before the catalog loads: `loading catalog…`.

**`asset` card** — see §3.3; on `/markets` it shows the selected ticker.

**`room` card** — title `{SYM} room`, subtitle `{n} messages · wallet sign-in to post`. Body = the room list + composer of `asset/[ticker]/chat/page.tsx:86-156` as a component `RoomPanel` (messages `useRoomMessages`, gate: `Connect a wallet to post` → `Sign in to post` ("One signature, good for 30 days. It can't move funds.") → composer with "Posting as your wallet address." + `ProfileButton`). `ChatRoomCard.tsx` (the link-out card) is deleted on desktop and kept as the phone entry point under the asset card. Partner's four fake messages and unauthenticated posting (`data.js:102-107`, `engine.js:768`) → Supabase `messages` (`supabase/chat.sql`) through `/api/chat` with the session token.

**Copy.** `markets` empties: search with no match → "No matching assets." / "Try another company or ticker." (`markets/page.tsx:90-94`); Watchlist tab empty → "Keep a few on your radar." / "Tap the star beside a stock to save it to your watchlist." with `Browse all markets` (`:96-104`); catalog loading → four skeleton rows and `Loading catalog…` (`CatalogList.tsx:49-54`). `room`: loading "Opening the room…"; not configured "Rooms aren't switched on for this deployment yet."; empty "Nobody has posted in #{SYM} yet. Be the first." (`chat/page.tsx:87-94`).

**Practice vs live.** Rows identical. The ticket inside the asset card differs (§2.2). The room's posting gate is wallet-only in both modes (rooms are wallet identities; email accounts see "Link a wallet to post in rooms" — open question 6).

**Fabricated → real.** 12 hard-coded `TICKERS` with synthetic `h7/h30/h180` (`data.js:8-35`) → featured 8 + 737-token catalog + pre-IPO feed; `liq` constants → Jupiter `liquidity`; session pills → cut; `ROOM` seed messages → Supabase rooms; Signals' Session Clock → cut; Gap Index over 4 seeded names → the strip's `WIDEST GAP` over every pre-IPO token.

### 3.3 `/asset/[ticker]` — the asset card

**Partner:** `renderAsset` `engine.js:362-426` (head `:369-373`, chart bar `:376`, facts `:378-382`, compare `:384-391`, ladder link `:392`, held by `:393`, news `:394`, action line `:395`, ticket `:397-414`), Lens chips `signals.js:202-207`.
**Live today:** `asset/[ticker]/page.tsx:48-78` (`TopBar`, `TickerBadge lg`, name, `OwnedPumpingBadge`, `EffectivePriceDisplay`, liquidity line, `AssetPriceChart`, `ChatRoomCard`, `AssetModeSection` (Shares/Options, Held by, `AssetPosition`), ticker news).

**Route behaviour.** `/asset/[ticker]` on desktop renders `<PanelGrid page="markets">` with `selected = ticker` (one saved layout for both routes; layout-engine open question 4, default taken) so the list, the asset and the room are all present. On phones it renders the `asset` card only (Trade tab) with `ChatRoomCard` beneath it linking to `/asset/[ticker]/chat`. Unknown ticker: the existing "We couldn't find that asset." (`:34-36`) inside a static panel; catalog still loading: `LoadingState`. `useLivePriceFor(symbol)` (`use-live-price-for.ts:14-49`) keeps polling the selected catalog ticker every 5 s and loads its 30-day history once.

The card has two targets: an xStock (`ticker`) or a pre-IPO token (`mint`, selected from the Pre-IPO tab or `/pre-ipo?sym=`). Cells differ where marked.

**Head** (`.asset-head`): badge · `Tesla` `TSLAx` · issuer line `xStocks (Backed) · XsDo…HzoB ↗ · price-tracking token` (mint from `getTokenForSymbol`, `lib/catalog.ts:100-105`, short form, linking `https://solscan.io/token/{mint}`; pre-IPO: `PreStocks · {mint short} ↗ · SPV exposure, not shares`) · price block right: `EffectivePriceDisplay` (`$379.60` + `Live · Pyth`/`Live · Jupiter`, `EffectivePriceDisplay.tsx:20-27`) and `{change24h} 24h`. `OwnedPumpingBadge` stays beside the name (real: `isPumping` over the 7d history, `lib/portfolio.ts:214`). Star = `WatchlistStarButton` in the card head tools. The partner's `24/7` pill (`:371`) is cut.

**Chart bar:** `TSLAx · {5-min | hourly | daily}` (matching the range's cadence, §4) + `RangeSwitch`. **Chart:** `BigChart` over `getEffectiveHistory(ticker, range)`; caption beneath as `AssetPriceChart.tsx:33-35` ("Last 7 days · Solana DEX price" / range equivalent) and, while a range has no data, the dashed box "24H chart loading…" (`:22-26`) — never the placeholder series (`isLiveHistory`, `lib/live-prices.ts:66`).

**Facts** (`dl.facts.three`):

| xStock (featured, Pyth feed) | xStock (catalog) | Pre-IPO |
|---|---|---|
| `EXCHANGE REFERENCE` `$379.74` `underlying, via Pyth` — `useEffectivePrice().underlying.price`; when `stale`: `NYSE closed · last regular-session print` (`PremiumBadge.tsx:27-33`) | `EXCHANGE REFERENCE` `—` `not tracked for this token yet` | `ISSUER MARK` `$965.91` `PreStocks fair value per token` (`token.markPrice`) |
| `ON-CHAIN GAP` `+0.12%` `token price vs the stock` (`getPremiumPct`, undefined while stale → `—`) | `—` | `GAP TO MARK` `+52.1%` `implies $1.45T vs $965B at the mark` (`premiumPct`, `impliedValuation`, `markValuation`; `formatValuation`) |
| `LIQUIDITY` `$1.6M` `Solana pools · no vote, dividends rebased` (`liquidity` from the §1.3 extension) | `LIQUIDITY` `$18K` + `thin market, expect slippage` under `THIN_LIQUIDITY_USD` (`asset/[ticker]/page.tsx:46,61-65`) | `LIQUIDITY` `$210K` `no vote, SPV exposure` (`token.liquidityUsd`) |

The partner labels the exchange reference "via Jupiter" (`:379`, from `stockData.price`); ours is Pyth for the featured eight (`api/live-prices/route.ts:166-188`) and "not tracked" for the catalog. Jupiter's `stockData.price` (verified present for the TSLAx/SPYx mints, `id: "xstocks"`) could fill the catalog gap later — noted in risks, not in scope.

**Ask agent chips** (partner `chipsFor` `signals.js:111`): eyebrow `ASK THE AGENT`, chips `Why did TSLAx move today?` · `Who holds TSLAx?` · (pre-IPO) `Is OPENAI's gap normal?` — each → `/agent?q=`. The partner's `What is ahead for TSLAx?` depends on the cut calendar and is dropped.

**Same company, two issuers** (pre-IPO only, partner `:384-391` with hard-coded `alt` prices): `CompanyComparisonCard` (`PreIpo.tsx:118-227`, real `compareAcrossIssuers`) rendered compact inside the card when the company has two tokens; `Valuation ladder ↓` link only if the ladder ships (§3.6).

**Held by** (partner `:393`, fake `WALLETS` with `pravatar` faces and `perf7`): the `AssetModeSection.tsx:50-78` list — real top wallets (`useInvestors`, `source === "chain"`) with initials avatar, name/handle (profile or short address), `{allocationPct}% of their portfolio`, and the 7-day move (`investor.performancePct`, a real value-weighted price move, `lib/investors.ts:48-57`), each linking to `/investor/[id]`. Empty: "No wallets to show for {SYM} yet." Loading: "Reading holders on Solana…". Sample fallback (only when `/api/investors` is down) keeps its "Sample investors holding" label. The Shares/Options segment (`:34-46`) is removed with the options chain.

**News** (partner `:394`, `href="#"`): eyebrow `{NAME} IN THE NEWS`, `NewsList scope ticker limit 3` (xStock) or `scope company` (pre-IPO), real links; empty "No recent coverage." The partner's `action-line` (calendar, `:395`) is cut.

**Ticket:** `TradeTicket` (§2.2) in the right column (`.asset-grid` two columns ≥ 900px container width, stacked below on phones per `mobile.css:38`). `AssetPosition.tsx` (Buy/Sell buttons) is replaced by the ticket.

**Copy.** Card title = `{Name} · {SYM}` (the only data-bearing title, layout-engine §1.2). Foot: none.

**Practice vs live.** Head, chart, facts, holders, news identical. Ticket per §2.2. Pre-IPO ticket in practice = connect prompt.

**Fabricated → real.** `t.ref` for facts (synthetic until Jupiter, then `stockData.price`) → Pyth underlying / issuer mark; `alt` prices (`data.js:17-20`) → `compareAcrossIssuers`; `heldBy(WALLETS)` → `/api/investors`; `NEWS` → `/api/news`; `ACTIONS` → cut; Lens regex answers → the Agent; the partner's `SOL_USD` and impact formula → Ultra quote.

### 3.4 `/asset/[ticker]/chat` — the room

**Partner:** `renderRoom` `engine.js:761-769` (local array, no auth). **Live:** `asset/[ticker]/chat/page.tsx` — real, keep.

Static route: `<Panel static title="{SYM} room" subtitle="{n} messages · wallet sign-in to post" action={<BackBar />}>` wrapping `RoomPanel` (§3.2). On desktop this route is reachable by deep link and simply shows the room full width; the markets grid is the normal home of the room. Message rows (`ChatMessageRow`) take the partner's `.room-list li` layout: avatar (initials) · `b` name `small` age · `p` body. Unknown room: "We couldn't find that room." Not configured: "Rooms aren't switched on for this deployment yet." Practice vs live: none — rooms are wallet identity, both modes.

### 3.5 `/buy/[ticker]` — the ticket, full width

**Live:** `buy/[ticker]/page.tsx` renders `TradeScreen` in `Suspense` (required: `useSearchParams` in a client component must sit under a `Suspense` boundary or the tree up to the nearest boundary is client-rendered — `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md:82-88`).

Port: `<Panel static title="Buy TSLAx" action={<BackBar />}><TradeTicket target=… initialSide={?side} refInvestorId={?ref} /></Panel>`. Keeps every existing entry point: `HoldingRow` actions `/buy/{t}` and `?side=sell` (`portfolio/page.tsx:176-178`), the investor page `Copy` `/buy/{t}?ref={id}` (`investor/[id]/page.tsx:82`), the feed `Copy`, and the iOS Phantom return (`DeepLinkResumer` finishes the swap regardless of which page the user is on). The `?ref=` banner "Copying {name}'s {SYM} position / Reflects their public holdings — not financial advice." (`TradeScreen.tsx:381-388`) stays. Copy lives in §2.2; the review sheet's disclosure sentence is verbatim from `TradeScreen.tsx:299-300`. Phone: the Trade tab's asset card also embeds the ticket, so `/buy/[ticker]` on a phone is the same ticket without the chart.

### 3.6 `/pre-ipo` — Pre-IPO

**Partner:** `preipo.html` (`partner-preipo-desktop.png`): `markets 4 | asset 8 / ladder 12` (`terminal.css:147`), `PAGES.preipo` `engine.js:52` with `marketTab: 'preipo'`; ladder `bounty.js:47-72`. The screenshot shows the partner's own bug: it opens with TSLAx selected and the ladder reads "pick a pre-IPO name" (audit pages-render).
**Live today:** `pre-ipo/page.tsx` (heading `:21-27`, `CompanyComparisonCard` list `:35-48`, issuer segment + `PreIpoRow` list `:50-73`, disclosure `:74-78`).

**Grid:** `preipo` — `markets` (4, sized 24, Pre-IPO tab preselected, phone Markets·1) · `asset` (8, auto, phone Trade·1 — desktop only for pre-IPO, see below) · `compare` (12, auto, phone Markets·2). The valuation `ladder` is deferred (layout-engine open question 7); its spec is at the end of this entry so it can be added without a design pass.

**Selection default:** the first token of the first `compareAcrossIssuers` company (i.e. a company sold by both issuers), else the highest implied valuation — never an xStock (fixes the partner bug). `?sym=OPENAI` selects by issuer symbol; `?mint=` by mint.

**`markets` card:** as §3.2 with the Pre-IPO tab on; the other tabs still work (it is the same component). Rows are `PreIpoToken`s from the shared store: badge, `OPENAI` + `IssuerPill`, `OpenAI · PreStocks · mark $965.91`, price, `+34.1% 24h`, `.gap` chip, star. Subtitle in the head: `{n} tokens` + ` · Tessera feed offline` / ` · PreStocks feed offline` when `sources` says so (`pre-ipo/page.tsx:55-56`).

**`asset` card:** §3.3 in pre-IPO mode. On phones the pre-IPO asset card is **not** reachable for Thursday: tapping a pre-IPO row opens the existing `PreIpoBuySheet` (`PreIpo.tsx:16-33` `BuyButton`), which is real and complete (Ultra quote, SOL/USDC, disclosure). The Trade tab keeps pointing at the selected xStock. Open question 4.

**`compare` card:** title `Same company, two issuers`, subtitle "which token is cheaper changes as they trade"; body = one `CompanyComparisonCard` per `compareAcrossIssuers(tokens)` entry (`PreIpo.tsx:118-227`: lower implied valuation, vs-own-mark, marks-disagree note, two token tiles with `BuyButton`, the "Token prices can't be compared directly…" sentence, `Latest on {company}` news). Foot: the existing disclosure verbatim: "Token prices from Jupiter. Mark prices and valuations are published by each issuer from private secondary-market deals. Pre-IPO tokens are not shares: PreStocks tokens track SPV exposure, Tessera T-Tokens are loan participation rights. Not financial advice." (`pre-ipo/page.tsx:75-77`; brand: disclosures never collapsed).

**Copy.** No page heading. Loading: `LoadingState` inside the cards; feed error: the route's error string ("Pre-IPO issuers unreachable", `api/pre-ipo/route.ts:65`). `compare` empty (only one issuer answering): "Only one issuer is answering right now, so there is nothing to compare. Every token is still listed in Markets."

**Practice vs live.** Rows and comparison identical. Buying is live-only (`usePreIpoBuy` refuses without a wallet in live mode, `use-pre-ipo-buy.ts:40-44`); in practice every buy control shows the connect prompt. Portfolio shows wallet-held pre-IPO tokens in live mode only (`portfolio/page.tsx:37-46`).

**Fabricated → real.** `data.js:17-20` `ref`/`markVal`/`supply`/`lastRound`/`status`/`alt` constants → `/api/pre-ipo` (PreStocks + Tessera feeds + Jupiter; verified Sept 22 the PreStocks API returns `markPrice, markValuation, tokenPrice, impliedValuation, supply, contract_address` for all 8 companies in `COMPANIES`); Session Clock / Gap Index → cut / strip chip.

**Ladder spec (deferred, class b + small c).** Data: copy `BOUNTY.VALUATIONS` from `data-bounty.js` to `src/data/valuations.json` — verified keys `SPACEX, OPENAI, ANTHROPIC, ANDURIL, KALSHI, POLYMARKET, NEURALINK, FIGUREAI`, each `{ stage: "listed"|"filed"|"private", ipoStatus: string, points: { label, valuationUsd, date, url, note }[] }` (2, 3, 1, 3, 3, 2, 2, 2 points). Only `MINTS` and `VALUATIONS` are used; `REPLAY`, `PRESETS`, `LAUNCHES`, `SNAPSHOT_AT` are dead (audit). Card: title `{Company} · valuation ladder`, subtitle `{stage} · live lines vs sourced events`; canvas `drawLadder` (`bounty.js:20-46`, log y, monthly x, step line through points, dashed `mark-implied` = `token.markValuation` and `chain-implied` = `token.impliedValuation`, `now` marker); facts `Mark-implied / Chain-implied / Last priced event / Chain vs last event`; the `ipoStatus` sentence; the event list with `company-confirmed` / `reported` tags and `source ↗` links; foot "Rounds, tenders and IPO pricing, each linked to where it was reported · issuer mark + Jupiter on-chain price". Since the live app's `COMPANIES` covers all eight, the ladder reaches every name (the partner reached four). Each `ipoStatus` string is dated editorial text (e.g. "Listed on Nasdaq as SPCX since Jun 12 2026"); it must be re-checked before shipping or shown with its `date`.

### 3.7 `/leaderboard` — People

**Partner:** `leaderboard.html` (`partner-leaderboard-desktop.png`): stories strip (`engine.js:302`, `pravatar` faces of the 8 fake `WALLETS`), `people 12` (`terminal.css:148`), `renderPeople` `:709-725` ("Largest real holders · ranked by 7d" over invented `perf7/perf30`, `verified` badges and bios, `data.js:38-47`).
**Live today:** `leaderboard/page.tsx` (heading `:25-33`, Score/move segment `:35-43`, 7d/30d window `:44-60`, explainer `:61-72`, `rank-card` rows `:77-105`, source line `:106-110`).

**Grid:** `leaderboard` — `people` (12, auto, phone People·1). The stories strip is cut (faces are placeholders; a real "people you follow" avatar row can return later from `useFollowedInvestors`).

**`people` card** — title `People`, subtitle `Largest real holders · ranked by {7d | 30d} move` when `source === "chain"`, `Sample profiles · on-chain holders loading` otherwise; tools = the existing segment `Solera Score | Market move` and the `7 days | 30 days` window (kept per layout-engine §5.5).

Row (`.person`, partner `:715-721`, phone two-row layout `mobile.css:58-63`): rank `01` · avatar (initials) · name (`profile.name` or `shortAddress`) + `✓` **only when a profile is claimed** (a real signature-verified claim, `api/profile/route.ts:82-91`; tooltip "Claimed with a wallet signature") · `@handle · 44% TSLAx` (top holding by `computeHoldings` allocation) or `on-chain wallet · 51% AAPLx` · bio (`profile.bio` or the generated "A real Solana wallet holding 3 tokenized stocks. Holdings are read live from the chain.", `lib/investors.ts:75-77`) · perf column: `+7.9% 7d` / `+21.3% 30d` (`performancePct`, `performance30dPct` — value-weighted price moves of what they hold, not returns) or the score `72/100 · steady` when the Score view is on (`normalizeSoleraScore`, `describeSoleraScore`) · `FOLLOW` (`FollowButton`) · `COPY` → `/buy/{topTicker}?ref={id}`. Rows link to `/investor/[id]`; `HolderHighlight` on hover.

Foot: the existing explainer, verbatim by mode (`leaderboard/page.tsx:65-71`): "Ranks real wallets by how the market moved what they hold over the last {7|30} days, value-weighted. Not what they earned since buying — the chain doesn't say what they paid. Past moves do not predict future results." / the Score text. Below the list: "Wallets are the largest non-custodial holders of each tokenized stock, read from public Solana data. Identities are unknown." (`:107-108`).

**Empty / loading.** Four skeleton rows (`:75-76`); `/api/investors` failed → sample profiles labelled "Sample profiles shown while on-chain holders load." (`:109`).

**Practice vs live.** None.

**Fabricated → real.** `WALLETS` names, handles, bios, `perf7/perf30`, `verified`, `photo` → `/api/investors` (rugcheck top holders filtered to real wallets, `api/investors/route.ts:58-91`) + claimed profiles; "ranked by 7d" over invented numbers → real weighted trailing move; `openWallet` toast with `href="#"` Solscan (`:797`) → `/investor/[id]` and `OnChainBadge`'s real Solscan link.

### 3.8 `/investor/[id]` — one wallet

**Partner:** no page; `openWallet` toast `engine.js:794-798`. **Live:** `investor/[id]/page.tsx` — real, keep.

Static: `<Panel static title={investor.name} subtitle={investor.handle} action={<BackBar />}>`. Body, top: avatar `lg`, name (`font-mono` for addresses), handle, bio, `PerformanceBadge` + "7-day move of holdings" (`:57-58`), `OnChainBadge` (Solscan link for real wallets, the "Solana verification is coming / sample wallet" popover for samples, `OnChainBadge.tsx:8-38`), `FollowButton md`, `SocialLinks` (profiles do not carry socials today; renders nothing for wallets). Then eyebrow `HOLDINGS` with `AllocationBar` and `HoldingRow`s (`Copy holding ↗` → `/buy/{t}?ref={id}`). **New:** eyebrow `FILLS ON SOLERA` — `FeedRow`s from `/api/feed?actors={id}` (only fills this wallet made through Solera, with notes) and the empty "No fills on Solera yet. Holdings above are read from the chain." — this replaces the partner's "read their notes" promise (README) with something true. Not found: "We couldn't find that investor." (`:32`).

### 3.9 `/portfolio` — Portfolio

**Partner:** `index.html` (`partner-portfolio-desktop.png`, `partner-mobile-portfolio.png`): `hero 8 | since 4 / positions 8 | calendar 4 / plans 12` (`terminal.css:145`); `renderHero` `engine.js:305-335`, `renderSince` `:732-752`, `renderPositions` `:664-691`, `scorecard` `:694-707`, `renderCalendar` `:771-776`, `renderPlans` `plans.js:128-146`.
**Live today:** `portfolio/page.tsx` — heading `:88-94`, balance card `:96-128`, "Portfolio perspective" `:130-153`, holdings `:154-183`, pre-IPO `:184-222`, options `:224-263`, recent activity `:265-279`, "Not yet in your portfolio" `:281-298`.

**Grid:** `portfolio` — `hero` (8, auto, phone Portfolio·1) · `since` (4, sized 12, Portfolio·2) · `positions` (8, sized 18, Portfolio·3) · `plans` (4, sized 18, Portfolio·4) · `activity` (12, auto, Portfolio·5). The calendar card is cut (decision); `plans` takes its slot; `activity` is added (layout-engine §5.1).

**`hero` card** (`.panel.hero`, graph paper) — title `Balance`; tools = `RangeSwitch`.

- Eyebrow: `PRACTICE MODE` / `LIVE · SOLANA MAINNET` (`portfolio/page.tsx:101` today says "Total practice balance" / "Total balance · on-chain"). In practice with no wallet the eyebrow line ends with a `Connect a wallet to trade for real` link (the retired `ModeStrip` call).
- Greeting (`.hello`): "Good {morning|afternoon|evening}, {first name}." when a claimed profile or an email account supplies a name; otherwise "Good {time of day}." No persona (the partner's `Lorenzo`, `data.js:50`, is invented).
- Balance: `formatCurrency(totalValue)` (`:56`: holdings + pre-IPO + cash) with `tweenText` counting (partner `:127-134`, honour reduced motion) and the range delta: "down **0.2%** this week" from the range series' first vs last (`weekChangePct` logic `:66` generalised to the selected range; when the real series has not loaded: no delta, and the caption "loading real history" — the partner's synthetic `portfolioSeries` is not used).
- KPI tiles (partner `:321-327`): `CASH` `formatCurrency(cashBalance)` (live: "SOL + USDC" label as `:123`) · `INVESTED` `holdingsValue + preIpoValue` · `NPL` `computePortfolioPerformance(holdings)` as `+8.7%` (unrealized; live holdings without a cost basis are excluded from the figure and a `small` says "{n} bought elsewhere excluded") · `POSITIONS` count · `FOLLOWING` `useFollowedInvestors` size. The Solera Score sentence ("TSLAx is your largest holding at 44% … concentration", `:143-149`) folds into a sixth tile `SCORE` `72/100 steady` with the sentence as its `small`, linking to `/leaderboard`.
- Pinned chips (partner `:328`): positions with `pinned` in the notes store: `📌 TSLAx $379.48 +52.8%` → selects the position.
- Chart: `BigChart` over the portfolio series for the range = Σ shares × ticker history + cash (`buildRealPortfolioHistory`, `lib/portfolio.ts:90`, extended to take the range; §4). Fallback `buildPortfolioHistory` (the illustrative curve, `:67`) is **not** drawn; while loading, the chart area shows "Real history loading…".
- Allocation bar + legend: `AllocationBar` (`components/AllocationBar.tsx`) with the `--tk-n` colours (design-system 5.3) and the partner's legend `● SPYx 76% ● TSLAx 12%` (`:331`).

**`since` card** — title `Since you last looked`, subtitle `{rel time} · what moved, who traded, what you wrote` or `first visit`. Store: localStorage `solera:visit` = `{ at, total, prices: Record<ticker, price>, gaps: Record<symbol, premiumPct> }`, written on `pagehide`, every 60 s and 2.5 s after load (partner `:1025`), read once at boot. Items (partner `:736-747`), each a row `small` kind · sentence, in order:

| Kind | Sentence | Source |
|---|---|---|
| `BALANCE` | "**−$2.74** since 14 min ago · now $4,341.49" | `totalValue − visit.total` |
| `HELD` | "**TSLAx** moved **+0.1%** · $379.32" (≤ 3, by absolute move, ≥ 0.05%) | holdings × `getEffectivePrice` vs `visit.prices` |
| `GAP` | "**OPENAI** gap narrowed 2.2 pts · now **+52.1%** vs mark" (≤ 2, ≥ 0.3 pts) | pre-IPO store vs `visit.gaps` |
| `FOLLOWING` | "**3** trades by people you follow · latest: {name} bought SPACEX — "…"" | `/api/feed?tab=all&actors=&since={visit.at}` |
| `YOU WROTE` | "**SPYx** is wrong if "I ever trade it." — still true?" (≤ 2, unmarked wrong-ifs) | notes store |

`AHEAD` rows (calendar) are cut. Empty: "Nothing yet. Come back after a few minutes and this fills in: balance change, movers you hold, gaps, trades by people you follow, and your own "wrong if" lines." (partner `:750`). First visit subtitle: `first visit`.

**`positions` card** — title `Your positions`, subtitle `**$3,499.32** invested · $842.17 cash · **NPL +10.8%** · 4 open · drag to reorder · 📌 pins to the balance card` (partner `:667`; NPL omitted when no cost basis exists). Rows = `PositionCard` per holding (equity from `computeHoldings(rawHoldings)`, pre-IPO from `preIpoPositions` `:38-46` in live mode), ordered by the notes store `sortOrder` (pointer drag within the card; `layout-engine.md` §2 keyboard rules apply):

- head (`.pos-head`): grip · badge · `Tesla` `TSLAx` · `1.100 × $379.48 · cost $248.42` (cost only when `costBasis`) · sparkline (7d) · value + `+52.8%` (`gainPct`) · 📌.
- `Scorecard` (§2.4).
- `.pos-note`: `WHY` textarea, `HORIZON` input, `WRONG IF` input — saved on blur to `/api/notes` (identity) or `solera:notes` (signed out), toast "Note saved".
- actions: `Buy` / `Sell` → `/buy/{t}` / `?side=sell` (today's `HoldingRow` actions `:176-178`) — on desktop these select the ticker in the markets grid instead (`/markets?sym=&side=`).

Foot: "Every fill carries its note. Edit inline." — the partner's second clause ("a weekly digest quotes your "wrong if" back and asks whether it happened", `:677`) promises a feature that does not exist and is dropped. Empty: "No positions yet — buy something from Markets." linking `/markets` (`:167`); live with no wallet balances loaded: `LoadingState` (`:76-84`); live wallet holding nothing: "This wallet holds no tokenized stocks yet." The options section (`:224-263`) is cut with the chain; `optionPositions` remain in the persisted store shape so old localStorage still parses (`use-portfolio.ts:125-130`) but are not rendered.

**`plans` card** — title `Plans`, subtitle `standing orders in plain words · {n} live`. Body (partner `plans.js:133-139`): composer `› if TSLAx opens at 370, buy $250 and hold until 400 or until deliveries miss` + `ARM IT`; a preview line under it (`Understood: when TSLAx falls to $370 → buy $250 · then hold until target $400 or wrong if "deliveries miss"` / `Not yet: which ticker?`) that comes from `POST /api/agent` in `preview` mode (the regex parser is replaced by the model; the partner's parser has the `$345`-as-amount and `sell 1 share`-as-all bugs, audit plans-agent); example chips (the partner's five `EXAMPLES`, `:127`, with prices rewritten from live figures so they are never stale); the live list (`armed` / `holding` / `ready to sign`) with `cancel`, then `EARLIER` (done/failed/cancelled/expired, last 6). Each row: `TSLAx` · status chip · the sentence in `q` · the rule in `small` · last log line in `em`. Foot, by mode: practice "A plan is your sentence, executed in practice cash on Solera's server when its price condition is met. Human conditions ("until deliveries miss") become the position's wrong-if for you to mark."; live "Price conditions become a Jupiter Trigger order you sign once; funds sit in Jupiter's vault until it fills or you cancel. Anything Trigger can't express waits here as "ready to sign"." (decision text). Data: `GET /api/plans`, `DELETE /api/plans/{id}`; the agent/plans document owns the parser, the executor and the Trigger flow — §5.5 lists only the fields this card renders. Empty: "No live plans. Write one above — Solera reads it, shows you the rule it understood, and only arms it when you say so." (partner `:137`, "parses" → "reads").

**`activity` card** — title `Recent fills`, tools = `See all →` (`/activity`). Rows = the last 5 `transactions` (`useActivePortfolio`) as `TransactionRow` extended with the note blockquote, the `practice` / `on-chain ↗` chip, and `via plan` / `via agent` chips. Empty: "No trades yet." (`:272`).

**Cut from today's page:** the page heading ("Your long view / Your portfolio."), "Portfolio perspective" as a section (folded into the hero KPI), "Your options", "Not yet in your portfolio" (`:281-298`; Markets covers it — layout-engine §5.1).

**Practice vs live.** Eyebrow, cash label, NPL availability (cost basis), pre-IPO rows (live only), `ProfileButton` in the hero (live only today, `:110`; port shows it whenever a wallet is connected regardless of mode), fills chips. Plans foot by mode. `since` is the same in both.

**Fabricated → real.** `ME` (Lorenzo, $842.17, four pre-written positions and theses, `data.js:49-58`) → the practice store's real starting state (`MY_CASH_BALANCE`, no positions) or wallet balances; synthetic `portfolioSeries` → `buildRealPortfolioHistory`; `ACTIONS` calendar → cut; scorecard "holders on the tape still in" → top-wallet count; the greeting persona → profile name or none.

### 3.10 `/activity` — every fill

**Live:** `activity/page.tsx` (`TransactionRow` list). Static: `<Panel static title="Recent fills" subtitle="{n} fills · {practice|live}" action={<BackBar />}>`; the same rows as the portfolio `activity` card, all of them, newest first, with a `Practice | On-chain` filter only in live mode (the live ledger holds only Solera-made on-chain trades, `use-live-portfolio.ts:16-24`). Empty: "No trades yet / Buy from your portfolio or copy a holding from the feed to get started." (`:20-27`). Practice vs live: which ledger (`useActivePortfolio`).

### 3.11 `/news` — all headlines

**Partner:** `renderNews` `engine.js:754-759` is dead code (never in a `PAGES` entry) with `href="#"` links. **Live:** `news/page.tsx` (`Markets | Your holdings | Pre-IPO` segment `:34-43`, `NewsList` sections `:45-80`).

Static: `<Panel static title="News" subtitle="headline · source · link, never the article" tools={segment} action={<BackBar />}>`. The subtitle is the partner's own line (`:757`) and it is true for us (`NewsItem.url` is the publisher's). Rows are `NewsRow` (vote column + comments, §2.5) grouped exactly as today: Markets = general; Your holdings = one section per held ticker/company (`:47-67`, empty "Nothing held yet. Buy something and its news shows up here."); Pre-IPO = one section per `COMPANIES` entry (`:69-80`). Practice vs live: the "Your holdings" scope follows the active portfolio (`:14-16`).

### 3.12 `/agent` — the Agent (new route)

**Partner:** `agent.html` (`partner-agent-desktop.png`): a docs card for `window.SOLERA.agent`, `?plan=`, `postMessage`, a "Try it here" input that arms plans, and a live JSON snapshot (`plans.js:149-171`). The decision cuts the in-page API and the postMessage bridge (audit: no origin check; leaks wallet, cash and notes to any framing page) and makes the tab a chat over `/api/agent`.

**Grid:** `agent` — `agent` (8, sized 24, phone Agent·1) · `plans` (4, sized 24, phone Agent·2; the same `plans` component as `/portfolio`).

**`agent` card** — title `Agent`, subtitle `Claude · reads live prices, news and your positions · never signs` (until the key is wired, the deployment shows `mock model · replies are canned` — honest, per decision "built against a mock model"). Body: a message list (`.lens-answer` styling from `signals.js:187-190`, user turns right-aligned, model turns with the `Lens · from Jupiter, your notes` source eyebrow becoming `from {tools used}` — the route returns which tools ran); a composer `› Ask, or write a plan…` + `SEND`; prompt chips (rotating six of the list below); and the foot "Composed by Claude from live figures. Nothing here is a forecast or a recommendation. Plans are armed only after you confirm; nothing is signed without your wallet."

Prompt chips — the partner's `SAMPLE` (`signals.js:99-110`) filtered to what the tools can answer honestly:

| Keep | Tool(s) behind it |
|---|---|
| `What moved while I slept?` | prices + visit snapshot + feed |
| `Who is buying what I hold?` | investors (top holders) + feed fills for held tickers |
| `Is OPENAI's premium normal?` | pre-IPO gaps: this token vs the mean absolute gap across all pre-IPO tokens (partner `:130`) |
| `Which of my wrong-ifs is closest to firing?` | notes + prices (the model reasons; the answer quotes the note back, never judges it) |
| `Read my TSLAx thesis back to me` | notes |
| `How liquid is TSLAx right now?` | Jupiter `liquidity` (replaces "How big is this market, really?", which needs the universe fetch) |
| `Is the NYSE open right now?` | Pyth `underlying.stale` (replaces "Is METAx open right now?", which used the invented 24/5 rule) |
| Cut | `What happens to my SPYx on dividend Monday?` (calendar), `Where is the liquidity going?` (universe), `Is the tape leaning one way?` (universe) |

Agent actions the card renders inline (from the route's `actions[]`): `plan_preview` → the Plans composer preview + `ARM IT` button; `open_ticket` → a `TradeTicket` sheet prefilled (never auto-submitted); `open_ticker` → `/markets?sym=`. `?q=` sends the question on load; `?plan=` **prefills the composer and waits** (partner armed it on load, `plans.js:175`).

**Empty state (no messages):** the chips and one line: "Ask about a token, a gap, your notes, or write a plan in plain words."

**Practice vs live.** Plan previews say which executor applies ("fills in practice cash on Solera's server" / "becomes a Jupiter Trigger order you sign once"); `open_ticket` opens the mode's ticket. Signed-out visitors can chat (prices, news, gaps) but get "Sign in to save a plan" on `ARM IT`.

**Fabricated → real.** The Lens regex composer (`signals.js:115-178`, "No model wrote this") → Claude tool-use; the JSON snapshot with `people: WALLETS` and `calendar: ACTIONS` (`plans.js:103-110`) → gone; `?plan=` auto-arming → preview only.

### 3.13 Cut routes and components

- `/options/[ticker]/[contractId]`: `notFound()`; delete `OptionsChain.tsx`, `OptionsTradeScreen.tsx`, `use-execute-options-trade.ts`, `lib/options-trade.ts`; keep `lib/options.ts` only if `use-portfolio.ts`'s validators still import it, else delete and drop the `optionPositions`/`optionTransactions` fields on the next store version.
- `ModeStrip.tsx`, `DiscoveryRail.tsx`, `Hero.tsx`, `FeedList.tsx`, `MarketRow.tsx`, `AssetPosition.tsx`, `ChatRoomCard.tsx` (desktop), `SegmentedControl.tsx` (replaced by the `.seg` primitive, design-system 4.6) — deleted or folded as stated above.
- Partner pieces not ported at all: `renderCalendar`, `renderActivity` (dead), `renderNews` (dead), `sessionInfo`, `streamTrade`, `tick`/`roll`/`retarget`, `openGate`, the demo wallet, `openWallet` toast, `window.SOLERA.*`, `?plan=` arming, `postMessage`, Lens `answer()`, Signals/Flows (until `/api/universe`), the stories strip, `layout.js` (replaced by the layout engine), `fonts.css` (766 KB; the same two families are already loaded by `layout.tsx:12-22`).

---

## 4. Chart ranges: 24H · 1W · 1M · 6M (kept, by extending `api/price-history`)

Today: `api/price-history/route.ts:23-24` fetches 30 days from CoinGecko `market_chart` and thins to 120 points; `getEffectiveHistory(ticker, "7d"|"30d")` slices the last quarter for 7d (`lib/live-prices.ts:56-63`). 24H and 6M have no source (audit).

Verified Sept 22 against `https://api.coingecko.com/api/v3/coins/tesla-xstock/market_chart?vs_currency=usd&days=N` (free, keyless):

| `days` | Points | Spacing | Use |
|---|---|---|---|
| `1` | 289 | 5 minutes (first gaps 5,5,5,5,5 min; last 3 min) | **24H** |
| `30` (current) | ~720 hourly, thinned to 120 | ~6 h after thinning | **1W** (last quarter) and **1M** |
| `180` | 181 | daily (1440 min) | **6M** |

Route: `GET /api/price-history?range=24h|30d|180d[&ticker=SYM]` (default `30d` keeps today's callers working). Response `{ source: "coingecko", range, history: Partial<Record<TickerSymbol, number[]>>, fetchedAt }`. Cache per range: `24h` 5 min (it moves), `30d` 15 min (today), `180d` 6 h. Fetch policy: `30d` for the featured eight at boot as today (`LivePriceLoader.tsx:57-69`, with the existing 12 s backfill against the rate limit, `route.ts:104-127`); `24h` and `180d` **lazily**, per ticker, on the first request for that range (the `single` map pattern, `route.ts:50-67`), so the boot burst stays at eight calls. Store: `history[ticker]` becomes `{ "30d"?: number[]; "24h"?: number[]; "180d"?: number[] }`; `getEffectiveHistory(ticker, range)` returns `[]` for a range not loaded (never the placeholder), and a `useHistoryRange(ticker, range)` hook triggers the lazy fetch. The hero's portfolio curve for a range needs every held ticker's series for that range: the hook takes a list. Pre-IPO tokens have no CoinGecko id in `xstocks.json`; their chart shows "No price history source for {issuer} tokens yet" (risk 4). X-axis labels per range follow `timeLabel`/`xTicks` (`engine.js:96-110`: `HH:00` for 24H, weekday for 1W, `Mon 5` for 1M, month names for 6M).

---

## 5. What the pages need from the backend (shapes; the agent/social documents are authoritative where they overlap)

### 5.1 Shared client stores

- `PreIpoLoader` + `lib/pre-ipo-store.ts`: one `/api/pre-ipo` poll (30 s) into a module store with `subscribe/getSnapshot`, replacing per-component `usePreIpo` polling. `usePreIpo()` keeps its signature over the store.
- `lib/live-prices.ts` gains `change24h`, `liquidity`, `lastFetchedAt`, and ranged `history` (§4).
- `src/hooks/use-auth.ts` (§1.7), `src/hooks/use-notes.ts` (§2.3), `src/hooks/use-feed.ts`, `src/hooks/use-plans.ts`, `src/hooks/use-visit.ts` (§3.9), `src/hooks/use-selected-ticker.ts` (§3.2).

### 5.2 Feed, votes, comments, fills (Discover, `/news`, `/investor`, the tape, `since`)

```ts
// GET /api/feed?tab=news|hot|all|mine&actors=a,b&since=<ms>&limit=40
interface FeedItem {
  id: string;                       // "news:<newsId>" | "fill:<uuid>"
  kind: "news" | "fill";
  at: number;                       // ms
  score: number;                    // net votes
  myVote: -1 | 0 | 1;               // when the request carries an identity
  comments: number;
  news?: NewsItem & { tickers: string[]; scope: "market" | "ticker" | "company" };
  fill?: {
    actor: string; actorName?: string; actorHandle?: string;   // profile join
    mode: "practice" | "live"; via: "ticket" | "plan" | "agent";
    ticker?: string; mint?: string; side: "buy" | "sell";
    quantity: number; pricePerShare: number; totalValue: number;
    signature?: string;             // live only
    thesis?: ThesisFields;
  };
}
// POST /api/fills   (Authorization required; body = fill minus actor/id)  → { id }
// POST /api/vote    { id: FeedItem["id"], dir: -1 | 0 | 1 }               → { score, myVote }
// GET  /api/comment?id=…  → { comments: { id, actor, actorName?, body, at, score }[] }
// POST /api/comment { id, body }  (3–280 chars, 3 s cooldown as api/chat:54-63) → { comment }
```

News items are voted on by their `NewsItem.id` (Finnhub numeric id / Google guid, `api/news/route.ts:80`, `lib/news.ts:78`); the feed route re-fetches `/api/news` internally (already cached 10 min) and joins scores. Hot: `score / ((now − at)/3600000 + 2) ** 1.4`.

```sql
create table if not exists public.fills (
  id          uuid primary key default gen_random_uuid(),
  actor       text not null,                       -- 'wallet:<base58>' | 'user:<uuid>'
  mode        text not null check (mode in ('practice','live')),
  via         text not null default 'ticket' check (via in ('ticket','plan','agent')),
  ticker      text,                                -- xStock symbol
  mint        text,                                -- pre-IPO mint
  side        text not null check (side in ('buy','sell')),
  quantity    double precision not null check (quantity > 0),
  price       double precision not null check (price > 0),
  total_usd   double precision not null check (total_usd > 0),
  signature   text,                                -- live tx signature
  thesis      jsonb,                               -- ThesisFields
  created_at  timestamptz not null default now(),
  check (ticker is not null or mint is not null)
);
create index if not exists fills_created on public.fills (created_at desc);
create index if not exists fills_actor_created on public.fills (actor, created_at desc);

create table if not exists public.votes (
  post_id   text not null,                         -- 'news:<id>' | 'fill:<uuid>'
  actor     text not null,
  dir       smallint not null check (dir in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (post_id, actor)
);
create table if not exists public.comments (
  id          bigint generated always as identity primary key,
  post_id     text not null,
  actor       text not null,
  body        text not null check (char_length(body) between 3 and 280),
  created_at  timestamptz not null default now()
);
create index if not exists comments_post_created on public.comments (post_id, created_at desc);
alter table public.fills enable row level security;  alter table public.votes enable row level security;  alter table public.comments enable row level security;
create policy "fills readable" on public.fills for select using (true);
create policy "votes readable" on public.votes for select using (true);
create policy "comments readable" on public.comments for select using (true);
-- writes only through the service role from the routes above, after the identity check (same model as supabase/chat.sql)
```

### 5.3 Position notes (portfolio `positions`, hero pins, palette, `since`, the agent)

```ts
// GET /api/notes            → { notes: PositionNote[] }        (identity from Authorization)
// PUT /api/notes  { notes: PositionNote[] }  (upsert by (actor, key))
interface PositionNote { key: string /* ticker or mint */; note?: string; horizon?: string; wrongIf?: string; wrongHitAt?: number | null; pinned: boolean; sortOrder: number; updatedAt: number }
```
```sql
create table if not exists public.position_notes (
  actor        text not null,
  key          text not null,
  note         text check (char_length(note) <= 280),
  horizon      text check (char_length(horizon) <= 24),
  wrong_if     text check (char_length(wrong_if) <= 140),
  wrong_hit_at timestamptz,
  pinned       boolean not null default false,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (actor, key)
);
alter table public.position_notes enable row level security;   -- no anon policies: private to the actor, served by the route
```
Signed-out practice users keep the same shape in localStorage `solera:notes` and it migrates to the table on first sign-in (one `PUT`).

### 5.4 Trending (optional, Discover `trending` + strip `MOST TRADED`)

`GET /api/trending` → `{ tokens: { symbol, name, issuer: "xStocks" | "PreStocks" | "Other", mint, price, liquidity, holders, stats: Record<"1h"|"6h"|"24h", { priceChange, holderChange, liquidityChange, buyVolume, sellVolume, numTraders, numNetBuyers }> }[], fetchedAt }`, from `lite-api.jup.ag/tokens/v2/search?query=xStock` and `?query=PreStocks` filtered to `tags` containing `stocks` (both verified Sept 22: 20 results each, fields as listed), cached 3 min server-side (partner did this per browser, `signals.js:211-218`). Issuer from `tags` (`xstocks` tag → xStocks; symbol in `PRESTOCKS_SYMBOLS` → PreStocks) rather than the partner's name regexes (audit signals-lens "Issuer attribution uses name regexes").

### 5.5 Plans (portfolio and agent `plans` card) — fields the card renders

```ts
interface PlanRow { id: string; text: string; sym: string; status: "armed" | "holding" | "ready" | "done" | "failed" | "cancelled" | "expired";
  mode: "practice" | "live"; executor: "server" | "trigger" | "notify"; rule: string /* describe() sentence */;
  triggerOrderKey?: string /* Jupiter Trigger order account, live */; filled?: { price: number; quantity: number; at: number };
  log: { at: number; msg: string }[]; createdAt: number; expiresAt?: number }
// GET /api/plans → { plans: PlanRow[] } · DELETE /api/plans/:id · POST /api/agent { messages, mode: "preview" | "chat", context } → { reply, tools: string[], actions: Action[] }
```
Hosting facts the copy must respect (verified Sept 22 at `vercel.com/docs/cron-jobs/usage-and-pricing` and `/docs/functions/limitations`): Hobby cron jobs run **once per day at most**, triggered anywhere within the hour ("Per-hour (±59 min)"); functions default and max **300 s** with Fluid compute (the brief's "10 s / 60 s" figures are the pre-Fluid limits). So a practice plan cannot be watched by cron; the practical executor is `POST /api/plans/run` called from any open Solera tab's price poll (idempotent, server re-reads prices), with the daily cron as a sweep — the plans card's foot must say "checked while Solera is open" if that is what ships. Jupiter Trigger (live): `POST https://lite-api.jup.ag/trigger/v1/createOrder` requires `inputMint, outputMint, maker, payer, params` (verified: Zod error lists exactly these); `GET /trigger/v1/getTriggerOrders?user=&orderStatus=active` returns `{ orders, totalPages, page, totalItems, user, orderStatus }` (verified), which the card can poll for `ready`/`filled` state.

### 5.6 Identity helper for routes

`lib/actor-server.ts`: `actorFromHeader(header): Promise<{ actor: string; wallet?: string; userId?: string } | null>` — tries `verifySessionToken` (`lib/session-server.ts:40-59`) → `wallet:<addr>`; else `getSupabaseService().auth.getUser(token)` → `user:<id>`. Wallet-linked email accounts (a `wallet` column on a `users_wallets` table, written after a signed `buildProfileClaimMessage`-style link) resolve to the wallet actor so their fills and notes follow the wallet.

---

## 6. Fabricated-data register (every place, with the real replacement)

| Partner | Where | Replacement |
|---|---|---|
| 12 `TICKERS` with seeded prices, `ref`, `liq`, `beta`, `session` (`data.js:8-21`) | markets, asset, tape, strip, Lens | featured 8 (`lib/mock-data.ts:15`, `lib/tokens.ts:30-39`) + 737-token catalog + `/api/pre-ipo`; prices from `/api/live-prices`, liquidity/24h from Jupiter v3 (extension) |
| Synthetic `h7/h30/h180` random walks, `tick`, `roll`, `retarget` (`data.js:23-35`, `engine.js:120-125`, `830-848`) | every chart and sparkline, 24h change | CoinGecko series per range (§4); `isLiveHistory` gates every sparkline |
| GOOGLx/METAx as "Ondo Stocks · 24/5", `sessionInfo`, Session Clock, `Paused` chip, `reopens` labels (`data.js:14-15`, `engine.js:136-144`) | rows, asset head, signals, strip | cut; the only session fact shown is Pyth `underlying.stale` → "NYSE closed" |
| 8 `WALLETS` with names, faces, `perf7/perf30`, bios, `verified` (`data.js:38-47`) | leaderboard, stories, held-by, scorecard, Lens, palette, trending side lists | `/api/investors` real wallets; profile names when claimed; `✓` = signature-verified claim |
| `ME` Lorenzo, $842.17, 4 positions with theses (`data.js:49-58`) | hero greeting, positions, plans snapshot, sign-up copy | practice store starting state (cash only) or wallet balances; greeting by profile name or none |
| `NEWS` 8 headlines credited to real outlets + "Solera Wire", with `what/affects/watch` bullets and `picsum` images (`data.js:60-93`) | feed, asset news, story sheet, Lens | `/api/news` (Finnhub / Google News RSS); summary from Finnhub; no bullets |
| `ACTIONS` calendar incl. a fictitious NVDAx split (`data.js:95-100`) | calendar card, since, asset action line, strip `AHEAD`, Lens | cut entirely |
| `ROOM` 4 messages (`data.js:102-107`) | room | Supabase `messages` |
| `NOTES` + `streamTrade` random tape with fake tx hashes (`data.js:110-121`, `engine.js:849-862`) | feed, tape, trending "on the tape", since "following" | `fills` table written on real fills |
| `seedScore`, `SEED_COMMENTS`, localStorage votes (`engine.js:510`, `:526-533`) | feed, story sheet | `votes` / `comments` tables from zero |
| `quoteFor` impact/fee formula and `SOL_USD = 214.5` (`engine.js:428-436`) | ticket quote | Ultra `/order` quote and `getSolPrice()` |
| Fake fill with random `tx` in Live (`engine.js:482`, `:502`) | success toast, tape | real signature from `executeTrade` |
| `DemoW4LLet…` live mode (`engine.js:1029`) | mode toggle, wallet pill, gate sheet | `useTradeMode` + `openConnect`; no demo wallet |
| localStorage accounts, no password, discarded signature (`engine.js:928-947`) | auth sheet | Supabase Auth email+password; wallet identity unchanged |
| "8 of 737 xStocks shown" literal (`engine.js:353`) | markets foot | computed `{tradeable} of {tokens.length}` |
| Street Index sparkline ramp (`signals.js:68`) | signals | not ported |
| Lens answers labelled "Jupiter" over simulated prices, headlines "placeholders" (`signals.js:161-167`) | Lens sheet | Claude with tools over real routes; sources listed per reply |
| Plan parser bugs (`plans.js:37-49`) | plans preview | model-parsed preview + explicit confirm |
| Footer claims (`engine.js:293`) | footer | live status line (§1.9) |
| `pravatar` faces (`engine.js:13`) and `picsum` images | everywhere | initials avatars; publisher images only |
| README/llms.txt promises ("read their notes", "weekly digest", MCP server) | copy | not repeated anywhere in the UI |

---

## 7. Practice vs live, in one table

| Surface | Practice (no wallet, or wallet + practice) | Live (wallet connected, mode live) |
|---|---|---|
| Masthead / pill | "Practice edition"; pill "Connect wallet" or amber dot | "Mainnet edition"; green dot, SOL balance |
| Hero eyebrow / cash label | `PRACTICE MODE` · "Cash" | `LIVE · SOLANA MAINNET` · "SOL + USDC to invest" |
| Holdings | `stocklana:portfolio` (`use-portfolio.ts:19`), always with cost basis | Ultra balances (`use-live-portfolio.ts:84-106`); cost basis only for Solera-made trades |
| Pre-IPO positions | none | wallet-held mints priced by `/api/pre-ipo` |
| Ticket quote | live price, $0 fees, "simulated" | Ultra quote, impact, fee bps, SOL/USDC |
| Ticket submit | `applyFill` locally + `POST /api/fills mode=practice` (if signed in) | wallet signs (`executeTrade`), Solscan link, `POST /api/fills mode=live` |
| Pre-IPO ticket | connect prompt + "Or buy on Jupiter ↗" | full ticket |
| Fills on the tape / feed | `practice` chip | `on-chain` chip + signature |
| Plans | server executes in practice cash | Jupiter Trigger order to sign; `ready to sign` fallback |
| Rooms, votes, comments | wallet session or email JWT; rooms wallet-only | same |
| Options | cut | cut |
| Investors, news, pre-IPO data, trending, since | identical | identical |

---

## 8. Copy sheet (titles, subtitles, empties, in the partner's voice)

Panel titles (render `// TITLE`): `Balance` · `Since you last looked` · `Your positions` · `Plans` · `Recent fills` · `Markets` · `{Name} · {SYM}` · `{SYM} room` · `Same company, two issuers` · `Discover` · `Trending` · `People` · `Agent` · `News` · `{Company} · valuation ladder` (deferred).

Eyebrows inside bodies: `PRACTICE MODE` / `LIVE · SOLANA MAINNET` · `CASH` `INVESTED` `NPL` `POSITIONS` `FOLLOWING` `SCORE` · `WHY` `HORIZON` `WRONG IF` · `EXCHANGE REFERENCE` `ON-CHAIN GAP` `LIQUIDITY` `ISSUER MARK` `GAP TO MARK` · `ASK THE AGENT` · `HELD BY` · `{NAME} IN THE NEWS` · `THIS THESIS IS ABOUT` · `ON THE TAPE, LAST HOUR` · `PEOPLE YOU FOLLOW` · `MOST HELD BY TOP WALLETS` · `HOLDINGS` · `FILLS ON SOLERA` · `EARLIER` · `WHAT IT IS` · `WHO IT TOUCHES`.

Empty states (title / body):
- Feed, signed out, no fills: "Nothing on the tape yet." / "Fills land here with their notes — yours and everyone's. Practice fills are labelled; on-chain fills link to Solscan."
- Feed, Following: "Follow someone on Leaderboard and their fills show up here."
- Feed, Mine: "Your fills land here with their notes."
- Positions: "No positions yet — buy something from Markets." · live: "This wallet holds no tokenized stocks yet."
- Since: "Nothing yet. Come back after a few minutes and this fills in: balance change, movers you hold, gaps, trades by people you follow, and your own "wrong if" lines."
- Plans: "No live plans. Write one above — Solera reads it, shows you the rule it understood, and only arms it when you say so."
- Recent fills: "No trades yet."
- Markets search: "No matching assets." / "Try another company or ticker."; Watchlist: "Keep a few on your radar." / "Tap the star beside a stock to save it to your watchlist."
- Held by: "No wallets to show for {SYM} yet."; News: "No recent coverage."
- Room: "Nobody has posted in #{SYM} yet. Be the first."
- Compare: "Only one issuer is answering right now, so there is nothing to compare."
- Investor fills: "No fills on Solera yet. Holdings above are read from the chain."
- Agent: "Ask about a token, a gap, your notes, or write a plan in plain words."
- Trending fallback loading: "Reading the largest wallets on Solana…"
- Chart, range not loaded: "{24H|1W|1M|6M} chart loading…"; pre-IPO: "No price history source for {issuer} tokens yet."

Sentences that must never appear: anything from the partner footer (`engine.js:293`), "Largest real holders" over sample data, "verified" without a signature, "24/5", "weekly digest", "MCP server", "$5,000 practice cash" as a literal.

---

## 9. Open questions (only the user can decide)

1. **Practice fills on the shared tape.** Default here: practice fills of signed-in users are posted to `fills` and shown with a `practice` chip on Everyone/Hot (decision text). Design-system open question 8 asks whether the Live edition should hide them; this document keeps them visible with a filter. Confirm.
2. **Thesis on a pre-IPO buy: is the leg required?** The decision makes the note optional; the partner blocks a pre-IPO buy until a leg is named (`engine.js:412`) and the scorecard is far better with one. Default here: optional, with the "No leg named" scorecard sentence. Require it?
3. **Practice pre-IPO fills.** The live app has no practice ledger for pre-IPO mints, so in practice mode the pre-IPO ticket is a connect prompt. Adding practice pre-IPO fills (extend `applyFill` to mints, price from `/api/pre-ipo`) would let the leg scorecard be demoed without a wallet. Default: not for Thursday.
4. **Pre-IPO asset card on phones.** Default: rows open the existing `PreIpoBuySheet`; the pre-IPO asset card is desktop only. Alternative: a `/pre-ipo/[symbol]` route.
5. **Default selection on `/markets`.** `TSLAx` (partner). Or the user's largest position when one exists?
6. **Rooms for email accounts.** Rooms are wallet-signed today (`/api/chat` needs the session token). Default: email accounts see "Link a wallet to post in rooms". Alternative: accept the Supabase JWT in `/api/chat` (identity `user:<id>`, `messages.wallet` becomes `actor`).
7. **Trending route.** Build `/api/trending` (Jupiter search, ~1 hour) or ship only the "most held by top wallets" fallback? Default: fallback ships; route if time remains.
8. **Signals / Flows / ladder.** Registry slots reserved; none in the Thursday layout (layout-engine question 7). Confirm.
9. **Greeting.** "Good afternoon, {first name}." only with a claimed profile or email name; else "Good afternoon." Or drop the greeting line entirely?
10. **`/asset/[ticker]` on desktop = the markets grid** (one saved layout for both routes; layout-engine question 4). Confirm.
11. **Solera Score.** Kept as a hero KPI tile and the People toggle. Drop it?
12. **Where the plans executor runs** given Hobby cron is once per day: tab-driven `/api/plans/run` (copy: "checked while Solera is open") vs. relying on Jupiter Trigger for anything price-based even in practice. The agent/plans document should decide; the plans card copy depends on it.

---

## 10. Risks

1. **Scope.** Priority 1 alone touches every route. The cards that can be shipped as pure UI over existing data (`markets`, `asset` head/chart/facts/held-by/news, `people`, `room`, `compare`, `activity`, `since`) should land before anything that needs a new table (`feed`, votes, comments, notes, plans, agent). Each per-route entry above marks what is (b) vs (c).
2. **`/api/live-prices` extension** (24h change, liquidity) is small but on the hot path (5 s poll, 5 s server cache); a mistake there blanks every price. Add the fields additively and keep the old shape.
3. **CoinGecko rate limit.** Four ranges × eight tickers = 32 calls if fetched eagerly; the lazy per-range policy in §4 keeps boot at eight. The free tier already rate-limits the current burst (the route has a 12 s backfill loop for that reason).
4. **Pre-IPO charts have no source.** Neither `/api/price-history` nor Jupiter's lite API gives a series for PreStocks/Tessera mints. The asset card must show the honest empty rather than a flat line; the partner's pre-IPO charts were synthetic.
5. **Catalog tickers have no exchange reference.** Only the featured eight have Pyth feeds; the facts row says "not tracked" for the other 729. Jupiter's `stockData.price` (present for xStocks mints, verified) is a later fix and must be labelled "via Jupiter" if used.
6. **Identity split.** Two token kinds (wallet HMAC session, Supabase JWT) reach the new routes; the helper in §5.6 must be the only place they are parsed, or a route will accept one and not the other. Email accounts that later link a wallet need their earlier `user:<id>` fills and notes re-keyed to `wallet:<addr>` (one SQL update on link).
7. **Stored XSS returns if any partner template string is copied.** All rows are JSX; server-side length/charset checks on display names, notes and comments (§2.3, §5.2).
8. **The `since` card and pins depend on localStorage** and are per browser; a user on two devices sees different "since" cards. Acceptable for Thursday; noted in copy ("in this browser") only where it matters (Mine tab, notes before sign-in).
9. **Feed `Following`/`Mine` filters pass actor lists in the query string**; with many follows the URL grows. Cap at 40 (the investors route returns at most `MAX_WALLETS = 40`, `api/investors/route.ts:24`).
10. **Vercel Hobby cron once per day** makes "server-side practice plans" only as live as the clients polling `/api/plans/run`; the plans card copy must not promise 24/7 watching for practice plans (only Jupiter's keeper is 24/7, for live Trigger orders).
11. **The sample-investor fallback** (`use-investors.ts:64`) still exists for when `/api/investors` is down; every surface that shows people must keep its "sample" label in that branch or the honesty rule breaks silently.
12. **Layout-doc coupling.** Registry ids, phone tabs and default spans in this document are the layout document's; if that document changes a span or a tab, the per-route tables here must follow.

---

## 11. Verification log (Sept 22, 2026)

- Read every live route and the components/hooks/lib/api files cited; every `file:line` above is from that read.
- Read `engine.js` (1048 lines), `signals.js`, `bounty.js`, `plans.js`, `mobile.js`, `data.js`, `layout.js` (head), `mobile.css`, the grid lines of `terminal.css`, the partner `README.md` and `llms.txt`; evaluated `data-bounty.js` with Node to list `BOUNTY` keys and `VALUATIONS` shape.
- Viewed all 12 screenshots in `docs/design-reference/`; `live-asset-desktop.png` is blank (12 KB) and was not used.
- CoinGecko `market_chart` for `tesla-xstock`: `days=1` → 289 points at 5-minute spacing; `days=180` → 181 daily points (curl + Node, Sept 22).
- Jupiter Price v3 for the TSLAx and SPYx mints: fields `createdAt, liquidity, usdPrice, blockId, decimals, priceChange24h, stockData{id:"xstocks", price, mcap, updatedAt}`; SOL has no `stockData`.
- Jupiter `tokens/v2/search?query=xStock`: 20 tokens; fields include `holderCount, liquidity, mcap, stats5m/1h/6h/24h` with `priceChange, holderChange, liquidityChange, volumeChange, buyVolume, sellVolume, numBuys, numSells, numTraders, numNetBuyers`, `tags` incl. `xstocks, stocks`.
- Jupiter Trigger v1: `getTriggerOrders?user=…&orderStatus=active` → `{orders, totalPages, page, totalItems, user, orderStatus}`; `POST createOrder {}` → Zod error requiring `inputMint, outputMint, maker, payer, params`.
- PreStocks `https://prestocks.com/api/prestocks`: 8 entries (ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET, SPACEX) with `markPrice, markValuation, tokenPrice, impliedValuation, supply, contract_address`.
- `@supabase/auth-js` 2.116.0 (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts`): `signUp(`, `signInWithPassword(`, `signOut(`, `getUser(`, `onAuthStateChange(` present.
- Next.js 16.3.5 docs: `use-search-params.md:82-88` (Suspense requirement), `route.md` (route handlers), `use-pathname.md`, `use-params.md` present under `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/`.
- Vercel docs: cron Hobby = once per day, per-hour precision (±59 min), 100 jobs/project; functions Hobby = 300 s default and maximum with Fluid compute; 4.5 MB request/response body.
- `src/data/xstocks.json` has 737 `symbol` entries; `.env.local` variable names only were listed (`PYTH_API_KEY`, `FINNHUB_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); no values were printed.
- No source files were modified; this document is the only file written.
