# Solera

**Stocks on Solana, with the people who hold them.** Solera is a social investing terminal for tokenized equities: live prices for every xStock on Solana, real on-chain investors to follow, real swaps from your own wallet through Jupiter, pre-IPO tokens compared across issuers, news with votes and comments, a room for every ticker, standing plans written in plain English, and an agent that reads prices, news and your plans and never signs anything. Practice mode lets anyone try all of it with nothing at stake.

Live at **https://trysolera.vercel.app**. Built for the Solana Foundation Stocklana hackathon.

## What it does

- **A terminal you arrange.** Every screen is a grid of cards: drag a card by its handle, resize it from the corner, drop it on a neighbour of the same size to swap. Layouts persist per page. On phones each tab shows its own stack.
- **Every tokenized stock on Solana.** 737 xStocks from the bundled catalog, priced through Jupiter, with liquidity and "not yet trading" labels so thin markets are never a surprise.
- **Live prices, keyless.** xStock prices from Jupiter, underlying share prices read straight from Pyth's on-chain price accounts, 24h · 1W · 1M · 6M history from CoinGecko. No paid feeds.
- **Real trades from your wallet.** Buy or sell any xStock or pre-IPO token with SOL (default) or USDC. Orders are built by Jupiter Ultra, signed in Phantom or Solflare, and landed on mainnet. Solera never holds keys or funds.
- **Works from Safari on iPhone.** Phantom's deeplink protocol connects and signs without leaving Safari; Android uses Mobile Wallet Adapter.
- **A thesis on every fill.** Why you bought, what would prove you wrong, your horizon. Optional, carried onto the position and the public tape, and scored against what the price did since.
- **Standing plans in plain words.** "If TSLAx falls to $300, sell 5 shares." Solera shows the rule it understood and arms it only when you tap. Practice plans fill on the server, checked about once a minute. Live plans become Jupiter Trigger orders you sign once, or wait as "ready to sign" when Jupiter can't express them.
- **An agent that never trades.** Ask for prices, news or your plans, or write a plan in a sentence. Claude answers when an API key is present; an offline parser answers the same way without one. Every proposal is a card with a button; nothing is armed, filled or signed by the model.
- **Real investors.** The leaderboard and "held by" lists are the largest real wallets holding each token, read from the chain, with verified links to Solscan. When the source is down, the card says so; nothing stands in for it.
- **Pre-IPO, compared.** OpenAI, Anthropic, SpaceX and others from PreStocks and Tessera, placed side by side on implied valuation so you can see which issuer is cheaper and how far each is from its own mark.
- **A feed people shape.** Headlines and fills with notes, ranked by real votes, with comments. Scores start at zero; nothing is seeded.
- **Accounts two ways.** Claim a handle by signing a message with your wallet, or sign up with an email and password to browse, practice, vote and comment, then link a wallet to trade live. Every ticker has a public room; posting needs one wallet sign-in good for 30 days.
- **Practice mode.** No wallet needed. Simulated fills at live prices, a practice portfolio that follows you across devices once you sign in, and copy trading from real wallets' holdings.

## Regulatory context

On September 17, 2026 the SEC issued a five-year Innovation Exemption for on-chain trading of tokenized US stocks: permissioned automated market maker pools on public, permissionless ledgers, for tokens that carry the full rights of the underlying share. Solera is a front end for exactly that model. The xStocks tradeable today are issued by third parties, are not offered to US persons, and carry price exposure rather than shareholder rights; pre-IPO tokens likewise give exposure, not ownership. Solera labels this on every trade screen, issues nothing, and custodies nothing. As rights-bearing tokens reach Solana under the exemption, the same screens list them.

## Development

