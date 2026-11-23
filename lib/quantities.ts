import type { FullData } from "./types";
import { area, fmt } from "./geo";
import { rasterize, regionAt } from "./rooms";
import { outsideFn, outsideMask } from "./scene3d";
import { roofInfo } from "./roof";
import { plinthInfo } from "./terrain";
import { floorCols } from "./stages";
import { defaultBuild } from "./types";
import { EXT_TEX, FLOOR_TEX, INT_TEX, ROOF_TEX } from "./textures";

export type RoomRow = { floor: string; name: string; area: number };
export type Line = { name: string; qty: number; unit: string; note?: string };

export type Report = {
  rough: Line[]; // kaba yapı ve tesisat (tahmini)
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
  let balN = 0, balVol = 0, balRail = 0, balArea = 0;
  let foundLen = 0,
    beamVol = 0,
    slabVol = 0,
    slabArea = 0,
    lintel = 0,
    sockets = 0,
    switches = 0,
    wet = 0,
    rads = 0;
  const bld = f.build ?? defaultBuild();
  let colCount = 0,
    colVol = 0,
    firstArea = 0;
  const WET = new Set(["sinkK", "basin", "vanity", "wc", "tub", "shower", "washer", "dish", "cooker"]);

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
      const gross = L * (w.h ?? fl.height);
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
      sockets += Math.max(4, Math.ceil(a / 3));
      switches += 1;
      const k = rm.floor && rm.floor !== "none" ? rm.floor : "none";
      floorTex.set(k, (floorTex.get(k) ?? 0) + a);
      if (fi === 0) footprint += a;
    }
    stairs += fl.stairs.length;
    for (const b of fl.balconies ?? []) {
      if (!fl.walls.some((q) => q.id === b.wall)) continue;
      balN += 1;
      balArea += b.w * b.d;
      balVol += b.w * b.d * b.slabT;
      balRail += b.w + 2 * b.d;
    }
    if (fl.walls.length) {
      const len = fl.walls.reduce((sum, w) => sum + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0);
      beamVol += fl.walls.reduce((sum, w) => sum + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) * w.t * 0.2, 0);
      if (fi === 0) foundLen = len;
      if (ras) {
        const out = outsideMask(ras);
        let n = 0;
        for (let k = 0; k < out.length; k++) if (!out[k]) n++;
        const a = n * ras.cell * ras.cell;
        slabArea += a;
        slabVol += a * bld.slabT;
        if (fi === 0) firstArea = a;
      }
    }
    if (fl.walls.length) {
      const cs = floorCols(f, fi);
      colCount += cs.length;
      colVol += cs.length * bld.colSize * bld.colSize * fl.height;
    }
    lintel += fl.openings.reduce((sum, o) => sum + o.w + 0.4, 0);
    for (const it of fl.items) {
      if (WET.has(it.key)) wet++;
      if (it.key === "rad") rads++;
    }
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
  if ((f.terrain?.slope ?? 0) > 0) {
    const pl = plinthInfo(f);
    add("Eğim nedeniyle açıkta kalan cokol betonu", pl.vol, "m³", `en yüksek ${r2(pl.max)} m, eğim %${f.terrain!.slope}`);
  }
  // elle koyulan elektrik ve tesisat noktaları
  const pts = new Map<string, number>();
  for (const fl of f.floors) for (const it of fl.items) if (it.key.startsWith("e_") || it.key.startsWith("p_")) pts.set(it.name, (pts.get(it.name) ?? 0) + 1);
  for (const [nm, q] of [...pts].sort()) add(`${nm} (planda işaretlenen)`, q, "adet");
  if (balN) {
    add("Balkon", balN, "adet");
    add("Balkon döşemesi (beton)", balVol, "m³", `${r2(balArea)} m² alan`);
    add("Balkon korkuluğu", balRail, "m");
  }

  const openings: Line[] = [...opens].sort().map(([name, qty]) => ({ name, qty, unit: "adet" }));
  const itemL: Line[] = [...items].sort((a, b) => a[0].localeCompare(b[0], "tr")).map(([name, qty]) => ({ name, qty, unit: "adet" }));
  void extWallLen;

  const rough: Line[] = [];
  const ar = (name: string, qty: number, unit: string, note?: string) => qty > 0.004 && rough.push({ name, qty: r2(qty), unit, note });
  if (bld.foundation === "strip") {
    ar("Temel hendeği kazısı", foundLen * (bld.fWidth + 0.6) * bld.fDepth, "m³", `${fmt(foundLen)} m × ${fmt(bld.fWidth + 0.6)} m × ${fmt(bld.fDepth)} m`);
    ar("Temel (şerit) betonu", foundLen * bld.fWidth * bld.fDepth, "m³", `${fmt(foundLen)} m × ${fmt(bld.fWidth)} m genişlik × ${fmt(bld.fDepth)} m derinlik`);
    ar("Grobeton (temel altı, 10 cm)", foundLen * bld.fWidth * 0.1, "m³");
  } else if (bld.foundation === "raft") {
    ar("Radye temel kazısı", (firstArea + foundLen * 0.9) * 0.5, "m³");
    ar("Radye temel betonu (40 cm)", (firstArea + foundLen * 0.9) * 0.4, "m³");
  }
  if (bld.screed) ar("Zemin şapı", firstArea * bld.screedT, "m³", `${fmt(firstArea)} m² × ${Math.round(bld.screedT * 100)} cm`);
  ar(`Zemin/ara döşeme betonu (${Math.round(bld.slabT * 100)} cm)`, slabVol, "m³", `${fmt(slabArea)} m² döşeme alanı`);
  ar("Direk (kolon) adedi", colCount, "adet", `${Math.round(bld.colSize * 100)} × ${Math.round(bld.colSize * 100)} cm`);
  ar("Direk betonu", colVol, "m³");
  ar("Hatıl betonu (her katta duvar üstü)", beamVol, "m³", "20 cm yükseklik varsayımı");
  ar("Lento (kapı/pencere üstü) toplam boy", lintel, "m");
  ar("Elektrik: priz", sockets, "adet", "oda alanına göre tahmini");
  ar("Elektrik: anahtar / lamba noktası", switches, "adet");
  ar("Elektrik: kablo (yaklaşık)", (sockets + switches * 2) * 10, "m", "nokta başına ~10 m");
  ar("Tesisat: su/gider noktası", wet, "adet", "lavabo, klozet, duş, küvet, evye, makineler");
  ar("Tesisat: boru (yaklaşık)", wet * 8, "m", "nokta başına ~8 m");
  ar("Radyatör", rads, "adet");
  ar("Mantolama (dış cephe yalıtımı)", extArea, "m²", "isteğe bağlı, dış cephe alanı kadar");

  let total = 0;
  rooms.forEach((r) => (total += r.area));
  return {
    plotArea: f.plot.closed && f.plot.points.length >= 3 ? r2(area(f.plot.points)) : null,
    footprint: r2(footprint),
    totalArea: r2(total),
    height: f.floors.reduce((s, fl) => s + fl.height, 0),
    rooms,
    rough,
    lines,
    openings,
    items: itemL,
    waste: WASTE,
  };
}
