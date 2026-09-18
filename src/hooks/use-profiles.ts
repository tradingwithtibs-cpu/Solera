"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/profiles";

/**
 * Client cache of wallet → profile, shared by every component. Wallets are
 * looked up in batches: ask for many, one request. Unknown wallets are
 * remembered as "no profile" so lists don't re-query on every render.
 */
let profiles: Record<string, Profile | null> = {};
let configured: boolean | null = null;
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function flush() {
  flushTimer = null;
  const wallets = [...pending];
  pending.clear();
  if (wallets.length === 0) return;
  try {
    const res = await fetch(`/api/profile?wallets=${encodeURIComponent(wallets.join(","))}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { profiles: Record<string, Profile>; configured: boolean };
    configured = data.configured;
    const next = { ...profiles };
    for (const w of wallets) next[w] = data.profiles[w] ?? null;
    profiles = next;
  } catch {
    // Leave them unknown; a later render can retry.
    for (const w of wallets) delete profiles[w];
  }
  notify();
}

/** Queue wallets for lookup; batched into one request per tick. */
export function requestProfiles(wallets: string[]) {
  let added = false;
  for (const w of wallets) {
    if (w && !(w in profiles) && !pending.has(w)) {
      pending.add(w);
      added = true;
    }
  }
  if (added && !flushTimer) flushTimer = setTimeout(flush, 50);
}

/** Put a freshly saved profile into the cache immediately. */
export function setProfile(profile: Profile) {
  profiles = { ...profiles, [profile.wallet]: profile };
  notify();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Profiles for a set of wallets (requests any that aren't cached yet). */
export function useProfiles(wallets: string[]): { get: (wallet: string) => Profile | null | undefined; configured: boolean | null } {
  const snapshot = useSyncExternalStore(subscribe, () => profiles, () => profiles);
  const key = wallets.join(",");
  useEffect(() => {
    requestProfiles(key ? key.split(",") : []);
  }, [key]);
  const get = useCallback((wallet: string) => snapshot[wallet], [snapshot]);
  return { get, configured };
}

export function useProfile(wallet: string | null | undefined): Profile | null | undefined {
  const { get } = useProfiles(wallet ? [wallet] : []);
  return wallet ? get(wallet) : undefined;
}
