"use client";

import { PriceChart } from "@/components/PriceChart";
import type { HistoryWindow } from "@/lib/live-prices";

// PriceChart's viewBox: the line sits PAD from the top and bottom of a HEIGHT-tall box.
const CHART_H = 96;
const CHART_PAD = 4;

const SPAN_MS: Record<HistoryWindow, number> = {
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "180d": 180 * 86_400_000,
};
// Tick counts that land on whole units: 4-hour, 1-day, 6-day and 30-day steps.
const TICKS: Record<HistoryWindow, number> = { "24h": 7, "7d": 8, "30d": 6, "180d": 7 };

const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function tickLabel(at: number, range: HistoryWindow): string {
  const d = new Date(at);
  if (range === "24h") return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: false }).replace(/^24/, "0") + ":00";
  if (range === "7d") return d.toLocaleDateString("en-US", { weekday: "short" });
  if (range === "30d") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short" });
}

/**
 * The balance chart with the partner's gutters: the range's time ticks
 * underneath, the series' high and low on the right, and the last value
 * tagged on a dotted reference line. The line itself is PriceChart (F4).
 * Ticks are spaced evenly back from `now`; pass null before hydration.
 */
export function HeroChart({ series, range, now }: { series: number[]; range: HistoryWindow; now: number | null }) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const spread = max - min || 1;
  const last = series[series.length - 1];
  const lastTop = ((CHART_PAD + (1 - (last - min) / spread) * (CHART_H - CHART_PAD * 2)) / CHART_H) * 100;
  const ticks = now === null ? [] : Array.from({ length: TICKS[range] }, (_, i) => now - SPAN_MS[range] * (1 - i / (TICKS[range] - 1)));

  return (
    <div className="pf-chart-wrap">
      <div className="pf-chart" role="img" aria-label={`Balance over the range, from ${whole.format(series[0])} to ${whole.format(last)}`}>
        <div className="pf-chart-plot">
          <PriceChart history={series} color="portfolio" />
          <i className="pf-chart-ref" style={{ top: `${lastTop}%` }} aria-hidden="true" />
        </div>
        <div className="pf-chart-y" aria-hidden="true">
          <span>{whole.format(max)}</span>
          <span>{whole.format(min)}</span>
          <b style={{ top: `${lastTop}%` }}>{whole.format(last)}</b>
        </div>
      </div>
      <div className="pf-chart-x" aria-hidden="true">
        {ticks.map((at, i) => (
          <span key={i}>{tickLabel(at, range)}</span>
        ))}
      </div>
    </div>
  );
}
