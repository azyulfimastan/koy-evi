import type { FullData, Opening } from "./types";
import type { Sel } from "@/components/editor/shared";
import { fmt } from "./geo";

export type RCounts = { plot: boolean; env: boolean; walls: number; ops: number; rooms: number; stairs: number; items: number; bals: number; roof: boolean };
export type RStep = { phase: string; floor: number; title: string; how: string; sel: Sel; c: RCounts };

const HOW = {
  start: "Önce boş bir arsa ve çizim alanı var. Adımları ileri tuşuyla izle; her adımda yeni eklenen parça turuncu görünür.",
  plot: "Arsa aracı: arsanın köşelerine sırayla dokun, ilk noktaya tekrar dokunarak kapat.",
  env: "Çevre aracı: ağaç, yol, çit gibi nesneyi seç, arsada yerine dokun.",
  wall: "Duvar aracı: köşelere sırayla dokun. Çizgi yatay veya dikeyse kendiliğinden kilitlenir; çizerken rakam yazarak ölçü girebilirsin.",
  door: "Kapı aracı: kapının geleceği duvara dokun. Sonra sağ panelden genişlik ve yüksekliği ayarla.",
  window: "Pencere aracı: duvara dokun. “Yerden yükseklik” pencerenin altlığıdır.",
  room: "Oda aracı: kapalı bir alanın içine dokun. Oda ve alanı otomatik oluşur; adını ve zemin kaplamasını panelden seç.",
  stair: "Merdiven aracı: planda yerine dokun. Tür ve genişliği panelden seç; basamak sayısı kat yüksekliğinden hesaplanır.",
  balcony: "Balkon aracı: balkonun çıkacağı duvarın dış tarafına dokun, ölçü ve korkuluğu panelden ayarla.",
  item: "Eşya aracı: listeden bir eşya seç, odada yerine dokun. Seç aracıyla sürükleyip taşıyabilirsin.",
  roof: "Çatı aracı: tür, eğim ve kaplamayı panelden seç. Çatı en üst katın üstüne oturur.",
  done: "Ev tamam. İstersen 3D görünümde “İnşaat aşamaları” ile temelden çatıya yapılışını da izleyebilirsin.",
};

const ROOF: Record<string, string> = { gable: "Beşik", hip: "Kırma", shed: "Tek eğimli", flat: "Düz" };

/** Bitmiş evden, yapılış sırasını yeniden kuran adım listesi (kaydedilmiş bir geçmiş gerekmez) */
export function buildReplay(f: FullData): RStep[] {
  const out: RStep[] = [];
  let c: RCounts = { plot: false, env: false, walls: 0, ops: 0, rooms: 0, stairs: 0, items: 0, bals: 0, roof: false };
  let floor = 0;
  const push = (phase: string, title: string, how: string, sel: Sel = null) => out.push({ phase, floor, title, how, sel, c: { ...c } });
  push("Başlangıç", "Boş arsa", HOW.start);
  if (f.plot.points.length >= 3) {
    c = { ...c, plot: true };
    push("Arsa", `Arsa çizildi · ${f.plot.points.length} köşe`, HOW.plot);
  }
  if (f.env.objs.length) {
    c = { ...c, env: true };
    push("Çevre", `Çevre: ${f.env.objs.length} nesne (ağaç, yol, çit…)`, HOW.env);
  }
  f.floors.forEach((fl, i) => {
    if (!fl.walls.length && !fl.items.length) return;
    floor = i;
    c = { ...c, walls: 0, ops: 0, rooms: 0, stairs: 0, items: 0, bals: 0 };
    const n = fl.walls.length;
    fl.walls.forEach((w, k) => {
      c = { ...c, walls: k + 1 };
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      push(`${fl.name}: duvarlar`, `Duvar ${k + 1}/${n} · ${fmt(L)} m, kalınlık ${Math.round(w.t * 100)} cm${w.h ? `, yükseklik ${Math.round(w.h * 100)} cm` : ""}`, HOW.wall, { k: "wall", id: w.id });
    });
    const ops = openingsOrdered(fl.openings);
    ops.forEach((o, k) => {
      c = { ...c, ops: k + 1 };
      push(o.kind === "door" ? `${fl.name}: kapılar` : `${fl.name}: pencereler`, `${o.kind === "door" ? "Kapı" : "Pencere"} · ${Math.round(o.w * 100)} × ${Math.round(o.h * 100)} cm`, o.kind === "door" ? HOW.door : HOW.window, { k: "op", id: o.id });
    });
    fl.rooms.forEach((r, k) => {
      c = { ...c, rooms: k + 1 };
      push(`${fl.name}: odalar`, `Oda: ${r.name}`, HOW.room, { k: "room", id: r.id });
    });
    fl.stairs.forEach((s, k) => {
      c = { ...c, stairs: k + 1 };
      push(`${fl.name}: merdiven`, `Merdiven (${({ straight: "düz", L: "L", U: "U", spiral: "sarmal" } as Record<string, string>)[s.kind]}, ${Math.round(s.w * 100)} cm)`, HOW.stair, { k: "stair", id: s.id });
    });
    (fl.balconies ?? []).forEach((b, k) => {
      c = { ...c, bals: k + 1 };
      push(`${fl.name}: balkon`, `Balkon · ${Math.round(b.w * 100)} × ${Math.round(b.d * 100)} cm`, HOW.balcony, { k: "balcony", id: b.id });
    });
    fl.items.forEach((it, k) => {
      c = { ...c, items: k + 1 };
      push(`${fl.name}: eşyalar`, `Eşya: ${it.name}`, HOW.item, { k: "item", id: it.id });
    });
  });
  if (f.roof.kind !== "none" && f.floors.some((fl) => fl.walls.length)) {
    c = { ...c, roof: true };
    push("Çatı", `Çatı: ${ROOF[f.roof.kind]}${f.roof.kind === "flat" ? "" : `, ${f.roof.pitch}° eğim`}`, HOW.roof);
  }
  push("Tamamlandı", "Ev tamam 🎉", HOW.done);
  return out;
}

export const openingsOrdered = (ops: Opening[]) => [...ops.filter((o) => o.kind === "door"), ...ops.filter((o) => o.kind !== "door")];

/** Adımdaki duruma kadar olan ev (o ana kadar çizilenler) */
export function cutAt(f: FullData, s: RStep): FullData {
  const floors = f.floors.map((fl, j) => {
    if (j < s.floor) return fl;
    if (j > s.floor) return { ...fl, walls: [], openings: [], rooms: [], stairs: [], items: [], balconies: [] };
    return {
      ...fl,
      walls: fl.walls.slice(0, s.c.walls),
      openings: openingsOrdered(fl.openings).slice(0, s.c.ops),
      rooms: fl.rooms.slice(0, s.c.rooms),
      stairs: fl.stairs.slice(0, s.c.stairs),
      balconies: (fl.balconies ?? []).slice(0, s.c.bals),
      items: fl.items.slice(0, s.c.items),
    };
  });
  return {
    ...f,
    plot: s.c.plot ? f.plot : { points: [], closed: false },
    env: s.c.env ? f.env : { ...f.env, objs: [] },
    roof: s.c.roof ? f.roof : { ...f.roof, kind: "none" },
    floors,
  };
}
