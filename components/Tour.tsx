"use client";
import { useEffect, useState } from "react";

export type DemoKind = "plot" | "walls" | "door" | "window" | "room" | "furn";
type Step = { title: string; text: string; btn?: string; css?: string; tool?: string; demo?: DemoKind; demoLabel?: string };

const STEPS: Step[] = [
  { title: "Hoş geldin 👋", text: "Bu kısa demo evin nasıl çizileceğini adım adım gösterir. Her adımda parlak çerçeveli düğmeyi görürsün. “Örnek uygula” dersen o adımı plana senin yerine yapar; hepsi “Geri al” ile silinir." },
  { title: "1. Arsa", btn: "Arsa", tool: "plot", demo: "plot", demoLabel: "Örnek arsa çiz", text: "Önce arsanın köşelerine sırayla dokun, ilk noktaya tekrar dokunup kapat. Ev bu alanın içine çizilir." },
  { title: "2. Duvar", btn: "Duvar", tool: "wall", demo: "walls", demoLabel: "Örnek duvarları çiz", text: "Köşelere sırayla dokun. Çizerken çizgi yatay veya dikeyse kendiliğinden kilitlenir (Yatay / 90° yazısı). İstediğin ölçü için rakam yaz, mesela 5,5. Bitirmek için ilk noktaya dokun." },
  { title: "3. Kapı", btn: "Kapı", tool: "door", demo: "door", demoLabel: "Örnek kapı koy", text: "Kapı aracını seç, bir duvara dokun. Sonra kapıya dokunup sağ panelden genişlik ve yüksekliğini değiştirebilirsin." },
  { title: "4. Pencere", btn: "Pencere", tool: "window", demo: "window", demoLabel: "Örnek pencere koy", text: "Aynı şekilde bir duvara dokun. “Yerden yükseklik” pencerenin altlığıdır." },
  { title: "5. Oda", btn: "Oda", tool: "room", demo: "room", demoLabel: "Örnek oda oluştur", text: "Kapalı bir alanın içine dokun, oda ve alanı otomatik hesaplanır. Panelden adını, zemin rengini ve kaplamasını seç." },
  { title: "6. Eşya", btn: "Eşya", tool: "furn", demo: "furn", demoLabel: "Örnek kanepe koy", text: "Listeden kategori ve eşya seç, sonra planda yerine dokun. Eşyayı seçip sürükleyerek taşırsın." },
  { title: "7. Seç ve düzenle", btn: "Seç", tool: "select", text: "Seç aracıyla bir duvara, kapıya, odaya ya da eşyaya dokun; sağ panelde (telefonda alttaki panelde) ayarları çıkar. Duvara çift tıklayarak ölçüsünü yazabilirsin." },
  { title: "8. İkinci kat", css: ".floors .add", text: "+ Kat ile yeni kat ekle. “Alt katın duvarlarını kopyala” ile dış duvarları tek hamlede getir. Katlar arasında kat adlarına dokunarak geçersin." },
  { title: "9. Merdiven", btn: "Merdiven", tool: "stair", text: "Alt katta merdiven koy: düz, L, U veya sarmal. Basamak sayısı kat yüksekliğinden hesaplanır." },
  { title: "10. Balkon", btn: "Balkon", tool: "balcony", text: "Üst katta bir duvarın dışına dokun: balkon çıkar. Genişlik, çıkma ve korkuluk türünü panelden seç. Kapısı için aynı duvara Kapı aracıyla kapı ekle." },
  { title: "11. Yapı: temel, şap, direk", btn: "Yapı", tool: "build", text: "Temel türü ve derinliği, şap, kat betonu ve direkleri buradan ayarlarsın. Direk koymak için plana dokun." },
  { title: "12. Çatı (isteğe bağlı)", btn: "Çatı", tool: "roof", text: "Çatı türünü seç; “Çatı yok” seçersen 3D'de çatı görünmez. Eğim, saçak ve kaplama burada." },
  { title: "13. 3D görünüm", css: ".floors .v3btn:not(.rep):not(.gd)", text: "3D'de ev içi, dışı ve inşaat aşamaları var: kaydırıcıyla kazı, temel, şap, direk, duvar ve betonu sırayla izle. Bir duvara dokununca turuncu ↕ düğmesini yukarı çekerek yüksekliğini değiştirirsin. Fare orta tuşu basılı tutarak etrafında dönersin." },
  { title: "14. Rapor", css: ".floors .v3btn.rep", text: "Alanlar, malzeme miktarları, temel ve beton hesabı, PDF indirme burada." },
  { title: "15. Yedek", css: ".bar .bak", text: "Evini dosya olarak indir, eski sürümlere dön. Her değişiklik otomatik kaydedilir." },
  { title: "Hazırsın 🎉", text: "İstediğin zaman bu demoyu 🎬 düğmesinden tekrar açabilirsin. Takıldığın bir yer olursa bana yaz." },
];

function findTarget(s: Step): HTMLElement | null {
  if (s.css) return document.querySelector<HTMLElement>(s.css);
  if (s.btn) {
    const bs = Array.from(document.querySelectorAll<HTMLElement>(".tools.modes button"));
    return bs.find((b) => b.textContent?.trim() === s.btn) ?? null;
  }
  return null;
}

export default function Tour({ onClose, onStep, onDemo }: { onClose: () => void; onStep: (tool?: string) => void; onDemo: (k: DemoKind) => string }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [msg, setMsg] = useState("");
  const s = STEPS[i];

  useEffect(() => {
    setMsg("");
    if (s.tool) onStep(s.tool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    const upd = () => {
      const el = findTarget(s);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      el.scrollIntoView?.({ block: "nearest", inline: "center" });
      setRect({ x: r.left - 5, y: r.top - 5, w: r.width + 10, h: r.height + 10 });
    };
    upd();
    const t = window.setInterval(upd, 250);
    return () => window.clearInterval(t);
  }, [s]);

  const last = i === STEPS.length - 1;
  return (
    <div className="tour" role="dialog" aria-label="Kullanım demosu">
      {rect && <div className="tspot" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
      <div className="tcard">
        <div className="tdots">{STEPS.map((_, k) => <i key={k} className={k === i ? "cur" : k < i ? "ok" : ""} />)}</div>
        <b>{s.title}</b>
        <p>{s.text}</p>
        {msg && <p className="tmsg">{msg}</p>}
        <div className="trow">
          {s.demo && <button className="go" onClick={() => setMsg(onDemo(s.demo!))}>▶ {s.demoLabel}</button>}
          <button onClick={() => setI((k) => Math.max(0, k - 1))} disabled={i === 0}>◀</button>
          <button className={s.demo ? "" : "go"} onClick={() => (last ? onClose() : setI((k) => k + 1))}>{last ? "Bitir" : "İleri ▶"}</button>
          <button onClick={onClose} aria-label="Demoyu kapat">✕</button>
        </div>
      </div>
    </div>
  );
}
