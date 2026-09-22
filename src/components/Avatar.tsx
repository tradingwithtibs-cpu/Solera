import { fillFor } from "@/lib/palette";

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
} as const;

/** Wallet or person avatar: initials on one of the eight ink-safe fills. */
export function Avatar({
  initials,
  colorClass,
  size = "md",
}: {
  initials: string;
  /** A `var(--color-tk-n)` token, or a legacy class name that is mapped to one. */
  colorClass: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border border-line-strong font-mono font-semibold text-white ${SIZES[size]}`}
      style={{ background: fillFor(colorClass, initials) }}
    >
      {initials}
    </div>
  );
}
