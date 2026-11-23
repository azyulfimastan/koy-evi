import type { FullData } from "./types";

export type RoofInfo = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ridgeAlongX: boolean;
  ridgeHeight: number; // tepe yüksekliği (m)
  usable: number; // 1,80 m ve üstü kullanılabilir alan (m²)
  spanDim: number;
  lenDim: number;
};

export const ATTIC_MIN = 1.8;

export function roofInfo(f: FullData): RoofInfo | null {
  if (f.roof.kind === "none") return null;
  let topIdx = -1;
  f.floors.forEach((fl, i) => {
    if (fl.walls.length) topIdx = i;
  });
  const pts: { x: number; y: number; t: number }[] = [];
  if (topIdx >= 0) f.floors[topIdx].walls.forEach((w) => pts.push({ ...w.a, t: w.t }, { ...w.b, t: w.t }));
  else f.plot.points.forEach((p) => pts.push({ ...p, t: 0 }));
  if (pts.length < 2) return null;
  const minX = Math.min(...pts.map((p) => p.x - p.t / 2));
  const maxX = Math.max(...pts.map((p) => p.x + p.t / 2));
  const minY = Math.min(...pts.map((p) => p.y - p.t / 2));
  const maxY = Math.max(...pts.map((p) => p.y + p.t / 2));
  const o = f.roof.overhang;
  const W = maxX - minX;
  const D = maxY - minY;
  const ridgeAlongX = f.roof.ridge === "auto" ? W >= D : f.roof.ridge === "x";
  const spanDim = ridgeAlongX ? D : W;
  const lenDim = ridgeAlongX ? W : D;
  const tan = Math.tan((f.roof.pitch * Math.PI) / 180);
  let H = 0;
  let usable = 0;
  if (f.roof.kind === "gable" || f.roof.kind === "hip") H = (spanDim / 2) * tan;
  else if (f.roof.kind === "shed") H = spanDim * tan;
  if (H > ATTIC_MIN && tan > 0) {
    const k = ATTIC_MIN / tan;
    if (f.roof.kind === "gable") usable = Math.max(0, spanDim - 2 * k) * lenDim;
    else if (f.roof.kind === "hip") usable = Math.max(0, spanDim - 2 * k) * Math.max(0, lenDim - 2 * k);
    else if (f.roof.kind === "shed") usable = Math.max(0, spanDim - k) * lenDim;
  }
  return { x0: minX - o, y0: minY - o, x1: maxX + o, y1: maxY + o, ridgeAlongX, ridgeHeight: H, usable, spanDim, lenDim };
}
