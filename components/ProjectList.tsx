"use client";
import { useEffect, useState } from "react";
import { VERSION } from "./App";
import { HouseLogo } from "./HouseArt";

type Item = { id: string; name: string; updatedAt: number; thumb?: string };

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
      body: JSON.stringify({ name }),
    });
    if (!r.ok) return setErr("Proje oluşturulamadı.");
    const p = await r.json();
    onOpen(p.id);
  }

  async function remove(id: string) {
    await fetch("/api/projects/" + id, { method: "DELETE" });
    setConfirmDel(null);
    load();
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

      <form className="newp" onSubmit={create}>
        <input placeholder="Yeni ev adı (örn. Köy evi 1)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary">+ Yeni ev</button>
      </form>

      {err && <div className="err">{err}</div>}
      {items === null && <div className="muted">Yükleniyor…</div>}
      {items?.length === 0 && <div className="empty muted">Henüz ev projen yok. Yukarıdan bir ad yazıp “Yeni ev”e dokun; uygulama seni adım adım yönlendirecek.</div>}

      <div className="grid">
        {items?.map((p) => (
          <div className="pcard" key={p.id}>
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
                  <button className="danger" onClick={() => remove(p.id)}>Evet, sil</button>
                  <button onClick={() => setConfirmDel(null)}>Vazgeç</button>
                </div>
              ) : (
                <button className="ghost" onClick={() => setConfirmDel(p.id)} aria-label="Sil">🗑</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
