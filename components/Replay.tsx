"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { FullData } from "@/lib/types";
import { flatten } from "@/lib/types";
import { buildReplay, cutAt } from "@/lib/replay";
import { balconyRect } from "@/lib/balcony";
import { drawPlan } from "./editor/drawPlan";
import { endJoins, rasterize, regionAt } from "@/lib/rooms";
import type { Region } from "@/lib/rooms";
import type { Pt } from "@/lib/types";
import type { V3 } from "@/lib/scene3d";

const View3D = dynamic(() => import("./View3D"), { ssr: false, loading: () => <div className="v3 v3load">3D hazırlanıyor…</div> });
const noop = () => {};
type Mode = "2d" | "3d" | "both";

/** Bir evin yapılışını ileri / geri tuşlarıyla adım adım gösterir (salt okunur, hiçbir şeyi değiştirmez) */
export default function Replay({ full, name, onClose, startAt = 0 }: { full: FullData; name: string; onClose: () => void; startAt?: number }) {
  const steps = useMemo(() => buildReplay(full), [full]);
  const [k, setK] = useState(Math.min(startAt, steps.length - 1));
  const [playing, setPlaying] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);
  const [mode, setMode] = useState<Mode>(() => { try { const m = localStorage.getItem("kte_rpmode"); return m === "3d" || m === "both" ? m : "2d"; } catch { return "2d"; } });
  const pickMode = (m: Mode) => { setMode(m); try { localStorage.setItem("kte_rpmode", m); } catch { /* yoksay */ } };
  const s = steps[k];
  const last = steps.length - 1;

  const part = useMemo(() => cutAt(full, s), [full, s]);
  const data = useMemo(() => flatten(part, s.floor), [part, s.floor]);
  const v3 = useMemo<V3>(() => ({ floors: "all", roof: part.roof.kind !== "none", items: true, sec: "none" }), [part.roof.kind]);
  const joins = useMemo(() => endJoins(data.walls), [data.walls]);
  const raster = useMemo(() => rasterize(data.walls), [data.walls]);
  const regions = useMemo(() => {
    const m = new Map<string, Region | null>();
    for (const r of data.rooms) m.set(r.id, regionAt(raster, r.seed));
    return m;
  }, [raster, data.rooms]);
  const roomCanvases = useMemo(() => {
    const m = new Map<string, HTMLCanvasElement>();
    for (const r of data.rooms) {
      const reg = regions.get(r.id);
      if (!reg || reg.open) continue;
      const c = document.createElement("canvas");
      c.width = reg.w;
      c.height = reg.h;
      const g = c.getContext("2d")!;
      const img = g.createImageData(reg.w, reg.h);
      const hex = r.color.replace("#", "");
      const R = parseInt(hex.slice(0, 2), 16), G = parseInt(hex.slice(2, 4), 16), B = parseInt(hex.slice(4, 6), 16);
      for (let i = 0; i < reg.mask.length; i++) if (reg.mask[i]) { img.data[i * 4] = R; img.data[i * 4 + 1] = G; img.data[i * 4 + 2] = B; img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
      m.set(r.id, c);
    }
    return m;
  }, [regions, data.rooms]);

  // görünüm: bitmiş evin tamamına göre sabit (adımlar arasında zıplamaz)
  const view = useMemo(() => {
    const el = wrap.current;
    const W = el?.clientWidth ?? 800, H = el?.clientHeight ?? 500;
    const pts: Pt[] = [...full.plot.points];
    for (const fl of full.floors) {
      fl.walls.forEach((w) => pts.push(w.a, w.b));
      for (const b of fl.balconies ?? []) {
        const w = fl.walls.find((q) => q.id === b.wall);
        if (w) pts.push(...balconyRect(w, b).pts);
      }
    }
    if (pts.length < 2) return { s: 30, ox: W / 2, oy: H / 2 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = W < 600 ? 30 : 60;
    const sc = Math.min((W - pad) / Math.max(maxX - minX, 1), (H - pad) / Math.max(maxY - minY, 1));
    return { s: sc, ox: W / 2 - ((minX + maxX) / 2) * sc, oy: H / 2 - ((minY + maxY) / 2) * sc };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, size]);

  useEffect(() => {
    if (!cv.current || !wrap.current) return;
    drawPlan(cv.current, wrap.current, { data, full: part, fi: s.floor, view, sel: s.sel, hover: null, chain: null, snapInfo: null, tool: "select", pick: null, envPick: null, regions, roomCanvases, joins, placeOn: () => null });
  }, [data, part, s, view, regions, roomCanvases, joins]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(el.clientWidth * 10000 + el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (k >= last) return setPlaying(false);
    const t = window.setTimeout(() => setK((x) => Math.min(last, x + 1)), 900);
    return () => window.clearTimeout(t);
  }, [playing, k, last]);

  const phaseStart = (i: number) => { while (i > 0 && steps[i - 1].phase === steps[i].phase) i--; return i; };
  const prevPhase = () => setK(k > phaseStart(k) ? phaseStart(k) : phaseStart(Math.max(0, phaseStart(k) - 1)));
  const nextPhase = () => { let i = k; while (i < last && steps[i + 1].phase === steps[k].phase) i++; setK(Math.min(last, i + 1)); };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { setPlaying(false); setK((x) => Math.min(last, x + 1)); }
      else if (e.key === "ArrowLeft") { setPlaying(false); setK((x) => Math.max(0, x - 1)); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [last, onClose]);

  return (
    <div className="replay" role="dialog" aria-label="Adım adım izle">
      <div className="rpbar">
        <b>🎞️ {name || "Ev"}: adım adım</b>
        <span className="rpfl">{full.floors[s.floor]?.name}</span>
        <button onClick={onClose}>✕ Kapat</button>
      </div>
      <div className="rpmode" role="tablist" aria-label="Görünüm">
        {([["2d", "2D"], ["3d", "3D"], ["both", "Yan yana"]] as [Mode, string][]).map(([m, l]) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => pickMode(m)}>{l}</button>
        ))}
      </div>
      <div className={"rpbody m" + mode}>
        <div className="rpcv" ref={wrap} style={mode === "3d" ? { display: "none" } : undefined}>
          <canvas ref={cv} />
        </div>
        {mode !== "2d" && (
          <div className="rp3d">
            <View3D full={part} fi={s.floor} v3={v3} name={name} walk={null} pan={false} sel={null} onPick={noop} onExit={noop} />
          </div>
        )}
      </div>
      <div className="rpcard">
        <div className="rpmeta"><span>{s.phase}</span><span>{k + 1} / {steps.length}</span></div>
        <b>{s.title}</b>
        <p>{s.how}</p>
        <input type="range" min={0} max={last} value={k} onChange={(e) => { setPlaying(false); setK(+e.target.value); }} aria-label="Adım" />
        <div className="rprow">
          <button onClick={() => { setPlaying(false); prevPhase(); }} disabled={k === 0} aria-label="Önceki aşama" title="Önceki aşama">⏮</button>
          <button className="big" onClick={() => { setPlaying(false); setK((x) => Math.max(0, x - 1)); }} disabled={k === 0}>◀ Geri</button>
          <button className="big go" onClick={() => { setPlaying(false); setK((x) => Math.min(last, x + 1)); }} disabled={k === last}>İleri ▶</button>
          <button onClick={() => { setPlaying(false); nextPhase(); }} disabled={k === last} aria-label="Sonraki aşama" title="Sonraki aşama">⏭</button>
          <button onClick={() => { if (k >= last) setK(0); setPlaying((v) => !v); }} aria-label="Otomatik oynat">{playing ? "⏸" : "▶ Oynat"}</button>
        </div>
      </div>
    </div>
  );
}
