import type { FullData, Floor, Wall, Opening, Item, Room } from "./types";
import { normalizeFull, defaultBuild } from "./types";
import { placeExtStair } from "./stairs";

/* Sihirbaz: girilen rakamlardan (oda, kat, balkon, çatı) otomatik ev üretir. */
export type RoomType = "salon" | "salonmutfak" | "mutfak" | "yatak" | "cocuk" | "banyo" | "wc" | "calisma" | "depo";
export type WRoom = { id: string; type: RoomType; w: number; d: number; band?: "S" | "N"; block?: number; turn?: 0 | 1 | 2 | 3 /* eşya yönü: 0 normal, 1 yatay ayna, 2 dikey ayna, 3 ikisi (180°) */ };
export type WBalcony = { id: string; floor: number; side: "N" | "E" | "S" | "W"; w: number; d: number };
export type Side = "N" | "E" | "S" | "W";
/** Kanat: bir bloğun bir cephesine eklenen dikdörtgen. to: bağlandığı blok (0 = ana blok, 1 = 1. kanat...) */
export type WWing = { id: string; to: number; side: Side; align: 0 | 0.5 | 1; w: number; d: number };
export type WSpec = {
  plotW: number;
  plotD: number;
  autoSize: boolean;
  houseW: number;
  houseD: number;
  floors: number;
  height: number;
  rooms: WRoom[][]; // her kat için oda listesi
  balconies: WBalcony[];
  roof: "gable" | "hip" | "shed" | "flat" | "none";
  pitch: number;
  furnish: boolean;
  plinth: number; // kaide yüksekliği (m)
  entryStair: boolean; // girişe dış merdiven
  upperExt: boolean; // 1. kata dış merdiven
  innerStair: boolean; // katlar arası iç merdiven
  shape: "rect" | "L" | "T" | "U" | "custom";
  wings: WWing[]; // ana bloğa (ve birbirlerine) eklenen kanatlar
};

export const RT: Record<RoomType, { name: string; color: string; floor: string; front: number; w: number; d: number }> = {
  salon: { name: "Salon", color: "#f3d9a6", floor: "parquet", front: 0, w: 5, d: 4 },
  salonmutfak: { name: "Salon ve mutfak", color: "#f3d9a6", floor: "parquet", front: 0, w: 6, d: 5 },
  mutfak: { name: "Mutfak", color: "#cfe3d0", floor: "fayans", front: 1, w: 3.5, d: 3 },
  calisma: { name: "Çalışma odası", color: "#e3efd0", floor: "laminate", front: 2, w: 3, d: 3 },
  yatak: { name: "Yatak odası", color: "#d9d2ef", floor: "laminate", front: 3, w: 3.5, d: 3.5 },
  cocuk: { name: "Çocuk odası", color: "#f6d6c8", floor: "laminate", front: 3, w: 3, d: 3 },
  banyo: { name: "Banyo", color: "#cde6f2", floor: "fayans", front: 4, w: 2.2, d: 2.5 },
  wc: { name: "WC", color: "#cde6f2", floor: "fayans", front: 4, w: 1.2, d: 1.8 },
  depo: { name: "Depo", color: "#e4ddcf", floor: "plain", front: 5, w: 2, d: 2 },
};

