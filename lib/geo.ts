import type { Pt } from "./store";

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export function area(pts: Pt[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function perimeter(pts: Pt[], closed: boolean) {
  let s = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

export const snapTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
export const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** i. kenarın uzunluğunu değiştirir: i+1. köşe, kenar yönünde kayar. */
export function setEdgeLength(pts: Pt[], i: number, len: number): Pt[] {
  const n = pts.length;
  const a = pts[i];
  const b = pts[(i + 1) % n];
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) {
    dx = 1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  const out = pts.map((p) => ({ ...p }));
  out[(i + 1) % n] = { x: round3(a.x + dx * len), y: round3(a.y + dy * len) };
  return out;
}

export function bounds(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export const fmt = (v: number, d = 2) => v.toFixed(d).replace(".", ",");
