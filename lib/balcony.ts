import type { Balcony, Pt, Wall } from "./types";

/** Balkonun plandaki dört köşesi (duvar yüzünden dışarı) ve yön vektörleri */
export function balconyRect(w: Wall, b: Balcony) {
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  const n = { x: -u.y * b.side, y: u.x * b.side };
  const c = { x: w.a.x + u.x * b.pos, y: w.a.y + u.y * b.pos };
  const o0 = w.t / 2;
  const P = (du: number, dn: number): Pt => ({ x: c.x + u.x * du + n.x * dn, y: c.y + u.y * du + n.y * dn });
  return { u, n, c, L, pts: [P(-b.w / 2, o0), P(b.w / 2, o0), P(b.w / 2, o0 + b.d), P(-b.w / 2, o0 + b.d)] as Pt[], P, o0 };
}

/** nokta balkonun içinde mi */
export function inBalcony(w: Wall, b: Balcony, p: Pt) {
  const r = balconyRect(w, b);
  const du = (p.x - r.c.x) * r.u.x + (p.y - r.c.y) * r.u.y;
  const dn = (p.x - r.c.x) * r.n.x + (p.y - r.c.y) * r.n.y;
  return Math.abs(du) <= b.w / 2 && dn >= r.o0 - 0.05 && dn <= r.o0 + b.d;
}

export const defaultBalcony = (): Omit<Balcony, "id" | "wall" | "pos" | "side"> => ({ w: 2.4, d: 1.2, rail: "bars", railH: 1.0, slabT: 0.15 });
