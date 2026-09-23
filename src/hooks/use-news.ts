"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { NewsItem } from "@/lib/news";

export type NewsScope = { kind: "general" } | { kind: "ticker"; ticker: string } | { kind: "company"; company: string };

/** One headline as the feed renders it: the item plus what it was fetched for. */
export interface FeedNews {
  kind: "news";
  id: string;
  at: number;
  item: NewsItem;
  /** Tickers (xStock symbols) or company ids the story was fetched for; empty for market-wide news. */
  tickers: string[];
  scope: "market" | "ticker" | "company";
}

export function queryFor(scope: NewsScope): string {
  if (scope.kind === "ticker") return `?ticker=${encodeURIComponent(scope.ticker)}`;
  if (scope.kind === "company") return `?company=${encodeURIComponent(scope.company)}`;
  return "";
}

interface Entry {
  items: NewsItem[];
  isLoaded: boolean;
  error: string | null;
  at: number;
  /** One automatic retry per error; after that only a fresh mount or the TTL asks again. */
  retried?: boolean;
}

const EMPTY: Entry = { items: [], isLoaded: false, error: null, at: 0 };
const TTL_MS = 5 * 60_000;
const RETRY_MS = 20_000;

/**
 * One module-level cache of news per scope, shared by every list on the
 * page (the feed, the asset card and /news all ask for the same general
 * scope). The route caches for 10 minutes server-side; this keeps a scope
 * for 5 so a tab switch never refetches.
 */
let entries: Record<string, Entry> = {};
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function load(query: string) {
  if (inflight.has(query)) return;
  const current = entries[query];
  if (current?.isLoaded && Date.now() - current.at < (current.error ? RETRY_MS : TTL_MS)) return;
  inflight.add(query);
  fetch(`/api/news${query}`)
    .then(async (res) => {
      if (!res.ok) throw new Error("News unavailable right now");
      const data = (await res.json()) as { items: NewsItem[] };
      entries = { ...entries, [query]: { items: data.items, isLoaded: true, error: null, at: Date.now() } };
    })
    .catch((err: unknown) => {
      const retried = current?.retried === true;
      entries = { ...entries, [query]: { items: [], isLoaded: true, error: err instanceof Error ? err.message : "News unavailable", at: Date.now(), retried: true } };
      // A slow provider answers on the next try more often than not: one retry, then the next mount or TTL asks again.
      if (!retried) {
        setTimeout(() => {
          if (entries[query]?.error && listeners.size > 0) load(query);
        }, RETRY_MS);
      }
    })
    .finally(() => {
      inflight.delete(query);
      notify();
    });
}

/** Headlines for one scope. Cached across mounts, so this is cheap to mount often. */
export function useNews(scope: NewsScope): { items: NewsItem[]; isLoaded: boolean; error: string | null } {
  const query = queryFor(scope);
  const snapshot = useSyncExternalStore(subscribe, () => entries, () => entries);
  useEffect(() => {
    load(query);
  }, [query]);
  const entry = snapshot[query] ?? EMPTY;
  return { items: entry.items, isLoaded: entry.isLoaded, error: entry.error };
}

function scopeKind(scope: NewsScope): FeedNews["scope"] {
  return scope.kind === "ticker" ? "ticker" : scope.kind === "company" ? "company" : "market";
}

function scopeKey(scope: NewsScope): string | null {
  return scope.kind === "ticker" ? scope.ticker : scope.kind === "company" ? scope.company : null;
}

/**
 * Several scopes merged into one list, newest first, deduped by story id
 * (a story fetched for two held tickers appears once and names both).
 * `isLoaded` waits for every scope; `error` is set only when nothing came
 * back at all.
 */
export function useNewsScopes(scopes: NewsScope[]): { items: FeedNews[]; isLoaded: boolean; error: string | null } {
  const queries = scopes.map(queryFor);
  const key = queries.join("|");
  const snapshot = useSyncExternalStore(subscribe, () => entries, () => entries);
  useEffect(() => {
    for (const q of key.split("|")) load(q);
  }, [key]);

  return useMemo(() => {
    const byId = new Map<string, FeedNews>();
    let loaded = 0;
    let failed = 0;
    let firstError: string | null = null;
    scopes.forEach((scope, i) => {
      const entry = snapshot[queries[i]];
      if (!entry?.isLoaded) return;
      loaded += 1;
      if (entry.error) {
        failed += 1;
        firstError ??= entry.error;
        return;
      }
      const kind = scopeKind(scope);
      const k = scopeKey(scope);
      for (const item of entry.items) {
        const existing = byId.get(item.id);
        if (existing) {
          if (k && !existing.tickers.includes(k)) existing.tickers.push(k);
          continue;
        }
        byId.set(item.id, { kind: "news", id: `news:${item.id}`, at: item.publishedAt, item, tickers: k ? [k] : [], scope: kind });
      }
    });
    const items = [...byId.values()].sort((a, b) => b.at - a.at);
    const isLoaded = scopes.length === 0 || loaded === scopes.length;
    return { items, isLoaded, error: isLoaded && failed === scopes.length && scopes.length > 0 ? firstError : null };
    // `snapshot` and `key` are the only inputs that change what this returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, key]);
}
