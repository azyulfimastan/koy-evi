import type { FullData, Floor, Wall, Opening, Item, Room } from "./types";
import { normalizeFull, defaultBuild } from "./types";
import { placeExtStair } from "./stairs";

/* Sihirbaz: girilen rakamlardan (oda, kat, balkon, çatı) otomatik ev üretir. */
export type RoomType = "salon" | "salonmutfak" | "mutfak" | "yatak" | "cocuk" | "banyo" | "wc" | "calisma" | "depo";
export type WRoom = { id: string; type: RoomType; w: number; d: number };
export type WBalcony = { id: string; floor: number; side: "N" | "E" | "S" | "W"; w: number; d: number };
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
    balconies: [], roof: "gable", pitch: 30, furnish: true, plinth: 0, entryStair: true, upperExt: false, innerStair: true,
  };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Cell = Rect & { name: string; type: RoomType | "hol"; want: number; hub?: boolean };

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

export function generate(s: WSpec): WResult {
  const warnings: string[] = [];
  const multi = s.floors > 1;
  let { W, D } = s.autoSize ? autoHouse(s) : { W: s.houseW, D: s.houseD };
  if (multi && D < 7.5) { D = 7.5; warnings.push("Merdiven sığsın diye evin derinliği 7,5 m yapıldı."); }
  if (multi && W < 6) W = 6;
  // arsa
  const mx = Math.max(1.5, (s.plotW - W) / 2), my = Math.max(1.5, (s.plotD - D) / 2);
  if (s.plotW < W + 3 || s.plotD < D + 3) warnings.push("Arsa evden küçük görünüyor; ev arsaya sığsın diye çevresine boşluk bırakıldı. Arsa ölçüsünü büyütebilirsin.");

  // ön (güney) bant derinliği: 1. katın oranına göre, tüm katlarda aynı
  const split = (rs: WRoom[]) => {
    const order = [...rs].sort((a, b) => RT[a.type].front - RT[b.type].front);
    const tot = floorArea(rs, multi);
    const south: WRoom[] = [], north: WRoom[] = [];
    let acc = multi ? 9 : 0;
    for (const r of order) {
      if (acc < tot / 2 - 0.01 || south.length === 0) { south.push(r); acc += area(r); } else north.push(r);
    }
    if (!north.length && south.length > 1) north.push(south.pop()!);
    return { south, north, accS: acc };
  };
  const f0 = split(s.rooms[0] ?? []);
  const totSouth0 = f0.south.reduce((a, r) => a + area(r), 0) + (multi ? 9 : 0);
  const tot0 = floorArea(s.rooms[0] ?? [], multi);
  let ds = D * Math.min(0.62, Math.max(0.38, totSouth0 / tot0));
  if (multi) ds = Math.min(Math.max(ds, 3.7), D - 2);
  if (!f0.north.length) ds = D; // tek bant

  const floors: Floor[] = [];
  const report: WResult["rooms"] = [];
  const counts: Record<string, number> = {};
  const T = 0.3, Ti = 0.15;

  for (let fi = 0; fi < s.floors; fi++) {
    const rs = s.rooms[fi] ?? [];
    const { south, north } = fi === 0 ? f0 : split(rs);
    const bandS = north.length || fi !== 0 ? ds : D;
    const cells: Cell[] = [];
    const named = (r: WRoom) => {
      const base = RT[r.type].name;
      const k = (counts[`${fi}${base}`] = (counts[`${fi}${base}`] ?? 0) + 1);
      return k === 1 ? base : `${base} ${k}`;
    };
    const place = (list: WRoom[], y0: number, y1: number, hol: boolean) => {
      const wAvail = W - (hol ? HOL_W : 0);
      const sum = list.reduce((a, r) => a + area(r), 0) || 1;
      let x = 0;
      list.forEach((r, i) => {
        const w = i === list.length - 1 ? wAvail - x : (wAvail * area(r)) / sum;
        cells.push({ x0: x, x1: x + w, y0, y1, name: named(r), type: r.type, want: area(r) });
        x += w;
      });
      if (hol) cells.push({ x0: W - HOL_W, x1: W, y0, y1, name: "Hol", type: "hol", want: HOL_W * (y1 - y0), hub: true });
    };
    const hasNorth = north.length > 0 && bandS < D - 0.5;
    if (!hasNorth) {
      place([...south, ...north], 0, D, multi);
    } else {
      place(south, D - bandS, D, multi);
      place(north, 0, D - bandS, false);
    }
    // bant yoksa ama kat çok katlı: yine de hol var, yukarıda yapıldı
    const yDiv = hasNorth ? D - bandS : -1;

    // duvarlar
    const walls: Wall[] = [];
    const mk = (ax: number, ay: number, bx: number, by: number, t: number, color = "#7a7266") => {
      const w: Wall = { id: uid(), a: { x: ax, y: ay }, b: { x: bx, y: by }, t, color };
      walls.push(w);
      return w;
    };
    const wn = mk(0, 0, W, 0, T), we = mk(W, 0, W, D, T), ws = mk(W, D, 0, D, T), ww = mk(0, D, 0, 0, T);
    let wDiv: Wall | null = null;
    if (hasNorth) wDiv = mk(0, yDiv, W, yDiv, Ti);
    const vwalls: { w: Wall; x: number; y0: number; y1: number }[] = [];
    const xs = (band: "S" | "N") => {
      const inBand = cells.filter((c) => (hasNorth ? (band === "S" ? c.y0 >= yDiv - 0.01 : c.y1 <= yDiv + 0.01) : band === "S"));
      return [...inBand].sort((a, b) => a.x0 - b.x0).slice(1).map((c) => ({ x: c.x0, y0: c.y0, y1: c.y1 }));
    };
    for (const v of [...xs("S"), ...(hasNorth ? xs("N") : [])]) vwalls.push({ w: mk(v.x, v.y0, v.x, v.y1, Ti), x: v.x, y0: v.y0, y1: v.y1 });

    // açıklıklar
    const openings: Opening[] = [];
    const O = (wall: Wall, pos: number, w: number, h: number, sill: number, kind: "door" | "window", flip = false, shape: "rect" | "arch" = "rect") => {
      const L = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
      pos = Math.min(Math.max(pos, w / 2 + 0.2), L - w / 2 - 0.2);
      openings.push({ id: uid(), wall: wall.id, pos, w, h, sill, kind, shape, flip, hinge: false });
    };
    // komşuluk ve kapılar (hub'dan BFS)
    const shared = (a: Cell, b: Cell) => {
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (Math.abs(a.x1 - b.x0) < 0.02 || Math.abs(b.x1 - a.x0) < 0.02) return oy >= 1.2 ? { kind: "v" as const, x: Math.abs(a.x1 - b.x0) < 0.02 ? a.x1 : b.x1, c: Math.max(a.y0, b.y0) + oy / 2, len: oy } : null;
      if (Math.abs(a.y1 - b.y0) < 0.02 || Math.abs(b.y1 - a.y0) < 0.02) return ox >= 1.2 ? { kind: "h" as const, y: Math.abs(a.y1 - b.y0) < 0.02 ? a.y1 : b.y1, c: Math.max(a.x0, b.x0) + ox / 2, len: ox } : null;
      return null;
    };
    let hub = cells.find((c) => c.hub) ?? cells.find((c) => c.type === "salon" || c.type === "salonmutfak") ?? cells[0];
    hub = hub ?? cells[0];
    const seen = new Set<Cell>([hub]);
    const q: Cell[] = [hub];
    while (q.length) {
      const a = q.shift()!;
      for (const b of cells) {
        if (seen.has(b)) continue;
        const sh = shared(a, b);
        if (!sh) continue;
        seen.add(b);
        q.push(b);
        if (sh.kind === "v") {
          const vw = vwalls.find((v) => Math.abs(v.x - sh.x) < 0.02 && v.y0 <= sh.c + 0.01 && v.y1 >= sh.c - 0.01);
          if (vw) O(vw.w, sh.c - vw.y0, 0.9, 2.1, 0, "door", false, a.hub || b.hub ? "rect" : "rect");
        } else if (wDiv) O(wDiv, sh.c, 0.9, 2.1, 0, "door");
      }
    }
    for (const c of cells) if (!seen.has(c)) warnings.push(`${floorName(fi)}: ${c.name} hiçbir odaya bitişik değil, kapısı yok.`);
    // dış cephe pencereleri ve giriş
    const balsHere = s.balconies.filter((b) => b.floor === fi);
    const balOn = (side: string) => balsHere.find((b) => b.side === side);
    const wallOf = { N: wn, E: we, S: ws, W: ww } as const;
    // balkon kapısı bölgesi: pencere koyma
    const posOf = (side: "N" | "E" | "S" | "W", c: Cell) => (side === "N" ? (c.x0 + c.x1) / 2 : side === "E" ? (c.y0 + c.y1) / 2 : side === "S" ? W - (c.x0 + c.x1) / 2 : D - (c.y0 + c.y1) / 2);
    const lenOf = (side: string, c: Cell) => (side === "N" || side === "S" ? c.x1 - c.x0 : c.y1 - c.y0);
    const balPos = (side: "N" | "E" | "S" | "W") => (side === "N" ? W / 2 : side === "E" ? D / 2 : side === "S" ? W / 2 : D / 2);
    const exteriors: { side: "N" | "E" | "S" | "W"; c: Cell }[] = [];
    for (const c of cells) {
      if (c.y0 < 0.01) exteriors.push({ side: "N", c });
      if (c.x1 > W - 0.01) exteriors.push({ side: "E", c });
      if (c.y1 > D - 0.01) exteriors.push({ side: "S", c });
      if (c.x0 < 0.01) exteriors.push({ side: "W", c });
    }
    // giriş kapısı: hub'ın güney cephesi, yoksa herhangi bir cephesi
    const entrance = exteriors.find((e) => e.c === hub && e.side === "S") ?? exteriors.find((e) => e.c === hub);
    if (fi === 0 && entrance) O(wallOf[entrance.side], posOf(entrance.side, hub) + (hub.hub ? 0 : 0), 1.0, 2.2, 0, "door");
    const placedBalDoor = new Set<string>();
    for (const b of balsHere) {
      if (placedBalDoor.has(b.side)) continue;
      placedBalDoor.add(b.side);
      O(wallOf[b.side], balPos(b.side), 0.9, 2.2, 0, "door");
    }
    for (const e of exteriors) {
      const L = lenOf(e.side, e.c);
      const wall = wallOf[e.side];
      const wet = e.c.type === "banyo" || e.c.type === "wc" || e.c.type === "depo";
      if (e.c.type === "hol" && fi === 0) continue;
      const nWin = L > 5 ? 2 : 1;
      for (let k = 0; k < nWin; k++) {
        const frac = nWin === 1 ? 0.5 : (k + 1) / 3;
        const base = posOf(e.side, e.c);
        const pos = e.side === "S" || e.side === "W" ? base - (frac - 0.5) * L : base + (frac - 0.5) * L;
        const bpos = balOn(e.side) ? balPos(e.side) : -99;
        if (Math.abs(pos - bpos) < 1.6) continue;
        if (entrance && e.c === entrance.c && e.side === entrance.side && Math.abs(pos - posOf(e.side, e.c)) < 1.4) continue;
        const ww_ = wet ? 0.6 : Math.min(1.3, L - 0.8);
        if (ww_ < 0.5) continue;
        O(wall, pos, ww_, wet ? 0.6 : 1.4, wet ? 1.5 : 0.9, "window");
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
      }
    }
    // merdiven (üst kata çıkan, hol içinde)
    const stairs: Floor["stairs"] = [];
    const holC = cells.find((c) => c.hub && c.type === "hol");
    if (multi && holC && fi < s.floors - 1 && s.innerStair) {
      stairs.push({ id: uid(), kind: "U", x: (holC.x0 + holC.x1) / 2, y: (holC.y0 + holC.y1) / 2, rot: 0, w: 0.9, mirror: false });
    }
    // dış merdivenler
    const pl = Math.max(0, s.plinth);
    const ptOn = (side: "N" | "E" | "S" | "W", pos: number) => (side === "N" ? { x: pos, y: 0 } : side === "E" ? { x: W, y: pos } : side === "S" ? { x: W - pos, y: D } : { x: 0, y: D - pos });
    const addExt = (side: "N" | "E" | "S" | "W", pos: number, rise: number) => {
      const wall = wallOf[side];
      const { stair } = placeExtStair(walls, wall, ptOn(side, pos), 1.0, rise);
      stairs.push({ id: uid(), ...stair });
    };
    if (fi === 0 && pl > 0.3 && s.entryStair && entrance) addExt(entrance.side, posOf(entrance.side, hub), pl);
    if (fi === 0 && pl > 0.3 && !s.entryStair) warnings.push("Ev yüksekte ama girişe dış merdiven seçilmedi; girişe çıkış yok.");
    if (fi === 1 && s.upperExt) {
      const rise = pl + (floors[0]?.height ?? s.height);
      const hol2 = cells.find((c) => c.hub && c.type === "hol");
      const side: "E" | "W" = "E";
      const pos = hol2 ? posOf(side, hol2) : D / 2;
      if (balOn(side)) warnings.push("1. kat doğu duvarında balkon var; dış merdiven de oraya konuldu, yerini editörde kaydırabilirsin.");
      for (let k = openings.length - 1; k >= 0; k--) if (openings[k].wall === wallOf[side].id && openings[k].kind === "window" && Math.abs(openings[k].pos - pos) < 1.3) openings.splice(k, 1);
      O(wallOf[side], pos, 1.0, 2.2, 0, "door");
      addExt(side, pos, rise);
    }
    // balkonlar
    const balconies: NonNullable<Floor["balconies"]> = balsHere.map((b) => {
      const wall = wallOf[b.side];
      return { id: uid(), wall: wall.id, pos: balPos(b.side), w: Math.min(b.w, (b.side === "N" || b.side === "S" ? W : D) - 0.6), d: b.d, side: -1, rail: "bars", railH: 1.0, slabT: 0.15 };
    });
    floors.push({ id: uid(), name: floorName(fi), height: s.height, walls, openings, rooms, stairs, items, cols: [], balconies });
  }

  const raw = {
    plot: { points: [{ x: -mx, y: -my }, { x: W + mx, y: -my }, { x: W + mx, y: D + my }, { x: -mx, y: D + my }], closed: true },
    snap: 0.1, defT: 0.25,
    roof: { kind: s.roof, pitch: s.pitch, overhang: 0.5, ridge: "auto", color: "#a5523a", tex: "tile" },
    floors, custom: [], build: { ...defaultBuild(), plinth: Math.max(0, s.plinth) },
    fin: { extColor: "#efe6d6", extTex: "plain", intColor: "#f4f0e8", intTex: "plain", doorColor: "#7a4a2a", frameColor: "#ffffff", groundColor: "#8fb45f", baseColor: "#a39b8e", baseTex: "stone" },
    env: {
      sun: { month: 6, hour: 15, lat: 52, north: 0, shadows: true },
      objs: [
        { id: uid(), rot: 0, kind: "road", name: "Yol", x: W / 2, y: D + my + 2.5, w: s.plotW + 12, d: 5, h: 0.05, color: "#5e5e5e" },
        { id: uid(), rot: 0, kind: "tree", name: "Ağaç", x: -mx + 1.8, y: -my + 1.8, w: 3.5, d: 3.5, h: 6.5, color: "#5b8f3c" },
        { id: uid(), rot: 0, kind: "pine", name: "Çam", x: W + mx - 1.8, y: -my + 1.8, w: 2.8, d: 2.8, h: 8.5, color: "#2f6a3a" },
        { id: uid(), rot: 0, kind: "fence", name: "Çit", x: W / 2, y: D + my, w: W + 2 * mx, d: 0.08, h: 1, color: "#8a6a4a" },
      ],
    },
  };
  const full = normalizeFull(raw);
  return { full, warnings, rooms: report, houseW: W, houseD: D };
}
