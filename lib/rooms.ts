import type { Pt, Wall } from "./types";

const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 0.002;

/** Her duvarın iki ucunda başka bir duvarın ucu var mı (köşe birleşimi)? */
export function endJoins(walls: Wall[]) {
  const m = new Map<string, [boolean, boolean]>();
  for (const w of walls) {
    let ja = false;
    let jb = false;
    for (const o of walls) {
      if (o.id === w.id) continue;
      if (near(w.a, o.a) || near(w.a, o.b)) ja = true;
      if (near(w.b, o.a) || near(w.b, o.b)) jb = true;
    }
    m.set(w.id, [ja, jb]);
  }
  return m;
}

export function wallGeom(w: Wall, join: [boolean, boolean] | undefined) {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const L = Math.hypot(dx, dy) || 1e-9;
  const u = { x: dx / L, y: dy / L };
  const n = { x: -u.y, y: u.x };
  const ea = join?.[0] ? w.t / 2 : 0;
  const eb = join?.[1] ? w.t / 2 : 0;
  return { L, u, n, ea, eb };
}

export type Region = {
  area: number;
  cx: number;
  cy: number;
  open: boolean;
  x0: number;
  y0: number;
  w: number;
  h: number;
  cell: number;
  mask: Uint8Array;
};

export type Raster = { x0: number; y0: number; w: number; h: number; cell: number; blocked: Uint8Array } | null;

export function rasterize(walls: Wall[]): Raster {
  if (!walls.length) return null;
  const joins = endJoins(walls);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x - w.t);
      minY = Math.min(minY, p.y - w.t);
      maxX = Math.max(maxX, p.x + w.t);
      maxY = Math.max(maxY, p.y + w.t);
    }
  }
  minX -= 0.5;
  minY -= 0.5;
  maxX += 0.5;
  maxY += 0.5;
  let cell = 0.05;
  while (((maxX - minX) / cell) * ((maxY - minY) / cell) > 1_500_000) cell *= 2;
  const W = Math.ceil((maxX - minX) / cell);
  const H = Math.ceil((maxY - minY) / cell);
  const blocked = new Uint8Array(W * H);
  for (const w of walls) {
    const { L, u, n, ea, eb } = wallGeom(w, joins.get(w.id));
    const half = Math.max(w.t / 2, cell * 0.8);
    const ax = w.a.x - u.x * ea;
    const ay = w.a.y - u.y * ea;
    const len = L + ea + eb;
    const bx0 = Math.min(w.a.x, w.b.x) - w.t - cell;
    const bx1 = Math.max(w.a.x, w.b.x) + w.t + cell;
    const by0 = Math.min(w.a.y, w.b.y) - w.t - cell;
    const by1 = Math.max(w.a.y, w.b.y) + w.t + cell;
    const i0 = Math.max(0, Math.floor((bx0 - minX) / cell));
    const i1 = Math.min(W - 1, Math.ceil((bx1 - minX) / cell));
    const j0 = Math.max(0, Math.floor((by0 - minY) / cell));
    const j1 = Math.min(H - 1, Math.ceil((by1 - minY) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = minX + (i + 0.5) * cell - ax;
        const py = minY + (j + 0.5) * cell - ay;
        const s = px * u.x + py * u.y;
        const r = px * n.x + py * n.y;
        if (s >= -cell * 0.5 && s <= len + cell * 0.5 && Math.abs(r) <= half) blocked[j * W + i] = 1;
      }
    }
  }
  return { x0: minX, y0: minY, w: W, h: H, cell, blocked };
}

export function regionAt(r: Raster, seed: Pt): Region | null {
  if (!r) return null;
  const si = Math.floor((seed.x - r.x0) / r.cell);
  const sj = Math.floor((seed.y - r.y0) / r.cell);
  if (si < 0 || sj < 0 || si >= r.w || sj >= r.h) return null;
  if (r.blocked[sj * r.w + si]) return null;
  const mask = new Uint8Array(r.w * r.h);
  const q = new Int32Array(r.w * r.h);
  let head = 0;
  let tail = 0;
  q[tail++] = sj * r.w + si;
  mask[sj * r.w + si] = 1;
  let open = false;
  let count = 0;
  let sx = 0;
  let sy = 0;
  while (head < tail) {
    const idx = q[head++];
    const x = idx % r.w;
    const y = (idx - x) / r.w;
    count++;
    sx += x;
    sy += y;
    if (x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1) open = true;
    const nb = [x > 0 ? idx - 1 : -1, x < r.w - 1 ? idx + 1 : -1, y > 0 ? idx - r.w : -1, y < r.h - 1 ? idx + r.w : -1];
    for (const k of nb) {
      if (k >= 0 && !mask[k] && !r.blocked[k]) {
        mask[k] = 1;
        q[tail++] = k;
      }
    }
  }
  return {
    area: count * r.cell * r.cell,
    cx: r.x0 + (sx / count + 0.5) * r.cell,
    cy: r.y0 + (sy / count + 0.5) * r.cell,
    open,
    x0: r.x0,
    y0: r.y0,
    w: r.w,
    h: r.h,
    cell: r.cell,
    mask,
  };
}

export function inRegion(reg: Region | null, p: Pt) {
  if (!reg) return false;
  const i = Math.floor((p.x - reg.x0) / reg.cell);
  const j = Math.floor((p.y - reg.y0) / reg.cell);
  if (i < 0 || j < 0 || i >= reg.w || j >= reg.h) return false;
  return reg.mask[j * reg.w + i] === 1;
}
