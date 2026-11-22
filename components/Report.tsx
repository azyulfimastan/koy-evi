"use client";
import { useMemo, useState } from "react";
import type { FullData } from "@/lib/types";
import { computeReport } from "@/lib/quantities";
import { makePdf } from "@/lib/report";
import { fmt } from "@/lib/geo";

export default function Report({ full, name, onClose }: { full: FullData; name: string; onClose: () => void }) {
  const rep = useMemo(() => computeReport(full), [full]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pdf = async () => {
    setBusy(true);
    setErr("");
    try {
      const blob = await makePdf(full, name || "Köy evi");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(name || "koy-evi").replace(/[^\p{L}\p{N}]+/gu, "-")}-rapor.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      setErr("PDF oluşturulamadı: " + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  };

  const tbl = (head: string, rows: { name: string; qty: number; unit: string; note?: string }[]) =>
    rows.length ? (
      <section className="rsec">
        <h3>{head}</h3>
        <table className="rtab">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.name}
                  {r.note && <div className="rnote">{r.note}</div>}
                </td>
                <td className="rq">
                  {fmt(r.qty, Number.isInteger(r.qty) ? 0 : 2)} {r.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ) : null;

  return (
    <div className="rpt">
      <div className="rbar">
        <b>Rapor ve malzeme</b>
        <button className="rpdf" onClick={pdf} disabled={busy}>
          {busy ? "Hazırlanıyor…" : "⬇ PDF indir"}
        </button>
        <button onClick={onClose}>✕ Kapat</button>
      </div>
      <div className="rbody">
        {err && <p className="rerr">{err}</p>}
        <section className="rsec">
          <h3>Özet</h3>
          <table className="rtab">
            <tbody>
              {rep.plotArea != null && (
                <tr><td>Arsa alanı</td><td className="rq">{fmt(rep.plotArea, 1)} m²</td></tr>
              )}
              <tr><td>Zemin kat oda alanı</td><td className="rq">{fmt(rep.footprint, 1)} m²</td></tr>
              <tr><td>Tüm katlarda oda alanı</td><td className="rq">{fmt(rep.totalArea, 1)} m²</td></tr>
              <tr><td>Kat sayısı</td><td className="rq">{full.floors.length}</td></tr>
            </tbody>
          </table>
        </section>
        {rep.rooms.length > 0 && (
          <section className="rsec">
            <h3>Odalar</h3>
            <table className="rtab">
              <tbody>
                {rep.rooms.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.name}
                      <div className="rnote">{r.floor}</div>
                    </td>
                    <td className="rq">{fmt(r.area, 2)} m²</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {tbl("Malzeme miktarı (yaklaşık)", rep.lines)}
        {tbl("Kapı ve pencereler", rep.openings)}
        {tbl("Eşyalar", rep.items)}
        <p className="rnote">Miktarlar plandan otomatik hesaplanır ve yaklaşıktır; fire payı %{rep.waste * 100} eklenmiştir.</p>
      </div>
    </div>
  );
}
