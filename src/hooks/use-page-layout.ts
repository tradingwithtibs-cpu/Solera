"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { defaultLayout, normalizeLayout, storageKey, type PageId, type PageLayout } from "@/lib/layout";
import { specsFor } from "@/lib/panel-registry";

/**
 * One saved layout per page, in localStorage under solera:layout:<page>,
 * through the app's module-store + useSyncExternalStore pattern. Reads are
 * normalised against the registry so a stale or hand-edited blob can never
 * break a page; writes happen only on a committed drop, resize or reset.
 */
interface Entry {
  layout: PageLayout;
  isCustom: boolean;
}

const entries = new Map<PageId, Entry>();
const listeners = new Map<PageId, Set<() => void>>();
const defaults = new Map<PageId, Entry>();

function defaultEntry(page: PageId): Entry {
  let d = defaults.get(page);
  if (!d) {
    d = { layout: defaultLayout(page, specsFor(page)), isCustom: false };
    defaults.set(page, d);
  }
  return d;
}

function read(page: PageId): Entry {
  try {
    const raw = window.localStorage.getItem(storageKey(page));
    if (!raw) return defaultEntry(page);
    return normalizeLayout(raw, page, specsFor(page));
  } catch {
    return defaultEntry(page);
  }
}

function get(page: PageId): Entry {
  let e = entries.get(page);
  if (!e) {
    e = typeof window === "undefined" ? defaultEntry(page) : read(page);
    entries.set(page, e);
  }
  return e;
}

function notify(page: PageId) {
  listeners.get(page)?.forEach((l) => l());
}

function commitLayout(page: PageId, layout: PageLayout) {
  const { layout: settled, isCustom } = normalizeLayout(layout, page, specsFor(page));
  entries.set(page, { layout: { ...settled, savedAt: layout.savedAt }, isCustom });
  try {
    if (isCustom) window.localStorage.setItem(storageKey(page), JSON.stringify(entries.get(page)!.layout));
    else window.localStorage.removeItem(storageKey(page));
  } catch {
    // Storage unavailable: the layout lasts for this page view.
  }
  notify(page);
}

function resetLayout(page: PageId) {
  try {
    window.localStorage.removeItem(storageKey(page));
  } catch {
    // ignore
  }
  entries.set(page, defaultEntry(page));
  notify(page);
}

function subscribeTo(page: PageId) {
  return (l: () => void) => {
    let set = listeners.get(page);
    if (!set) {
      set = new Set();
      listeners.set(page, set);
    }
    set.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(page)) {
        entries.set(page, read(page));
        notify(page);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      set!.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  };
}

export function usePageLayout(page: PageId): {
  layout: PageLayout;
  isCustom: boolean;
  commit: (layout: PageLayout) => void;
  reset: () => void;
} {
  const entry = useSyncExternalStore(subscribeTo(page), () => get(page), () => defaultEntry(page));
  useEffect(() => {
    // One nudge past the server snapshot once storage is readable.
    notify(page);
  }, [page]);
  const commit = useCallback((layout: PageLayout) => commitLayout(page, layout), [page]);
  const reset = useCallback(() => resetLayout(page), [page]);
  return { layout: entry.layout, isCustom: entry.isCustom, commit, reset };
}

/** Reset from outside React (the ⌘K command). */
export function resetPageLayout(page: PageId) {
  resetLayout(page);
}
