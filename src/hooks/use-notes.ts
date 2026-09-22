"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { normalizeNoteInput, type PositionNote, type PositionNoteInput } from "@/lib/notes";
import { useSession } from "./use-session";

const KEY = "solera:notes";

/**
 * Position notes, keyed by ticker or mint. Signed out: this browser.
 * Signed in: the account, with the browser's notes uploaded once on the
 * first load that finds the account empty.
 */
let notes: Record<string, PositionNote> = typeof window !== "undefined" ? read() : {};
let serverOwner: string | null = null;
const uploaded = new Set<string>();
const listeners = new Set<() => void>();

function read(): Record<string, PositionNote> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, PositionNote>) : {};
  } catch {
    return {};
  }
}

function persistLocal() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // ignore
  }
}

function notify() {
  listeners.forEach((l) => l());
}

async function loadServer(owner: string, token: string) {
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const res = await fetch("/api/notes", { headers });
    if (!res.ok) return;
    const data = (await res.json()) as { notes: PositionNote[] };
    const fromServer = Object.fromEntries(data.notes.map((n) => [n.key, n]));
    if (data.notes.length === 0 && Object.keys(notes).length > 0 && !uploaded.has(owner)) {
      uploaded.add(owner);
      const up = await fetch("/api/notes", { method: "PUT", headers, body: JSON.stringify({ notes: Object.values(notes) }) });
      if (up.ok) {
        const merged = (await up.json()) as { notes: PositionNote[] };
        for (const n of merged.notes) fromServer[n.key] = n;
      }
    }
    serverOwner = owner;
    notes = { ...notes, ...fromServer };
    notify();
  } catch {
    // Keep the local copy.
  }
}

export function useNotes() {
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => notes,
    () => notes,
  );
  const { owner, token, signedIn } = useSession();

  useEffect(() => {
    if (signedIn && owner && token && serverOwner !== owner) loadServer(owner, token);
  }, [signedIn, owner, token]);

  const save = useCallback(
    async (input: PositionNoteInput) => {
      const next = normalizeNoteInput(input, notes[input.key]);
      notes = { ...notes, [input.key]: next };
      persistLocal();
      notify();
      if (signedIn && owner && token) {
        try {
          const res = await fetch("/api/notes", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
          if (res.ok) {
            const data = (await res.json()) as { notes: PositionNote[] };
            for (const n of data.notes) notes = { ...notes, [n.key]: n };
            notify();
          }
        } catch {
          // The local copy stands until the next load.
        }
      }
    },
    [signedIn, owner, token],
  );

  const get = useCallback((key: string): PositionNote | undefined => snapshot[key], [snapshot]);
  return { notes: snapshot, get, save };
}
