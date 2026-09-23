const W = 72;
const H = 24;
const PAD = 1.5;

/** A stroke-only sparkline in a row: 72×24, coloured gain or loss by first-vs-last. */
export function Spark({ series, className = "spark" }: { series: number[]; className?: string }) {
  if (series.length < 2) return <span className={className} aria-hidden="true" />;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const d = series
    .map((v, i) => {
      const x = PAD + (i / (series.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = series[series.length - 1] >= series[0];
  return (
    <svg className={`${className} ${up ? "up" : "down"}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
