"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny toast store for the Agent tab's card actions (agent-ux §4 toasts):
 * `.ok` / `.warn`, 5 s, at most three on screen. `Toasts.tsx` renders them
 * through a portal on the globals.css `.toasts` frame. If the Plans UI lands
 * its own, the merge keeps one.
 */
export interface ToastItem {
  id: number;
  message: string;
  kind: "ok" | "warn";
  href?: string;
  label?: string;
}

export const TOAST_MS = 5_000;
const MAX = 3;
const EMPTY: ToastItem[] = [];

let items: ToastItem[] = EMPTY;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function dismissToast(id: number) {
  if (!items.some((t) => t.id === id)) return;
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(message: string, kind: "ok" | "warn" = "ok", link?: { href: string; label: string }) {
  const id = ++seq;
  items = [...items, { id, message, kind, ...(link ? { href: link.href, label: link.label } : {}) }].slice(-MAX);
  emit();
  setTimeout(() => dismissToast(id), TOAST_MS);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}
