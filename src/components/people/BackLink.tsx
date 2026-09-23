"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";

/** The back affordance in a static panel's head: history back when there is one, else the fallback route. */
export function BackLink({ fallback = "/leaderboard", label = "People" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-ghost btn-small"
      aria-label="Go back"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <ArrowLeftIcon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
