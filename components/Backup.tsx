"use client";
import { useEffect, useState } from "react";
import type { FullData } from "@/lib/types";
import { downloadBackup, safeName, stamp } from "@/lib/backup";

type Snap = { ts: number; walls: number; rooms: number; items: number; floors: number };

function when(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return same ? `Bugün ${t}` : `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${t}`;
}

export default function Backup({ id, name, full, flush, onRestore, onClose }: { id: string; name: string; full: FullData; flush: () => Promise<void>; onRestore: (d: unknown) => void; onClose: () => void }) {
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch(`/api/projects/${id}/history`);
    setSnaps(r.ok ? await r.json() : []);
  }
  useEffect(() => {
    flush().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restore(ts: number) {
    setBusy(true);
    await flush();
    const r = await fetch(`/api/projects/${id}/history`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ts }) });
    setBusy(false);
    setAsk(null);
    if (!r.ok) return setMsg("Geri yüklenemedi.");
    const p = await r.json();
    onRestore(p.data);
    setMsg("✅ Eski sürüme dönüldü. Az önceki hâl de geçmişe kaydedildi.");
    load();
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="mcard" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <b>💾 Yedek ve geçmiş</b>
          <button onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <section>
          <h4>Bu evi dosya olarak indir</h4>
          <p className="muted small">Telefonuna veya bilgisayarına kaydet. Evler listesindeki “Yedekten yükle” ile geri açarsın.</p>
          <button className="primary" onClick={() => downloadBackup([{ name, data: full }], `${safeName(name)}-yedek-${stamp()}.json`)}>⬇ Yedeği indir (.json)</button>
        </section>
        <section>
          <h4>Sürüm geçmişi</h4>
          <p className="muted small">Çalışırken en çok 10 dakikada bir otomatik sürüm alınır (son 40 sürüm).</p>
          {msg && <div className="note">{msg}</div>}
          {snaps === null && <div className="muted">Yükleniyor…</div>}
          {snaps?.length === 0 && <div className="muted">Henüz kayıtlı sürüm yok. Çizmeye devam ettikçe burada görünecek.</div>}
          <div className="hist">
            {snaps?.map((s) => (
              <div className="hrow" key={s.ts}>
                <div>
                  <b>{when(s.ts)}</b>
                  <span className="muted small">
                    {s.floors} kat · {s.walls} duvar · {s.rooms} oda · {s.items} eşya
                  </span>
                </div>
                {ask === s.ts ? (
                  <div className="row">
                    <button className="primary" disabled={busy} onClick={() => restore(s.ts)}>{busy ? "…" : "Evet, dön"}</button>
                    <button onClick={() => setAsk(null)}>Vazgeç</button>
                  </div>
                ) : (
                  <button onClick={() => setAsk(s.ts)}>↺ Bu sürüme dön</button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
