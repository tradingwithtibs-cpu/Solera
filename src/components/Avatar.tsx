const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
} as const;

export function Avatar({
  initials,
  colorClass,
  size = "md",
}: {
  initials: string;
  colorClass: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZES[size]} ${colorClass}`}
    >
      {initials}
    </div>
  );
}
