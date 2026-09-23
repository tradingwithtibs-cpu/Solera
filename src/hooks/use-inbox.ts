"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { plansClient, PlansClientError, type InboxItem } from "@/lib/plans-client";
import { showToast } from "@/components/plans/toast-store";
import { readyToastText } from "@/components/plans/plan-format";
import { useSession } from "./use-session";

/**
 * The in-app inbox (docs/port/backend.md §9.8, agent-ux §3.3 step 2):
 * `GET /api/inbox` every 30 s while the app is open and on focus, the
 * unread count for the bell, `POST /api/inbox/read` when a row is opened.
 * The first time a poll sees a new `plan_ready` row it raises the `.warn`
 * toast with an open link. One module store, so the bell and the sheet
 * share a single poll.
 */
export interface InboxSnapshot {
  items: InboxItem[] | null;
  error: string | null;
  unavailable: boolean;
  fetchedAt: number | null;
}

const EMPTY: InboxSnapshot = { items: null, error: null, unavailable: false, fetchedAt: null };
const POLL_MS = 30_000;

let snapshot: InboxSnapshot = EMPTY;
let currentToken: string | null = null;
let refs = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
/** Row ids the previous polls already saw; toasts fire only for rows that appear after the first poll. */
let seen: Set<string> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function patch(next: Partial<InboxSnapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

export function refreshInbox(): Promise<void> {
  const token = currentToken;
  if (!token) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const items = await plansClient.inbox(token);
      if (currentToken !== token) return;
      if (seen) {
        for (const item of items) {
          if (!seen.has(item.id) && item.kind === "plan_ready" && item.readAt === null) {
            showToast({ kind: "warn", message: readyToastText(item), href: item.href ?? undefined, linkLabel: "open" });
          }
        }
      }
      seen = new Set(items.map((i) => i.id));
      patch({ items, error: null, unavailable: false, fetchedAt: Date.now() });
    } catch (err) {
      if (currentToken !== token) return;
      const status = err instanceof PlansClientError ? err.status : 0;
      patch({ error: err instanceof Error ? err.message : "Couldn't load your inbox.", unavailable: status === 501 });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function onFocus() {
  void refreshInbox();
}

function start() {
  if (!currentToken) return;
  void refreshInbox();
  timer = setInterval(refreshInbox, POLL_MS);
  window.addEventListener("focus", onFocus);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener("focus", onFocus);
}

function attach(token: string | null): () => void {
  refs++;
  if (refs === 1 || token !== currentToken) {
    if (refs > 1) stop();
    currentToken = token;
    seen = null;
    patch({ items: null, error: null, unavailable: false, fetchedAt: null });
    start();
  }
  return () => {
    refs--;
    if (refs === 0) stop();
  };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Marks rows read: optimistic locally, then the route. */
export async function markInboxRead(ids: string[]): Promise<void> {
  const token = currentToken;
  const pending = ids.filter((id) => snapshot.items?.some((i) => i.id === id && i.readAt === null));
  if (!token || pending.length === 0) return;
  const at = Date.now();
  patch({ items: (snapshot.items ?? []).map((i) => (pending.includes(i.id) ? { ...i, readAt: at } : i)) });
  try {
    await plansClient.markRead(token, pending);
  } catch {
    // The next poll restores the server's truth.
  }
}

export function useInbox() {
  const { token, signedIn } = useSession();
  const snap = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

  useEffect(() => attach(token), [token]);

  const items = signedIn ? snap.items : null;
  const unread = items ? items.filter((i) => i.readAt === null).length : 0;
  const markRead = useCallback((ids: string[]) => markInboxRead(ids), []);

  return { items, unread, error: signedIn ? snap.error : null, unavailable: snap.unavailable, fetchedAt: snap.fetchedAt, signedIn, refresh: refreshInbox, markRead };
}
