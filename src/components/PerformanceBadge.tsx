import { formatPercent } from "@/lib/format";

export function PerformanceBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 font-mono text-xs font-semibold tabular-nums ${
        positive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
      }`}
    >
      {formatPercent(value)}
    </span>
  );
}
