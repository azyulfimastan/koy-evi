"use client";
import { useEffect, useRef, useState } from "react";
import type { FullData } from "@/lib/types";
import type { PhotoCam, PhotoJob } from "@/lib/photo";

const QUAL = [
  { k: 64, t: "Taslak" },
  { k: 256, t: "İyi" },
  { k: 1024, t: "Mükemmel" },
];

function dur(ms: number) {
  if (!isFinite(ms) || ms <= 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk ${s % 60 ? (s % 60) + " sn" : ""}`.trim();
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

export default function Photo({ full, fi, cam, inside, aspect, name, onClose }: { full: FullData; fi: number; cam: PhotoCam; inside: { floor: number } | null; aspect: number; name: string; onClose: () => void }) {
  const coarse = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  const RES = coarse ? [{ k: 1280, t: "Telefon (1280)" }, { k: 1920, t: "HD (1920)" }] : [{ k: 1920, t: "HD (1920)" }, { k: 2560, t: "2K (2560)" }, { k: 3840, t: "4K (3840)" }];
  const [res, setRes] = useState(() => {
    try {
      const t = +(localStorage.getItem("kte_photo_res") ?? 0); // otomatik testler için küçük boyut
      if (t > 0) return t;
    } catch {
      /* yok say */
    }
    return RES[0].k;
  });
  const [target, setTarget] = useState(256);
  const [denoise, setDenoise] = useState(true);
  const [run, setRun] = useState(true);
  const [st, setSt] = useState({ samples: 0, ms: 0, ready: false, err: "" });
  const cv = useRef<HTMLCanvasElement>(null);
  const job = useRef<PhotoJob | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const targetRef = useRef(target);
  targetRef.current = target;

  const a = Math.max(0.5, Math.min(2, aspect));
  const W = a >= 1 ? res : Math.round(res * a);
  const H = a >= 1 ? Math.round(res / a) : res;

  useEffect(() => {
    let dead = false;
    let raf = 0;
    let lastUi = 0;
    setSt({ samples: 0, ms: 0, ready: false, err: "" });
    const c = cv.current!;
    // yeni WebGL bağlamı için tuvali yenile
    const fresh = c.cloneNode() as HTMLCanvasElement;
    c.replaceWith(fresh);
    (cv as React.MutableRefObject<HTMLCanvasElement>).current = fresh;
    fresh.width = W;
    fresh.height = H;
    const t = setTimeout(async () => {
      try {
        const { startPhoto } = await import("@/lib/photo");
        if (dead) return;
        const j = await startPhoto({ full, fi, cam, inside, canvas: fresh, width: W, height: H, denoise });
        if (dead) {
          j.dispose();
          return;
        }
        job.current = j;
        const loop = (now: number) => {
          if (dead) return;
          if (runRef.current && j.samples() < targetRef.current) j.step();
          if (now - lastUi > 300) {
            lastUi = now;
            setSt({ samples: Math.floor(j.samples()), ms: j.msPerSample(), ready: j.ready(), err: "" });
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        setSt((q) => ({ ...q, err: "Bu cihazda fotoğraf modu başlatılamadı: " + (e instanceof Error ? e.message : String(e)) }));
      }
    }, 60);
    return () => {
      dead = true;
      clearTimeout(t);
      cancelAnimationFrame(raf);
      job.current?.dispose();
      job.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res]);

  useEffect(() => {
    job.current?.setDenoise(denoise);
  }, [denoise]);

  const done = st.samples >= target;
  const pct = Math.min(100, Math.round((st.samples / target) * 100));
  const left = (target - st.samples) * st.ms;

  function download() {
    const c = cv.current;
    if (!c) return;
    c.toBlob((b) => {
      if (!b) return;
      const a2 = document.createElement("a");
      a2.href = URL.createObjectURL(b);
      a2.download = (name || "ev").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") + `-foto-${W}x${H}.png`;
      document.body.appendChild(a2);
      a2.click();
      a2.remove();
      setTimeout(() => URL.revokeObjectURL(a2.href), 5000);
    }, "image/png");
  }

  return (
    <div className="photo">
      <div className="pbar">
        <b>📸 Gerçekçi fotoğraf</b>
        <button className="x" onClick={onClose} aria-label="Kapat">✕</button>
      </div>
      <div className="pview">
        <canvas ref={cv} />
        {!st.ready && !st.err && <div className="pwait">Işık hesaplanmaya hazırlanıyor…<br /><span>(ilk açılış biraz sürebilir)</span></div>}
        {st.err && <div className="pwait err">{st.err}</div>}
      </div>
      <div className="pctl">
        <div className="prog">
          <div className="bar"><i style={{ width: pct + "%" }} /></div>
          <span>
            {done ? "✅ Bitti" : st.ready ? `${pct}% · ${st.samples}/${target} geçiş` : "Hazırlanıyor"}
            {!done && st.ready && st.samples >= 3 && left > 0 ? ` · ~${dur(left)} kaldı` : ""}
          </span>
        </div>
        <div className="prow">
          <label>
            Kalite
            <select value={target} onChange={(e) => setTarget(+e.target.value)}>
              {QUAL.map((q) => (
                <option key={q.k} value={q.k}>{q.t}</option>
              ))}
            </select>
          </label>
          <label>
            Boyut
            <select value={res} onChange={(e) => setRes(+e.target.value)}>
              {RES.map((q) => (
                <option key={q.k} value={q.k}>{q.t}</option>
              ))}
            </select>
          </label>
          <label className="chk"><input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} /> Kumlanmayı azalt</label>
        </div>
        <div className="prow">
          {!done && <button onClick={() => setRun((v) => !v)}>{run ? "⏸ Duraklat" : "▶ Devam"}</button>}
          <button className="primary" onClick={download} disabled={!st.ready}>⬇ Resmi indir ({W}×{H})</button>
        </div>
        <div className="muted small">Işık her yüzeyden sekerek hesaplanır; resim zamanla netleşir. İstediğin an indirebilirsin. Ekranı kapatma.</div>
      </div>
    </div>
  );
}
