"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

/**
 * The Supabase Auth user for email accounts, as a store. Undefined until
 * the first check completes; null when signed out.
 */
let user: User | null | undefined = undefined;
let started = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    user = null;
    notify();
    return;
  }
  supabase.auth.getSession().then(({ data }) => {
    user = data.session?.user ?? null;
    notify();
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    user = session?.user ?? null;
    notify();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAuthUser(): User | null | undefined {
  const snapshot = useSyncExternalStore(subscribe, () => user, () => undefined);
  useEffect(() => {
    start();
  }, []);
  return snapshot;
}

export function getAuthUser(): User | null | undefined {
  return user;
}
