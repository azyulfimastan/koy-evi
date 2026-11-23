import type { FullData } from "./types";
import { balconyRect } from "./balcony";
import { stairBox } from "./stairs";

/** Bir katın sade plan çizimi (SVG metni): karşılaştırma ve özet sayfaları için */
export function planSvg(f: FullData, fi: number, W = 520, H = 380): string {
  const fl = f.floors[fi];
  if (!fl || !fl.walls.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#999" font-size="14" font-family="sans-serif">Bu katta duvar yok</text></svg>`;
  const pts = fl.walls.flatMap((w) => [w.a, w.b]);
  const bal = (fl.balconies ?? []).flatMap((b) => {
    const w = fl.walls.find((q) => q.id === b.wall);
    return w ? balconyRect(w, b).pts : [];
  });
  const all = [...pts, ...bal];
  const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
  const pad = 24;
  const s = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1), (H - 2 * pad) / Math.max(maxY - minY, 1));
  const X = (x: number) => (pad + (x - minX) * s + (W - 2 * pad - (maxX - minX) * s) / 2).toFixed(1);
  const Y = (y: number) => (pad + (y - minY) * s + (H - 2 * pad - (maxY - minY) * s) / 2).toFixed(1);
  const out: string[] = [];
  for (const b of fl.balconies ?? []) {
    const w = fl.walls.find((q) => q.id === b.wall);
    if (!w) continue;
    const r = balconyRect(w, b);
    out.push(`<polygon points="${r.pts.map((p) => X(p.x) + "," + Y(p.y)).join(" ")}" fill="#d9d6cb" stroke="#7a7266" stroke-width="1.5"/>`);
  }
  for (const w of fl.walls) out.push(`<line x1="${X(w.a.x)}" y1="${Y(w.a.y)}" x2="${X(w.b.x)}" y2="${Y(w.b.y)}" stroke="#3d382f" stroke-width="${Math.max(2, w.t * s).toFixed(1)}"/>`);
  for (const o of fl.openings) {
    const w = fl.walls.find((q) => q.id === o.wall);
    if (!w) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
    const a = { x: w.a.x + ux * (o.pos - o.w / 2), y: w.a.y + uy * (o.pos - o.w / 2) };
    const b = { x: w.a.x + ux * (o.pos + o.w / 2), y: w.a.y + uy * (o.pos + o.w / 2) };
    out.push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#fffdf6" stroke-width="${Math.max(2, w.t * s + 1).toFixed(1)}"/>`);
    out.push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="${o.kind === "window" ? "#4a90c8" : "#a0623a"}" stroke-width="2"/>`);
  }
  for (const st of fl.stairs) {
    const bx = stairBox(st, fl.height);
    out.push(`<rect x="${(+X(st.x) - (bx.W * s) / 2).toFixed(1)}" y="${(+Y(st.y) - (bx.D * s) / 2).toFixed(1)}" width="${(bx.W * s).toFixed(1)}" height="${(bx.D * s).toFixed(1)}" fill="none" stroke="#7a7266" stroke-width="1.2" stroke-dasharray="3 2" transform="rotate(${st.rot} ${X(st.x)} ${Y(st.y)})"/>`);
  }
  for (const r of fl.rooms) out.push(`<text x="${X(r.seed.x)}" y="${Y(r.seed.y)}" text-anchor="middle" font-size="${Math.max(9, Math.min(13, s * 0.4)).toFixed(0)}" font-family="sans-serif" fill="#2a2a26" paint-order="stroke" stroke="#fffdf6" stroke-width="3">${r.name.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">${out.join("")}</svg>`;
}
