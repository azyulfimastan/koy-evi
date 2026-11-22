export type Pt = { x: number; y: number };
export type Plot = { points: Pt[]; closed: boolean };
export type Wall = { id: string; a: Pt; b: Pt; t: number; color: string };
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
export type Room = { id: string; name: string; seed: Pt; color: string };
export type Stair = {
  id: string;
  kind: "straight" | "L" | "U" | "spiral";
  x: number; // merkez
  y: number;
  rot: number; // derece (0/90/180/270)
  w: number; // basamak genişliği (m)
  mirror: boolean;
};
export type Floor = {
  id: string;
  name: string;
  height: number; // kat yüksekliği (m), döşeme üstünden bir üst döşemeye
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  stairs: Stair[];
};
export type Roof = {
  kind: "gable" | "hip" | "shed" | "flat";
  pitch: number; // derece
  overhang: number; // m
  ridge: "auto" | "x" | "y";
  color: string;
};
export type FullData = { plot: Plot; snap: number; defT: number; roof: Roof; floors: Floor[] };

/** Editörün o an çalıştığı kat + ortak ayarlar (düz görünüm) */
export type PlanData = {
  plot: Plot;
  snap: number;
  defT: number;
  roof: Roof;
  name: string;
  height: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  stairs: Stair[];
};

export type Project = { id: string; name: string; createdAt: number; updatedAt: number; data: FullData };

export const uid = () => Math.random().toString(36).slice(2, 10);

export const defaultRoof = (): Roof => ({ kind: "gable", pitch: 35, overhang: 0.4, ridge: "auto", color: "#a5523a" });
export const newFloor = (name: string): Floor => ({ id: uid(), name, height: 2.8, walls: [], openings: [], rooms: [], stairs: [] });

export function defaultFull(): FullData {
  return { plot: { points: [], closed: false }, snap: 0.1, defT: 0.25, roof: defaultRoof(), floors: [newFloor("Zemin kat")] };
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
  };
}

export function flatten(f: FullData, i: number): PlanData {
  const fl = f.floors[Math.min(i, f.floors.length - 1)];
  return {
    plot: f.plot,
    snap: f.snap,
    defT: f.defT,
    roof: f.roof,
    name: fl.name,
    height: fl.height,
    walls: fl.walls,
    openings: fl.openings,
    rooms: fl.rooms,
    stairs: fl.stairs,
  };
}

export function unflatten(f: FullData, i: number, d: PlanData): FullData {
  const floors = f.floors.map((fl, k) =>
    k === i ? { ...fl, name: d.name, height: d.height, walls: d.walls, openings: d.openings, rooms: d.rooms, stairs: d.stairs } : fl
  );
  return { plot: d.plot, snap: d.snap, defT: d.defT, roof: d.roof, floors };
}
