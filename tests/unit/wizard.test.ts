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
