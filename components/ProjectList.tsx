"use client";
import { useEffect, useState } from "react";
import { VERSION } from "./App";

type Item = { id: string; name: string; updatedAt: number };

export default function ProjectList({ onOpen, onLogout }: { onOpen: (id: string) => void; onLogout: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [name, setName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function load() {
    const r = await fetch("/api/projects");
    if (r.status === 401) return onLogout();
    if (!r.ok) return setErr("Projeler yüklenemedi.");
    setItems(await r.json());
  }
  useEffect(() => {
    load();
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
    <div className="page">
      <header className="top">
        <div>
          <h1>Köy Evi Tasarım</h1>
          <div className="ver">{VERSION}</div>
        </div>
        <button onClick={onLogout}>Çıkış</button>
      </header>

      <form className="card row" onSubmit={create}>
        <input placeholder="Yeni ev adı (örn. Köy evi 1)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary">+ Yeni ev</button>
      </form>

      {err && <div className="err">{err}</div>}
      {items === null && <div className="muted">Yükleniyor…</div>}
      {items?.length === 0 && <div className="muted">Henüz ev projen yok. Yukarıdan bir tane oluştur.</div>}

      <div className="list">
        {items?.map((p) => (
          <div className="card item" key={p.id}>
            <button className="link" onClick={() => onOpen(p.id)}>
              <b>{p.name}</b>
              <span className="muted">{new Date(p.updatedAt).toLocaleString("tr-TR")}</span>
            </button>
            {confirmDel === p.id ? (
              <div className="row">
                <button className="danger" onClick={() => remove(p.id)}>Evet, sil</button>
                <button onClick={() => setConfirmDel(null)}>Vazgeç</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(p.id)} aria-label="Sil">Sil</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
