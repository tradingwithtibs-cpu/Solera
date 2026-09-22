"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/profiles";

/**
 * Client cache of owner → profile (a wallet address or an auth user id),
 * shared by every component. Owners are looked up in batches: ask for
 * many, one request. Unknown owners are remembered as "no profile" so
 * lists don't re-query on every render.
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
  const owners = [...pending];
  pending.clear();
  if (owners.length === 0) return;
  try {
    const res = await fetch(`/api/profile?owners=${encodeURIComponent(owners.join(","))}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { profiles: Record<string, Profile>; configured: boolean };
    configured = data.configured;
    const next = { ...profiles };
    for (const o of owners) next[o] = data.profiles[o] ?? null;
    for (const [key, p] of Object.entries(data.profiles)) next[key] = p;
    profiles = next;
  } catch {
    // Leave them unknown; a later render can retry.
    for (const o of owners) delete profiles[o];
  }
  notify();
}

/** Queue owners for lookup; batched into one request per tick. */
export function requestProfiles(owners: string[]) {
  let added = false;
  for (const o of owners) {
    if (o && !(o in profiles) && !pending.has(o)) {
      pending.add(o);
      added = true;
    }
  }
  if (added && !flushTimer) flushTimer = setTimeout(flush, 50);
}

/** Put a freshly saved profile into the cache immediately, under every key it answers to. */
export function setProfile(profile: Profile) {
  profiles = { ...profiles, [profile.owner]: profile, ...(profile.wallet ? { [profile.wallet]: profile } : {}) };
  notify();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Profiles for a set of owners (requests any that aren't cached yet). */
export function useProfiles(owners: string[]): { get: (owner: string) => Profile | null | undefined; configured: boolean | null } {
  const snapshot = useSyncExternalStore(subscribe, () => profiles, () => profiles);
  const key = owners.join(",");
  useEffect(() => {
    requestProfiles(key ? key.split(",") : []);
  }, [key]);
  const get = useCallback((owner: string) => snapshot[owner], [snapshot]);
  return { get, configured };
}

export function useProfile(owner: string | null | undefined): Profile | null | undefined {
  const { get } = useProfiles(owner ? [owner] : []);
  return owner ? get(owner) : undefined;
}
