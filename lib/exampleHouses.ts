/* Köy için 16 örnek ev: alt kat bir daire (120 m²), üst kat bir daire (140 m²).
   Şekil (dikdörtgen / kare / L) × merdiven (içeriden / dışarıdan) × yan yapı (sundurma, kış bahçesi, çay bahçesi, garaj).
   Evler sihirbaz üreticisiyle kurulur; sihirbazda açıp değiştirilebilir. */
import { defaultSpec, generate, newId, RT } from "./wizard";
import type { RoomType, WRoom, WSpec, WWing } from "./wizard";

type Struct = "sundurma" | "garaj" | "kisbahcesi" | "caybahcesi";
type Shape = "rect" | "square" | "L";
type Ex = { shape: Shape; stairs: "in" | "out"; struct: Struct; detached?: boolean; wingSide?: "S" | "E" | "W" };

const SN: Record<Struct, string> = { sundurma: "Sundurmalı", garaj: "Garajlı", kisbahcesi: "Kış bahçeli", caybahcesi: "Çay bahçeli" };
const SHN: Record<Shape, string> = { rect: "Dikdörtgen", square: "Kare", L: "L şekilli" };

type RDef = [RoomType, number, number];
const FLAT0: RDef[] = [["salon", 6.5, 4], ["mutfak", 4, 3.5], ["yatak", 4, 4], ["yatak", 4, 3], ["cocuk", 3.5, 3.2], ["calisma", 3, 2.7], ["banyo", 3, 2], ["wc", 1.6, 2], ["depo", 2.5, 2]];
const FLAT1: RDef[] = [["salon", 7, 4.3], ["mutfak", 4.2, 3.8], ["yatak", 4.2, 4.2], ["yatak", 4, 3.4], ["yatak", 3.8, 3.4], ["cocuk", 3.5, 3.2], ["calisma", 3.4, 3], ["banyo", 3, 2.3], ["wc", 1.6, 2], ["depo", 2.5, 2]];

/** oda listesini toplam alana (m²) ölçekler, en/boyu aynı oranda büyütür */
function scaled(list: RDef[], target: number, block?: number): WRoom[] {
  const sum = list.reduce((a, [, w, d]) => a + w * d, 0);
  const k = Math.sqrt(target / sum);
  return list.map(([type, w, d]) => ({ id: newId(), type, w: Math.round(w * k * 10) / 10, d: Math.round(d * k * 10) / 10, block }));
}
const room = (type: RoomType, w: number, d: number, block?: number, band?: "S" | "N"): WRoom => ({ id: newId(), type, w, d, block, band });

const SIZE: Record<Struct, [number, number]> = { sundurma: [6, 3.5], garaj: [3.5, 6], kisbahcesi: [4.5, 4.5], caybahcesi: [4.5, 4.5] };

function build(ex: Ex): ReturnType<typeof generate> {
  const s: WSpec = defaultSpec();
  const inside = ex.shape !== "L" && !ex.detached; // yan yapı ev gövdesinin içinde (birleşik)
  const [sw, sd] = SIZE[ex.struct];
  const wings: WWing[] = [];
  let W = ex.shape === "square" ? 12 : 14, D = ex.shape === "square" ? 12 : 10.5;
  if (ex.shape === "L") {
    const A = 146 - sw * sd;
    W = 13; D = Math.round((A / W) * 2) / 2;
    const side = ex.wingSide ?? "S";
    wings.push({ id: newId(), to: 0, side, align: 0, w: side === "S" ? sw : sd, d: side === "S" ? sd : sw });
  }
  const f0: WRoom[] = scaled(FLAT0, 111, 0);
  const f1: WRoom[] = scaled(FLAT1, 131, 0);
  if (ex.shape === "L") {
    f0.push(room(ex.struct, wings[0].w, wings[0].d, 1));
    f1.push(room("yatak", wings[0].w, wings[0].d, 1));
  } else if (inside) {
    f0.unshift(room(ex.struct, sw, sd, 0, ex.struct === "garaj" ? "N" : "S"));
    f1.splice(0, 0, room("calisma", 3, 3, 0));
  } else if (ex.detached) {
    // gövde içinde fazladan oda yok; ayrı garaj sonradan arsaya konur. Yan yapı: sundurma/kış/çay bahçesi gövdede
    if (ex.struct !== "garaj") f0.unshift(room(ex.struct, sw, sd, 0, "S"));
  }
  s.floors = 2;
  s.height = 2.8;
  s.rooms = [f0, f1];
  s.autoSize = false;
  s.houseW = W;
  s.houseD = D;
  s.wings = wings;
  s.balconies = [
    { id: newId(), floor: 1, side: "S", w: 3.2, d: 1.5 },
    { id: newId(), floor: 1, side: "E", w: 2.8, d: 1.4 },
  ];
  s.roof = ex.shape === "L" ? "gable" : "hip";
  s.plinth = 0;
  s.entryStair = false;
  s.innerStair = ex.stairs === "in";
  s.upperExt = ex.stairs === "out";
  s.shape = ex.shape === "L" ? "custom" : "rect";
  s.plotW = ex.detached ? 36 : 28;
  s.plotD = 32;
  void RT;
  return generate(s);
}

