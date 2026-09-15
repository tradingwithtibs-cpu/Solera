"use client";
import { useState } from "react";
import { INVESTORS, TICKERS } from "@/lib/mock-data";
import { useFollowedInvestors } from "@/hooks/use-followed-investors";
import { InvestorCard } from "./InvestorCard";
import { SearchIcon } from "./icons";
import { SegmentedControl } from "./SegmentedControl";
export function FeedList() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "following">("all");
  const { isFollowing } = useFollowedInvestors();
  const q = query.trim().toLowerCase();
  const filtered = INVESTORS.filter(
    (i) =>
      (view === "all" || isFollowing(i.id)) &&
      (!q ||
        i.name.toLowerCase().includes(q) ||
        i.handle.toLowerCase().includes(q) ||
        i.holdings.some(
          (h) => h.ticker.toLowerCase().includes(q) || TICKERS[h.ticker].name.toLowerCase().includes(q),
        )),
  );
  return (
    <>
      <div className="space-y-4 px-5 pb-4 sm:px-7">
        <div className="search-field">
          <SearchIcon className="h-4 w-4 shrink-0 text-neutral-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an investor, company, or ticker"
            aria-label="Search investors or tickers"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <SegmentedControl
            label="Investor feed"
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "For you" },
              { value: "following", label: "Following" },
            ]}
          />
          <span className="font-mono text-xs text-neutral-500" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "investor" : "investors"}
          </span>
        </div>
      </div>
      <section aria-label="Investor portfolios" className="flex-1 space-y-4 px-5 pb-7 sm:px-7">
        {filtered.length ? (
          filtered.map((investor) => <InvestorCard key={investor.id} investor={investor} />)
        ) : (
          <div className="empty-state">
            <h2>{q ? "No matches this time." : "Your circle starts here."}</h2>
            <p>
              {q
                ? `Try another name or ticker for “${query}”.`
                : "Follow an investor to keep their portfolio in this feed."}
            </p>
            <button
              className="btn-secondary mt-4"
              onClick={() => {
                setQuery("");
                setView("all");
              }}
            >
              Explore investors
            </button>
          </div>
        )}
      </section>
    </>
  );
}
