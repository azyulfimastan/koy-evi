"use client";
import { useEffect, useRef, useState } from "react";
import { VERSION } from "./App";
import { HouseLogo } from "./HouseArt";
import { TEMPLATES } from "@/lib/templates";
import Summary from "./Summary";
import Compare from "./Compare";
import Replay from "./Replay";
import Wizard from "./Wizard";
import { normalizeFull } from "@/lib/types";
import type { FullData } from "@/lib/types";
import { downloadBackup, parseBackup, stamp } from "@/lib/backup";

type Item = { id: string; name: string; updatedAt: number; thumb?: string };
type Trash = { id: string; name: string; deletedAt: number; thumb?: string };

function ago(t: number) {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return "az önce";
  if (d < 3600) return `${Math.floor(d / 60)} dk önce`;
  if (d < 86400) return `${Math.floor(d / 3600)} saat önce`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} gün önce`;
  return new Date(t).toLocaleDateString("tr-TR");
}

export default function ProjectList({ onOpen, onLogout }: { onOpen: (id: string) => void; onLogout: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [name, setName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [tpl, setTpl] = useState("empty");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [trash, setTrash] = useState<Trash[] | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [cmp, setCmp] = useState(false);
  const [wiz, setWiz] = useState(false);
  const [sumId, setSumId] = useState<string | null>(null);
  const [rp, setRp] = useState<{ name: string; full: FullData } | null>(null);
  async function watch(p: Item) {
    const r = await fetch("/api/projects/" + p.id);
    if (!r.ok) return setErr("Ev yüklenemedi.");
    const j = await r.json();
    setRp({ name: j.name, full: normalizeFull(j.data) });
  }
  const toggle = (id: string) => setSel((a) => (a.includes(id) ? a.filter((x) => x !== id) : a.length >= 4 ? a : [...a, id]));

  async function duplicate(p: Item) {
    setBusy("Kopyalanıyor…");
    try {
      const r = await fetch("/api/projects/" + p.id);
      if (!r.ok) throw new Error();
      const src = await r.json();
      const base = p.name.replace(/\s*\(alternatif \d+\)$/, "");
      const n = (items ?? []).filter((q) => q.name.startsWith(base)).length + 1;
      const c = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${base} (alternatif ${n})`, data: src.data }) });
      if (!c.ok) throw new Error();
      const np = await c.json();
      if (src.thumb) await fetch("/api/projects/" + np.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thumb: src.thumb }) });
      setNote(`✅ Kopyalandı: ${np.name}. Şimdi onu açıp değiştirebilirsin.`);
      load();
    } catch {
      setErr("Kopyalanamadı.");
    }
    setBusy("");
  }

  async function loadTrash() {
    const r = await fetch("/api/trash");
    if (r.ok) setTrash(await r.json());
  }

  async function load() {
    const r = await fetch("/api/projects");
    if (r.status === 401) return onLogout();
    if (!r.ok) return setErr("Projeler yüklenemedi.");
    const all: Item[] = await r.json();
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    setItems(all);
  }
  useEffect(() => {
    load();
    loadTrash();
    const on = () => load();
    window.addEventListener("kte-thumb", on);
    return () => window.removeEventListener("kte-thumb", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || (tpl !== "empty" ? TEMPLATES.find((t) => t.key === tpl)?.name : ""), data: TEMPLATES.find((t) => t.key === tpl)?.make() ?? undefined }),
    });
    if (!r.ok) return setErr("Proje oluşturulamadı.");
    const p = await r.json();
    onOpen(p.id);
  }

  async function remove(id: string) {
    await fetch("/api/projects/" + id, { method: "DELETE" });
    setConfirmDel(null);
    setNote("Ev çöp kutusuna taşındı. 30 gün içinde geri getirebilirsin.");
    load();
    loadTrash();
  }

  async function restore(id: string) {
    await fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setNote("✅ Ev geri getirildi.");
    load();
    loadTrash();
  }

  async function purge(id: string) {
    await fetch("/api/trash?id=" + encodeURIComponent(id), { method: "DELETE" });
    loadTrash();
  }

  async function exportAll() {
    if (!items?.length) return;
    setBusy("Yedek hazırlanıyor…");
    try {
      const all = await Promise.all(items.map((p) => fetch("/api/projects/" + p.id).then((r) => r.json())));
      downloadBackup(all.map((p) => ({ name: p.name, createdAt: p.createdAt, data: p.data })), `koy-evi-tum-evler-${stamp()}.json`);
      setNote(`✅ ${all.length} ev tek dosyaya yedeklendi.`);
    } catch {
      setErr("Yedek alınamadı.");
    }
    setBusy("");
  }

  async function importFile(f: File) {
    setErr("");
    setBusy("Yedek yükleniyor…");
    try {
      if (f.size > 8 * 1024 * 1024) throw new Error("Dosya çok büyük.");
      const list = parseBackup(await f.text());
      for (const p of list) {
        const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: p.name, data: p.data }) });
        if (!r.ok) throw new Error("Kaydedilemedi.");
      }
      setNote(`✅ ${list.length} ev yedekten yüklendi.`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yedek yüklenemedi.");
    }
    setBusy("");
  }

  return (
    <div className="page home">
      <header className="top">
        <div className="brand">
          <HouseLogo />
          <div>
            <h1>Köy Evi Tasarım</h1>
            <div className="ver">Evini çiz, 3D gez, malzemesini hesapla · {VERSION}</div>
          </div>
        </div>
        <button onClick={onLogout}>Çıkış</button>
      </header>

      <button type="button" className="wizbtn" onClick={() => setWiz(true)}>
        <b>✨ Hadi beraber oluşturalım</b>
        <span>Çizmeden, sadece rakam gir: oda, kat, balkon… Ev kendiliğinden 2D ve 3D çıksın.</span>
      </button>

      <form className="newp" onSubmit={create}>
        <div className="newrow">
          <input placeholder="Yeni ev adı (örn. Köy evi 1)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary">+ Yeni ev</button>
        </div>
        <div className="tpls" role="radiogroup" aria-label="Başlangıç">
          {TEMPLATES.map((t) => (
            <button type="button" key={t.key} role="radio" aria-checked={tpl === t.key} className={"tpl" + (tpl === t.key ? " on" : "")} onClick={() => setTpl(t.key)}>
              <b>{t.name}</b>
              <span>{t.desc}</span>
            </button>
          ))}
        </div>
      </form>

      <div className="bkbar">
        <button onClick={() => fileRef.current?.click()}>⬆ Yedekten yükle</button>
        <button onClick={exportAll} disabled={!items?.length}>⬇ Tüm evleri yedekle</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} />
        {busy && <span className="muted">{busy}</span>}
      </div>

      {err && <div className="err">{err}</div>}
      {note && <div className="note" onClick={() => setNote("")}>{note}</div>}
      {items === null && <div className="muted">Yükleniyor…</div>}
      {items?.length === 0 && <div className="empty muted">Henüz ev projen yok. Yukarıdan bir ad yazıp “Yeni ev”e dokun; uygulama seni adım adım yönlendirecek.</div>}

      <div className="grid">
        {items?.map((p) => (
          <div className="pcard" key={p.id}>
            <input type="checkbox" className="psel" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} aria-label={p.name + " karşılaştırmaya ekle"} />
            <button className="pthumb" onClick={() => onOpen(p.id)} aria-label={p.name + " projesini aç"}>
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb} alt="" />
              ) : (
                <div className="noimg">
                  <HouseLogo size={44} />
                  <span>3D resim, ilk düzenlemeden sonra çıkar</span>
                </div>
              )}
            </button>
            <div className="pinfo">
              <button className="link" onClick={() => onOpen(p.id)}>
                <b>{p.name}</b>
                <span className="muted">{ago(p.updatedAt)}</span>
              </button>
              {confirmDel === p.id ? (
                <div className="row">
                  <button className="danger" onClick={() => remove(p.id)}>Çöpe at</button>
                  <button onClick={() => setConfirmDel(null)}>Vazgeç</button>
                </div>
              ) : (
                <button className="ghost" onClick={() => setConfirmDel(p.id)} aria-label="Sil">🗑</button>
              )}
            </div>
            <div className="pactions">
              <button onClick={() => duplicate(p)}>📋 Alternatif kopyala</button>
              <button onClick={() => setSumId(p.id)}>📄 Özet</button>
              <button onClick={() => watch(p)}>🎞️ Adım adım izle</button>
            </div>
          </div>
        ))}
      </div>

      {items && items.length >= 2 && sel.length < 2 && <div className="muted small" style={{ margin: "6px 0" }}>Alternatifleri karşılaştırmak için evlerin köşesindeki kutuyu işaretle (en çok 4).</div>}
      {sel.length >= 2 && (
        <div className="cmpbar">
          <button onClick={() => setCmp(true)}>⚖️ {sel.length} evi karşılaştır</button>
        </div>
      )}
      {cmp && <Compare ids={sel} onClose={() => setCmp(false)} onSummary={(id) => { setCmp(false); setSumId(id); }} />}
      {wiz && <Wizard onClose={() => setWiz(false)} onCreated={(id) => { setWiz(false); onOpen(id); }} />}
      {rp && <Replay full={rp.full} name={rp.name} onClose={() => setRp(null)} />}
      {sumId && <Summary id={sumId} onClose={() => { setSumId(null); load(); }} />}

      {!!trash?.length && (
        <div className="trash">
          <button className="link" onClick={() => setShowTrash((v) => !v)}>
            🗑 Çöp kutusu ({trash.length}) {showTrash ? "▴" : "▾"}
          </button>
          {showTrash && (
            <>
              <p className="muted small">Silinen evler 30 gün burada kalır, sonra kendiliğinden silinir.</p>
              {trash.map((t) => (
                <div className="trow" key={t.id}>
                  <div>
                    <b>{t.name}</b>
                    <span className="muted small">{ago(t.deletedAt)} silindi</span>
                  </div>
                  <div className="row">
                    <button onClick={() => restore(t.id)}>↺ Geri getir</button>
                    <button className="ghost" onClick={() => purge(t.id)} title="Kalıcı sil">✕</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
