import type { FullData } from "./types";
import { area, fmt } from "./geo";
import { rasterize, regionAt } from "./rooms";
import { outsideFn } from "./scene3d";
import { roofInfo } from "./roof";
import { EXT_TEX, FLOOR_TEX, INT_TEX, ROOF_TEX } from "./textures";

export type RoomRow = { floor: string; name: string; area: number };
export type Line = { name: string; qty: number; unit: string; note?: string };

export type Report = {
  plotArea: number | null;
  footprint: number; // zemin kat kapalı oda + duvar alanı yaklaşığı
  totalArea: number; // tüm katların oda alanı toplamı
  height: number;
  rooms: RoomRow[];
  lines: Line[]; // malzeme listesi
  openings: Line[];
  items: Line[];
  waste: number;
};

const WASTE = 0.1;
const nm = (list: [string, string][], k: string) => list.find((x) => x[0] === k)?.[1] ?? k;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function computeReport(f: FullData): Report {
  const rooms: RoomRow[] = [];
  let wallLen = 0,
    extArea = 0,
    intArea = 0,
    wallVol = 0,
    extWallLen = 0,
    ceil = 0,
    footprint = 0;
  const extByTex = 0;
  void extByTex;
  const floorTex = new Map<string, number>();
  const opens = new Map<string, number>();
  const items = new Map<string, number>();
  let stairs = 0;

  f.floors.forEach((fl, fi) => {
    const isOut = outsideFn(fl);
    const ras = rasterize(fl.walls);
    for (const w of fl.walls) {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const L = Math.hypot(dx, dy);
      if (L < 0.01) continue;
      const nx = -dy / L;
      const ny = dx / L;
      const mx = (w.a.x + w.b.x) / 2;
      const my = (w.a.y + w.b.y) / 2;
      const off = w.t / 2 + 0.15;
      const outA = isOut(mx + nx * off, my + ny * off);
      const outB = isOut(mx - nx * off, my - ny * off);
      const ops = fl.openings.filter((o) => o.wall === w.id);
      const opArea = ops.reduce((s, o) => s + o.w * o.h, 0);
      const gross = L * fl.height;
      wallLen += L;
      wallVol += (gross - opArea) * w.t;
      const faces = [outA, outB];
      for (const out of faces) {
        if (out) {
          extArea += gross - opArea;
        } else {
          intArea += gross - opArea;
        }
      }
      if (outA || outB) extWallLen += L;
      for (const o of ops) {
        const key = `${o.kind === "door" ? "Kapı" : "Pencere"} ${Math.round(o.w * 100)}×${Math.round(o.h * 100)} cm`;
        opens.set(key, (opens.get(key) ?? 0) + 1);
      }
    }
    for (const rm of fl.rooms) {
      const reg = regionAt(ras, rm.seed);
      if (!reg || reg.open) continue;
      const a = reg.area;
      rooms.push({ floor: fl.name, name: rm.name, area: r2(a) });
      ceil += a;
      const k = rm.floor && rm.floor !== "none" ? rm.floor : "none";
      floorTex.set(k, (floorTex.get(k) ?? 0) + a);
      if (fi === 0) footprint += a;
    }
    stairs += fl.stairs.length;
    for (const it of fl.items) items.set(it.name, (items.get(it.name) ?? 0) + 1);
  });

  const ri = roofInfo(f);
  const lines: Line[] = [];
  const add = (name: string, qty: number, unit: string, note?: string) => qty > 0.004 && lines.push({ name, qty: r2(qty), unit, note });
  add("Duvar uzunluğu (eksen)", wallLen, "m");
  add("Duvar hacmi (açıklıklar düşülmüş)", wallVol, "m³", "yapı malzemesi için");
  add(`Dış cephe – ${nm(EXT_TEX, f.fin.extTex)}`, extArea, "m²", `+%${WASTE * 100} fire ile ${fmt(extArea * (1 + WASTE))} m²`);
  add(`İç duvar – ${nm(INT_TEX, f.fin.intTex)}`, intArea, "m²", `+%${WASTE * 100} fire ile ${fmt(intArea * (1 + WASTE))} m²`);
  add("Tavan boyası / sıva", ceil, "m²");
  for (const [k, a] of floorTex) add(`Zemin – ${k === "none" ? "Kaplamasız (varsayılan)" : nm(FLOOR_TEX, k)}`, a, "m²", k === "none" ? undefined : `+%${WASTE * 100} fire ile ${fmt(a * (1 + WASTE))} m²`);
  if (ri) {
    const foot = (ri.x1 - ri.x0) * (ri.y1 - ri.y0);
    const cos = Math.cos((f.roof.pitch * Math.PI) / 180);
    const surf = f.roof.kind === "flat" ? foot : foot / Math.max(cos, 0.2);
    add(`Çatı kaplaması – ${nm(ROOF_TEX, f.roof.tex)}`, surf, "m²", `+%${WASTE * 100} fire ile ${fmt(surf * (1 + WASTE))} m²`);
    if (f.roof.kind === "gable" || f.roof.kind === "hip") add("Mahya uzunluğu (yaklaşık)", ri.lenDim + 2 * f.roof.overhang, "m");
    if (f.roof.tex === "tile") add("Kiremit (yaklaşık, 14 adet/m²)", Math.ceil(surf * 14 * (1 + WASTE)), "adet");
    if (ri.usable > 0) add("Çatı arası kullanılabilir alan (≥1,80 m)", ri.usable, "m²");
  }
  if (stairs) add("Merdiven", stairs, "adet");

  const openings: Line[] = [...opens].sort().map(([name, qty]) => ({ name, qty, unit: "adet" }));
  const itemL: Line[] = [...items].sort((a, b) => a[0].localeCompare(b[0], "tr")).map(([name, qty]) => ({ name, qty, unit: "adet" }));
  void extWallLen;

  let total = 0;
  rooms.forEach((r) => (total += r.area));
  return {
    plotArea: f.plot.closed && f.plot.points.length >= 3 ? r2(area(f.plot.points)) : null,
    footprint: r2(footprint),
    totalArea: r2(total),
    height: f.floors.reduce((s, fl) => s + fl.height, 0),
    rooms,
    lines,
    openings,
    items: itemL,
    waste: WASTE,
  };
}