let n = 0;
const uid = () => `w${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newId = uid;

export function defaultSpec(): WSpec {
  const r = (type: RoomType, w?: number, d?: number): WRoom => ({ id: uid(), type, w: w ?? RT[type].w, d: d ?? RT[type].d });
  return {
    plotW: 20, plotD: 24, autoSize: true, houseW: 10, houseD: 8, floors: 1, height: 2.8,
    rooms: [[r("salonmutfak", 6, 4.5), r("yatak", 3.5, 3.5), r("yatak", 3, 3), r("banyo", 2.2, 2.5)]],
    balconies: [], roof: "gable", pitch: 30, furnish: true, plinth: 0, entryStair: true, upperExt: false, innerStair: true, shape: "rect", wings: [],
  };
}


const HOL_W = 2.5;
const area = (r: WRoom) => Math.max(1, r.w * r.d);

export function floorArea(rs: WRoom[], multi: boolean) {
  return rs.reduce((a, r) => a + area(r), 0) + (multi ? 9 : 0);
}

/** kat adı */
export const floorName = (i: number) => (i === 0 ? "Zemin kat" : `${i}. kat`);


export type WResult = { full: FullData; warnings: string[]; rooms: { floor: number; name: string; w: number; d: number; a: number; want: number }[]; houseW: number; houseD: number };

export function autoHouse(s: WSpec) {
  const multi = s.floors > 1;
  const A = Math.max(...s.rooms.slice(0, s.floors).map((rs) => floorArea(rs, multi)), 16) * 1.08;
  const W = Math.round(Math.sqrt(A * 1.3) * 2) / 2;
  const D = Math.round((A / W) * 2) / 2;
  return { W: Math.max(W, 5), D: Math.max(D, multi ? 7 : 5) };
}

const r5 = (x: number) => Math.round(x * 2) / 2;
/** Hazır şekil: toplam taban alanını ana blok + kanatlara böler */
export function shapePreset(kind: "L" | "T" | "U", s: WSpec): { houseW: number; houseD: number; wings: WWing[] } {
  const multi = s.floors > 1;
  const A = Math.max(...s.rooms.slice(0, s.floors).map((rs) => floorArea(rs, multi)), 16) * 1.08;
  const share = kind === "U" ? 0.55 : 0.62;
  const mainA = A * share;
  const W0 = Math.max(6, r5(Math.sqrt(mainA * 1.3)));
  const D0 = Math.max(multi ? 7.5 : 5, r5(mainA / W0));
  const mk = (w: number, align: 0 | 0.5 | 1, wa: number): WWing => ({ id: newId(), to: 0, side: "S", align, w: Math.max(3, r5(w)), d: Math.max(3, r5(wa / Math.max(3, r5(w)))) });
  if (kind === "L") return { houseW: W0, houseD: D0, wings: [mk(W0 * 0.5, 0, A - mainA)] };
  if (kind === "T") return { houseW: W0, houseD: D0, wings: [mk(W0 * 0.4, 0.5, A - mainA)] };
  return { houseW: W0, houseD: D0, wings: [mk(W0 * 0.3, 0, (A - mainA) / 2), mk(W0 * 0.3, 1, (A - mainA) / 2)] };
}

type Block = { x: number; y: number; w: number; d: number };
type Cell = { turn?: number; x0: number; y0: number; x1: number; y1: number; b: number; name: string; type: RoomType | "hol"; want: number; hub?: boolean };
type Piece = { e0: number; e1: number; wall: Wall; ext: boolean };

const edgeOf = (b: Block, side: Side) =>
  side === "N" ? { ax: b.x, ay: b.y, dx: 1, dy: 0, len: b.w } : side === "E" ? { ax: b.x + b.w, ay: b.y, dx: 0, dy: 1, len: b.d } : side === "S" ? { ax: b.x + b.w, ay: b.y + b.d, dx: -1, dy: 0, len: b.w } : { ax: b.x, ay: b.y + b.d, dx: 0, dy: -1, len: b.d };
/** global noktanın cephe boyunca konumu (cephenin saat yönündeki başlangıcından) */
const eOf = (b: Block, side: Side, p: { x: number; y: number }) => {
  const e = edgeOf(b, side);
  return (p.x - e.ax) * e.dx + (p.y - e.ay) * e.dy;
};
const OUT: Record<Side, { x: number; y: number }> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
const SIDES: Side[] = ["N", "E", "S", "W"];

function buildBlocks(W: number, D: number, wings: WWing[], warnings: string[]): (Block | null)[] {
  const bl: (Block | null)[] = [{ x: 0, y: 0, w: W, d: D }];
  wings.forEach((g, i) => {
    const p = bl[g.to];
    if (!p) { bl.push(null); warnings.push(`Kanat ${i + 1} bağlandığı blok olmadığı için eklenmedi.`); return; }
    const al = g.align;
    let r: Block;
    if (g.side === "N") r = { x: p.x + al * (p.w - g.w), y: p.y - g.d, w: g.w, d: g.d };
    else if (g.side === "S") r = { x: p.x + al * (p.w - g.w), y: p.y + p.d, w: g.w, d: g.d };
    else if (g.side === "E") r = { x: p.x + p.w, y: p.y + al * (p.d - g.d), w: g.w, d: g.d };
    else r = { x: p.x - g.w, y: p.y + al * (p.d - g.d), w: g.w, d: g.d };
    const clash = bl.some((o) => o && Math.min(o.x + o.w, r.x + r.w) - Math.max(o.x, r.x) > 0.05 && Math.min(o.y + o.d, r.y + r.d) - Math.max(o.y, r.y) > 0.05);
    if (clash) { bl.push(null); warnings.push(`Kanat ${i + 1} başka bir bloğun üstüne biniyor, eklenmedi. Cephesini ya da hizasını değiştir.`); return; }
    const ov = g.side === "N" || g.side === "S" ? Math.min(p.x + p.w, r.x + r.w) - Math.max(p.x, r.x) : Math.min(p.y + p.d, r.y + r.d) - Math.max(p.y, r.y);
    if (ov < 1.2) warnings.push(`Kanat ${i + 1} bağlandığı bloğa yeterince değmiyor (en az 1,2 m ortak duvar gerekir).`);
    bl.push(r);
  });
  return bl;
}

export function generate(s: WSpec): WResult {
  const warnings: string[] = [];
  const ord = new Map<string, number>();
  s.rooms.forEach((l) => l.forEach((r, i) => ord.set(r.id, i)));
  const multi = s.floors > 1;
  const useAuto = s.autoSize && s.wings.length === 0;
  let { W, D } = useAuto ? autoHouse(s) : { W: s.houseW, D: s.houseD };
  if (multi && D < 7.5) { D = 7.5; warnings.push("Merdiven sığsın diye ana bloğun derinliği 7,5 m yapıldı."); }
  if (multi && W < 6) W = 6;
  const blocksN = buildBlocks(W, D, s.wings, warnings);
  const blocks = blocksN.filter((b): b is Block => !!b);
  const bIdx = blocksN.map((b) => (b ? blocks.indexOf(b) : -1));
  void bIdx;
  const minX = Math.min(...blocks.map((b) => b.x)), maxX = Math.max(...blocks.map((b) => b.x + b.w));
  const minY = Math.min(...blocks.map((b) => b.y)), maxY = Math.max(...blocks.map((b) => b.y + b.d));
  const Wt = maxX - minX, Dt = maxY - minY;
  const mx = Math.max(1.5, (s.plotW - Wt) / 2), my = Math.max(1.5, (s.plotD - Dt) / 2);
  if (s.plotW < Wt + 3 || s.plotD < Dt + 3) warnings.push("Arsa evden küçük görünüyor; ev arsaya sığsın diye çevresine boşluk bırakıldı. Arsa ölçüsünü büyütebilirsin.");

  const split = (rs: WRoom[], hol: boolean) => {
    const order = [...rs].sort((a, b) => RT[a.type].front - RT[b.type].front);
    const tot = rs.reduce((a, r) => a + area(r), 0) + (hol ? 9 : 0);
    const south: WRoom[] = order.filter((r) => r.band === "S"), north: WRoom[] = order.filter((r) => r.band === "N");
    let acc = (hol ? 9 : 0) + south.reduce((a, r) => a + area(r), 0);
    for (const r of order) {
      if (r.band) continue;
      if (acc < tot / 2 - 0.01 || (south.length === 0 && !north.length)) { south.push(r); acc += area(r); } else north.push(r);
    }
    if (!north.length && south.length > 1 && !south.some((r) => r.band === "S")) north.push(south.pop()!);
    const byList = (l: WRoom[]) => l.sort((a, b) => (ord.get(a.id) ?? 0) - (ord.get(b.id) ?? 0));
    return { south: byList(south), north: byList(north) };
  };
  /** odaları bloklara dağıt: gündüz odaları ana bloğa, kalanlar kanatlara; her bloğa en az bir oda */
  const assign = (rs: WRoom[]): WRoom[][] => {
    const nb = blocks.length;
    const forced = rs.filter((r) => r.block !== undefined && r.block >= 0 && r.block < nb);
    const order = rs.filter((r) => !forced.includes(r)).sort((a, b) => RT[a.type].front - RT[b.type].front);
    const capTot = blocks.reduce((a, b) => a + b.w * b.d, 0);
    const total = rs.reduce((a, r) => a + area(r), 0) + (multi ? 9 : 0);
    const out: WRoom[][] = blocks.map(() => []);
    forced.forEach((r) => out[r.block!].push(r));
    let idx = 0;
    blocks.forEach((b, bi) => {
      const target = (total * (b.w * b.d)) / capTot;
      let acc = (bi === 0 && multi ? 9 : 0) + out[bi].reduce((a, r) => a + area(r), 0);
      const last = bi === nb - 1;
      const needAfter = blocks.slice(bi + 1).filter((_, k) => out[bi + 1 + k].length === 0).length;
      while (idx < order.length && (last || (out[bi].length === 0 ? true : acc + area(order[idx]) / 2 <= target))) {
        if (!last && order.length - idx <= needAfter) break;
        out[bi].push(order[idx]);
        acc += area(order[idx]);
        idx++;
      }
    });
    while (idx < order.length) out[nb - 1].push(order[idx++]);
    out.forEach((l) => { if (!l.length) l.push({ id: uid(), type: "calisma", w: 3, d: 3 }); });
    return out;
  };

  const f0rooms = assign(s.rooms[0] ?? []);
  const f0split = split(f0rooms[0], multi);
  const south0 = f0split.south.reduce((a, r) => a + area(r), 0) + (multi ? 9 : 0);
  const tot0 = f0rooms[0].reduce((a, r) => a + area(r), 0) + (multi ? 9 : 0);
  let ds0 = D * Math.min(0.62, Math.max(0.38, south0 / tot0));
  if (multi) ds0 = Math.min(Math.max(ds0, 3.7), D - 2);
  if (!f0split.north.length) ds0 = D;

  const floors: Floor[] = [];
  const report: WResult["rooms"] = [];
  const T = 0.3, Ti = 0.15, Ts = 0.2;

  for (let fi = 0; fi < s.floors; fi++) {
    const counts: Record<string, number> = {};
    const named = (r: WRoom) => {
      const base = RT[r.type].name;
      const k = (counts[base] = (counts[base] ?? 0) + 1);
      return k === 1 ? base : `${base} ${k}`;
    };
    const per = fi === 0 ? f0rooms : assign(s.rooms[fi] ?? []);
    // ---- yerleşim: her blok için hücreler (genel koordinat) ----
    const cells: Cell[] = [];
    blocks.forEach((blk, bi) => {
      const rs = per[bi];
      const hol = multi && bi === 0;
      const cl = (x0: number, y0: number, x1: number, y1: number, r: WRoom | null, h = false) =>
        cells.push({ x0: blk.x + x0, y0: blk.y + y0, x1: blk.x + x1, y1: blk.y + y1, b: bi, name: r ? named(r) : "Hol", type: r ? r.type : "hol", want: r ? area(r) : HOL_W * (y1 - y0), hub: h || undefined, turn: r?.turn });
      if (!hol && blk.w < 4.8 && rs.length > 1) {
        // dar kanat: odalar alt alta
        const order = [...rs].sort((a, b) => (ord.get(a.id) ?? 0) - (ord.get(b.id) ?? 0));
        const sum = order.reduce((a, r) => a + area(r), 0);
        let y = 0;
        order.forEach((r, i) => {
          const d = i === order.length - 1 ? blk.d - y : (blk.d * area(r)) / sum;
          cl(0, y, blk.w, y + d, r);
          y += d;
        });
        return;
      }
      const sp = split(rs, hol);
      let ds: number;
      if (bi === 0) ds = ds0;
      else {
        const sS = sp.south.reduce((a, r) => a + area(r), 0), tt = rs.reduce((a, r) => a + area(r), 0) || 1;
        ds = sp.north.length ? blk.d * Math.min(0.62, Math.max(0.38, sS / tt)) : blk.d;
      }
      const hasNorth = sp.north.length > 0 && ds < blk.d - 0.5;
      const place = (list: WRoom[], y0: number, y1: number, withHol: boolean) => {
        const wAvail = blk.w - (withHol ? HOL_W : 0);
        const sum = list.reduce((a, r) => a + area(r), 0) || 1;
        let x = 0;
        list.forEach((r, i) => {
          const w = i === list.length - 1 ? wAvail - x : (wAvail * area(r)) / sum;
          cl(x, y0, x + w, y1, r);
          x += w;
        });
        if (withHol) cl(blk.w - HOL_W, y0, blk.w, y1, null, true);
      };
      if (!hasNorth) place([...sp.south, ...sp.north], 0, blk.d, hol);
      else {
        place(sp.south, blk.d - ds, blk.d, hol);
        place(sp.north, 0, blk.d - ds, false);
      }
    });

    // ---- duvarlar ----
    const walls: Wall[] = [];
    const mk = (ax: number, ay: number, bx: number, by: number, t: number) => {
      const w: Wall = { id: uid(), a: { x: ax, y: ay }, b: { x: bx, y: by }, t, color: "#7a7266" };
      walls.push(w);
      return w;
    };
    // blok dış kenarları: komşu blokla ortak kısım yalnız bir kez (iç duvar), kalanı dış duvar
    const pieces = new Map<string, Piece[]>();
    blocks.forEach((blk, bi) => {
      for (const side of SIDES) {
        const e = edgeOf(blk, side);
        const cuts: { a: number; b: number; own: boolean }[] = [];
        blocks.forEach((o, oi) => {
          if (oi === bi) return;
          const along = side === "N" || side === "S";
          const touching = side === "N" ? Math.abs(o.y + o.d - blk.y) < 0.02 : side === "S" ? Math.abs(o.y - (blk.y + blk.d)) < 0.02 : side === "E" ? Math.abs(o.x - (blk.x + blk.w)) < 0.02 : Math.abs(o.x + o.w - blk.x) < 0.02;
          if (!touching) return;
          const lo = along ? Math.max(blk.x, o.x) : Math.max(blk.y, o.y);
          const hi = along ? Math.min(blk.x + blk.w, o.x + o.w) : Math.min(blk.y + blk.d, o.y + o.d);
          if (hi - lo < 0.05) return;
          const p1 = along ? { x: lo, y: blk.y } : { x: blk.x, y: lo };
          const p2 = along ? { x: hi, y: blk.y } : { x: blk.x, y: hi };
          const ea = eOf(blk, side, p1), eb = eOf(blk, side, p2);
          cuts.push({ a: Math.min(ea, eb), b: Math.max(ea, eb), own: bi < oi });
        });
        const bps = [0, e.len, ...cuts.flatMap((c) => [c.a, c.b])].filter((v) => v >= -0.001 && v <= e.len + 0.001).sort((a, b) => a - b);
        const list: Piece[] = [];
        for (let k = 0; k + 1 < bps.length; k++) {
          const a = bps[k], b = bps[k + 1];
          if (b - a < 0.02) continue;
          const mid = (a + b) / 2;
          const cut = cuts.find((c) => mid >= c.a && mid <= c.b);
          if (cut && !cut.own) continue; // diğer blok çizer
          const wl = mk(e.ax + e.dx * a, e.ay + e.dy * a, e.ax + e.dx * b, e.ay + e.dy * b, cut ? Ts : T);
          list.push({ e0: a, e1: b, wall: wl, ext: !cut });
        }
        pieces.set(`${bi}${side}`, list);
      }
    });
    // iç duvarlar: hücre kenarlarından, aynı doğru üzerindekiler birleştirilir
    const hz = new Map<number, [number, number][]>(), vt = new Map<number, [number, number][]>();
    const key = (v: number) => Math.round(v * 100);
    for (const c of cells) {
      const blk = blocks[c.b];
      const onB = (v: number, w: number) => Math.abs(v - w) < 0.01;
      if (!onB(c.y0, blk.y)) (hz.get(key(c.y0)) ?? hz.set(key(c.y0), []).get(key(c.y0))!).push([c.x0, c.x1]);
      if (!onB(c.y1, blk.y + blk.d)) (hz.get(key(c.y1)) ?? hz.set(key(c.y1), []).get(key(c.y1))!).push([c.x0, c.x1]);
      if (!onB(c.x0, blk.x)) (vt.get(key(c.x0)) ?? vt.set(key(c.x0), []).get(key(c.x0))!).push([c.y0, c.y1]);
      if (!onB(c.x1, blk.x + blk.w)) (vt.get(key(c.x1)) ?? vt.set(key(c.x1), []).get(key(c.x1))!).push([c.y0, c.y1]);
    }
    const merge = (iv: [number, number][]) => {
      const a = [...iv].sort((p, q) => p[0] - q[0]);
      const out: [number, number][] = [];
      for (const v of a) {
        const l = out[out.length - 1];
        if (l && v[0] <= l[1] + 0.01) l[1] = Math.max(l[1], v[1]);
        else out.push([v[0], v[1]]);
      }
      return out;
    };
    hz.forEach((iv, k) => merge(iv).forEach(([a, b]) => mk(a, k / 100, b, k / 100, Ti)));
    vt.forEach((iv, k) => merge(iv).forEach(([a, b]) => mk(k / 100, a, k / 100, b, Ti)));

    // ---- açıklıklar ----
    const openings: Opening[] = [];
    const reserved: { wall: string; pos: number; half: number }[] = [];
    const wLen = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const O = (wall: Wall, pos: number, w: number, h: number, sill: number, kind: "door" | "window") => {
      pos = Math.min(Math.max(pos, w / 2 + 0.1), wLen(wall) - w / 2 - 0.1);
      openings.push({ id: uid(), wall: wall.id, pos, w, h, sill, kind, shape: "rect", flip: false, hinge: false });
      return pos;
    };
    const shared = (a: Cell, b: Cell) => {
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (Math.abs(a.x1 - b.x0) < 0.02 || Math.abs(b.x1 - a.x0) < 0.02) return oy >= 1.2 ? { kind: "v" as const, at: Math.abs(a.x1 - b.x0) < 0.02 ? a.x1 : b.x1, c: Math.max(a.y0, b.y0) + oy / 2 } : null;
      if (Math.abs(a.y1 - b.y0) < 0.02 || Math.abs(b.y1 - a.y0) < 0.02) return ox >= 1.2 ? { kind: "h" as const, at: Math.abs(a.y1 - b.y0) < 0.02 ? a.y1 : b.y1, c: Math.max(a.x0, b.x0) + ox / 2 } : null;
      return null;
    };
    const doorAt = (sh: NonNullable<ReturnType<typeof shared>>) => {
      const wl = walls.find((w) => (sh.kind === "v" ? Math.abs(w.a.x - sh.at) < 0.02 && Math.abs(w.b.x - sh.at) < 0.02 && Math.min(w.a.y, w.b.y) <= sh.c + 0.01 && Math.max(w.a.y, w.b.y) >= sh.c - 0.01 : Math.abs(w.a.y - sh.at) < 0.02 && Math.abs(w.b.y - sh.at) < 0.02 && Math.min(w.a.x, w.b.x) <= sh.c + 0.01 && Math.max(w.a.x, w.b.x) >= sh.c - 0.01));
      if (!wl) return false;
      O(wl, sh.kind === "v" ? Math.abs(sh.c - wl.a.y) : Math.abs(sh.c - wl.a.x), 0.9, 2.1, 0, "door");
      return true;
    };
    const hubCell = cells.find((c) => c.hub) ?? cells.find((c) => c.b === 0 && (c.type === "salon" || c.type === "salonmutfak")) ?? cells[0];
    const seen = new Set<Cell>([hubCell]);
    const q: Cell[] = [hubCell];
    while (q.length) {
      const a = q.shift()!;
      for (const b of cells) {
        if (seen.has(b)) continue;
        const sh = shared(a, b);
        if (!sh) continue;
        seen.add(b);
        q.push(b);
        if (!doorAt(sh)) warnings.push(`${floorName(fi)}: ${a.name} ile ${b.name} arasına kapı konamadı.`);
      }
    }
    for (const c of cells) if (!seen.has(c)) warnings.push(`${floorName(fi)}: ${c.name} hiçbir odaya bitişik değil, kapısı yok.`);

    // hücrenin dış cephe parçalarıyla kesişimi: [{side, piece, lo, hi}]
    const cellExt = (c: Cell) => {
      const blk = blocks[c.b];
      const out: { side: Side; pc: Piece; lo: number; hi: number }[] = [];
      for (const side of SIDES) {
        let ca: number, cb: number;
        if (side === "N") { if (Math.abs(c.y0 - blk.y) > 0.01) continue; ca = c.x0 - blk.x; cb = c.x1 - blk.x; }
        else if (side === "S") { if (Math.abs(c.y1 - (blk.y + blk.d)) > 0.01) continue; ca = blk.x + blk.w - c.x1; cb = blk.x + blk.w - c.x0; }
        else if (side === "E") { if (Math.abs(c.x1 - (blk.x + blk.w)) > 0.01) continue; ca = c.y0 - blk.y; cb = c.y1 - blk.y; }
        else { if (Math.abs(c.x0 - blk.x) > 0.01) continue; ca = blk.y + blk.d - c.y1; cb = blk.y + blk.d - c.y0; }
        for (const pc of pieces.get(`${c.b}${side}`) ?? []) {
          if (!pc.ext) continue;
          const lo = Math.max(ca, pc.e0), hi = Math.min(cb, pc.e1);
          if (hi - lo > 0.3) out.push({ side, pc, lo, hi });
        }
      }
      return out;
    };
    const posIn = (pc: Piece, e: number) => e - pc.e0;
    const ptAt = (w: Wall, pos: number) => { const L = wLen(w); return { x: w.a.x + ((w.b.x - w.a.x) / L) * pos, y: w.a.y + ((w.b.y - w.a.y) / L) * pos }; };

    // giriş kapısı (zemin kat)
    type Ent = { side: Side; wall: Wall; pos: number; cell: Cell };
    let entrance: Ent | null = null;
    if (fi === 0) {
      const cand = [hubCell, ...cells.filter((c) => c.b === 0 && c !== hubCell), ...cells.filter((c) => c.b !== 0)];
      outer: for (const c of cand) {
        const ex = cellExt(c);
        for (const sd of ["S", "E", "W", "N"] as Side[]) {
          const hit = ex.filter((e) => e.side === sd).sort((a, b) => b.hi - b.lo - (a.hi - a.lo))[0];
          if (hit && hit.hi - hit.lo >= 1.4) {
            const pos = O(hit.pc.wall, posIn(hit.pc, (hit.lo + hit.hi) / 2), 1.0, 2.2, 0, "door");
            reserved.push({ wall: hit.pc.wall.id, pos, half: 1.0 });
            entrance = { side: sd, wall: hit.pc.wall, pos, cell: c };
            break outer;
          }
        }
      }
      if (!entrance) warnings.push("Zemin katta dışarıya açılan giriş kapısı konamadı.");
    }
    // balkonlar
    const balsHere = s.balconies.filter((b) => b.floor === fi);
    const balconies: NonNullable<Floor["balconies"]> = [];
    const usedSide = new Set<Side>();
    for (const b of balsHere) {
      let best: { pc: Piece } | null = null;
      blocks.forEach((_, bi) => (pieces.get(`${bi}${b.side}`) ?? []).forEach((pc) => { if (pc.ext && (!best || pc.e1 - pc.e0 > best.pc.e1 - best.pc.e0)) best = { pc }; }));
      const bp = best as { pc: Piece } | null;
      if (!bp || bp.pc.e1 - bp.pc.e0 < 1.6) { warnings.push(`${floorName(fi)}: ${SIDE_TR[b.side]} cephede balkon için yeterli dış duvar yok.`); continue; }
      const len = bp.pc.e1 - bp.pc.e0;
      const pos = len / 2;
      if (!usedSide.has(b.side)) { usedSide.add(b.side); O(bp.pc.wall, pos, 0.9, 2.2, 0, "door"); reserved.push({ wall: bp.pc.wall.id, pos, half: Math.min(b.w, len - 0.6) / 2 + 0.3 }); }
      balconies.push({ id: uid(), wall: bp.pc.wall.id, pos, w: Math.min(b.w, len - 0.6), d: b.d, side: -1, rail: "bars", railH: 1.0, slabT: 0.15 });
    }
    // pencereler
    for (const c of cells) {
      const wet = c.type === "banyo" || c.type === "wc" || c.type === "depo";
      if (c.type === "hol" && fi === 0) continue;
      for (const e of cellExt(c)) {
        const L = e.hi - e.lo;
        const n = L > 5 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const frac = n === 1 ? 0.5 : (k + 1) / 3;
          const pos = posIn(e.pc, e.lo + frac * L);
          const ww = wet ? 0.6 : Math.min(1.3, L - 0.8);
          if (ww < 0.5) continue;
          if (reserved.some((r) => r.wall === e.pc.wall.id && Math.abs(r.pos - pos) < r.half + ww / 2 + 0.1)) continue;
          O(e.pc.wall, pos, ww, wet ? 0.6 : 1.4, wet ? 1.5 : 0.9, "window");
        }
      }
    }
    // odalar
    const rooms: Room[] = cells.map((c) => {
      const t = c.type === "hol" ? { color: "#eadfcf", floor: "marble" } : RT[c.type];
      return { id: uid(), name: c.name, seed: { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 }, color: t.color, floor: t.floor };
    });
    for (const c of cells) report.push({ floor: fi, name: c.name, w: c.x1 - c.x0, d: c.y1 - c.y0, a: (c.x1 - c.x0) * (c.y1 - c.y0), want: c.want });

    // eşyalar
    const items: Item[] = [];
    const I = (key: string, name: string, shape: Item["shape"], x: number, y: number, rot: number, w: number, d: number, h: number, color: string, elev = 0) =>
      items.push({ id: uid(), key, name, shape, x, y, rot, w, d, h, elev, color });
    if (s.furnish) {
      for (const c of cells) {
        const cw = c.x1 - c.x0, cd = c.y1 - c.y0, cx = (c.x0 + c.x1) / 2;
        const m = 0.2;
        const i0 = items.length;
        if (c.type === "salon" || c.type === "salonmutfak") {
          if (cw >= 3 && cd >= 3) {
            I("sofa3", "Üçlü kanepe", "sofa", cx - (c.type === "salonmutfak" ? cw * 0.18 : 0), c.y1 - 0.65 - m, 180, 2.2, 0.95, 0.85, "#8c9aa6");
            I("coffee", "Orta sehpa", "rect", cx - (c.type === "salonmutfak" ? cw * 0.18 : 0), c.y1 - 2.0, 0, 1, 0.6, 0.45, "#8a6a4a");
          }
          if (c.type === "salonmutfak" && cw >= 4.5) {
            const kx = c.x0 + cw * 0.62;
            I("counter120", "Mutfak tezgâhı (120 cm)", "rect", kx + 0.6, c.y0 + 0.45, 0, 1.2, 0.6, 0.9, "#e8e2d6");
            I("cooker", "Ocak / fırın", "cooker", kx + 1.5, c.y0 + 0.45, 0, 0.6, 0.6, 0.9, "#e8e2d6");
            I("sinkK", "Evye", "sink", kx + 2.4 > c.x1 - 0.3 ? c.x1 - 1.0 : kx + 2.4, c.y0 + 0.45, 0, 1.2, 0.6, 0.9, "#e8e2d6");
          }
        } else if (c.type === "mutfak") {
          if (cw >= 2.6 && cd >= 2.2) {
            I("counter120", "Mutfak tezgâhı (120 cm)", "rect", c.x0 + 0.9, c.y0 + 0.45, 0, 1.2, 0.6, 0.9, "#e8e2d6");
            I("cooker", "Ocak / fırın", "cooker", c.x0 + 1.8, c.y0 + 0.45, 0, 0.6, 0.6, 0.9, "#e8e2d6");
            I("sinkK", "Evye", "sink", Math.min(c.x1 - 0.8, c.x0 + 2.7), c.y0 + 0.45, 0, 1.2, 0.6, 0.9, "#e8e2d6");
            if (cd >= 3) I("table4", "Yemek masası (4 kişilik)", "rect", cx, c.y1 - 0.9, 0, 1.4, 0.8, 0.75, "#a07a52");
          }
        } else if (c.type === "yatak") {
          if (cw >= 2.8 && cd >= 2.8) I("bed2", "Çift kişilik yatak", "bed", cx, c.y0 + 1.1, 0, 1.6, 2, 0.5, "#d9c3a0");
        } else if (c.type === "cocuk") {
          if (cw >= 2.2 && cd >= 2.4) I("bed1", "Tek kişilik yatak", "bed", c.x0 + 0.7, c.y0 + 1.25, 0, 0.9, 2, 0.5, "#9fc3d9");
        } else if (c.type === "calisma") {
          if (cw >= 2 && cd >= 2) I("kdesk", "Çalışma masası", "rect", cx, c.y0 + 0.45, 0, 1.4, 0.65, 0.74, "#d8b48a");
        } else if (c.type === "banyo") {
          if (cw >= 1.8 && cd >= 2) {
            I("shower", "Duş teknesi", "shower", c.x0 + 0.55, c.y0 + 0.55, 0, 0.9, 0.9, 0.1, "#f4f6f7");
            I("wc", "Klozet", "toilet", c.x1 - 0.4, c.y1 - 0.5, 180, 0.4, 0.7, 0.8, "#f4f6f7");
            I("vanity", "Lavabo dolabı", "sink", c.x0 + 0.5, c.y1 - 0.3, 180, 0.7, 0.45, 0.85, "#f4f6f7");
          }
        } else if (c.type === "wc") {
          I("wc", "Klozet", "toilet", cx, c.y1 - 0.45, 180, 0.4, 0.7, 0.8, "#f4f6f7");
        }
        if (c.turn) {
          const mx2 = c.x0 + c.x1, my2 = c.y0 + c.y1;
          for (const it of items.slice(i0)) {
            if (c.turn === 1 || c.turn === 3) { it.x = mx2 - it.x; it.rot = (360 - it.rot) % 360; }
            if (c.turn === 2 || c.turn === 3) { it.y = my2 - it.y; it.rot = (540 - it.rot) % 360; }
          }
        }
      }
    }
    // merdiven (iç, hol içinde)
    const stairs: Floor["stairs"] = [];
    const holC = cells.find((c) => c.hub && c.type === "hol");
    if (multi && holC && fi < s.floors - 1 && s.innerStair) {
      stairs.push({ id: uid(), kind: "U", x: (holC.x0 + holC.x1) / 2, y: (holC.y0 + holC.y1) / 2, rot: 0, w: 0.9, mirror: false });
    }
    // dış merdivenler
    const pl = Math.max(0, s.plinth);
    const addExt = (wall: Wall, pos: number, side: Side, rise: number) => {
      const { stair } = placeExtStair(walls, wall, ptAt(wall, pos), 1.0, rise, OUT[side]);
      stairs.push({ id: uid(), ...stair });
    };
    const entranceNow = entrance as Ent | null;
    if (fi === 0 && pl > 0.3 && s.entryStair && entranceNow) addExt(entranceNow.wall, entranceNow.pos, entranceNow.side, pl);
    if (fi === 0 && pl > 0.3 && !s.entryStair) warnings.push("Ev yüksekte ama girişe dış merdiven seçilmedi; girişe çıkış yok.");
    if (fi === 1 && s.upperExt) {
      const rise = pl + (floors[0]?.height ?? s.height);
      let best: { pc: Piece; pos: number; score: number } | null = null;
      blocks.forEach((_, bi) => (pieces.get(`${bi}E`) ?? []).forEach((pc) => {
        if (!pc.ext) return;
        let pos = (pc.e1 - pc.e0) / 2;
        const hl = holC ? cellExt(holC).find((e) => e.side === "E" && e.pc === pc) : undefined;
        if (hl) pos = posIn(pc, (hl.lo + hl.hi) / 2);
        const score = (hl ? 100 : 0) + (pc.e1 - pc.e0);
        const cur = best as { score: number } | null;
        if (!cur || score > cur.score) best = { pc, pos, score };
      }));
      const bb = best as { pc: Piece; pos: number; score: number } | null;
      if (!bb || bb.pc.e1 - bb.pc.e0 < 1.4) warnings.push("1. kata dış merdiven için sağ cephede yeterli dış duvar yok.");
      else {
        for (let k = openings.length - 1; k >= 0; k--) if (openings[k].wall === bb.pc.wall.id && openings[k].kind === "window" && Math.abs(openings[k].pos - bb.pos) < 1.3) openings.splice(k, 1);
        const pos = O(bb.pc.wall, bb.pos, 1.0, 2.2, 0, "door");
        addExt(bb.pc.wall, pos, "E", rise);
      }
    }
    floors.push({ id: uid(), name: floorName(fi), height: s.height, walls, openings, rooms, stairs, items, cols: [], balconies });
  }

  const cx = (minX + maxX) / 2;
  const raw = {
    plot: { points: [{ x: minX - mx, y: minY - my }, { x: maxX + mx, y: minY - my }, { x: maxX + mx, y: maxY + my }, { x: minX - mx, y: maxY + my }], closed: true },
    snap: 0.1, defT: 0.25,
    roof: { kind: s.roof, pitch: s.pitch, overhang: 0.5, ridge: "auto", color: "#a5523a", tex: "tile" },
    floors, custom: [], build: { ...defaultBuild(), plinth: Math.max(0, s.plinth) },
    fin: { extColor: "#efe6d6", extTex: "plain", intColor: "#f4f0e8", intTex: "plain", doorColor: "#7a4a2a", frameColor: "#ffffff", groundColor: "#8fb45f", baseColor: "#a39b8e", baseTex: "stone" },
    env: {
      sun: { month: 6, hour: 15, lat: 52, north: 0, shadows: true },
      objs: [
        { id: uid(), rot: 0, kind: "road", name: "Yol", x: cx, y: maxY + my + 2.5, w: s.plotW + 12, d: 5, h: 0.05, color: "#5e5e5e" },
        { id: uid(), rot: 0, kind: "tree", name: "Ağaç", x: minX - mx + 1.8, y: minY - my + 1.8, w: 3.5, d: 3.5, h: 6.5, color: "#5b8f3c" },
        { id: uid(), rot: 0, kind: "pine", name: "Çam", x: maxX + mx - 1.8, y: minY - my + 1.8, w: 2.8, d: 2.8, h: 8.5, color: "#2f6a3a" },
        { id: uid(), rot: 0, kind: "fence", name: "Çit", x: cx, y: maxY + my, w: Wt + 2 * mx, d: 0.08, h: 1, color: "#8a6a4a" },
      ],
    },
  };
  const full = normalizeFull(raw);
  return { full, warnings, rooms: report, houseW: Wt, houseD: Dt };
}

const SIDE_TR: Record<Side, string> = { N: "arka", E: "sağ", S: "ön", W: "sol" };
