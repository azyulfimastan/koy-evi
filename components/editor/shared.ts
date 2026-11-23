import type { FullData, Pt } from "@/lib/types";

export type View = { s: number; ox: number; oy: number };
export type Saved = "saved" | "saving" | "error";
export type Tool = "select" | "plot" | "wall" | "door" | "window" | "room" | "furn" | "env" | "stair" | "roof";
export type Sel =
  | null
  | { k: "pv"; i: number }
  | { k: "wall"; id: string }
  | { k: "op"; id: string }
  | { k: "room"; id: string }
  | { k: "stair"; id: string }
  | { k: "item"; id: string }
  | { k: "env"; id: string };

export const cloneF = (d: FullData): FullData => JSON.parse(JSON.stringify(d));
export const ROOM_COLORS = ["#f2d9a6", "#bfe0c4", "#c9d9f0", "#f0c9c9", "#e4d0f0", "#f0e6a8"];
export const WALL_COLOR = "#7a7266";
export const near = (a: Pt, b: Pt, e = 0.002) => Math.hypot(a.x - b.x, a.y - b.y) < e;

export const TOOL_HINT: Record<Tool, string> = {
  select: "Bir duvara, kapıya, pencereye veya odaya dokun. Duvarı sürükleyerek taşı.",
  plot: "",
  wall: "Duvarın başlangıcına dokun, sonra köşelere sırayla dokun. Çizerken rakam yazarak ölçü girebilirsin. Bitirmek için aynı noktaya tekrar dokun.",
  door: "Kapı koymak istediğin duvara dokun.",
  window: "Pencere koymak istediğin duvara dokun.",
  room: "Duvarlarla kapalı bir alanın içine dokun, oda otomatik oluşur.",
  env: "Listeden ağaç, yol, komşu bina gibi bir nesne seç, sonra arsada yerleştireceğin noktaya dokun.",
  furn: "Listeden bir eşya seç, sonra odada yerleştireceğin noktaya dokun.",
  stair: "Merdivenin yerleşeceği noktaya dokun. Basamak sayısı kat yüksekliğinden hesaplanır.",
  roof: "Çatı türünü ve eğimini panelden ayarla. Taslak, en üst katın dış sınırına göre çizilir.",
};


/** yeni kapı / pencerenin varsayılan ölçüleri */
export const defaults = (kind: "door" | "window") =>
  kind === "door" ? { w: 0.9, h: 2.1, sill: 0, shape: "rect" as const } : { w: 1.2, h: 1.2, sill: 0.9, shape: "rect" as const };

/** imleç yakalama bilgisi (SolidWorks tarzı gösterge): ne yakalandı, hangi kılavuz çizgiler çizilecek */
export type SnapInfo = {
  kind: "end" | "mid" | "perp" | "ang" | "align" | "grid";
  label: string;
  guides: { a: Pt; b: Pt }[];
} | null;
