import type { FullData } from "./types";

/** Arsa eğimi: ev tabanının en yüksek köşesi 0 m (kat kotu), eğim yönünde alçalır. */
export function terrainFn(f: FullData): ((x: number, z: number) => number) | null {
  const t = f.terrain;
  const s = Math.max(0, Math.min(25, t?.slope ?? 0)) / 100;
  if (s < 0.0005) return null;
  const a = ((t?.dir ?? 0) * Math.PI) / 180;
  const dx = Math.sin(a), dz = -Math.cos(a); // 0° = kuzey = plan üstü (−y)
  const fp = f.floors.find((fl) => fl.walls.length)?.walls.flatMap((w) => [w.a, w.b]) ?? f.plot.points;
  if (!fp.length) return null;
  const cx = fp.reduce((q, p) => q + p.x, 0) / fp.length;
  const cz = fp.reduce((q, p) => q + p.y, 0) / fp.length;
  const proj = (x: number, z: number) => x * dx + z * dz;
  const pmin = Math.min(...fp.map((p) => proj(p.x, p.y)));
  return (x, z) => {
    const h = -s * (proj(x, z) - pmin);
    const d = Math.hypot(x - cx, z - cz);
    const k = d <= 70 ? 1 : d >= 260 ? 0 : 1 - (d - 70) / 190; // uzakta düzleşir
    return h * k;
  };
}

/** zemin kat duvarları altında açıkta kalan cokol (m³) ve en derin yükseklik */
export function plinthInfo(f: FullData) {
  const hf = terrainFn(f);
  const fl = f.floors.find((q) => q.walls.length);
  if (!hf || !fl) return { vol: 0, max: 0 };
  let vol = 0, max = 0;
  for (const w of fl.walls) {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const dep = Math.max(0, -Math.min(hf(w.a.x, w.a.y), hf(w.b.x, w.b.y)));
    vol += L * w.t * dep;
    max = Math.max(max, dep);
  }
  return { vol, max };
}
