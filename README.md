# Solera

**Stocks on Solana, with the people who hold them.** Solera is a social investing app for tokenized equities: live prices for every xStock on Solana, real on-chain investors to follow, real swaps from your own wallet through Jupiter, pre-IPO tokens compared across issuers, news, and a room for every ticker. Practice mode lets anyone try it with nothing at stake.

Live at **https://trysolera.vercel.app**. Built for the Solana Foundation Stocklana hackathon.

## What it does

- **Every tokenized stock on Solana.** 737 xStocks from the bundled catalog, priced through Jupiter, with liquidity and "not yet trading" labels so thin markets are never a surprise.
- **Live prices, keyless.** xStock prices from Jupiter, underlying share prices read straight from Pyth's on-chain price accounts, 30-day history from CoinGecko. No paid feeds.
- **Real trades from your wallet.** Buy or sell any xStock or pre-IPO token with SOL (default) or USDC. Orders are built by Jupiter Ultra, signed in Phantom or Solflare, and landed on mainnet. Solera never holds keys or funds.
- **Works from Safari on iPhone.** Phantom's deeplink protocol connects and signs without leaving Safari; Android uses Mobile Wallet Adapter.
- **Real investors.** The leaderboard and "held by" lists are the largest real wallets holding each token, read from the chain, with verified links to Solscan.
- **Pre-IPO, compared.** OpenAI, Anthropic, SpaceX and others from PreStocks and Tessera, placed side by side on implied valuation so you can see which issuer is cheaper and how far each is from its own mark.
- **Profiles and rooms.** Claim a handle by signing a message with your wallet (no email, no password). Every ticker has a public room; posting needs one wallet sign-in good for 30 days.
- **News.** Market news on Discover, company news on each asset, coverage for private companies on the pre-IPO tab.
- **Practice mode.** No wallet needed. Simulated fills at live prices, a practice portfolio, and copy trading from real wallets' holdings.

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

Tests run the pure TypeScript modules (settlement math, Pyth parsing, pre-IPO valuation, deeplink encryption, session tokens, chat validation) through the TypeScript compiler; no test framework is needed.

### Environment

Everything works with no configuration: prices, catalog, trading, investors and news all use keyless public APIs. Optional keys in `.env.local`:

- `FINNHUB_API_KEY`: richer company news (falls back to Google News).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: profiles and rooms. Run `supabase/schema.sql` and `supabase/chat.sql` once in the Supabase SQL editor.
- `SOLANA_RPC_URL`: a private RPC if the public one rate-limits.

## How it's built

- `src/lib/trade.ts` and `src/lib/jupiter.ts`: the one path every real trade takes (Jupiter Ultra order, wallet signature, execute), with a resumable second half for deeplink wallets.
- `src/lib/phantom-deeplink*.ts`, `src/lib/deferred-signing.ts`, `src/components/DeepLinkResumer.tsx`: Phantom over universal links on iOS Safari.
- `src/app/api/live-prices`, `src/lib/pyth-onchain.ts`: Jupiter prices plus Pyth PriceUpdateV2 accounts read from mainnet.
- `src/app/api/catalog`, `src/lib/catalog*.ts`: the full xStock catalog, refreshed from CoinGecko and priced in batches through Jupiter.
- `src/app/api/investors`, `src/lib/investors.ts`: top holders from rugcheck, classified on-chain into real wallets.
- `src/app/api/pre-ipo`, `src/lib/pre-ipo.ts`: PreStocks and Tessera feeds, implied valuations, cross-issuer comparison.
- `src/app/api/profile`, `src/app/api/session`, `src/app/api/chat`: wallet-signature auth and Supabase-backed profiles and rooms.
- `src/hooks/`: `useSyncExternalStore` stores for the practice portfolio, live portfolio (balances via Jupiter), watchlist, trade mode, profiles, sessions and rooms.

Practice state lives in the browser under `stocklana:*` keys; live trade history under `solera:live-trades`, keyed by wallet.

## Hosting

Vercel project `solera`, linked in `.vercel/project.json`. Deploy with `npx vercel --prod`. Production env vars mirror `.env.local`.
