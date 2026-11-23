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
  foot: number; // çatının plandaki alanı (m²), çıkma dahil
};

export const ATTIC_MIN = 1.8;

function infoFor(f: FullData, minX: number, maxX: number, minY: number, maxY: number): RoofInfo {
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
  return { x0: minX - o, y0: minY - o, x1: maxX + o, y1: maxY + o, ridgeAlongX, ridgeHeight: H, usable, spanDim, lenDim, foot: (W + 2 * o) * (D + 2 * o) };
}

/** Çatı parçaları: çok kanatlı evde her blok ayrı, yoksa tek parça (en üst katın dış sınırı) */
export function roofParts(f: FullData): RoofInfo[] {
  if (f.roof.kind === "none") return [];
  const parts = f.roof.parts;
  if (parts && parts.length) {
    let topIdx = -1;
    f.floors.forEach((fl, i) => { if (fl.walls.length) topIdx = i; });
    const t = topIdx >= 0 ? Math.max(...f.floors[topIdx].walls.map((w) => w.t), 0.2) / 2 : 0.15;
    return parts.map((p) => infoFor(f, p.x - t, p.x + p.w + t, p.y - t, p.y + p.d + t));
  }
  const one = roofInfo(f);
  return one ? [one] : [];
}

export function roofInfo(f: FullData): RoofInfo | null {
  if (f.roof.kind === "none") return null;
  if (f.roof.parts && f.roof.parts.length) {
    const ps = roofParts(f);
    if (!ps.length) return null;
    const big = [...ps].sort((a, b) => b.foot - a.foot)[0];
    return { ...big, x0: Math.min(...ps.map((p) => p.x0)), y0: Math.min(...ps.map((p) => p.y0)), x1: Math.max(...ps.map((p) => p.x1)), y1: Math.max(...ps.map((p) => p.y1)), ridgeHeight: Math.max(...ps.map((p) => p.ridgeHeight)), usable: ps.reduce((a, p) => a + p.usable, 0), foot: ps.reduce((a, p) => a + p.foot, 0) };
  }
  let topIdx = -1;
  f.floors.forEach((fl, i) => {
    if (fl.walls.length) topIdx = i;
  });
  const pts: { x: number; y: number; t: number }[] = [];
  if (topIdx >= 0) f.floors[topIdx].walls.forEach((w) => pts.push({ ...w.a, t: w.t }, { ...w.b, t: w.t }));
  else f.plot.points.forEach((p) => pts.push({ ...p, t: 0 }));
  if (pts.length < 2) return null;
  return infoFor(f, Math.min(...pts.map((p) => p.x - p.t / 2)), Math.max(...pts.map((p) => p.x + p.t / 2)), Math.min(...pts.map((p) => p.y - p.t / 2)), Math.max(...pts.map((p) => p.y + p.t / 2)));
}
