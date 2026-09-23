"use client";

import { useSyncExternalStore } from "react";

/**
 * The plans toasts (agent-ux §4 "Toasts"): at most three, 5 s each, hover
 * pauses. A module store so the panel, the inbox poll and the ticket can
 * all announce without threading a context; <Toasts /> renders them.
 */
export interface PlanToast {
  id: number;
  kind: "ok" | "warn" | "info";
  message: string;
  href?: string;
  linkLabel?: string;
}

const MAX_VISIBLE = 3;
const DEFAULT_MS = 5_000;
const RESUME_MS = 2_000;

let toasts: PlanToast[] = [];
let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function schedule(id: number, ms: number) {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), ms),
  );
}

export function showToast(toast: Omit<PlanToast, "id">, ms = DEFAULT_MS): number {
  const id = ++seq;
  toasts = [...toasts, { id, ...toast }];
  while (toasts.length > MAX_VISIBLE) {
    const oldest = toasts[0];
    toasts = toasts.slice(1);
    const t = timers.get(oldest.id);
    if (t) clearTimeout(t);
    timers.delete(oldest.id);
  }
  schedule(id, ms);
  emit();
  return id;
}

export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  if (!toasts.some((x) => x.id === id)) return;
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

/** Hover keeps a toast on screen; leaving gives it two more seconds. */
export function pauseToast(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

export function resumeToast(id: number) {
  if (toasts.some((x) => x.id === id)) schedule(id, RESUME_MS);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const NONE: PlanToast[] = [];

export function useToasts(): PlanToast[] {
  return useSyncExternalStore(subscribe, () => toasts, () => NONE);
}

// One host renders the toasts even when several panels mount <Toasts />.
let hosts: number[] = [];
let hostSeq = 0;
const hostListeners = new Set<() => void>();

function emitHosts() {
  hostListeners.forEach((l) => l());
}

export function nextHostId(): number {
  return ++hostSeq;
}

export function registerHost(id: number): () => void {
  hosts = [...hosts, id];
  emitHosts();
  return () => {
    hosts = hosts.filter((h) => h !== id);
    emitHosts();
  };
}

export function usePrimaryHost(): number | null {
  return useSyncExternalStore(
    (l) => {
      hostListeners.add(l);
      return () => {
        hostListeners.delete(l);
      };
    },
    () => hosts[0] ?? null,
    () => null,
  );
}
