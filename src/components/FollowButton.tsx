"use client";

import { useFollowedInvestors } from "@/hooks/use-followed-investors";

/**
 * FOLLOW (action gradient) / FOLLOWING (outlined, muted) — partner
 * `.follow` / `.follow.on` on the design-system button variants. Local
 * state per browser via useFollowedInvestors.
 */
export function FollowButton({ investorId, name, size = "sm" }: { investorId: string; name?: string; size?: "sm" | "md" }) {
  const { isFollowing, toggle } = useFollowedInvestors();
  const following = isFollowing(investorId);
  const who = name ?? investorId;

  return (
    <button
      type="button"
      aria-pressed={following}
      aria-label={`${following ? "Unfollow" : "Follow"} ${who}`}
      onClick={(e) => {
        // Cards wrap this in a <Link> — don't trigger navigation.
        e.preventDefault();
        e.stopPropagation();
        toggle(investorId);
      }}
      className={`shrink-0 ${following ? "btn-secondary text-muted" : "btn-primary"} ${size === "sm" ? "btn-small" : ""}`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
