"use client";

import { useFollowedInvestors } from "@/hooks/use-followed-investors";

export function FollowButton({ investorId, size = "sm" }: { investorId: string; size?: "sm" | "md" }) {
  const { isFollowing, toggle } = useFollowedInvestors();
  const following = isFollowing(investorId);

  return (
    <button
      type="button"
      aria-pressed={following}
      aria-label={`${following ? "Unfollow" : "Follow"} ${investorId
        .split("-")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ")}`}
      onClick={(e) => {
        // Cards wrap this in a <Link> — don't trigger navigation.
        e.preventDefault();
        e.stopPropagation();
        toggle(investorId);
      }}
      className={`shrink-0 rounded-full font-semibold transition ${
        size === "md" ? "px-4 py-1.5 text-sm" : "px-3 py-1 text-xs"
      } ${
        following
          ? "bg-neutral-100 text-neutral-500 active:bg-neutral-200"
          : "bg-gradient-brand text-white active:opacity-90"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
