import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSpec, generate, newId, type WSpec } from "../../lib/wizard";

test("tek katlı varsayılan: her odada kapı, giriş kapısı var", () => {
  const r = generate(defaultSpec());
  const f = r.full.floors[0];
  assert.equal(f.rooms.length, 4);
  assert.ok(f.openings.filter((o) => o.kind === "door").length >= 4);
  assert.ok(f.walls.length >= 6);
  assert.equal(r.warnings.filter((w) => w.includes("kapısı yok")).length, 0);
});

test("iki katlı: merdiven ve hol, balkon dışarı bakar", () => {
  const s: WSpec = { ...defaultSpec(), floors: 2 };
  const t = (type: any, w: number, d: number) => ({ id: newId(), type, w, d });
  s.rooms = [[t("salonmutfak", 6, 4.5), t("yatak", 3.5, 3.5), t("banyo", 2.2, 2.5)], [t("yatak", 3.5, 3.5), t("cocuk", 3, 3), t("banyo", 2.2, 2.5)]];
  s.balconies = [{ id: newId(), floor: 1, side: "S", w: 2.4, d: 1.2 }];
  const r = generate(s);
  assert.equal(r.full.floors.length, 2);
  assert.equal(r.full.floors[0].stairs.length, 1);
  assert.equal(r.full.floors[1].balconies?.length, 1);
  assert.equal(r.warnings.filter((w) => w.includes("kapısı yok")).length, 0);
  const b = r.full.floors[1].balconies![0];
  assert.equal(b.side, -1);
});

test("kaide ve dış merdiven: girişe ve 1. kata dış merdiven, iç merdiven kapatılabilir", () => {
  const s: WSpec = { ...defaultSpec(), floors: 2, plinth: 1.2, upperExt: true, innerStair: false };
  const t = (type: any, w: number, d: number) => ({ id: newId(), type, w, d });
  s.rooms = [[t("salonmutfak", 6, 4.5), t("yatak", 3.5, 3.5), t("banyo", 2.2, 2.5)], [t("yatak", 3.5, 3.5), t("cocuk", 3, 3), t("banyo", 2.2, 2.5)]];
  const r = generate(s);
  assert.equal(r.full.build?.plinth, 1.2);
  assert.equal(r.full.floors[0].stairs.filter((q) => q.ext).length, 1);
  assert.equal(r.full.floors[1].stairs.filter((q) => q.ext).length, 1);
  assert.equal(r.full.floors.flatMap((f) => f.stairs).filter((q) => !q.ext).length, 0);
});

import { shapePreset } from "../../lib/wizard";
for (const kind of ["L", "T", "U"] as const) {
  test(`${kind} şekilli ev: kanatlar var, her oda bağlı, giriş kapısı var`, () => {
    for (const nf of [1, 2]) {
      const s: WSpec = { ...defaultSpec(), floors: nf, autoSize: false };
      const t = (type: any, w: number, d: number) => ({ id: newId(), type, w, d });
      const one = [t("salon", 5, 4), t("mutfak", 3.5, 3), t("yatak", 3.5, 3.5), t("yatak", 3, 3), t("cocuk", 3, 3), t("banyo", 2.2, 2.5)];
      s.rooms = nf === 1 ? [one] : [one.slice(0, 3), one.slice(3)];
      const p = shapePreset(kind, s);
      Object.assign(s, { shape: kind, houseW: p.houseW, houseD: p.houseD, wings: p.wings });
      const r = generate(s);
      assert.equal(r.warnings.filter((w) => w.includes("kapısı yok") || w.includes("konamadı") || w.includes("biniyor") || w.includes("değmiyor")).length, 0, r.warnings.join(" | "));
      const f = r.full.floors[0];
      assert.ok(f.rooms.length >= 4);
      assert.ok(f.openings.some((o) => o.kind === "door"));
      // taban alanı kutudan küçük (girinti var)
      const A = r.rooms.filter((x) => x.floor === 0).reduce((a, x) => a + x.a, 0);
      assert.ok(A < r.houseW * r.houseD - 1, `${A} ${r.houseW * r.houseD}`);
    }
  });
}

