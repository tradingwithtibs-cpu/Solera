import { useId } from "react";
const WIDTH = 320;
const HEIGHT = 96;
const PADDING = 4;

/** A minimal line + fill chart for a ticker's trailing price history. No charting library — just an SVG path. */
export function PriceChart({ history, color }: { history: number[]; color: string }) {
  const gradientId = useId();
  if (history.length < 2) return null;

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;

  const points = history.map((value, i) => {
    const x = (i / (history.length - 1)) * (WIDTH - PADDING * 2) + PADDING;
    const y = HEIGHT - PADDING - ((value - min) / range) * (HEIGHT - PADDING * 2);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const fillPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${HEIGHT} L${points[0][0].toFixed(1)},${HEIGHT} Z`;

  const rising = history[history.length - 1] >= history[0];
  const strokeColor = "currentColor";

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={`w-full ${rising ? "up" : "down"}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`chart-fill-${gradientId}-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.16" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#chart-fill-${gradientId}-${color})`} />
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
