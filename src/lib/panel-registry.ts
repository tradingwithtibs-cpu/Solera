import type { PageId, PanelSpec, PhoneTab } from "./layout";

/**
 * Every grid page's cards, in designed order, with their spans. The packer
 * turns this into the default layout; docs/port/layout-engine.md §5 tabulates
 * the result and tests/panel-registry.test.mjs pins it.
 */
export const PHONE_TABS: readonly PhoneTab[] = ["portfolio", "markets", "trade", "discover", "people", "agent"];

export const PANEL_REGISTRY: Record<PageId, readonly PanelSpec[]> = {
  portfolio: [
    { id: "hero", title: "Balance", minCols: 6, minRows: 8, defaultCols: 8, defaultRows: null, estimateRows: 12, phone: { tab: "portfolio", order: 1 } },
    { id: "since", title: "Since you last looked", minCols: 3, minRows: 5, defaultCols: 4, defaultRows: 12, phone: { tab: "portfolio", order: 2 } },
    { id: "positions", title: "Your positions", minCols: 5, minRows: 6, defaultCols: 8, defaultRows: 18, phone: { tab: "portfolio", order: 3 } },
    { id: "plans", title: "Plans", minCols: 3, minRows: 6, defaultCols: 4, defaultRows: 18, phone: { tab: "portfolio", order: 4 } },
    { id: "activity", title: "Recent fills", minCols: 6, minRows: 5, defaultCols: 12, defaultRows: null, estimateRows: 8, phone: { tab: "portfolio", order: 5 } },
  ],
  markets: [
    { id: "markets", title: "Markets", minCols: 3, minRows: 8, defaultCols: 4, defaultRows: 24, phone: { tab: "markets", order: 1 } },
    { id: "asset", title: "Asset", minCols: 6, minRows: 10, defaultCols: 8, defaultRows: null, estimateRows: 30, phone: { tab: "trade", order: 1 } },
    { id: "room", title: "Room", minCols: 3, minRows: 6, defaultCols: 4, defaultRows: 12, phone: { tab: "markets", order: 2 } },
  ],
  preipo: [
    { id: "markets", title: "Markets · Pre-IPO", minCols: 3, minRows: 8, defaultCols: 4, defaultRows: 24, phone: { tab: "markets", order: 1 } },
    { id: "asset", title: "Asset", minCols: 6, minRows: 10, defaultCols: 8, defaultRows: null, estimateRows: 30, phone: { tab: "trade", order: 1 } },
    { id: "compare", title: "Same company, two issuers", minCols: 6, minRows: 5, defaultCols: 12, defaultRows: null, estimateRows: 10, phone: { tab: "markets", order: 2 } },
  ],
  discover: [
    { id: "feed", title: "Discover", minCols: 6, minRows: 8, defaultCols: 8, defaultRows: 24, phone: { tab: "discover", order: 1 } },
    { id: "trending", title: "Trending", minCols: 3, minRows: 6, defaultCols: 4, defaultRows: 24, phone: { tab: "discover", order: 2 } },
  ],
  leaderboard: [
    { id: "people", title: "People", minCols: 6, minRows: 6, defaultCols: 12, defaultRows: null, estimateRows: 14, phone: { tab: "people", order: 1 } },
  ],
  agent: [
    { id: "agent", title: "Agent", minCols: 6, minRows: 10, defaultCols: 8, defaultRows: 24, phone: { tab: "agent", order: 1 } },
    { id: "plans", title: "Plans", minCols: 3, minRows: 6, defaultCols: 4, defaultRows: 24, phone: { tab: "agent", order: 2 } },
  ],
};

export function specsFor(page: PageId): readonly PanelSpec[] {
  return PANEL_REGISTRY[page];
}

export function specFor(page: PageId, id: string): PanelSpec | undefined {
  return PANEL_REGISTRY[page].find((s) => s.id === id);
}
