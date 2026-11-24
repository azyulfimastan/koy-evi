"use client";
import { useState } from "react";
import { VERSION } from "./App";
import { HouseLogo, Landscape } from "./HouseArt";

export default function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setBusy(false);
    if (r.ok) onDone();
    else setErr((await r.json().catch(() => ({}))).error || "Giriş başarısız.");
  }

  return (
    <div className="center loginbg">
      <Landscape />
      <form className="card login" onSubmit={submit}>
        <div className="welcome">3D Mimari Çizim Programına hoş geldiniz</div>
        <div className="brand">
          <HouseLogo size={42} />
          <h1>Köy Evi Tasarım</h1>
        </div>
        <p className="muted">Hayalindeki köy evini çiz, 3D gez, malzemesini hesapla. Devam etmek için şifreni gir.</p>
        <input
          type="password"
          placeholder="Şifre"
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
        />
        {err && <div className="err">{err}</div>}
        <button className="primary" disabled={busy || !pw}>
          {busy ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
        <div className="ver">Köy Evi Tasarım {VERSION}</div>
        <div className="by">Ahmet Kula tarafından geliştirilmiştir</div>
      </form>
    </div>
  );
}
