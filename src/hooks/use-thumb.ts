"use client";

import { useEffect, useState, type RefObject } from "react";
import type { FeedNews } from "./use-news";

/**
 * A story's picture when its feed gave none: asked of /api/news/thumb once
 * the row is on screen, remembered for the session (misses too), shared by
 * every row showing the same story.
 */
const thumbs = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function scopeQuery(item: FeedNews): string {
  if (item.scope === "ticker" && item.tickers[0]) return `&ticker=${encodeURIComponent(item.tickers[0])}`;
  if (item.scope === "company" && item.tickers[0]) return `&company=${encodeURIComponent(item.tickers[0])}`;
  return "";
}

function load(item: FeedNews): Promise<string | null> {
  const key = item.item.id;
  if (thumbs.has(key)) return Promise.resolve(thumbs.get(key)!);
  const pending = inflight.get(key);
  if (pending) return pending;
  const task = fetch(`/api/news/thumb?id=${encodeURIComponent(key)}${scopeQuery(item)}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as { image?: string | null };
      return typeof data.image === "string" ? data.image : null;
    })
    .catch(() => null)
    .then((image) => {
      thumbs.set(key, image);
      inflight.delete(key);
      return image;
    });
  inflight.set(key, task);
  return task;
}

/** The resolved picture URL, null when there is none, undefined while unknown. Only asks once `ref` is near the viewport. */
export function useThumb(item: FeedNews, ref: RefObject<HTMLElement | null>): string | null | undefined {
  const key = item.item.id;
  const [thumb, setThumb] = useState<string | null | undefined>(() => (item.item.image ? item.item.image : thumbs.get(key)));

  useEffect(() => {
    if (item.item.image) return;
    const known = thumbs.get(key);
    if (known !== undefined) {
      // Already resolved by another row: adopt it (a state write after the fact, not during render).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThumb(known);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      let cancelled = false;
      load(item).then((image) => {
        if (!cancelled) setThumb(image);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        load(item).then((image) => {
          if (!cancelled) setThumb(image);
        });
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [item, key, ref]);

  return item.item.image ?? thumb;
}