export type ExampleDef = { key: string; name: string; desc: string; make: () => unknown };

function mk(ex: Ex, n: number): ExampleDef {
  const stairs = ex.stairs === "in" ? "iç merdiven" : "dış merdiven";
  const garage = ex.detached ? " + ayrı garaj" : "";
  const name = `${n}. ${SHN[ex.shape]} · ${ex.detached && ex.struct === "garaj" ? "Ayrı garajlı" : SN[ex.struct]}${ex.detached && ex.struct !== "garaj" ? " + ayrı garaj" : ""} · ${stairs}`;
  return {
    key: `ex${n}`,
    name,
    desc: `Alt 120 m² · üst 140 m² · 2 balkon${garage}`,
    make: () => {
      const r = build(ex);
      if (ex.detached) {
        // ayrı garaj: evin sağ tarafına, yola yakın
        const f0 = r.full.floors[0];
        const xs = f0.walls.flatMap((w) => [w.a.x, w.b.x]);
        const ys = f0.walls.flatMap((w) => [w.a.y, w.b.y]);
        const maxX = Math.max(...xs), maxY = Math.max(...ys);
        const px = Math.max(...r.full.plot.points.map((p) => p.x));
        const gx = Math.min(px - 2.2, maxX + 6);
        r.full.env.objs.push({ id: newId(), rot: 0, kind: "building", name: "Garaj (ayrı)", x: gx, y: maxY - 2.5, w: 3.8, d: 6.5, h: 3.2, color: "#cfc9bd" });
      }
      return r.full;
    },
  };
}

const LIST: Ex[] = [
  { shape: "rect", stairs: "in", struct: "sundurma" },
  { shape: "rect", stairs: "out", struct: "garaj" },
  { shape: "rect", stairs: "in", struct: "kisbahcesi" },
  { shape: "rect", stairs: "out", struct: "caybahcesi" },
  { shape: "square", stairs: "out", struct: "sundurma" },
  { shape: "square", stairs: "in", struct: "garaj" },
  { shape: "square", stairs: "out", struct: "kisbahcesi" },
  { shape: "square", stairs: "in", struct: "caybahcesi" },
  { shape: "L", stairs: "in", struct: "sundurma" },
  { shape: "L", stairs: "out", struct: "garaj" },
  { shape: "L", stairs: "in", struct: "kisbahcesi" },
  { shape: "L", stairs: "out", struct: "caybahcesi" },
  { shape: "rect", stairs: "in", struct: "sundurma", detached: true },
  { shape: "square", stairs: "out", struct: "kisbahcesi", detached: true },
  { shape: "L", stairs: "out", struct: "sundurma", detached: true },
  { shape: "L", stairs: "in", struct: "caybahcesi", detached: true },
];

export const EXAMPLES: ExampleDef[] = LIST.map((e, i) => mk(e, i + 1));
export const buildExample = build;
