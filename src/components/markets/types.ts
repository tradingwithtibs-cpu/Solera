import type { PreIpoToken } from "@/lib/pre-ipo";
import type { TickerSymbol } from "@/lib/types";

/** What the asset card and the ticket are pointed at: a tokenized stock, or a pre-IPO token. */
export type TicketTarget = { kind: "xstock"; ticker: TickerSymbol } | { kind: "pre-ipo"; token: PreIpoToken };

export type MarketTab = "all" | "xstocks" | "preipo" | "watchlist";
