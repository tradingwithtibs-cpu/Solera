"use client";

import { useRouter } from "next/navigation";

/** The back affordance in a static panel's head: history when there is one, else the markets grid. */
export function BackLink({ fallback = "/markets" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-ghost btn-small"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      ← Back
    </button>
  );
}
