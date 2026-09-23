const W = 56;
const H = 18;
const POINTS = 40;

/** The 56×18 row sparkline: one path, coloured by first-vs-last through `.up`/`.down`. Renders an empty slot for a missing series so row columns stay aligned. */
export function Sparkline({ series }: { series: number[] }) {
  const s = series.slice(-POINTS);
  if (s.length < 2) return <span className="spark" aria-hidden="true" />;
  const lo = Math.min(...s);
  const hi = Math.max(...s);
  const r = hi - lo || 1;
  const d = s
    .map((v, i) => `${i ? "L" : "M"}${((i / (s.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / r) * (H - 2) - 1).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`spark ${s[s.length - 1] >= s[0] ? "up" : "down"}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
