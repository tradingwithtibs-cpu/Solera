"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const KEY = "solera:visit";
const WRITE_AFTER_LOAD_MS = 2_500;
const WRITE_EVERY_MS = 60_000;

/**
 * What the portfolio looked like the last time this browser looked at it.
 * Written by the portfolio page (2.5 s after load, every 60 s, on pagehide),
 * read once at boot by the "Since you last looked" card and the strip, so
 * a visit compares against the previous one and not against a moment ago.
 * Only real figures go in: live prices, the loaded balance, pre-IPO gaps.
 */
export interface VisitSnapshot {
  at: number;
  total: number;
  /** Ticker → live price at the time. */
  prices: Record<string, number>;
  /** Pre-IPO symbol → premium to the issuer's mark, in percent. */
  gaps: Record<string, number>;
}

export type VisitInput = Omit<VisitSnapshot, "at">;

function isNumberRecord(v: unknown): v is Record<string, number> {
  return !!v && typeof v === "object" && Object.values(v as object).every((n) => typeof n === "number" && Number.isFinite(n));
}

function read(): VisitSnapshot | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<VisitSnapshot>;
    if (typeof v.at !== "number" || !Number.isFinite(v.at) || typeof v.total !== "number" || !Number.isFinite(v.total)) return null;
    return { at: v.at, total: v.total, prices: isNumberRecord(v.prices) ? v.prices : {}, gaps: isNumberRecord(v.gaps) ? v.gaps : {} };
  } catch {
    return null;
  }
}

// Read once per page load and never replaced: the card keeps comparing
// against the visit before this one even as the snapshot is rewritten.
const boot: VisitSnapshot | null = typeof window !== "undefined" ? read() : null;
const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The previous visit outside React (strip chips, palette). */
export function getPreviousVisit(): VisitSnapshot | null {
  return boot;
}

export function writeVisit(input: VisitInput) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), ...input }));
  } catch {
    // Storage unavailable: the card just says "first visit" next time.
  }
}

/** The previous visit; null on a first visit and during server render. */
export function usePreviousVisit(): VisitSnapshot | null {
  const value = useSyncExternalStore(subscribe, () => boot, () => null);
  // Nudge past the server snapshot once the client store is readable (same pattern as use-portfolio.ts).
  useEffect(() => {
    listeners.forEach((l) => l());
  }, []);
  return value;
}

/**
 * Keeps the stored snapshot current while the page is open. Pass null until
 * the figures are real (portfolio loaded, held tickers priced live).
 */
export function useVisitWriter(current: VisitInput | null) {
  const latest = useRef<VisitInput | null>(null);
  useEffect(() => {
    latest.current = current;
  }, [current]);
  useEffect(() => {
    const write = () => {
      if (latest.current) writeVisit(latest.current);
    };
    const timeout = setTimeout(write, WRITE_AFTER_LOAD_MS);
    const interval = setInterval(write, WRITE_EVERY_MS);
    window.addEventListener("pagehide", write);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      window.removeEventListener("pagehide", write);
      write();
    };
  }, []);
}
