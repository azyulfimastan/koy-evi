export type Pt = { x: number; y: number };
export type Plot = { points: Pt[]; closed: boolean };
export type Wall = { id: string; a: Pt; b: Pt; t: number; color: string; ext?: string; int?: string };
export type Opening = {
  id: string;
  wall: string;
  pos: number; // duvarın a ucundan açıklığın merkezine mesafe (m)
  w: number;
  h: number;
  sill: number; // yerden yükseklik (m)
  kind: "door" | "window";
  shape: "rect" | "arch" | "round";
  flip: boolean; // kapı açılış tarafı
  hinge: boolean; // menteşe tarafı
};
export type Room = { id: string; name: string; seed: Pt; color: string; floor?: string; floorColor?: string };
export type Stair = {
  id: string;
  kind: "straight" | "L" | "U" | "spiral";
  x: number; // merkez
  y: number;
  rot: number; // derece (0/90/180/270)
  w: number; // basamak genişliği (m)
  mirror: boolean;
};
export type Shape = "rect" | "round" | "bed" | "sofa" | "chair" | "cooker" | "sink" | "toilet" | "tub" | "shower" | "rug" | "stove" | "wardrobe";
export type CatItem = { key: string; name: string; cat: string; w: number; d: number; h: number; shape: Shape; color: string; elev?: number };
export type Item = { id: string; key: string; name: string; shape: Shape; x: number; y: number; rot: number; w: number; d: number; h: number; elev: number; color: string };
export type EnvKind = "tree" | "pine" | "bush" | "road" | "building" | "fence";
/** Arsa çevresindeki nesneler (ağaç, yol, komşu bina...). w: x yönü, d: y yönü, h: yükseklik (m) */
export type EnvObj = { id: string; kind: EnvKind; name: string; x: number; y: number; rot: number; w: number; d: number; h: number; color: string };
export type Sun = { month: number; hour: number; lat: number; north: number; shadows: boolean };
export type Env = { sun: Sun; objs: EnvObj[] };
export const defaultEnv = (): Env => ({ sun: { month: 6, hour: 14, lat: 52, north: 0, shadows: true }, objs: [] });

export type Floor = {
  id: string;
  name: string;
  height: number; // kat yüksekliği (m), döşeme üstünden bir üst döşemeye
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  stairs: Stair[];
  items: Item[];
};
export type Roof = {
  kind: "gable" | "hip" | "shed" | "flat";
  pitch: number; // derece
  overhang: number; // m
  ridge: "auto" | "x" | "y";
  color: string;
  tex: string; // kaplama: tile | metal | shingle | plain
};
/** Tüm ev için malzeme ve renk ayarları (3B) */
export type Finish = {
  extColor: string;
  extTex: string; // plain | brick | stone | wood
  intColor: string;
  intTex: string; // plain | wood
  doorColor: string;
  frameColor: string;
  groundColor: string;
  baseColor?: string; // subasman (taban taşı)
  baseTex?: string;
};
export const defaultFinish = (): Finish => ({ extColor: "#e9e1d3", extTex: "plain", intColor: "#f4f0e8", intTex: "plain", doorColor: "#8a5a36", frameColor: "#f7f7f4", groundColor: "#93b565" });
export type FullData = { plot: Plot; snap: number; defT: number; roof: Roof; floors: Floor[]; custom: CatItem[]; fin: Finish; env: Env };

/** Editörün o an çalıştığı kat + ortak ayarlar (düz görünüm) */
export type PlanData = {
  plot: Plot;
  snap: number;
  defT: number;
  roof: Roof;
  fin: Finish;
  env: Env;
  name: string;
  height: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  stairs: Stair[];
  items: Item[];
  custom: CatItem[];
};

export type Project = { id: string; name: string; createdAt: number; updatedAt: number; data: FullData; thumb?: string };

export const uid = () => Math.random().toString(36).slice(2, 10);

export const defaultRoof = (): Roof => ({ kind: "gable", pitch: 35, overhang: 0.4, ridge: "auto", color: "#a5523a", tex: "tile" });
export const newFloor = (name: string): Floor => ({ id: uid(), name, height: 2.8, walls: [], openings: [], rooms: [], stairs: [], items: [] });

export function defaultFull(): FullData {
  return { plot: { points: [], closed: false }, snap: 0.1, defT: 0.25, roof: defaultRoof(), floors: [newFloor("Zemin kat")], custom: [], fin: defaultFinish(), env: defaultEnv() };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeFull(d: any): FullData {
  const base = defaultFull();
  if (!d) return base;
  let floors: Floor[];
  if (Array.isArray(d.floors) && d.floors.length) {
    floors = d.floors.map((f: any, i: number) => ({
      ...newFloor(i === 0 ? "Zemin kat" : `${i}. kat`),
      ...f,
      walls: f.walls ?? [],
      openings: f.openings ?? [],
      rooms: f.rooms ?? [],
      stairs: f.stairs ?? [],
      items: f.items ?? [],
    }));
  } else {
    // v0.2 verisi: tek katlı düz yapı
    floors = [{ ...newFloor("Zemin kat"), walls: d.walls ?? [], openings: d.openings ?? [], rooms: d.rooms ?? [] }];
  }
  return {
    plot: d.plot ?? base.plot,
    snap: typeof d.snap === "number" ? d.snap : base.snap,
    defT: typeof d.defT === "number" ? d.defT : base.defT,
    roof: { ...defaultRoof(), ...(d.roof ?? {}) },
    floors,
    custom: Array.isArray(d.custom) ? d.custom : [],
    fin: { ...defaultFinish(), ...(d.fin ?? {}) },
    env: { sun: { ...defaultEnv().sun, ...(d.env?.sun ?? {}) }, objs: Array.isArray(d.env?.objs) ? d.env.objs : [] },
  };
}

export function flatten(f: FullData, i: number): PlanData {
  const fl = f.floors[Math.min(i, f.floors.length - 1)];
  return {
    plot: f.plot,
    snap: f.snap,
    defT: f.defT,
    roof: f.roof,
    fin: f.fin,
    env: f.env,
    name: fl.name,
    height: fl.height,
    walls: fl.walls,
    openings: fl.openings,
    rooms: fl.rooms,
    stairs: fl.stairs,
    items: fl.items,
    custom: f.custom,
  };
}

export function unflatten(f: FullData, i: number, d: PlanData): FullData {
  const floors = f.floors.map((fl, k) =>
    k === i ? { ...fl, name: d.name, height: d.height, walls: d.walls, openings: d.openings, rooms: d.rooms, stairs: d.stairs, items: d.items } : fl
  );
  return { plot: d.plot, snap: d.snap, defT: d.defT, roof: d.roof, floors, custom: d.custom, fin: d.fin, env: d.env };
}
