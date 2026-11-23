"use client";
import { useEffect, useState } from "react";
import { summarize, type Summary } from "@/lib/summary";
import { fmt } from "@/lib/geo";

type Col = { id: string; name: string; thumb?: string; sum: Summary };

/** Seçilen alternatifleri yan yana tabloda karşılaştırır */
export default function Compare({ ids, onClose, onSummary }: { ids: string[]; onClose: () => void; onSummary: (id: string) => void }) {
  const [cols, setCols] = useState<Col[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all(ids.map((id) => fetch("/api/projects/" + id).then((r) => (r.ok ? r.json() : Promise.reject()))))
      .then((ps) => setCols(ps.map((p) => ({ id: p.id, name: p.name, thumb: p.thumb, sum: summarize(p.data).sum }))))
      .catch(() => setErr("Evler yüklenemedi."));
  }, [ids]);

  if (err) return <div className="sumroot"><div className="sumbox"><p className="err">{err}</p><button onClick={onClose}>Kapat</button></div></div>;
  if (!cols) return <div className="sumroot"><div className="sumbox muted">Yükleniyor…</div></div>;

  type R = { k: string; v: (s: Summary) => number | null; f: (s: Summary) => string; best?: "max" | "min" };
  const rows: R[] = [
    { k: "Kat sayısı", v: (s) => s.floors, f: (s) => String(s.floors) },
    { k: "Toplam oda alanı", v: (s) => s.roomArea, f: (s) => `${fmt(s.roomArea, 1)} m²`, best: "max" },
    { k: "Zemin kat alanı", v: (s) => s.groundArea, f: (s) => `${fmt(s.groundArea, 1)} m²` },
    { k: "Oda sayısı", v: (s) => s.rooms, f: (s) => String(s.rooms) },
    { k: "Yatak odası", v: (s) => s.bedrooms, f: (s) => String(s.bedrooms), best: "max" },
    { k: "Banyo", v: (s) => s.baths, f: (s) => String(s.baths) },
    { k: "Balkon", v: (s) => s.balconies, f: (s) => String(s.balconies) },
    { k: "Duvar uzunluğu", v: (s) => s.wallLen, f: (s) => `${fmt(s.wallLen, 0)} m`, best: "min" },
    { k: "Çatı", v: () => null, f: (s) => s.roof },
    { k: "Maliyet tahmini", v: (s) => (s.pricedLines ? s.cost : null), f: (s) => (s.pricedLines ? `${fmt(s.cost, 0)} TL` : "fiyat yok"), best: "min" },
    { k: "Aile puanı", v: (s) => s.avg, f: (s) => (s.avg != null ? `${fmt(s.avg, 1)} / 5 (${s.votes} kişi)` : "oy yok"), best: "max" },
  ];
  const bestIdx = (r: R) => {
    if (!r.best) return -1;
    const vals = cols.map((c) => r.v(c.sum));
    const ok = vals.filter((x): x is number => x != null);
    if (ok.length < 2) return -1;
    const t = r.best === "max" ? Math.max(...ok) : Math.min(...ok);
    if (ok.every((x) => x === t)) return -1;
    return vals.indexOf(t);
  };

  return (
    <div className="sumroot" role="dialog" aria-label="Alternatif karşılaştırma">
      <div className="sumbox wide">
        <div className="sumbar noprint">
          <b>⚖️ Alternatifleri karşılaştır</b>
          <button className="go" onClick={() => window.print()}>🖨 Yazdır / PDF</button>
          <button onClick={onClose}>✕ Kapat</button>
        </div>
        <div className="cmpwrap">
          <table className="cmp">
            <thead>
              <tr>
                <th />
                {cols.map((c) => (
                  <th key={c.id}>
                    {c.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.thumb} alt="" />}
                    <div>{c.name}</div>
                    <button className="noprint" onClick={() => onSummary(c.id)}>📄 Özet</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = bestIdx(r);
                return (
                  <tr key={r.k}>
                    <td className="ck">{r.k}</td>
                    {cols.map((c, i) => (
                      <td key={c.id} className={i === b ? "best" : ""}>{r.f(c.sum)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">Yeşil kutu, o satırda en iyi değer (en geniş alan, en çok yatak odası, en az duvar, en düşük maliyet, en yüksek aile puanı). Maliyet için her evin Rapor ekranında birim fiyatları girmen gerekir; fiyatlar evler arasında aynı olmalı ki kıyas doğru olsun.</p>
      </div>
    </div>
  );
}
