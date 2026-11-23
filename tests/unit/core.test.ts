// Hızlı birim testleri: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFull } from "../../lib/types";
import { TEMPLATES, LEGACY_TEMPLATES } from "../../lib/templates";
import { parseBackup } from "../../lib/backup";
import { computeReport } from "../../lib/quantities";

test("şablonlar geçerli ev verisi üretir", () => {
  for (const t of TEMPLATES) {
    const raw = t.make();
    if (t.key === "empty") {
      assert.equal(raw, null);
      continue;
    }
    const d = normalizeFull(raw);
    assert.ok(d.floors.length >= 1, t.key + ": kat yok");
    assert.ok(d.floors[0].walls.length >= 4, t.key + ": duvar yok");
    assert.ok(d.plot.closed, t.key + ": arsa kapalı değil");
    // her açıklık var olan bir duvara bağlı olmalı
    for (const fl of d.floors) for (const o of fl.openings) assert.ok(fl.walls.some((w) => w.id === o.wall), t.key + ": boşta kapı/pencere");
    // kimlikler benzersiz
    const ids = d.floors.flatMap((fl) => [...fl.walls, ...fl.openings, ...fl.rooms, ...fl.items].map((x) => x.id));
    assert.equal(new Set(ids).size, ids.length, t.key + ": tekrar eden kimlik");
  }
});

test("şablon odaları kapalı ve alanları makul", () => {
  for (const t of TEMPLATES.filter((x) => x.key !== "empty")) {
    const r = computeReport(normalizeFull(t.make()));
    const want = normalizeFull(t.make()).floors.reduce((a, f) => a + f.rooms.length, 0);
    assert.equal(r.rooms.length, want, t.key + ": kapanmayan oda var");
    for (const room of r.rooms) assert.ok(room.area > 1.4 && room.area < 80, `${t.key}/${room.name}: alan ${room.area}`);
    assert.ok(r.lines.some((l) => l.name.startsWith("Dış cephe")), t.key + ": dış cephe hesabı yok");
  }
});

test("yedek dosyası okunur (kendi biçimi, tek ev, çıplak veri)", () => {
  const data = normalizeFull(TEMPLATES[1].make());
  const ours = JSON.stringify({ app: "koy-evi-tasarim", format: 1, projects: [{ name: "A", data }, { name: "B", data }] });
  assert.equal(parseBackup(ours).length, 2);
  assert.equal(parseBackup(JSON.stringify({ name: "Tek", data }))[0].name, "Tek");
  assert.equal(parseBackup(JSON.stringify(data)).length, 1);
  assert.throws(() => parseBackup("{bozuk"), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ merhaba: 1 })), /yedeği değil/);
});

test("bozuk veri güvenle tamamlanır", () => {
  const d = normalizeFull({ floors: [{ walls: [{ a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }] }] } as unknown);
  assert.ok(d.floors[0].height > 0);
  assert.ok(d.roof && d.fin && d.env);
});

test("duvar başına yükseklik rapora yansır", () => {
  const vol = (d: ReturnType<typeof normalizeFull>) => computeReport(d).lines.find((l) => l.name.startsWith("Duvar hacmi"))!.qty;
  const full = normalizeFull(LEGACY_TEMPLATES.find((x) => x.key === "villa")!.make());
  const before = vol(full);
  for (const f of full.floors) for (const w of f.walls) w.h = 1;
  assert.ok(vol(full) < before * 0.5, "alçak duvarlar hacmi düşürmeli");
});
