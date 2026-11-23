"use client";
import { useEffect, useMemo, useState } from "react";
import { summarize } from "@/lib/summary";
import { planSvg } from "@/lib/planSvg";
import { uid } from "@/lib/types";
import { fmt } from "@/lib/geo";

type Proj = { id: string; name: string; data: unknown; thumb?: string };

/** Tek alternatifin aile özeti: 3D resim, planlar, rakamlar, aile oyları, yazdırma */
export default function Summary({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<Proj | null>(null);
  const [err, setErr] = useState("");
  const [who, setWho] = useState("");
  const [score, setScore] = useState(4);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/projects/" + id)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setP)
      .catch(() => setErr("Ev yüklenemedi."));
  }, [id]);

  const calc = useMemo(() => (p ? summarize(p.data) : null), [p]);

  async function saveVotes(votes: { id: string; who: string; score: number; note: string }[]) {
    if (!p || !calc) return;
    setBusy(true);
    const data = { ...calc.full, family: { votes } };
    const r = await fetch("/api/projects/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    setBusy(false);
    if (!r.ok) return setErr("Kaydedilemedi.");
    setP({ ...p, data });
  }

  if (err) return <div className="sumroot"><div className="sumbox"><p className="err">{err}</p><button onClick={onClose}>Kapat</button></div></div>;
  if (!p || !calc) return <div className="sumroot"><div className="sumbox muted">Yükleniyor…</div></div>;
  const { full, sum } = calc;
  const votes = full.family?.votes ?? [];
  const row = (k: string, v: string) => <tr><td>{k}</td><td className="rq">{v}</td></tr>;

  return (
    <div className="sumroot" role="dialog" aria-label="Aile özeti">
      <div className="sumbox">
        <div className="sumbar noprint">
          <b>📄 Aile özeti</b>
          <button className="go" onClick={() => window.print()}>🖨 Yazdır / PDF</button>
          <button onClick={onClose}>✕ Kapat</button>
        </div>
        <h2>{p.name}</h2>
        {p.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img className="sumthumb" src={p.thumb} alt="3D görünüm" />}
        <table className="rtab">
          <tbody>
            {row("Kat sayısı", String(sum.floors))}
            {row("Oda sayısı", `${sum.rooms} (yatak odası ${sum.bedrooms}, banyo ${sum.baths})`)}
            {row("Toplam oda alanı", `${fmt(sum.roomArea, 1)} m²`)}
            {row("Zemin kat alanı", `${fmt(sum.groundArea, 1)} m²`)}
            {sum.plotArea != null && row("Arsa", `${fmt(sum.plotArea, 0)} m²`)}
            {row("Balkon", String(sum.balconies))}
            {row("Çatı", sum.roof)}
            {row("Maliyet tahmini", sum.pricedLines ? `${fmt(sum.cost, 0)} TL (${sum.pricedLines} kalem)` : "Fiyat girilmemiş (Rapor ekranında)")}
          </tbody>
        </table>
        {full.floors.map((fl, i) => (
          <div key={fl.id} className="sumplan">
            <h4>{fl.name}</h4>
            <div dangerouslySetInnerHTML={{ __html: planSvg(full, i) }} />
          </div>
        ))}
        <h3>👨‍👩‍👧 Aile görüşü{sum.avg != null && <span className="avg"> · ortalama {fmt(sum.avg, 1)} / 5 ({sum.votes} kişi)</span>}</h3>
        {votes.length === 0 && <p className="muted small">Henüz görüş yok. Aşağıdan isim, puan ve not ekle.</p>}
        {votes.map((v) => (
          <div className="vote" key={v.id}>
            <b>{v.who}</b> <span className="stars">{"★".repeat(v.score)}{"☆".repeat(5 - v.score)}</span>
            {v.note && <div className="muted small">{v.note}</div>}
            <button className="ghost noprint" onClick={() => saveVotes(votes.filter((q) => q.id !== v.id))} aria-label="Görüşü sil">✕</button>
          </div>
        ))}
        <form
          className="voteform noprint"
          onSubmit={(e) => {
            e.preventDefault();
            if (!who.trim()) return;
            saveVotes([...votes, { id: uid(), who: who.trim(), score, note: note.trim() }]);
            setWho("");
            setNote("");
          }}
        >
          <input placeholder="Adın (örn. Anne)" value={who} onChange={(e) => setWho(e.target.value)} maxLength={40} />
          <select value={score} onChange={(e) => setScore(+e.target.value)} aria-label="Puan">
            {[5, 4, 3, 2, 1].map((n) => (<option key={n} value={n}>{"★".repeat(n)} ({n})</option>))}
          </select>
          <input placeholder="Not (isteğe bağlı)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          <button className="go" disabled={busy || !who.trim()}>+ Görüş ekle</button>
        </form>
      </div>
    </div>
  );
}
