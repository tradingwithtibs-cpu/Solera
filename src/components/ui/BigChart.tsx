"use client";

import { useEffect, useRef } from "react";
import type { HistoryWindow } from "@/lib/live-prices";

interface Props {
  /** Closes, oldest → newest. Fewer than two points draws nothing. */
  series: number[];
  /** The range that produced the series; only used to label the x axis and the tooltip. */
  range: HistoryWindow;
  /** A dotted reference line, e.g. the exchange price behind an xStock. */
  reference?: number;
  ariaLabel?: string;
}

const PAD = { l: 10, r: 64, t: 12, b: 24 };
const SPAN_MS: Record<HistoryWindow, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "180d": 180 * 86_400_000,
};
const TICK_SEGMENTS: Record<HistoryWindow, number> = { "24h": 6, "7d": 7, "30d": 6, "180d": 6 };

function usd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

/** "Nice" tick values between lo and hi, roughly `count` of them. */
function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const rough = span / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

function timeAt(i: number, n: number, range: HistoryWindow, now: number): number {
  return now - SPAN_MS[range] * (1 - i / Math.max(1, n - 1));
}

function tickLabel(t: number, range: HistoryWindow): string {
  const d = new Date(t);
  if (range === "24h") return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") return d.toLocaleDateString("en-US", { weekday: "short" });
  if (range === "30d") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short" });
}

