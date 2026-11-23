/* İnşaat aşamaları: kazı → temel → şap → (her kat: direk → duvar → kapı/pencere → beton) → çatı */
import { defaultBuild, type FullData } from "./types";

export type Stage = { key: "plot" | "dig" | "found" | "screed" | "cols" | "walls" | "fit" | "slab" | "roof" | "done"; label: string; floor?: number };

export function buildStages(f: FullData): Stage[] {
  const b = f.build ?? defaultBuild();
  const st: Stage[] = [{ key: "plot", label: "Boş arsa" }];
  if (b.foundation !== "none") st.push({ key: "dig", label: b.foundation === "raft" ? "Radye temel kazısı" : "Temel hendeklerinin kazısı" }, { key: "found", label: b.foundation === "raft" ? "Radye temel betonu" : "Şerit temel betonu" });
  if (b.screed) st.push({ key: "screed", label: "Zemin betonu ve şap" });
  let top = -1;
  f.floors.forEach((fl, i) => fl.walls.length && (top = i));
  f.floors.forEach((fl, i) => {
    if (!fl.walls.length) return;
    st.push({ key: "cols", floor: i, label: `${fl.name}: direkler (kolonlar)` }, { key: "walls", floor: i, label: `${fl.name}: duvar örme` }, { key: "fit", floor: i, label: `${fl.name}: kapı ve pencereler` });
    if (i < top) st.push({ key: "slab", floor: i, label: `${fl.name}: tavan betonu (üst kat zemini)` });
    else if (b.topSlab) st.push({ key: "slab", floor: i, label: `${fl.name}: tavan betonu` });
  });
  if (f.roof.kind !== "none") st.push({ key: "roof", label: "Çatı" });
  st.push({ key: "done", label: "Tamamlandı: iç mekân ve eşyalar" });
  return st;
}

/** Aşama dizinine kadar o iş yapıldı mı? */
export function reached(stages: Stage[], si: number, key: Stage["key"], floor?: number) {
  const idx = stages.findIndex((s) => s.key === key && s.floor === floor);
  return idx >= 0 && idx <= si;
}

/** Kat için direk konumları: köşeler, duvar kesişimleri, uzun duvarlarda ara direkler + elle konanlar */
export function floorCols(f: FullData, fi: number): { x: number; y: number; manual?: boolean }[] {
  const fl = f.floors[fi];
  const b = f.build ?? defaultBuild();
  const out: { x: number; y: number; manual?: boolean }[] = [];
  const near = (x: number, y: number, r = 0.35) => out.some((c) => Math.hypot(c.x - x, c.y - y) < r);
  if (b.autoCols) {
    for (const w of fl.walls) {
      for (const p of [w.a, w.b]) if (!near(p.x, p.y)) out.push({ x: p.x, y: p.y });
    }
    for (const w of fl.walls) {
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      if (L <= 4.2) continue;
      const n = Math.ceil(L / 4) - 1;
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const x = w.a.x + (w.b.x - w.a.x) * t;
        const y = w.a.y + (w.b.y - w.a.y) * t;
        if (!near(x, y, 0.5)) out.push({ x, y });
      }
    }
  }
  for (const c of fl.cols ?? []) out.push({ x: c.x, y: c.y, manual: true });
  return out;
}
