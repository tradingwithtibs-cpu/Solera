import confetti from "canvas-confetti";

/**
 * Fires a brief confetti burst to celebrate a completed trade. Isolated
 * here (rather than inlined at each call site) so the "how" can change
 * independently of the screens that trigger it, and so it's one place to
 * respect reduced-motion preferences.
 */
export function celebrateTrade() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  confetti({
    particleCount: 120,
    spread: 75,
    startVelocity: 45,
    origin: { y: 0.6 },
    colors: ["#4c6fff", "#9b5cf7", "#f59e0b"],
  });
}
