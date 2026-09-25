# Stocklana submission

Deadline: Friday, September 25, 2026, 4:00 PM ET, at https://hackathons.solana.com/hackathons/stocklana. Edits are allowed until then, so submit early with the live link and update later.

Tracks to enter: Main track, Best Use of PreStocks, Best Use of Tessera Pre-IPO Stocks, Best Use of Pyth Market Data. Skip Clawpump and Meteora (both need Meteora infrastructure Solera does not use).

## Form text

**Project name:** Solera

**Tagline:** Stocks on Solana, with the people who hold them.

**Links**

- Live: https://trysolera.vercel.app
- Code: https://github.com/tradingwithtibs-cpu/Solera (make it public before submitting, or say in the form that judges can request access)
- Video: (paste the link once recorded)

**Description**

Solera is a social investing terminal for tokenized stocks on Solana. Every xStock on Solana is priced live through Jupiter, with the underlying share price read straight from Pyth's on-chain accounts so the gap is always visible. The largest real wallets holding each token are read from the chain and shown as people you can follow and copy. A buy or sell is a real Jupiter Ultra swap signed in your own wallet, from Safari on iPhone as well as desktop. Solera never holds keys or funds.

Two things make it more than a brokerage. Standing plans: write "if TSLAx falls to $300, sell 5 shares" in plain words, see the rule Solera understood, and arm it with one tap. Practice plans fill on the server; live plans become Jupiter Trigger orders you sign once. And an agent that reads prices, news and your plans, drafts a plan from a sentence, and never signs anything. Every proposal is a card with a button.

Pre-IPO tokens from PreStocks and Tessera sit side by side on implied valuation, so you can see which issuer is cheaper for OpenAI, Anthropic or SpaceX and how far each is from its own mark. A feed of headlines and fills is ranked by real votes with comments, and every ticker has a room.

Practice mode lets anyone try all of it with nothing at stake. Everything runs keyless and free: no paid data feeds, no custodian, no seeded numbers.

**Why Solana**

The product only exists because the assets, the holders and the swaps are all public on one chain. Holder lists come from token accounts, prices from Jupiter and Pyth, fills from mainnet, standing orders from Jupiter Trigger. Nothing is simulated.

**Built with**

Next.js 16, Jupiter Ultra and Trigger V2, Pyth PriceUpdateV2 accounts, wallet-adapter with Phantom deeplinks for iOS, Supabase (profiles, rooms, plans, practice ledger, feed), Claude Opus 5 for the agent, PreStocks and Tessera feeds, CoinGecko history.

## Video shot list

Three minutes, one clean path, recorded on production at https://trysolera.vercel.app in a normal-size browser window (not full screen, so Phantom's popup is visible if you connect). Practice mode throughout; no real SOL is spent. Speak the bold line while the screen shows the action.

1. **Discover, signed out** (15 s). Land on the home page. "Solera is stocks on Solana, with the people who hold them." Hover the tape, scroll the Trending card. Point at "Most held by top wallets": these are real wallets read from the chain.
2. **Markets** (25 s). Open TSLAx. "Live price from Jupiter, the share price from Pyth, the gap between them." Switch the chart range once. Drag one card by its grip and drop it on a neighbor to swap. "Every screen is a grid you arrange."
3. **Held by and Leaderboard** (15 s). Scroll to Held by on the TSLAx card. Click one wallet. "Real holders, verified on Solscan." Tap Follow.
4. **Practice buy with a thesis** (30 s). Sign in with email (have an account ready). Buy $100 of TSLAx in practice. Type a one-line thesis and a "wrong if". "Why you bought, carried onto the position and the tape."
5. **A plan that fills** (40 s). Open Plans. Type `buy $25 of SPYx if it goes over $<a price just under the current one>`. Show the rule Solera understood, tap ARM IT. Cut to the row turning FILLED, the fill on the tape with the `practice` and `via plan` chips, and the "server watch" foot showing a recent check. "Standing plans in plain words, filled by the server, no tab required."
6. **The agent** (35 s). Open the Agent tab. Ask `show me the latest news on TSLAx`. Then `if TSLAx falls to $<price> sell 5 shares`. Show the plan card with "sell 5 shares". Then ask `should I buy TSLAx?` and show the one-sentence decline. "The agent reads prices, news and your plans. It never signs anything."
7. **Pre-IPO** (15 s). Open Pre-IPO. "OpenAI, Anthropic and SpaceX from PreStocks and Tessera, compared on implied valuation." Point at the cheaper issuer and the distance from mark.
8. **Phone** (15 s, optional). Screen record iPhone Safari: connect Phantom through the deeplink, return to Solera connected. "Works from Safari on iPhone."
9. **Close** (5 s). Back to Discover. "Live at trysolera.vercel.app. Nothing simulated, nothing custodied."

Before recording: fund the practice account with a fill or two so Portfolio is not empty, follow one wallet, and open the Plans panel once so the server watch foot reads "on".
