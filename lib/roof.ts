import type { FullData, Wall } from "./types";
import { outsideMask, rasterize } from "./rooms";

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

type Rc = { x0: number; y0: number; x1: number; y1: number };

/** Satır satır tarayıp benzer şeritleri dikdörtgenlere birleştirir (tol: hücre) */
function strips(mask: Uint8Array, W: number, H: number, tol: number) {
  type O = { a: number; b: number; j0: number; j1: number };
  const done: O[] = [];
  let open: O[] = [];
  for (let j = 0; j <= H; j++) {
    const runs: [number, number][] = [];
    if (j < H) {
      let i = 0;
      while (i < W) {
        if (mask[j * W + i]) {
          const st = i;
          while (i < W && mask[j * W + i]) i++;
          runs.push([st, i]);
        } else i++;
      }
    }
    const next: O[] = [];
    const used = new Set<O>();
    for (const [a, b] of runs) {
      const hit = open.find((o) => !used.has(o) && Math.abs(o.a - a) <= tol && Math.abs(o.b - b) <= tol);
      if (hit) {
        used.add(hit);
        hit.a = Math.min(hit.a, a);
        hit.b = Math.max(hit.b, b);
        hit.j1 = j + 1;
        next.push(hit);
      } else next.push({ a, b, j0: j, j1: j + 1 });
    }
    open.forEach((o) => { if (!used.has(o)) done.push(o); });
    open = next;
  }
  return done;
}

const partCache = new WeakMap<Wall[], Rc[] | null>();

/** En üst katın dış sınırını dikdörtgenlere ayırır; sınır zaten dikdörtgense null (tek parça) */
function footprintRects(walls: Wall[]): Rc[] | null {
  if (partCache.has(walls)) return partCache.get(walls)!;
  let res: Rc[] | null = null;
  const r = walls.length ? rasterize(walls) : null;
  if (r) {
    const out = outsideMask(r);
    const { w: W, h: H, cell } = r;
    const fp = new Uint8Array(W * H);
    let n = 0, i0 = W, i1 = -1, j0 = H, j1 = -1;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++)
        if (!out[j * W + i]) {
          fp[j * W + i] = 1;
          n++;
          if (i < i0) i0 = i;
          if (i > i1) i1 = i;
          if (j < j0) j0 = j;
          if (j > j1) j1 = j;
        }
    const box = (i1 - i0 + 1) * (j1 - j0 + 1);
    if (n > 0 && n < box * 0.96) {
      const tol = Math.max(1, Math.round(0.3 / cell));
      const minC = Math.max(1, Math.round(0.3 / cell));
      const toRc = (o: { a: number; b: number; j0: number; j1: number }, tr: boolean): Rc =>
        tr ? { x0: r.x0 + o.j0 * cell, x1: r.x0 + o.j1 * cell, y0: r.y0 + o.a * cell, y1: r.y0 + o.b * cell } : { x0: r.x0 + o.a * cell, x1: r.x0 + o.b * cell, y0: r.y0 + o.j0 * cell, y1: r.y0 + o.j1 * cell };
      const hz = strips(fp, W, H, tol).filter((o) => o.b - o.a >= minC && o.j1 - o.j0 >= minC);
      const tp = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) tp[i * H + j] = fp[j * W + i];
      const vt = strips(tp, H, W, tol).filter((o) => o.b - o.a >= minC && o.j1 - o.j0 >= minC);
      const score = (l: { a: number; b: number; j0: number; j1: number }[]) => ({ n: l.length, m: Math.min(...l.map((o) => Math.min(o.b - o.a, o.j1 - o.j0))) });
      const sh = hz.length ? score(hz) : null, sv = vt.length ? score(vt) : null;
      let useH = true;
      if (!sh) useH = false;
      else if (sv) useH = sh.n < sv.n || (sh.n === sv.n && sh.m >= sv.m);
      const list = useH ? hz.map((o) => toRc(o, false)) : vt.map((o) => toRc(o, true));
      if (list.length > 1 && list.length <= 6) res = list;
    }
  }
  partCache.set(walls, res);
  return res;
}

/** Çatı parçaları: dik açılı çok kanatlı evde her kanat ayrı çatı, dikdörtgen evde tek parça */
export function roofParts(f: FullData): RoofInfo[] {
  if (f.roof.kind === "none") return [];
  let topIdx = -1;
  f.floors.forEach((fl, i) => { if (fl.walls.length) topIdx = i; });
  if (topIdx >= 0) {
    const rcs = footprintRects(f.floors[topIdx].walls);
    if (rcs) return rcs.map((c) => infoFor(f, c.x0, c.x1, c.y0, c.y1));
  }
  const one = roofInfo(f);
  return one ? [one] : [];
}

export function roofInfo(f: FullData): RoofInfo | null {
  if (f.roof.kind === "none") return null;
  let topIdx = -1;
  f.floors.forEach((fl, i) => {
    if (fl.walls.length) topIdx = i;
  });
  if (topIdx >= 0 && footprintRects(f.floors[topIdx].walls)) {
    const ps = roofParts(f);
    const big = [...ps].sort((a, b) => b.foot - a.foot)[0];
    return { ...big, x0: Math.min(...ps.map((p) => p.x0)), y0: Math.min(...ps.map((p) => p.y0)), x1: Math.max(...ps.map((p) => p.x1)), y1: Math.max(...ps.map((p) => p.y1)), ridgeHeight: Math.max(...ps.map((p) => p.ridgeHeight)), usable: ps.reduce((a, p) => a + p.usable, 0), foot: ps.reduce((a, p) => a + p.foot, 0) };
  }
  return bboxInfo(f, topIdx);
}

function bboxInfo(f: FullData, topIdx: number): RoofInfo | null {
  const pts: { x: number; y: number; t: number }[] = [];
  if (topIdx >= 0) f.floors[topIdx].walls.forEach((w) => pts.push({ ...w.a, t: w.t }, { ...w.b, t: w.t }));
  else f.plot.points.forEach((p) => pts.push({ ...p, t: 0 }));
  if (pts.length < 2) return null;
  return infoFor(f, Math.min(...pts.map((p) => p.x - p.t / 2)), Math.max(...pts.map((p) => p.x + p.t / 2)), Math.min(...pts.map((p) => p.y - p.t / 2)), Math.max(...pts.map((p) => p.y + p.t / 2)));
}
