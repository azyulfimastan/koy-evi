"use client";
import { useEffect, useState } from "react";
import type { FullData } from "@/lib/types";

type Step = { title: string; text: string; btn: string; act: "plot" | "wall" | "door" | "room" | "furn" | "3d" | "report"; done: (f: FullData, s: { saw3d: boolean; sawRep: boolean }) => boolean };

const STEPS: Step[] = [
  { title: "1. Arsanı çiz", text: "Arsa aracıyla arsanın köşelerine sırayla dokun. İlk noktaya tekrar dokunarak kapat.", btn: "Arsa aracını seç", act: "plot", done: (f) => f.plot.closed },
  { title: "2. Duvarları çiz", text: "Duvar aracıyla evin köşelerine dokun. Bitirince ilk noktaya dokunup kapat.", btn: "Duvar aracını seç", act: "wall", done: (f) => f.floors.some((l) => l.walls.length > 0) },
  { title: "3. Kapı ve pencere", text: "Kapı veya pencere aracını seç, bir duvara dokun. Boyutunu sağdaki panelden değiştirirsin.", btn: "Kapı aracını seç", act: "door", done: (f) => f.floors.some((l) => l.openings.length > 0) },
  { title: "4. Oda ekle", text: "Oda aracıyla kapalı bir alanın içine dokun; oda alanı otomatik hesaplanır, adını yazarsın.", btn: "Oda aracını seç", act: "room", done: (f) => f.floors.some((l) => l.rooms.length > 0) },
  { title: "5. Eşya yerleştir", text: "Eşya aracını seç, listeden bir eşya al, plana dokun.", btn: "Eşya aracını seç", act: "furn", done: (f) => f.floors.some((l) => l.items.length > 0) },
  { title: "6. 3D'de gör", text: "Evini 3D görüntüle, içine girip gez, renk ve malzeme seç.", btn: "3D görünüme geç", act: "3d", done: (_f, s) => s.saw3d },
  { title: "7. Rapor al", text: "Alanları, malzeme miktarlarını gör ve PDF indir.", btn: "Raporu aç", act: "report", done: (_f, s) => s.sawRep },
];

export default function Guide({ full, is3d, onAct, forceOpen, onForceDone }: { full: FullData; is3d: boolean; onAct: (a: Step["act"]) => void; forceOpen: boolean; onForceDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [saw3d, setSaw3d] = useState(false);
  const [sawRep, setSawRep] = useState(false);

  useEffect(() => {
    let off = false;
    try {
      off = localStorage.getItem("kte_guide") === "off";
    } catch {
      /* yok say */
    }
    const empty = !full.plot.closed || !full.floors.some((l) => l.walls.length > 0);
    setOpen(!off && empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (is3d) setSaw3d(true);
  }, [is3d]);
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setSkipped([]);
      onForceDone();
    }
  }, [forceOpen, onForceDone]);

  if (!open) return null;
  const st = { saw3d, sawRep };
  const idx = STEPS.findIndex((s, i) => !s.done(full, st) && !skipped.includes(i));
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem("kte_guide", "off");
    } catch {
      /* yok say */
    }
  };
  if (idx < 0)
    return (
      <div className="guide">
        <div className="gtxt">
          <b>🎉 Tüm adımlar tamam.</b> İstediğin zaman değişiklik yapmaya devam edebilirsin.
        </div>
        <button onClick={close}>Kapat</button>
      </div>
    );
  const s = STEPS[idx];
  return (
    <div className="guide">
      <div className="gtxt">
        <b>{s.title}</b>
        <span>{s.text}</span>
      </div>
      <div className="gbtn">
        <button
          className="go"
          onClick={() => {
            if (s.act === "report") setSawRep(true);
            onAct(s.act);
          }}
        >
          {s.btn}
        </button>
        <button onClick={() => setSkipped((a) => [...a, idx])}>Atla</button>
        <button onClick={close} aria-label="Yönlendirmeyi kapat">✕</button>
      </div>
      <div className="gdots">
        {STEPS.map((x, i) => (
          <i key={i} className={i === idx ? "cur" : x.done(full, st) ? "ok" : skipped.includes(i) ? "sk" : ""} />
        ))}
      </div>
    </div>
  );
}
