import { FlameIcon, RocketIcon } from "./icons";

/**
 * Shown next to a ticker whose trailing history is up 15%+ — see lib/portfolio.ts
 * `isPumping`. Icon-only: the animated rocket + flame is already a strong,
 * self-explanatory signal next to a green % badge, and a bare icon is
 * trivially narrow — it can't crowd a title the way an icon+text pill can
 * (that crowding is exactly what happened on the currently-live layout).
 * `aria-label` keeps it announced correctly for screen readers even though
 * there's no visible text.
 *
 * Glow pulses (not blinks) — see the CSS comment in globals.css for why: a
 * real on/off blink faster than ~3Hz is a seizure trigger and reads as
 * alarm/urgency, not celebration, on an actual money decision.
 */
export function PumpingBadge() {
  return (
    <span
      role="img"
      aria-label="Pumping"
      title="Pumping"
      className="pump-glow-pulse relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-50"
    >
      {/* Rocket + flame bob and tilt together as one rigid unit — they used
          to animate independently (rocket rotating, flame fixed), which
          made the rocket's tilt swing its base sideways across the flame
          on some frames. Centering the flame with margin (not a
          translate-x transform) leaves `transform` free for its own
          flicker keyframes without clobbering the centering. */}
      <span className="pump-rocket-bob relative flex h-4 w-4 items-center justify-center">
        <FlameIcon className="pump-flame-flicker absolute inset-x-0 top-full mx-auto -mt-1 h-3 w-3" />
        <RocketIcon className="relative h-4 w-4 text-red-600" />
      </span>
    </span>
  );
}
