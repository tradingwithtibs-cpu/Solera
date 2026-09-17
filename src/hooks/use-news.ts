"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news";

export type NewsScope = { kind: "general" } | { kind: "ticker"; ticker: string } | { kind: "company"; company: string };

function queryFor(scope: NewsScope): string {
  if (scope.kind === "ticker") return `?ticker=${encodeURIComponent(scope.ticker)}`;
  if (scope.kind === "company") return `?company=${encodeURIComponent(scope.company)}`;
  return "";
}

/** Loads one news scope once per mount. The route caches, so this is cheap to mount often. */
export function useNews(scope: NewsScope) {
  const query = queryFor(scope);
  const [state, setState] = useState<{ items: NewsItem[]; isLoaded: boolean; error: string | null }>({
    items: [],
    isLoaded: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    // Network fetch on mount; setState only runs after the round trip.
    fetch(`/api/news${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("News unavailable right now");
        const data = (await res.json()) as { items: NewsItem[] };
        if (!cancelled) setState({ items: data.items, isLoaded: true, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ items: [], isLoaded: true, error: err instanceof Error ? err.message : "News unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return state;
}