test("özel şekil: kanat başka kanada bağlanır, üst üste binen kanat reddedilir", () => {
  const s: WSpec = { ...defaultSpec(), autoSize: false, houseW: 8, houseD: 6 };
  s.rooms = [[{ id: newId(), type: "salon", w: 5, d: 4 }, { id: newId(), type: "yatak", w: 4, d: 3 }, { id: newId(), type: "yatak", w: 3, d: 3 }, { id: newId(), type: "banyo", w: 2, d: 2 }]];
  s.wings = [{ id: newId(), to: 0, side: "E", align: 0, w: 4, d: 4 }, { id: newId(), to: 1, side: "S", align: 0, w: 4, d: 3 }, { id: newId(), to: 0, side: "E", align: 0, w: 4, d: 4 }];
  const r = generate(s);
  assert.ok(r.warnings.some((w) => w.includes("biniyor")));
  assert.ok(r.houseW >= 12 && r.houseD >= 6);
});

import { roofParts } from "../../lib/roof";
test("çatı duvarlara göre otomatik parçalanır: dikdörtgen 1, L 2, T 2, U 3, özel E-kanat 2", () => {
  const t = (type: any, w: number, d: number) => ({ id: newId(), type, w, d });
  const rooms = [t("salon", 5, 4), t("mutfak", 3.5, 3), t("yatak", 3.5, 3.5), t("yatak", 3, 3), t("cocuk", 3, 3), t("banyo", 2.2, 2.5)];
  const base = (): WSpec => ({ ...defaultSpec(), autoSize: false, rooms: [rooms] });
  assert.equal(roofParts(generate(base()).full).length, 1);
  const exp: Record<string, number> = { L: 2, T: 2, U: 3 };
  for (const k of ["L", "T", "U"] as const) {
    const s = base();
    const p = shapePreset(k, s);
    Object.assign(s, { shape: k, houseW: p.houseW, houseD: p.houseD, wings: p.wings });
    assert.equal(roofParts(generate(s).full).length, exp[k], k);
  }
  const c = { ...base(), houseW: 8, houseD: 6, wings: [{ id: newId(), to: 0, side: "E" as const, align: 0 as const, w: 4, d: 4 }] };
  assert.equal(roofParts(generate(c).full).length, 2);
});

test("oda yeri, sırası, bloğu ve eşya yönü elle belirlenir", () => {
  const t = (type: any, w: number, d: number, extra: object = {}) => ({ id: newId(), type, w, d, ...extra });
  const a = t("yatak", 3.5, 3.5, { band: "S" });
  const b = t("yatak", 3, 3);
  const c = t("salon", 5, 4, { band: "N" });
  const d = t("banyo", 2.2, 2.5);
  const s: WSpec = { ...defaultSpec(), autoSize: false, houseW: 10, houseD: 8, rooms: [[b, a, c, d]] };
  const r = generate(s);
  const rooms = r.full.floors[0].rooms;
  const y = (n: string) => rooms.find((q) => q.name.startsWith(n))!.seed.y;
  assert.ok(y("Salon") < y("Yatak odası "), "zorla arka: salon kuzeyde (küçük y)");
  // eşya yönü: yatak odasındaki yatak aynalanınca x merkezin diğer yanına geçer
  const x0 = (spec: WSpec) => { const rr = generate(spec); const it = rr.full.floors[0].items.find((q) => q.key === "bed2")!; return it.x; };
  const base = x0({ ...s, rooms: [[t("yatak", 5, 4, { turn: 0 })]], wings: [] });
  const mir = x0({ ...s, rooms: [[t("yatak", 5, 4, { turn: 1 })]], wings: [] });
  assert.ok(Math.abs(base - 5) < 0.2 && Math.abs(mir - 5) < 0.2);
  const k = (turn: 0 | 3) => { const rr = generate({ ...s, rooms: [[t("yatak", 5, 4, { turn })]], wings: [] }); return rr.full.floors[0].items.find((q) => q.key === "bed2")!; };
  assert.ok(Math.abs(k(0).y + k(3).y - 8) < 0.2, "180° çevirince y simetrik");
  assert.equal((k(0).rot + 180) % 360, k(3).rot);
});
