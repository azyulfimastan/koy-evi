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

export type PlanData = {
  plot: Plot;
  snap: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  defT: number; // varsayılan duvar kalınlığı (m)
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: PlanData;
};

export function defaultData(): PlanData {
  return { plot: { points: [], closed: false }, snap: 0.1, walls: [], openings: [], rooms: [], defT: 0.25 };
}

export function normalizeData(d: Partial<PlanData> | undefined | null): PlanData {
  const base = defaultData();
  return { ...base, ...(d || {}), plot: d?.plot ?? base.plot };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
