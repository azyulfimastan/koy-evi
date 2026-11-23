import type { FullData } from "./types";
import { computeReport } from "./quantities";
import { normalizeFull } from "./types";

export type Summary = {
  floors: number;
  rooms: number;
  roomArea: number;
  groundArea: number;
  plotArea: number | null;
  wallLen: number;
  bedrooms: number;
  baths: number;
  balconies: number;
  roof: string;
  cost: number;
  pricedLines: number;
  votes: number;
  avg: number | null;
};

const ROOF: Record<string, string> = { none: "Çatısız", gable: "Beşik", hip: "Kırma", shed: "Tek eğimli", flat: "Düz" };

export function summarize(raw: unknown): { full: FullData; sum: Summary } {
  const full = normalizeFull(raw);
  const rep = computeReport(full);
  const prices = full.prices ?? {};
  let cost = 0, priced = 0;
  for (const r of [...rep.lines, ...rep.rough, ...rep.openings, ...rep.items]) {
    const p = prices[`${r.name}|${r.unit}`];
    if (p > 0) {
      cost += r.qty * p;
      priced++;
    }
  }
  const votes = full.family?.votes ?? [];
  const wallLen = full.floors.reduce((t, fl) => t + fl.walls.reduce((q, w) => q + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0), 0);
  const names = full.floors.flatMap((fl) => fl.rooms.map((r) => r.name.toLowerCase()));
  return {
    full,
    sum: {
      floors: full.floors.length,
      rooms: rep.rooms.length,
      roomArea: rep.totalArea,
      groundArea: rep.footprint,
      plotArea: rep.plotArea,
      wallLen,
      bedrooms: names.filter((n) => /yatak|misafir|çocuk/.test(n)).length,
      baths: names.filter((n) => /banyo|wc|tuvalet/.test(n)).length,
      balconies: full.floors.reduce((t, fl) => t + (fl.balconies ?? []).length, 0),
      roof: ROOF[full.roof.kind] ?? "—",
      cost,
      pricedLines: priced,
      votes: votes.length,
      avg: votes.length ? votes.reduce((t, v) => t + v.score, 0) / votes.length : null,
    },
  };
}
