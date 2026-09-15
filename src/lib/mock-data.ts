import type { HoldingPosition, Investor, TickerInfo, TickerSymbol } from "./types";

// ---------------------------------------------------------------------------
// MOCK DATA
//
// Everything below is local, static, and hand-written. There is no backend
// and no blockchain call behind any of it. Swapping this file for a real
// data source (an indexer, a Solana RPC, a backend API) is meant to be the
// only change needed to make the rest of the app "real" — components read
// from `TICKERS` / `INVESTORS` / `MY_HOLDINGS` and don't know or care where
// the numbers came from.
// ---------------------------------------------------------------------------

export const TICKERS: Record<TickerSymbol, TickerInfo> = {
  TSLAx: {
    symbol: "TSLAx",
    name: "Tesla",
    price: 248.42,
    color: "bg-violet-500",
    history: [210, 215, 208, 220, 225, 218, 230, 235, 228, 240, 245, 238, 250, 242, 248, 255, 247, 252, 245, 248.42],
  },
  AAPLx: {
    symbol: "AAPLx",
    name: "Apple",
    price: 231.18,
    color: "bg-sky-500",
    history: [215, 217, 214, 218, 220, 219, 222, 224, 221, 225, 227, 223, 226, 229, 228, 230, 227, 229, 232, 231.18],
  },
  SPYx: {
    symbol: "SPYx",
    name: "S&P 500",
    price: 572.35,
    color: "bg-emerald-500",
    history: [540, 542, 545, 543, 548, 551, 549, 554, 557, 555, 560, 563, 561, 566, 569, 567, 571, 568, 573, 572.35],
  },
  NVDAx: {
    symbol: "NVDAx",
    name: "Nvidia",
    price: 178.32,
    color: "bg-amber-500",
    history: [145, 150, 148, 155, 160, 157, 163, 168, 165, 170, 172, 169, 174, 171, 176, 180, 177, 181, 179, 178.32],
  },
  AMZNx: {
    symbol: "AMZNx",
    name: "Amazon",
    price: 224.87,
    color: "bg-orange-500",
    history: [205, 207, 204, 209, 211, 208, 213, 215, 212, 217, 219, 216, 220, 218, 221, 223, 220, 222, 226, 224.87],
  },
  GOOGLx: {
    symbol: "GOOGLx",
    name: "Alphabet",
    price: 196.44,
    color: "bg-indigo-500",
    history: [175, 177, 174, 179, 181, 178, 183, 185, 182, 187, 189, 186, 190, 188, 191, 193, 190, 192, 195, 196.44],
  },
  METAx: {
    symbol: "METAx",
    name: "Meta",
    price: 615.2,
    color: "bg-blue-600",
    history: [560, 565, 558, 570, 575, 568, 580, 585, 578, 590, 595, 588, 600, 595, 602, 608, 600, 605, 610, 615.2],
  },
  COINx: {
    symbol: "COINx",
    name: "Coinbase",
    price: 287.65,
    color: "bg-cyan-500",
    history: [240, 245, 238, 250, 255, 248, 258, 263, 256, 265, 268, 262, 270, 266, 272, 278, 270, 275, 280, 287.65],
  },
};

export const TICKER_LIST: TickerInfo[] = Object.values(TICKERS);

