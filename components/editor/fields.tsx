"use client";
import { useEffect, useState } from "react";
import { fmt } from "@/lib/geo";
import { SWATCHES } from "@/lib/textures";

/** Renk + kaplama seçimi satırı */
export function MatRow({ label, color, tex, opts, onColor, onTex }: { label: string; color: string; tex?: string; opts?: [string, string][]; onColor: (c: string) => void; onTex?: (t: string) => void }) {
  return (
    <div className="mat">
      <div className="matt">
        <span>{label}</span>
        <input type="color" value={color} onChange={(e) => onColor(e.target.value)} aria-label={label + " rengi"} />
      </div>
      {opts && onTex && (
        <select value={tex} onChange={(e) => onTex(e.target.value)} aria-label={label + " kaplaması"}>
          {opts.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
        </select>
      )}
      <div className="sw">
        {SWATCHES.map((c) => (
          <button key={c} style={{ background: c }} className={c.toLowerCase() === color.toLowerCase() ? "on" : ""} onClick={() => onColor(c)} aria-label={c} />
        ))}
      </div>
    </div>
  );
}

/** Sayı alanı: Enter veya odaktan çıkınca kaydeder */
export function NumField({ label, value, onCommit, decimals = 2 }: { label: string; value: number; onCommit: (v: number) => void; decimals?: number }) {
  const [t, setT] = useState(fmt(value, decimals));
  useEffect(() => setT(fmt(value, decimals)), [value, decimals]);
  const commit = () => {
    const v = parseFloat(t.replace(",", "."));
    if (!isFinite(v) || v <= 0 || v > 100000) return setT(fmt(value, decimals));
    if (Math.abs(v - value) < Math.pow(10, -decimals) / 2) return;
    onCommit(v);
  };
  return (
    <label className="edge">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={t}
        onChange={(e) => setT(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

