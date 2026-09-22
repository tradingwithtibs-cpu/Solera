"use client";

import type { HistoryWindow } from "@/lib/live-prices";

export const RANGES: { value: HistoryWindow; label: string; caption: string }[] = [
  { value: "24h", label: "24H", caption: "Last 24 hours · 5-minute closes" },
  { value: "7d", label: "1W", caption: "Last 7 days" },
  { value: "30d", label: "1M", caption: "Last 30 days" },
  { value: "180d", label: "6M", caption: "Last 6 months · daily closes" },
];

/** The 24H · 1W · 1M · 6M segment every chart uses. */
export function RangeSwitch({ value, onChange }: { value: HistoryWindow; onChange: (next: HistoryWindow) => void }) {
  return (
    <div className="range" role="group" aria-label="Chart range">
      {RANGES.map((r) => (
        <button key={r.value} type="button" aria-pressed={value === r.value} onClick={() => onChange(r.value)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function rangeCaption(value: HistoryWindow): string {
  return RANGES.find((r) => r.value === value)?.caption ?? "";
}