function tipLabel(t: number, range: HistoryWindow): string {
  const d = new Date(t);
  if (range === "24h" || range === "7d")
    return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function xTicks(n: number, range: HistoryWindow, now: number): { i: number; l: string }[] {
  const segments = TICK_SEGMENTS[range];
  const seen = new Set<string>();
  const out: { i: number; l: string }[] = [];
  for (let k = 0; k <= segments; k++) {
    const i = Math.round((k / segments) * (n - 1));
    const l = tickLabel(timeAt(i, n, range, now), range);
    if (seen.has(l)) continue;
    seen.add(l);
    out.push({ i, l });
  }
  return out;
}

interface Geometry {
  x: (i: number) => number;
  y: (v: number) => number;
  W: number;
  H: number;
}

function draw(canvas: HTMLCanvasElement, series: number[], range: HistoryWindow, reference: number | undefined, hover: number | null): Geometry | null {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const W = rect.width;
  const H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);

  const css = getComputedStyle(canvas);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const mono = token("--font-mono", token("--font-figures", "monospace"));
  const line = token("--ink-tooltip", "#f2f3ff");
  const grid = token("--line", "#232a40");
  const muted = token("--text-2", "#8a8fb3");
  const ink = token("--ink-page", "#0b0d16");
  const panel = token("--ink-panel", "#10131f");

  let rawLo = Math.min(...series);
  let rawHi = Math.max(...series);
  if (reference !== undefined && Number.isFinite(reference)) {
    rawLo = Math.min(rawLo, reference);
    rawHi = Math.max(rawHi, reference);
  }
  const pad = (rawHi - rawLo || rawLo * 0.01 || 1) * 0.12;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const r = hi - lo || 1;
  const x = (i: number) => PAD.l + (i / Math.max(1, series.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / r) * (H - PAD.t - PAD.b);
  const now = Date.now();

  ctx.clearRect(0, 0, W, H);
  ctx.font = `500 10px ${mono}`;
  ctx.lineWidth = 1;

  // y grid and labels in the right gutter (a label under the last-price tag is skipped).
  const lastY = y(series[series.length - 1]);
  for (const v of niceTicks(lo, hi, 4)) {
    const gy = y(v);
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(PAD.l, gy);
    ctx.lineTo(W - PAD.r, gy);
    ctx.stroke();
    if (Math.abs(gy - lastY) < 12) continue;
    ctx.fillStyle = muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(usd(v), W - PAD.r + 8, gy);
  }
  // x grid and labels.
  for (const { i, l } of xTicks(series.length, range, now)) {
    const gx = x(i);
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(gx, PAD.t);
    ctx.lineTo(gx, H - PAD.b);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textAlign = i === 0 ? "left" : i === series.length - 1 ? "right" : "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(l, gx, H - 8);
  }
  // axis frame
  ctx.strokeStyle = grid;
  ctx.beginPath();
  ctx.moveTo(PAD.l, H - PAD.b);
  ctx.lineTo(W - PAD.r, H - PAD.b);
  ctx.moveTo(W - PAD.r, PAD.t);
  ctx.lineTo(W - PAD.r, H - PAD.b);
  ctx.stroke();

  // area + line
  const fill = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
  fill.addColorStop(0, `${line}33`);
  fill.addColorStop(1, `${line}00`);
  ctx.beginPath();
  ctx.moveTo(x(0), y(series[0]));
  series.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(series.length - 1), H - PAD.b);
  ctx.lineTo(x(0), H - PAD.b);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  series.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineWidth = 1;

  // the exchange reference, dotted
  if (reference !== undefined && Number.isFinite(reference)) {
    const ry = y(reference);
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = muted;
    ctx.beginPath();
    ctx.moveTo(PAD.l, ry);
    ctx.lineTo(W - PAD.r, ry);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // last price: dashed line and the tag in the gutter
  const last = series[series.length - 1];
  const ly = y(last);
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = `${line}66`;
  ctx.beginPath();
  ctx.moveTo(PAD.l, ly);
  ctx.lineTo(W - PAD.r, ly);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = line;
  ctx.fillRect(W - PAD.r + 4, ly - 8, PAD.r - 6, 16);
  ctx.fillStyle = ink;
  ctx.font = `600 10px ${mono}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(usd(last), W - PAD.r + 8, ly);

  // crosshair
  if (hover !== null && hover >= 0 && hover < series.length) {
    const hx = x(hover);
    const hy = y(series[hover]);
    ctx.strokeStyle = `${line}99`;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, PAD.t);
    ctx.lineTo(hx, H - PAD.b);
    ctx.moveTo(PAD.l, hy);
    ctx.lineTo(W - PAD.r, hy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fillStyle = line;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = panel;
    ctx.stroke();
  }
  return { x, y, W, H };
}

/**
 * The big price chart on canvas: right-gutter price labels, time ticks
 * that match the range, an area fill under the line, the last price tagged
 * in the gutter, a dotted reference line and a pointer crosshair with a
 * tooltip (pointer events, so it works on touch too). Colours come from
 * the page tokens at draw time.
 */
export function BigChart({ series, range, reference, ariaLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const tip = tipRef.current;
    if (!canvas || series.length < 2) return;
    let hover: number | null = null;
    let geometry: Geometry | null = null;
    let frame = 0;
    const render = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        geometry = draw(canvas, series, range, reference, hover);
      });
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const inner = rect.width - PAD.l - PAD.r;
      if (inner <= 0) return;
      const i = Math.max(0, Math.min(series.length - 1, Math.round(((e.clientX - rect.left - PAD.l) / inner) * (series.length - 1))));
      if (i === hover) return;
      hover = i;
      render();
      if (tip) {
        tip.hidden = false;
        const px = geometry ? geometry.x(i) : e.clientX - rect.left;
        tip.style.left = `${Math.min(rect.width - 130, Math.max(0, px - 55))}px`;
        tip.innerHTML = `<b>${usd(series[i])}</b><span>${tipLabel(timeAt(i, series.length, range, Date.now()), range)}</span>`;
      }
    };
    const onLeave = () => {
      hover = null;
      render();
      if (tip) tip.hidden = true;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointercancel", onLeave);
    const observer = new ResizeObserver(render);
    observer.observe(canvas.parentElement ?? canvas);
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointercancel", onLeave);
    };
  }, [series, range, reference]);

  return (
    <>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel ?? "Price chart"} />
      <div ref={tipRef} className="chart-tip" hidden />
    </>
  );
}
