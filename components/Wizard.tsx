"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { planSvg } from "@/lib/planSvg";
import { RT, autoHouse, defaultSpec, floorName, generate, newId, type RoomType, type WBalcony, type WRoom, type WSpec } from "@/lib/wizard";
import type { V3 } from "@/lib/scene3d";

const View3D = dynamic(() => import("./View3D"), { ssr: false, loading: () => <div className="wz3load">3D hazırlanıyor…</div> });
const V3_ALL: V3 = { floors: "all", roof: true, items: true, sec: "none" };
const SIDES = { S: "Ön (yol tarafı)", N: "Arka", E: "Sağ", W: "Sol" } as const;
const STEPS = ["Arsa ve kat", "Odalar", "Balkonlar", "Çatı ve son"];

/** Ondalık virgül/nokta kabul eden küçük sayı kutusu */
function Num({ v, on, min = 0, max = 99, step = 0.1, label }: { v: number; on: (n: number) => void; min?: number; max?: number; step?: number; label: string }) {
  const [t, setT] = useState(String(v).replace(".", ","));
  useEffect(() => { if (parseFloat(t.replace(",", ".")) !== v) setT(String(v).replace(".", ",")); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (n: number) => on(Math.min(max, Math.max(min, Math.round(n / step) * step)));
  return (
    <label className="wnum">
      <span>{label}</span>
      <div>
        <button type="button" aria-label={label + " azalt"} onClick={() => commit(v - step * (step < 1 ? 5 : 1))}>−</button>
        <input inputMode="decimal" value={t} onChange={(e) => { setT(e.target.value); const n = parseFloat(e.target.value.replace(",", ".")); if (!isNaN(n)) on(Math.min(max, Math.max(min, n))); }} onBlur={() => setT(String(v).replace(".", ","))} aria-label={label} />
        <button type="button" aria-label={label + " artır"} onClick={() => commit(v + step * (step < 1 ? 5 : 1))}>+</button>
      </div>
    </label>
  );
}

const PRESETS: { name: string; types: RoomType[] }[] = [
  { name: "1+1", types: ["salonmutfak", "yatak", "banyo"] },
  { name: "2+1", types: ["salonmutfak", "yatak", "yatak", "banyo"] },
  { name: "3+1", types: ["salon", "mutfak", "yatak", "yatak", "cocuk", "banyo"] },
  { name: "4+1", types: ["salon", "mutfak", "yatak", "yatak", "cocuk", "cocuk", "banyo", "wc"] },
];
const mkRoom = (type: RoomType): WRoom => ({ id: newId(), type, w: RT[type].w, d: RT[type].d });

export default function Wizard({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [s, setS] = useState<WSpec>(defaultSpec);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [fl, setFl] = useState(0);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ds = useDeferredValue(s);
  const res = useMemo(() => generate(ds), [ds]);
  const upd = (p: Partial<WSpec>) => setS((x) => ({ ...x, ...p }));
  const fi = Math.min(fl, res.full.floors.length - 1);
  const svg = useMemo(() => planSvg(res.full, fi, 520, 380), [res.full, fi]);
  const auto = autoHouse(s);

  function setFloors(n: number) {
    setS((x) => {
      const rooms = [...x.rooms];
      while (rooms.length < n) rooms.push(rooms.length === 1 ? [mkRoom("yatak"), mkRoom("cocuk"), mkRoom("banyo")] : rooms[rooms.length - 1].map((r) => ({ ...r, id: newId() })));
      return { ...x, floors: n, rooms, balconies: x.balconies.filter((b) => b.floor < n) };
    });
    setFl((f) => Math.min(f, n - 1));
  }
  const setRooms = (f: number, list: WRoom[]) => setS((x) => ({ ...x, rooms: x.rooms.map((r, i) => (i === f ? list : r)) }));
  const rooms = s.rooms[fl] ?? [];
  const patchRoom = (id: string, p: Partial<WRoom>) => setRooms(fl, rooms.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const patchBal = (id: string, p: Partial<WBalcony>) => upd({ balconies: s.balconies.map((b) => (b.id === id ? { ...b, ...p } : b)) });

  async function create() {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name || "Sihirbaz evi", data: res.full }) });
    setBusy(false);
    if (!r.ok) return setErr("Ev oluşturulamadı, tekrar dene.");
    const p = await r.json();
    onCreated(p.id);
  }

  const bad = res.rooms.filter((r) => r.a < r.want * 0.8 || r.a > r.want * 1.25);

  return (
    <div className="wiz" role="dialog" aria-label="Hadi beraber oluşturalım">
      <div className="wzbar">
        <b>✨ Hadi beraber oluşturalım</b>
        <button onClick={onClose}>✕ Kapat</button>
      </div>
      <div className="wzbody">
        <div className="wzprev">
          <div className="wztabs">
            <button className={mode === "2d" ? "on" : ""} onClick={() => setMode("2d")}>2D plan</button>
            <button className={mode === "3d" ? "on" : ""} onClick={() => setMode("3d")}>3D</button>
            {mode === "2d" && res.full.floors.length > 1 && res.full.floors.map((f, i) => (
              <button key={f.id} className={"fl" + (fi === i ? " on" : "")} onClick={() => setFl(i)}>{f.name}</button>
            ))}
            <span className="wzdim">{res.houseW.toFixed(1).replace(".", ",")} × {res.houseD.toFixed(1).replace(".", ",")} m</span>
          </div>
          <div className="wzview">
            {mode === "2d" ? <div className="wzsvg" dangerouslySetInnerHTML={{ __html: svg }} /> : <View3D full={res.full} fi={0} v3={V3_ALL} name="Sihirbaz" walk={null} pan={false} sel={null} onPick={() => {}} onExit={() => {}} />}
          </div>
        </div>

        <div className="wzform">
          <div className="wzsteps">
            {STEPS.map((t, i) => (
              <button key={t} className={step === i ? "on" : i < step ? "done" : ""} onClick={() => setStep(i)}><i>{i + 1}</i> {t}</button>
            ))}
          </div>

          {step === 0 && (
            <section>
              <h3>Arsan ne kadar?</h3>
              <div className="wzrow">
                <Num label="Arsa genişliği (m)" v={s.plotW} on={(n) => upd({ plotW: n })} min={6} max={200} step={1} />
                <Num label="Arsa derinliği (m)" v={s.plotD} on={(n) => upd({ plotD: n })} min={6} max={200} step={1} />
              </div>
              <h3>Kaç katlı?</h3>
              <div className="wzchips">
                {[1, 2, 3].map((n) => <button key={n} className={s.floors === n ? "on" : ""} onClick={() => setFloors(n)}>{n} kat</button>)}
              </div>
              <Num label="Kat yüksekliği (m)" v={s.height} on={(n) => upd({ height: n })} min={2.3} max={4} step={0.1} />
            </section>
          )}

          {step === 1 && (
            <section>
              {s.floors > 1 && (
                <div className="wzchips">
                  {Array.from({ length: s.floors }, (_, i) => <button key={i} className={fl === i ? "on" : ""} onClick={() => setFl(i)}>{floorName(i)}</button>)}
                </div>
              )}
              <h3>{floorName(fl)} odaları</h3>
              <div className="wzchips small">
                <span>Hazır:</span>
                {PRESETS.map((p) => <button key={p.name} onClick={() => setRooms(fl, p.types.map(mkRoom))}>{p.name}</button>)}
              </div>
              {rooms.map((r) => (
                <div className="wroom" key={r.id}>
                  <select value={r.type} onChange={(e) => patchRoom(r.id, { type: e.target.value as RoomType, w: RT[e.target.value as RoomType].w, d: RT[e.target.value as RoomType].d })} aria-label="Oda türü">
                    {(Object.keys(RT) as RoomType[]).map((k) => <option key={k} value={k}>{RT[k].name}</option>)}
                  </select>
                  <Num label="En (m)" v={r.w} on={(n) => patchRoom(r.id, { w: n })} min={1} max={15} step={0.1} />
                  <Num label="Boy (m)" v={r.d} on={(n) => patchRoom(r.id, { d: n })} min={1} max={15} step={0.1} />
                  <button className="wdel" aria-label="Odayı sil" onClick={() => setRooms(fl, rooms.filter((x) => x.id !== r.id))}>🗑</button>
                </div>
              ))}
              <div className="wzchips small">
                <span>+ Ekle:</span>
                {(Object.keys(RT) as RoomType[]).map((k) => <button key={k} onClick={() => setRooms(fl, [...rooms, mkRoom(k)])}>{RT[k].name}</button>)}
              </div>
              <p className="wznote">Ölçüler istek olarak alınır; ev dikdörtgen olduğu için odalar birbirine oranlanıp sığdırılır. Gerçek ölçüleri aşağıda görürsün.</p>
              {res.full.floors[fi] && (
                <div className="wzlist">
                  {res.rooms.filter((r) => r.floor === Math.min(fl, res.full.floors.length - 1)).map((r, i) => (
                    <div key={i} className={r.a < r.want * 0.8 || r.a > r.want * 1.25 ? "off" : ""}><span>{r.name}</span><b>{r.w.toFixed(1).replace(".", ",")} × {r.d.toFixed(1).replace(".", ",")} m = {r.a.toFixed(1).replace(".", ",")} m²</b></div>
                  ))}
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section>
              <h3>Balkon ister misin?</h3>
              {s.balconies.length === 0 && <p className="wznote">Balkon yok. Eklemek için aşağıya dokun.</p>}
              {s.balconies.map((b) => (
                <div className="wroom bal" key={b.id}>
                  <label className="wsel"><span>Kat</span>
                    <select value={b.floor} onChange={(e) => patchBal(b.id, { floor: +e.target.value })}>
                      {Array.from({ length: s.floors }, (_, i) => <option key={i} value={i}>{floorName(i)}</option>)}
                    </select></label>
                  <label className="wsel"><span>Cephe</span>
                    <select value={b.side} onChange={(e) => patchBal(b.id, { side: e.target.value as WBalcony["side"] })}>
                      {(Object.keys(SIDES) as (keyof typeof SIDES)[]).map((k) => <option key={k} value={k}>{SIDES[k]}</option>)}
                    </select></label>
                  <Num label="Genişlik (m)" v={b.w} on={(n) => patchBal(b.id, { w: n })} min={1} max={10} step={0.1} />
                  <Num label="Çıkma (m)" v={b.d} on={(n) => patchBal(b.id, { d: n })} min={0.8} max={3} step={0.1} />
                  <span className="wzarea">{(b.w * b.d).toFixed(1).replace(".", ",")} m²</span>
                  <button className="wdel" aria-label="Balkonu sil" onClick={() => upd({ balconies: s.balconies.filter((x) => x.id !== b.id) })}>🗑</button>
                </div>
              ))}
              <button className="wadd" onClick={() => upd({ balconies: [...s.balconies, { id: newId(), floor: Math.min(1, s.floors - 1), side: "S", w: 2.4, d: 1.2 }] })}>+ Balkon ekle</button>
            </section>
          )}

          {step === 3 && (
            <section>
              <h3>Çatı</h3>
              <div className="wzchips">
                {([["gable", "Beşik"], ["hip", "Kırma"], ["shed", "Tek eğimli"], ["flat", "Düz"], ["none", "Yok"]] as [WSpec["roof"], string][]).map(([k, l]) => <button key={k} className={s.roof === k ? "on" : ""} onClick={() => upd({ roof: k })}>{l}</button>)}
              </div>
              {s.roof !== "flat" && s.roof !== "none" && <Num label="Çatı eğimi (°)" v={s.pitch} on={(n) => upd({ pitch: n })} min={10} max={60} step={1} />}
              <h3>Evin dış ölçüsü</h3>
              <label className="wchk"><input type="checkbox" checked={s.autoSize} onChange={(e) => upd({ autoSize: e.target.checked, houseW: e.target.checked ? s.houseW : res.houseW, houseD: e.target.checked ? s.houseD : res.houseD })} /> Oda toplamına göre otomatik ({auto.W.toString().replace(".", ",")} × {auto.D.toString().replace(".", ",")} m)</label>
              {!s.autoSize && (
                <div className="wzrow">
                  <Num label="Ev genişliği (m)" v={s.houseW} on={(n) => upd({ houseW: n })} min={4} max={40} step={0.5} />
                  <Num label="Ev derinliği (m)" v={s.houseD} on={(n) => upd({ houseD: n })} min={4} max={40} step={0.5} />
                </div>
              )}
              <label className="wchk"><input type="checkbox" checked={s.furnish} onChange={(e) => upd({ furnish: e.target.checked })} /> Eşyaları da yerleştir</label>
              <h3>Evin adı</h3>
              <input className="wname" placeholder="örn. Alternatif A" value={name} onChange={(e) => setName(e.target.value)} />
              {bad.length > 0 && <p className="wznote">ℹ️ {bad.length} odanın ölçüsü istenenden belirgin farklı çıktı (2. adımda turuncu). Ev ölçüsünü büyütebilir ya da odaları küçültebilirsin.</p>}
            </section>
          )}

          {res.warnings.length > 0 && <div className="wwarn">{res.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}</div>}
          {err && <div className="err">{err}</div>}

          <div className="wnav">
            <button onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}>◀ Geri</button>
            {step < STEPS.length - 1 ? (
              <button className="go" onClick={() => setStep((x) => x + 1)}>İleri ▶</button>
            ) : (
              <button className="go" onClick={create} disabled={busy}>{busy ? "Oluşturuluyor…" : "✅ Evi oluştur ve aç"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
