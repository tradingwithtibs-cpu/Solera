# Stocklana

A social investing practice app for Solana tokenized equities. Explore sample investors, follow their portfolios, review and copy a holding, manage a simulated portfolio, and keep a watchlist.

## Development

Requires Node.js 20.9 or newer and npm.

```sh
npm install
npm run dev
```

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The financial tests execute the actual pure TypeScript portfolio and settlement functions through TypeScript's compiler; no additional test dependency is required.

For a local production preview:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
```

## Architecture

- `src/lib/mock-data.ts`: canonical simulated tickers, profiles, and starting balances.
- `src/lib/portfolio.ts`: valuation, unrealized return, concentration score, and momentum calculations.
- `src/lib/ledger.ts`: validated application of a fill, including weighted cost basis and full-position selling.
- `src/lib/trade.ts`: isolated mock execution seam for a future wallet/swap integration.
- `src/hooks/`: localStorage-backed state via `useSyncExternalStore`.
- `src/components/AppShell.tsx` and `src/app/globals.css`: shared responsive layout and visual system.

Existing storage keys are `stocklana:portfolio`, `stocklana:watchlist`, `stocklana:followed-investors`, and `stocklana:chat`. Preserve their schemas and legacy transaction normalization. The getting-started guide uses `stocklana:onboarding`.

Live prices come from Pyth (Hermes) when `PYTH_API_KEY` is set in `.env.local` — a free key from a [Pyth Terminal](https://docs.pyth.network/price-feeds/pro/acquire-api-key) account is enough. Each ticker reads two feeds (see `src/lib/pyth-feeds.ts`): the xStock token price, which trades 24/7 and is the price used everywhere, and the underlying listed share, used only for the premium/discount badge. Without a key every ticker falls back to its simulated price. No auth, database, RPC writes, or actual trades are configured. All activity is simulated and stored in the current browser. The portfolio curve is illustrative, not recorded account history. Stocklana Score is a simple concentration indicator, not a complete risk measure.

## Hosting

The existing `.vercel/project.json` links the Vercel project. The public app is https://stocklana.vercel.app. Local changes do not deploy automatically. Publish with the existing Vercel CLI workflow when the change is ready for release.
