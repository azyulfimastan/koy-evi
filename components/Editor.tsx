"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Plot, Pt } from "@/lib/store";
import { area, bounds, dist, fmt, perimeter, round3, setEdgeLength, snapTo } from "@/lib/geo";
import { VERSION } from "./App";

type View = { s: number; ox: number; oy: number }; // ekran = dünya*s + o (dünya: metre)
type Saved = "saved" | "saving" | "error";

const EMPTY: Plot = { points: [], closed: false };
const clone = (p: Plot): Plot => ({ closed: p.closed, points: p.points.map((q) => ({ ...q })) });

export default function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  const [name, setName] = useState("");
  const [plot, setPlot] = useState<Plot>(EMPTY);
  const [snap, setSnap] = useState(0.1);
  const [view, setView] = useState<View>({ s: 40, ox: 0, oy: 0 });
  const [sel, setSel] = useState<number | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [saved, setSaved] = useState<Saved>("saved");
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState(true);
  const [, bump] = useState(0);

  const past = useRef<Plot[]>([]);
  const future = useRef<Plot[]>([]);
  const plotRef = useRef(plot);
  plotRef.current = plot;
  const viewRef = useRef(view);
  viewRef.current = view;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // ---------- yükle ----------
  useEffect(() => {
    let dead = false;
    fetch("/api/projects/" + id)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p) => {
        if (dead) return;
        setName(p.name);
        setPlot(p.data?.plot ?? EMPTY);
        setSnap(typeof p.data?.snap === "number" ? p.data.snap : 0.1);
        setLoaded(true);
        requestAnimationFrame(() => fit(p.data?.plot ?? EMPTY));
      })
      .catch(() => {
        if (!dead) onBack();
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---------- otomatik kaydet ----------
  const first = useRef(true);
  useEffect(() => {
    if (!loaded) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved("saving");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/projects/" + id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, data: { plot, snap } }),
        });
        setSaved(r.ok ? "saved" : "error");
      } catch {
        setSaved("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [plot, snap, name, loaded, id]);

  // ---------- geçmiş ----------
  const commit = useCallback((before: Plot) => {
    past.current.push(clone(before));
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    bump((n) => n + 1);
  }, []);
  const apply = (next: Plot) => {
    commit(plotRef.current);
    setPlot(next);
  };
  const undo = useCallback(() => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(clone(plotRef.current));
    setPlot(p);
    setSel(null);
    bump((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const p = future.current.pop();
    if (!p) return;
    past.current.push(clone(plotRef.current));
    setPlot(p);
    setSel(null);
    bump((n) => n + 1);
  }, []);

  // ---------- görünüm ----------
  function fit(pl: Plot = plotRef.current) {
    const el = wrap.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (pl.points.length < 2) {
      setView({ s: 40, ox: W / 2 - 15 * 40, oy: H / 2 - 10 * 40 });
      return;
    }
    const b = bounds(pl.points);
    const w = Math.max(b.maxX - b.minX, 1);
    const h = Math.max(b.maxY - b.minY, 1);
    const s = Math.min((W - 140) / w, (H - 140) / h);
    setView({ s, ox: W / 2 - ((b.minX + b.maxX) / 2) * s, oy: H / 2 - ((b.minY + b.maxY) / 2) * s });
  }

  const toWorld = (sx: number, sy: number): Pt => ({
    x: (sx - viewRef.current.ox) / viewRef.current.s,
    y: (sy - viewRef.current.oy) / viewRef.current.s,
  });
  const toScreen = (p: Pt) => ({ x: p.x * viewRef.current.s + viewRef.current.ox, y: p.y * viewRef.current.s + viewRef.current.oy });

  // ---------- çizim ----------
  const draw = useCallback(() => {
    const c = cv.current;
    const el = wrap.current;
    if (!c || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
      c.style.width = W + "px";
      c.style.height = H + "px";
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#f6f3ea";
    g.fillRect(0, 0, W, H);
    const { s, ox, oy } = view;

    // ızgara
    const steps = [0.1, 0.5, 1, 5, 10, 50, 100, 500];
    const minor = steps.find((m) => m * s >= 12) ?? 500;
    const major = minor * 10;
    const x0 = Math.floor((0 - ox) / s / minor) * minor;
    const x1 = Math.ceil((W - ox) / s / minor) * minor;
    const y0 = Math.floor((0 - oy) / s / minor) * minor;
    const y1 = Math.ceil((H - oy) / s / minor) * minor;
    const isMajor = (v: number) => Math.abs(Math.round(v / major) * major - v) < minor / 100;
    g.lineWidth = 1;
    for (let x = x0; x <= x1 + 1e-9; x += minor) {
      const px = Math.round(x * s + ox) + 0.5;
      g.strokeStyle = isMajor(x) ? "#cfc8b4" : "#e6e1d2";
      g.beginPath();
      g.moveTo(px, 0);
      g.lineTo(px, H);
      g.stroke();
    }
    for (let y = y0; y <= y1 + 1e-9; y += minor) {
      const py = Math.round(y * s + oy) + 0.5;
      g.strokeStyle = isMajor(y) ? "#cfc8b4" : "#e6e1d2";
      g.beginPath();
      g.moveTo(0, py);
      g.lineTo(W, py);
      g.stroke();
    }

    const pts = plot.points;
    const sp = pts.map((p) => ({ x: p.x * s + ox, y: p.y * s + oy }));

    // arsa dolgusu
    if (pts.length >= 3 && plot.closed) {
      g.beginPath();
      sp.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fillStyle = "rgba(122,160,92,0.22)";
      g.fill();
    }
    // çizgiler
    if (pts.length >= 2 || (pts.length === 1 && hover)) {
      g.beginPath();
      sp.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (plot.closed) g.closePath();
      g.strokeStyle = "#3f6b2a";
      g.lineWidth = 2.5;
      g.stroke();
    }
    // çizim sırasında hayalet çizgi
    if (!plot.closed && pts.length >= 1 && hover) {
      const last = sp[sp.length - 1];
      const h = toScreen(hover);
      g.setLineDash([6, 5]);
      g.strokeStyle = "#3f6b2a";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(last.x, last.y);
      g.lineTo(h.x, h.y);
      g.stroke();
      g.setLineDash([]);
      label(g, fmt(dist(pts[pts.length - 1], hover)) + " m", (last.x + h.x) / 2, (last.y + h.y) / 2, "#555");
    }
    // kenar yazıları
    const ne = plot.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < ne; i++) {
      const a = sp[i];
      const b = sp[(i + 1) % sp.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 50) continue;
      label(g, fmt(dist(pts[i], pts[(i + 1) % pts.length])) + " m", (a.x + b.x) / 2, (a.y + b.y) / 2, "#2c4a1c");
    }
    // orta nokta "+" tutamaçları
    if (plot.closed) {
      for (let i = 0; i < sp.length; i++) {
        const a = sp[i];
        const b = sp[(i + 1) % sp.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 40) continue;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.strokeStyle = "#8a9f7b";
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(mx, my + 16, 8, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = "#3f6b2a";
        g.font = "bold 13px system-ui";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("+", mx, my + 16.5);
      }
    }
    // köşeler
    sp.forEach((p, i) => {
      g.beginPath();
      g.arc(p.x, p.y, i === sel ? 9 : 7, 0, Math.PI * 2);
      g.fillStyle = i === sel ? "#d9822b" : i === 0 && !plot.closed ? "#c2410c" : "#fff";
      g.fill();
      g.strokeStyle = "#3f6b2a";
      g.lineWidth = 2.5;
      g.stroke();
    });

    // ölçek çubuğu
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const m = nice.find((n) => n * s >= 80) ?? 500;
    const bx = 16;
    const by = H - 20;
    g.strokeStyle = "#333";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(bx, by - 5);
    g.lineTo(bx, by);
    g.lineTo(bx + m * s, by);
    g.lineTo(bx + m * s, by - 5);
    g.stroke();
    g.fillStyle = "#333";
    g.font = "12px system-ui";
    g.textAlign = "left";
    g.textBaseline = "bottom";
    g.fillText(m >= 1 ? `${m} m` : `${m * 100} cm`, bx + 4, by - 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot, view, sel, hover]);

  useEffect(() => {
    draw();
  }, [draw]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // ---------- fare / dokunma ----------
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<
    | null
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean }
    | { kind: "vtx"; i: number; before: Plot }
    | { kind: "pinch"; d: number; s: number; cx: number; cy: number }
  >(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const sn = (p: Pt): Pt => ({ x: round3(snapTo(p.x, snapRef.current)), y: round3(snapTo(p.y, snapRef.current)) });

  function hitVertex(sx: number, sy: number) {
    const pts = plotRef.current.points;
    const R = ptrs.current.size && matchMedia("(pointer: coarse)").matches ? 22 : 13;
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = toScreen(pts[i]);
      if (Math.hypot(p.x - sx, p.y - sy) <= R) return i;
    }
    return -1;
  }
  function hitMid(sx: number, sy: number) {
    const pts = plotRef.current.points;
    for (let i = 0; i < pts.length; i++) {
      const a = toScreen(pts[i]);
      const b = toScreen(pts[(i + 1) % pts.length]);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 40) continue;
      if (Math.hypot((a.x + b.x) / 2 - sx, (a.y + b.y) / 2 + 16 - sy) <= 14) return i;
    }
    return -1;
  }

  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      drag.current = {
        kind: "pinch",
        d: Math.hypot(a.x - b.x, a.y - b.y),
        s: viewRef.current.s,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      return;
    }
    const pl = plotRef.current;
    if (pl.closed) {
      const vi = hitVertex(p.x, p.y);
      if (vi >= 0) {
        setSel(vi);
        drag.current = { kind: "vtx", i: vi, before: clone(pl) };
        return;
      }
      const mi = hitMid(p.x, p.y);
      if (mi >= 0) {
        const a = pl.points[mi];
        const b = pl.points[(mi + 1) % pl.points.length];
        const before = clone(pl);
        const pts = pl.points.map((q) => ({ ...q }));
        pts.splice(mi + 1, 0, sn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
        setPlot({ ...pl, points: pts });
        setSel(mi + 1);
        drag.current = { kind: "vtx", i: mi + 1, before };
        return;
      }
    }
    drag.current = { kind: "pan", sx: p.x, sy: p.y, ox: viewRef.current.ox, oy: viewRef.current.oy, moved: false };
  }

  function onMove(e: React.PointerEvent) {
    const p = local(e);
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, p);
    const d = drag.current;
    if (!d) {
      if (!plotRef.current.closed) setHover(sn(toWorld(p.x, p.y)));
      return;
    }
    if (d.kind === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const nd = Math.hypot(a.x - b.x, a.y - b.y);
      const ns = Math.min(2000, Math.max(2, d.s * (nd / d.d)));
      const v = viewRef.current;
      const wx = (d.cx - v.ox) / v.s;
      const wy = (d.cy - v.oy) / v.s;
      const ncx = (a.x + b.x) / 2;
      const ncy = (a.y + b.y) / 2;
      setView({ s: ns, ox: ncx - wx * ns, oy: ncy - wy * ns });
      d.cx = ncx;
      d.cy = ncy;
      d.d = nd;
      d.s = ns;
    } else if (d.kind === "pan") {
      const dx = p.x - d.sx;
      const dy = p.y - d.sy;
      if (Math.hypot(dx, dy) > 5) d.moved = true;
      if (d.moved) setView({ ...viewRef.current, ox: d.ox + dx, oy: d.oy + dy });
      if (!plotRef.current.closed) setHover(sn(toWorld(p.x, p.y)));
    } else if (d.kind === "vtx") {
      const w = sn(toWorld(p.x, p.y));
      const pl = plotRef.current;
      const pts = pl.points.map((q) => ({ ...q }));
      pts[d.i] = w;
      setPlot({ ...pl, points: pts });
    }
  }

  function onUp(e: React.PointerEvent) {
    const p = local(e);
    const d = drag.current;
    ptrs.current.delete(e.pointerId);
    if (d?.kind === "pinch") {
      drag.current = null;
      return;
    }
    drag.current = null;
    if (d?.kind === "vtx") {
      const now = plotRef.current;
      if (JSON.stringify(now.points) !== JSON.stringify(d.before.points)) commit(d.before);
      return;
    }
    if (d?.kind === "pan" && !d.moved) {
      const pl = plotRef.current;
      if (pl.closed) {
        setSel(null);
        return;
      }
      // çizim modu: tıklayarak köşe ekle
      const w = sn(toWorld(p.x, p.y));
      if (pl.points.length >= 3) {
        const f = toScreen(pl.points[0]);
        if (Math.hypot(f.x - p.x, f.y - p.y) <= 14) {
          apply({ ...pl, closed: true });
          setHover(null);
          return;
        }
      }
      const last = pl.points[pl.points.length - 1];
      if (last && dist(last, w) < 1e-6) return;
      apply({ ...pl, points: [...pl.points.map((q) => ({ ...q })), w] });
    }
  }

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const v = viewRef.current;
      const ns = Math.min(2000, Math.max(2, v.s * Math.exp(-e.deltaY * 0.0015)));
      const wx = (mx - v.ox) / v.s;
      const wy = (my - v.oy) / v.s;
      setView({ s: ns, ox: mx - wx * ns, oy: my - wy * ns });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loaded]);

  // klavye
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel !== null) {
        delVertex();
      } else if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, undo, redo]);

  // ---------- eylemler ----------
  function delVertex() {
    const pl = plotRef.current;
    if (sel === null) return;
    if (pl.closed && pl.points.length <= 3) return;
    const pts = pl.points.filter((_, i) => i !== sel);
    apply({ ...pl, points: pts });
    setSel(null);
  }
  function closeShape() {
    if (plot.points.length >= 3) {
      apply({ ...plot, closed: true });
      setHover(null);
    }
  }
  function redraw() {
    apply(clone(EMPTY));
    setSel(null);
  }
  function undoLast() {
    // çizim modunda son noktayı geri al
    undo();
  }
  function editEdge(i: number, text: string) {
    const v = parseFloat(text.replace(",", "."));
    if (!isFinite(v) || v <= 0 || v > 5000) return;
    const pl = plotRef.current;
    if (Math.abs(dist(pl.points[i], pl.points[(i + 1) % pl.points.length]) - v) < 0.0005) return;
    apply({ ...pl, points: setEdgeLength(pl.points, i, round3(v)) });
  }

  const n = plot.points.length;
  const drawing = !plot.closed;
  const stat =
    saved === "saving" ? "Kaydediliyor…" : saved === "error" ? "Kaydedilemedi!" : "Kaydedildi ✓";

  return (
    <div className="editor">
      <div className="bar">
        <button onClick={onBack}>← Evlerim</button>
        <input className="nm" value={name} onChange={(e) => setName(e.target.value)} aria-label="Ev adı" />
        <span className={"stat " + saved}>{stat}</span>
        <span className="ver">Köy Evi Tasarım {VERSION}</span>
      </div>

      <div className="tools">
        <button onClick={undo} disabled={!past.current.length}>↶ Geri al</button>
        <button onClick={redo} disabled={!future.current.length}>↷ İleri al</button>
        <label className="snap">
          <span className="lbl">Izgara</span>
          <select value={snap} onChange={(e) => setSnap(parseFloat(e.target.value))}>
            <option value={0}>Kapalı</option>
            <option value={0.05}>5 cm</option>
            <option value={0.1}>10 cm</option>
            <option value={0.25}>25 cm</option>
            <option value={0.5}>50 cm</option>
            <option value={1}>1 m</option>
          </select>
        </label>
        <button onClick={() => fit()}>Sığdır</button>
        <button onClick={redraw} disabled={n === 0}>Arsayı sil</button>
        <button className="onlym" onClick={() => setPanel((v) => !v)}>
          {panel ? "Panel ▾" : "Panel ▴"}
        </button>
      </div>

      <div className="stage">
        <div className="cv" ref={wrap}>
          <canvas
            ref={cv}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => !drag.current && setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="hint">
            {drawing
              ? n === 0
                ? "Arsanın köşelerine sırayla tıkla. Fare tekerleği ile yakınlaş."
                : n < 3
                ? "Köşe eklemeye devam et."
                : "İlk (turuncu) noktaya tıkla ya da “Arsayı tamamla”."
              : "Köşeleri sürükle, kenarın altındaki + ile yeni köşe ekle."}
          </div>
        </div>

        {panel && (
          <aside className="side">
            <h3>Arsa</h3>
            {drawing ? (
              <>
                <div className="muted">Çizim sürüyor · {n} köşe</div>
                <div className="row">
                  <button onClick={undoLast} disabled={n === 0}>Son noktayı geri al</button>
                  <button className="primary" onClick={closeShape} disabled={n < 3}>
                    Arsayı tamamla
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="stats">
                  <div>
                    <span>Alan</span>
                    <b>{fmt(area(plot.points))} m²</b>
                  </div>
                  <div>
                    <span>Çevre</span>
                    <b>{fmt(perimeter(plot.points, true))} m</b>
                  </div>
                </div>
                <h4>Kenar uzunlukları (m)</h4>
                <div className="edges">
                  {plot.points.map((p, i) => (
                    <EdgeRow
                      key={i + ":" + plot.points.length}
                      i={i}
                      value={dist(p, plot.points[(i + 1) % n])}
                      onCommit={(t) => editEdge(i, t)}
                    />
                  ))}
                </div>
                <div className="muted small">
                  Bir kenarın uzunluğunu değiştirince o kenarın sonundaki köşe kayar.
                </div>
                {sel !== null && (
                  <button className="danger" onClick={delVertex} disabled={n <= 3}>
                    Seçili köşeyi sil
                  </button>
                )}
              </>
            )}
            <div className="ver pushb">Köy Evi Tasarım {VERSION}</div>
          </aside>
        )}
      </div>
    </div>
  );
}

function EdgeRow({ i, value, onCommit }: { i: number; value: number; onCommit: (t: string) => void }) {
  const [t, setT] = useState(fmt(value));
  useEffect(() => setT(fmt(value)), [value]);
  return (
    <label className="edge">
      <span>Kenar {i + 1}</span>
      <input
        inputMode="decimal"
        value={t}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => onCommit(t)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  g.font = "600 12px system-ui";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const w = g.measureText(text).width + 10;
  g.fillStyle = "rgba(255,255,255,0.88)";
  g.fillRect(x - w / 2, y - 10, w, 20);
  g.fillStyle = color;
  g.fillText(text, x, y);
}
