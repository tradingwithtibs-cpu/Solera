"use client";
import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
const key = "stocklana:onboarding";
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return localStorage.getItem(key) === "dismissed";
  } catch {
    return false;
  }
}

// Read eagerly at module load (client-only), same pattern as the other
// localStorage-backed hooks — see use-followed-investors.ts.
let dismissed: boolean = typeof window !== "undefined" ? readDismissed() : true;

function getSnapshot() {
  return dismissed;
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
// The server always renders "hidden" (no localStorage to check), and this
// has to match the client's first hydration pass too, or React sees a
// structural mismatch (a whole section appearing/disappearing, not just
// changed text) and throws a real hydration error instead of a graceful
// flash. useSyncExternalStore doesn't re-check getSnapshot() on its own
// once mounted, so the effect below nudges past this placeholder to the
// real value once we're safely past hydration.
function getServerSnapshot() {
  return true;
}
export function WelcomeGuide() {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    listeners.forEach((fn) => fn());
  }, []);

  if (hidden) return null;
  return (
    <section className="welcome-guide">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">A good place to begin</p>
          <h2 className="mt-2 text-lg font-semibold">Follow the thinking.</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-600">
            Explore a portfolio. Read the reasoning. Try copying a holding with simulated funds.
          </p>
        </div>
        <button
          aria-label="Dismiss getting started guide"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-600"
          onClick={() => {
            dismissed = true;
            try {
              localStorage.setItem(key, "dismissed");
            } catch {}
            listeners.forEach((fn) => fn());
          }}
        >
          ×
        </button>
      </div>
      <Link href="/investor/maya-chen" className="mt-4 inline-flex text-sm font-semibold text-indigo-700">
        Explore a sample portfolio →
      </Link>
    </section>
  );
}