Requires Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests run the pure TypeScript modules (the layout engine, settlement math, Pyth parsing, pre-IPO valuation, deeplink encryption, session tokens, plans and their parser and evaluator, the agent's tools and mock model, the feed ranking, chat validation) through the TypeScript compiler; no test framework is needed.

### Environment

Prices, the catalog, trading, investors and news work with no configuration. Optional keys in `.env.local`:

- `FINNHUB_API_KEY`: richer company news (falls back to Google News).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: profiles, rooms, the server-side practice ledger, fills, notes, plans, the inbox and the feed. Run `supabase/schema.sql`, `supabase/chat.sql` and `supabase/port.sql` once in the Supabase SQL editor. For email accounts, switch the Email provider on in the Supabase dashboard (confirmation off for the hackathon) and add the site URL to the redirect list.
- `PLAN_EVALUATOR_SECRET`: the bearer that lets a scheduler call `POST /api/plans/evaluate` every minute. Vercel Hobby's cron runs once a day, so the minute cadence comes from Supabase `pg_cron` + `pg_net` (the block at the end of `supabase/port.sql`); an open tab also checks its owner's plans every 60 s, and while anyone has Solera open the health poll runs the shared pass whenever the scheduler has been quiet for 50 s, so practice plans fill without `pg_cron`.
- `ANTHROPIC_API_KEY`: turns the agent from the offline parser into Claude. `SOLERA_AGENT_MODEL_ID` picks the model (default `claude-opus-5`); `SOLERA_AGENT_MODEL=mock` forces the parser for demos.
- `SOLANA_RPC_URL`: a private RPC if the public one rate-limits.

## How it's built

- `src/lib/layout.ts`, `src/lib/panel-registry.ts`, `src/components/panels/`: the 12-column card grid with dense packing, drag, resize, swap-on-drop, keyboard control and per-page persistence.
- `src/lib/trade.ts` and `src/lib/jupiter.ts`: the one path every real trade takes (Jupiter Ultra order, wallet signature, execute), with a resumable second half for deeplink wallets.
- `src/lib/phantom-deeplink*.ts`, `src/lib/deferred-signing.ts`, `src/components/DeepLinkResumer.tsx`: Phantom over universal links on iOS Safari.
- `src/lib/plans.ts`, `src/lib/plan-parser.ts`, `src/lib/plan-evaluator.ts`, `src/app/api/plans/`: standing plans as data, the plain-English parser, and the minute evaluator that fills practice plans and notifies for live ones.
- `src/lib/agent/`, `src/app/api/agent/`: the agent's strict tools over the same library the routes use, a manual tool loop capped at six steps, the Claude adapter on `@anthropic-ai/sdk`, and the deterministic mock model.
- `src/lib/feed.ts`, `src/lib/feed-server.ts`, `src/app/api/feed/`: posts minted on first vote or comment from the server's own news cache or a fill row, ranked by score / (age + 2)^1.4.
- `src/app/api/live-prices`, `src/lib/pyth-onchain.ts`: Jupiter prices plus Pyth PriceUpdateV2 accounts read from mainnet.
- `src/app/api/catalog`, `src/lib/catalog*.ts`: the full xStock catalog, refreshed from CoinGecko and priced in batches through Jupiter.
- `src/app/api/investors`, `src/lib/investors.ts`: top holders from rugcheck, classified on-chain into real wallets.
- `src/app/api/pre-ipo`, `src/lib/pre-ipo.ts`: PreStocks and Tessera feeds, implied valuations, cross-issuer comparison.
- `src/app/api/session`, `src/app/api/profile`, `src/lib/auth-server.ts`: one HMAC session for both identities (a wallet signature or a Supabase Auth token), profiles keyed by owner.
- `src/app/api/practice/`, `src/app/api/fills`, `src/app/api/notes`, `src/app/api/tape`: the server-side practice ledger with optimistic concurrency, on-chain-verified live fills, position notes, and the public tape.
- `src/hooks/`: `useSyncExternalStore` stores for the practice and live portfolios, prices and history, the catalog, plans, the agent thread, profiles, sessions and rooms.

Signed out, practice state lives in the browser under `stocklana:*` keys and layouts under `solera:layout:*`; signed in, the practice ledger moves to the server and follows you.

## Hosting

Vercel project `solera`, linked in `.vercel/project.json`. Preview deploys come from pushing a branch; production is `npx vercel --prod`. Production env vars mirror `.env.local`.