export const INVESTORS: Investor[] = [
  {
    id: "maya-chen",
    name: "Maya Chen",
    handle: "@mayabuilds",
    initials: "MC",
    avatarColor: "bg-violet-500",
    bio: "Product designer by day. Long TSLAx since the split.",
    performancePct: 18.4,
    holdings: [
      { ticker: "TSLAx", shares: 12.4, thesis: "Long since before the split — the robotics story is only getting started." },
      { ticker: "AAPLx", shares: 9.8 },
      { ticker: "SPYx", shares: 6.1 },
      { ticker: "NVDAx", shares: 5.2, thesis: "Every robot needs a brain. Betting on who makes it." },
    ],
    socials: { x: "mayabuilds", instagram: "maya.builds" },
    walletAddress: "7xKXtg2CW3ojpEEfNVvpKW3xkJ8Y5MG4LhIzWEnpQdQ2",
  },
  {
    id: "jordan-blake",
    name: "Jordan Blake",
    handle: "@jblake",
    initials: "JB",
    avatarColor: "bg-sky-500",
    bio: "Steady and boring on purpose. Mostly index exposure.",
    performancePct: 6.2,
    holdings: [
      { ticker: "SPYx", shares: 18.5, thesis: "Boring compounds. Index and chill." },
      { ticker: "TSLAx", shares: 3.2 },
      { ticker: "AAPLx", shares: 2.1 },
      { ticker: "AMZNx", shares: 4.0 },
    ],
    socials: { x: "jblaketrades" },
    walletAddress: "9nQqTr7XzKmVwEo2FbLj4hRs3PdG6YcAz1WvUxN8pTqe",
  },
  {
    id: "priya-patel",
    name: "Priya Patel",
    handle: "@priyainvests",
    initials: "PP",
    avatarColor: "bg-rose-500",
    bio: "Ex-hardware engineer. High conviction in Apple.",
    performancePct: 24.7,
    holdings: [
      { ticker: "AAPLx", shares: 21.6, thesis: "Ex-hardware engineer take: the services-margin story is underrated." },
      { ticker: "TSLAx", shares: 8.4 },
      { ticker: "SPYx", shares: 3.9 },
      { ticker: "GOOGLx", shares: 3.5, thesis: "Search plus the cloud plus the model lab. Undervalued as a bundle." },
    ],
    socials: { x: "priyainvests", discord: "priyainvests" },
    walletAddress: "4gVpR8mNcXeYq2TzKj9LsWb6HfDo3AaU7ZnE5xCtRyJp",
  },
  {
    id: "sam-osei",
    name: "Sam Osei",
    handle: "@samosei",
    initials: "SO",
    avatarColor: "bg-amber-500",
    bio: "Rebalances monthly. Rough quarter, staying the course.",
    performancePct: -3.1,
    holdings: [
      { ticker: "SPYx", shares: 7.3, thesis: "Rebalancing monthly no matter what the headlines say." },
      { ticker: "AAPLx", shares: 7.0 },
      { ticker: "TSLAx", shares: 3.6 },
      { ticker: "COINx", shares: 2.8, thesis: "Rebalanced into crypto-equity exposure this month too." },
    ],
    socials: { instagram: "samosei.money" },
    walletAddress: "3kLpQ9vXbNcRt6MzYo1JfWs4EgHa8DiU2ZxV7nCpTqBm",
  },
  {
    id: "elena-volkov",
    name: "Elena Volkov",
    handle: "@elenav",
    initials: "EV",
    avatarColor: "bg-neutral-800",
    bio: "Concentrated bets. Not for the faint of heart.",
    performancePct: 41.2,
    holdings: [
      { ticker: "TSLAx", shares: 24.9, thesis: "All-in on autonomy. High risk, high conviction." },
      { ticker: "SPYx", shares: 5.2 },
      { ticker: "METAx", shares: 1.5 },
    ],
    socials: { x: "elenav_trades", discord: "elenav" },
    walletAddress: "5hYtN2wLdRq8VbKz3MjPo7FeCa9UxG4TnS6ZyDpQwXr1",
  },
];

/** The signed-in user, shown on the Feed greeting and their own avatar. */
export const MY_PROFILE = {
  name: "Tibet",
  initials: "T",
  avatarColor: "bg-indigo-500",
  walletAddress: "2bWmK7xPqTr4NcYz9LsHo1FeVa6UdGj3ZnE8pCtRySq5",
};

/**
 * The signed-in user's own starting positions, with a cost basis (average
 * price paid) below today's price — this is what gives the portfolio a
 * real, computed unrealized gain instead of a hardcoded performance number.
 */
export const MY_HOLDINGS: HoldingPosition[] = [
  { ticker: "SPYx", shares: 3.4, costBasis: 525 },
  { ticker: "TSLAx", shares: 1.1, costBasis: 215 },
  { ticker: "NVDAx", shares: 0.8, costBasis: 150 },
];

/** Fake uninvested cash balance shown at the top of the Portfolio screen. */
export const MY_CASH_BALANCE = 842.17;
