"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "stocklana:followed-investors";

function readFromStorage(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

// Module-level store shared by every FollowButton on the page, so toggling
// one instance is reflected everywhere else immediately.
let snapshot: Set<string> = typeof window !== "undefined" ? readFromStorage() : new Set();
const listeners = new Set<() => void>();

// A stable, always-empty Set — kept separate from `snapshot` on purpose.
// The server genuinely has no localStorage, so it always renders "not
// following". getServerSnapshot() has to return something that MATCHES
// that server output during the client's hydration pass, or React throws
// a real hydration-mismatch error the moment a returning visitor's
// `snapshot` is non-empty. React does NOT then automatically re-check
// getSnapshot() on its own afterwards — useSyncExternalStore only
// re-renders a component when its `subscribe` listener fires, and nothing
// fires one right after mount — so without the nudge in
// useFollowedInvestors() below, the UI would stay stuck showing this
// empty placeholder forever for a returning visitor, even though the
// real, correct value was already sitting in `snapshot` the whole time.
const EMPTY_SET: Set<string> = new Set();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return EMPTY_SET;
}

function toggleFollow(id: string) {
  const next = new Set(snapshot);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Ignore write failures (private browsing, storage disabled, etc.)
  }
  listeners.forEach((listener) => listener());
}

/**
 * Local-only "follow" state, persisted per-browser via localStorage.
 * There's no backend, so this is purely a UI affordance for the demo —
 * it doesn't sync across devices or affect what data is shown.
 */
export function useFollowedInvestors() {
  const followed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isFollowing = useCallback((id: string) => followed.has(id), [followed]);

  // One-time nudge past the SSR-safe placeholder above, to the real value
  // that's already sitting in `snapshot` — see the comment on EMPTY_SET.
  useEffect(() => {
    listeners.forEach((listener) => listener());
  }, []);

  return { isFollowing, toggle: toggleFollow, followed };
}
