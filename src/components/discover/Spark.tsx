/** A 48×14 trail sparkline: stroke is currentColor, coloured by first-vs-last through `.up`/`.down`. */
export function Spark({ values, className = "spark trail" }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 48;
  const h = 14;
  const pad = 1;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg className={`${className} ${rising ? "up" : "down"}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
