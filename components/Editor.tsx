"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatItem, FullData, Item, Opening, PlanData, Pt, Room, Stair, Wall } from "@/lib/types";
import { flatten, newFloor, normalizeFull, uid, unflatten, defaultFull } from "@/lib/types";
import { roofInfo, ATTIC_MIN } from "@/lib/roof";
import { drawStair, stairBox, stairLocal, stairSteps } from "@/lib/stairs";
import { CATALOG, CATS, drawItem, itemLocal } from "@/lib/furniture";
import { area, bounds, dist, fmt, perimeter, round3, setEdgeLength, snapTo, segProject } from "@/lib/geo";
import { endJoins, inRegion, rasterize, regionAt, wallGeom } from "@/lib/rooms";
import type { Region } from "@/lib/rooms";
import { VERSION } from "./App";

type View = { s: number; ox: number; oy: number };
type Saved = "saved" | "saving" | "error";
type Tool = "select" | "plot" | "wall" | "door" | "window" | "room" | "furn" | "stair" | "roof";
type Sel =
  | null
  | { k: "pv"; i: number }
  | { k: "wall"; id: string }
  | { k: "op"; id: string }
  | { k: "room"; id: string }
  | { k: "stair"; id: string }
  | { k: "item"; id: string };

const cloneF = (d: FullData): FullData => JSON.parse(JSON.stringify(d));
const ROOM_COLORS = ["#f2d9a6", "#bfe0c4", "#c9d9f0", "#f0c9c9", "#e4d0f0", "#f0e6a8"];
const WALL_COLOR = "#7a7266";
const near = (a: Pt, b: Pt, e = 0.002) => Math.hypot(a.x - b.x, a.y - b.y) < e;

const TOOL_HINT: Record<Tool, string> = {
  select: "Bir duvara, kapıya, pencereye veya odaya dokun. Duvarı sürükleyerek taşı.",
  plot: "",
  wall: "Duvarın başlangıcına dokun, sonra köşelere sırayla dokun. Bitirmek için aynı noktaya tekrar dokun.",
  door: "Kapı koymak istediğin duvara dokun.",
  window: "Pencere koymak istediğin duvara dokun.",
  room: "Duvarlarla kapalı bir alanın içine dokun, oda otomatik oluşur.",
  furn: "Listeden bir eşya seç, sonra odada yerleştireceğin noktaya dokun.",
  stair: "Merdivenin yerleşeceği noktaya dokun. Basamak sayısı kat yüksekliğinden hesaplanır.",
  roof: "Çatı türünü ve eğimini panelden ayarla. Taslak, en üst katın dış sınırına göre çizilir.",
};

export default function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  const [name, setName] = useState("");
  const [full, setFull] = useState<FullData>(defaultFull());
  const [fi, setFi] = useState(0);
  const [view, setView] = useState<View>({ s: 40, ox: 0, oy: 0 });
  const [tool, setTool] = useState<Tool>("plot");
  const [sel, setSel] = useState<Sel>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [chain, setChain] = useState<Pt | null>(null);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState<CatItem | null>(null);
  const [cat, setCat] = useState(CATS[0]);
  const [cust, setCust] = useState({ name: "", w: "100", d: "60", h: "75", color: "#d9d3b8" });
  const [saved, setSaved] = useState<Saved>("saved");
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState(true);
  const [, bump] = useState(0);

  const fullRef = useRef(full);
  fullRef.current = full;
  const fiRef = useRef(fi);
  fiRef.current = fi;
  const data = useMemo<PlanData>(() => flatten(full, fi), [full, fi]);
  const setData = useCallback((next: PlanData) => setFull((prev) => unflatten(prev, fiRef.current, next)), []);
  const cloneFull = () => cloneF(fullRef.current);

  const past = useRef<FullData[]>([]);
  const future = useRef<FullData[]>([]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const viewRef = useRef(view);
  viewRef.current = view;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const chainRef = useRef(chain);
  chainRef.current = chain;
  const chainFirst = useRef<Pt | null>(null);
  const chainCount = useRef(0);
  const selRef = useRef(sel);
  selRef.current = sel;

  const { plot, walls, openings, rooms, stairs, items, custom } = data;
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // ---------- türetilmiş veri ----------
  const joins = useMemo(() => endJoins(walls), [walls]);
  const raster = useMemo(() => rasterize(walls), [walls]);
  const regions = useMemo(() => {
    const m = new Map<string, Region | null>();
    for (const r of rooms) m.set(r.id, regionAt(raster, r.seed));
    return m;
  }, [raster, rooms]);
  const roomCanvases = useMemo(() => {
    const m = new Map<string, HTMLCanvasElement>();
    if (typeof document === "undefined") return m;
    for (const r of rooms) {
      const reg = regions.get(r.id);
      if (!reg || reg.open) continue;
      const c = document.createElement("canvas");
      c.width = reg.w;
      c.height = reg.h;
      const g = c.getContext("2d")!;
      const img = g.createImageData(reg.w, reg.h);
      const hex = r.color.replace("#", "");
      const R = parseInt(hex.slice(0, 2), 16);
      const G = parseInt(hex.slice(2, 4), 16);
      const B = parseInt(hex.slice(4, 6), 16);
      for (let i = 0; i < reg.mask.length; i++) {
        if (reg.mask[i]) {
          img.data[i * 4] = R;
          img.data[i * 4 + 1] = G;
          img.data[i * 4 + 2] = B;
          img.data[i * 4 + 3] = 150;
        }
      }
      g.putImageData(img, 0, 0);
      m.set(r.id, c);
    }
    return m;
  }, [regions, rooms]);

  // ---------- yükle ----------
  useEffect(() => {
    let dead = false;
    fetch("/api/projects/" + id)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p) => {
        if (dead) return;
        const d = normalizeFull(p.data);
        setName(p.name);
        setFull(d);
        setFi(0);
        setTool(d.plot.closed ? "select" : "plot");
        setLoaded(true);
        requestAnimationFrame(() => fit(flatten(d, 0)));
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
  const latest = useRef({ name, full });
  latest.current = { name, full };
  const dirty = useRef(false);
  const ver = useRef(0);
  const first = useRef(true);

  const putNow = useCallback(
    async (keepalive = false) => {
      const v = ver.current;
      const body = JSON.stringify({ name: latest.current.name, data: latest.current.full });
      try {
        const r = await fetch("/api/projects/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive });
        if (r.ok && v === ver.current) dirty.current = false;
        setSaved(r.ok ? (v === ver.current ? "saved" : "saving") : "error");
      } catch {
        setSaved("error");
      }
    },
    [id]
  );

  useEffect(() => {
    if (!loaded) return;
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    ver.current += 1;
    setSaved("saving");
    const t = setTimeout(() => putNow(), 600);
    return () => clearTimeout(t);
  }, [full, name, loaded, putNow]);

  // sayfadan/Editor'den çıkarken bekleyen değişikliği hemen gönder
  useEffect(() => {
    const flush = () => {
      if (dirty.current) putNow(true);
    };
    const onVis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [putNow]);

  async function goBack() {
    if (dirty.current) await putNow();
    onBack();
  }

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 3500);
    return () => clearTimeout(t);
  }, [note]);

  // ---------- geçmiş ----------
  const commit = useCallback((before: FullData) => {
    past.current.push(cloneF(before));
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    bump((n) => n + 1);
  }, []);
  const apply = useCallback(
    (next: PlanData) => {
      commit(fullRef.current);
      setData(next);
    },
    [commit, setData]
  );
  const undo = useCallback(() => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(cloneF(fullRef.current));
    setFull(p);
    setFi((f) => Math.min(f, p.floors.length - 1));
    setSel(null);
    setChain(null);
    bump((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const p = future.current.pop();
    if (!p) return;
    past.current.push(cloneF(fullRef.current));
    setFull(p);
    setFi((f) => Math.min(f, p.floors.length - 1));
    setSel(null);
    bump((n) => n + 1);
  }, []);

  // ---------- görünüm ----------
  function fit(d: PlanData = dataRef.current) {
    const el = wrap.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const pts: Pt[] = [...d.plot.points];
    d.walls.forEach((w) => pts.push(w.a, w.b));
    d.stairs.forEach((st) => pts.push({ x: st.x, y: st.y }));
    if (pts.length < 2) {
      setView({ s: 40, ox: W / 2 - 15 * 40, oy: H / 2 - 10 * 40 });
      return;
    }
    const b = bounds(pts);
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

  // ---------- yardımcılar ----------
  const sn = (p: Pt): Pt => ({ x: round3(snapTo(p.x, dataRef.current.snap)), y: round3(snapTo(p.y, dataRef.current.snap)) });

  function snapWall(raw: Pt, from: Pt | null): Pt {
    const d = dataRef.current;
    const R = 12 / viewRef.current.s;
    let best: Pt | null = null;
    let bd = R;
    const cands: Pt[] = [...d.plot.points];
    d.walls.forEach((w) => cands.push(w.a, w.b));
    for (const c of cands) {
      const dd = dist(c, raw);
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    if (best) return { x: best.x, y: best.y };
    let p = { ...raw };
    let fx = false;
    let fy = false;
    if (from) {
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      if (Math.abs(dy) < Math.abs(dx) * 0.07) {
        p.y = from.y;
        fy = true;
      } else if (Math.abs(dx) < Math.abs(dy) * 0.07) {
        p.x = from.x;
        fx = true;
      }
    }
    const s = sn(p);
    return { x: fx ? p.x : s.x, y: fy ? p.y : s.y };
  }

  function hitWall(p: Pt, tolPx = 8): Wall | null {
    const d = dataRef.current;
    let best: Wall | null = null;
    let bd = Infinity;
    for (const w of d.walls) {
      const pr = segProject(p, w.a, w.b);
      const lim = w.t / 2 + tolPx / viewRef.current.s;
      if (pr.d <= lim && pr.d < bd) {
        bd = pr.d;
        best = w;
      }
    }
    return best;
  }
  function openingCenter(o: Opening): Pt | null {
    const w = dataRef.current.walls.find((x) => x.id === o.wall);
    if (!w) return null;
    const g = wallGeom(w, undefined);
    return { x: w.a.x + g.u.x * o.pos, y: w.a.y + g.u.y * o.pos };
  }
  function hitOpening(p: Pt): Opening | null {
    for (const o of dataRef.current.openings) {
      const c = openingCenter(o);
      if (!c) continue;
      const w = dataRef.current.walls.find((x) => x.id === o.wall)!;
      if (dist(c, p) <= Math.max(o.w / 2, 10 / viewRef.current.s) && segProject(p, w.a, w.b).d <= w.t / 2 + 10 / viewRef.current.s)
        return o;
    }
    return null;
  }
  function placeOn(p: Pt, w: number): { wall: Wall; pos: number } | null {
    const wall = hitWall(p, 14);
    if (!wall) return null;
    const pr = segProject(p, wall.a, wall.b);
    const L = pr.L;
    if (L < 0.5) return null;
    const ww = Math.min(w, L - 0.1);
    let pos = pr.t * L;
    pos = Math.round(pos / 0.05) * 0.05;
    pos = Math.max(ww / 2 + 0.05, Math.min(L - ww / 2 - 0.05, pos));
    return { wall, pos: round3(pos) };
  }
  const defaults = (kind: "door" | "window") =>
    kind === "door"
      ? { w: 0.9, h: 2.1, sill: 0, shape: "rect" as const }
      : { w: 1.2, h: 1.2, sill: 0.9, shape: "rect" as const };

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
    const S = (p: Pt) => ({ x: p.x * s + ox, y: p.y * s + oy });

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

    // arsa
    const pts = plot.points;
    const sp = pts.map(S);
    const plotTool = tool === "plot";
    if (pts.length >= 3 && plot.closed) {
      g.beginPath();
      sp.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fillStyle = "rgba(122,160,92,0.16)";
      g.fill();
    }
    if (pts.length >= 2 || (pts.length === 1 && hover)) {
      g.beginPath();
      sp.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (plot.closed) g.closePath();
      g.strokeStyle = plotTool ? "#3f6b2a" : "#7ea06a";
      g.lineWidth = plotTool ? 2.5 : 2;
      g.setLineDash(plotTool ? [] : [8, 5]);
      g.stroke();
      g.setLineDash([]);
    }

    // oda dolguları
    for (const r of rooms) {
      const cvs = roomCanvases.get(r.id);
      const reg = regions.get(r.id);
      if (!cvs || !reg) continue;
      g.imageSmoothingEnabled = false;
      g.drawImage(cvs, reg.x0 * s + ox, reg.y0 * s + oy, reg.w * reg.cell * s, reg.h * reg.cell * s);
    }

    // alt katın hayaleti
    const polyGhost = (a: Pt, b: Pt, n: Pt, half: number) => {
      const p1 = S({ x: a.x + n.x * half, y: a.y + n.y * half });
      const p2 = S({ x: b.x + n.x * half, y: b.y + n.y * half });
      const p3 = S({ x: b.x - n.x * half, y: b.y - n.y * half });
      const p4 = S({ x: a.x - n.x * half, y: a.y - n.y * half });
      g.beginPath();
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.lineTo(p3.x, p3.y);
      g.lineTo(p4.x, p4.y);
      g.closePath();
    };
    if (fi > 0) {
      const below = full.floors[fi - 1];
      const bj = endJoins(below.walls);
      for (const w of below.walls) {
        const { L, u, n, ea, eb } = wallGeom(w, bj.get(w.id));
        polyGhost({ x: w.a.x - u.x * ea, y: w.a.y - u.y * ea }, { x: w.a.x + u.x * (L + eb), y: w.a.y + u.y * (L + eb) }, n, w.t / 2);
        g.fillStyle = "rgba(90,80,70,0.13)";
        g.fill();
        g.strokeStyle = "rgba(90,80,70,0.35)";
        g.lineWidth = 1;
        g.stroke();
      }
      for (const st of below.stairs) drawStair(g, st, below.height, s, ox, oy, { color: "rgba(90,80,70,0.55)", fill: "rgba(0,0,0,0)", lw: 1.5, ghost: true });
    }

    // duvarlar
    const poly = (a: Pt, b: Pt, n: Pt, half: number) => {
      const p1 = S({ x: a.x + n.x * half, y: a.y + n.y * half });
      const p2 = S({ x: b.x + n.x * half, y: b.y + n.y * half });
      const p3 = S({ x: b.x - n.x * half, y: b.y - n.y * half });
      const p4 = S({ x: a.x - n.x * half, y: a.y - n.y * half });
      g.beginPath();
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.lineTo(p3.x, p3.y);
      g.lineTo(p4.x, p4.y);
      g.closePath();
    };
    for (const w of walls) {
      const { L, u, n, ea, eb } = wallGeom(w, joins.get(w.id));
      const ops = openings.filter((o) => o.wall === w.id).sort((a, b) => a.pos - b.pos);
      let cur = -ea;
      const segs: [number, number][] = [];
      for (const o of ops) {
        const s0 = o.pos - o.w / 2;
        const s1 = o.pos + o.w / 2;
        if (s0 > cur) segs.push([cur, s0]);
        cur = Math.max(cur, s1);
      }
      if (cur < L + eb) segs.push([cur, L + eb]);
      const isSel = sel?.k === "wall" && sel.id === w.id;
      for (const [s0, s1] of segs) {
        const A = { x: w.a.x + u.x * s0, y: w.a.y + u.y * s0 };
        const B = { x: w.a.x + u.x * s1, y: w.a.y + u.y * s1 };
        poly(A, B, n, w.t / 2);
        g.fillStyle = w.color;
        g.fill();
        g.strokeStyle = isSel ? "#d9822b" : "#3d382f";
        g.lineWidth = isSel ? 2.5 : 1;
        g.stroke();
      }
      // açıklıklar
      for (const o of ops) {
        const isOpSel = sel?.k === "op" && sel.id === o.id;
        const cC = { x: w.a.x + u.x * o.pos, y: w.a.y + u.y * o.pos };
        const j1 = S({ x: cC.x - (u.x * o.w) / 2, y: cC.y - (u.y * o.w) / 2 });
        const j2 = S({ x: cC.x + (u.x * o.w) / 2, y: cC.y + (u.y * o.w) / 2 });
        const nn = { x: n.x * s, y: n.y * s };
        g.strokeStyle = isOpSel ? "#d9822b" : "#3d382f";
        g.lineWidth = isOpSel ? 2.5 : 1.5;
        // pervazlar
        for (const j of [j1, j2]) {
          g.beginPath();
          g.moveTo(j.x + (nn.x * w.t) / 2, j.y + (nn.y * w.t) / 2);
          g.lineTo(j.x - (nn.x * w.t) / 2, j.y - (nn.y * w.t) / 2);
          g.stroke();
        }
        if (o.kind === "window") {
          g.lineWidth = 1.2;
          for (const k of [-0.3, 0, 0.3]) {
            g.beginPath();
            g.moveTo(j1.x + nn.x * w.t * k, j1.y + nn.y * w.t * k);
            g.lineTo(j2.x + nn.x * w.t * k, j2.y + nn.y * w.t * k);
            g.stroke();
          }
          if (isOpSel) {
            g.fillStyle = "rgba(217,130,43,0.25)";
            poly({ x: cC.x - (u.x * o.w) / 2, y: cC.y - (u.y * o.w) / 2 }, { x: cC.x + (u.x * o.w) / 2, y: cC.y + (u.y * o.w) / 2 }, n, w.t / 2);
            g.fill();
          }
        } else {
          const hinge = o.hinge ? j2 : j1;
          const other = o.hinge ? j1 : j2;
          const side = o.flip ? -1 : 1;
          const leaf = { x: hinge.x + nn.x * side * o.w, y: hinge.y + nn.y * side * o.w };
          g.lineWidth = isOpSel ? 2.5 : 1.5;
          g.beginPath();
          g.moveTo(hinge.x, hinge.y);
          g.lineTo(leaf.x, leaf.y);
          g.stroke();
          const a1 = Math.atan2(leaf.y - hinge.y, leaf.x - hinge.x);
          const a2 = Math.atan2(other.y - hinge.y, other.x - hinge.x);
          const ccw = (a2 - a1 + Math.PI * 4) % (Math.PI * 2) > Math.PI;
          g.lineWidth = 1;
          g.setLineDash([4, 3]);
          g.beginPath();
          g.arc(hinge.x, hinge.y, o.w * s, a1, a2, ccw);
          g.stroke();
          g.setLineDash([]);
        }
      }
    }

    // merdivenler
    for (const st of stairs) {
      const isSel = sel?.k === "stair" && sel.id === st.id;
      drawStair(g, st, data.height, s, ox, oy, { color: isSel ? "#d9822b" : "#3d382f", fill: "rgba(255,255,255,0.7)", lw: isSel ? 2.5 : 1.3 });
    }
    // eşyalar (halılar altta)
    const ordered = [...items].sort((a, b) => (a.shape === "rug" ? 0 : 1) - (b.shape === "rug" ? 0 : 1));
    for (const it of ordered) drawItem(g, it, s, ox, oy, { selected: sel?.k === "item" && sel.id === it.id, label: true });
    if (tool === "furn" && pick && hover) drawItem(g, { x: hover.x, y: hover.y, rot: 0, w: pick.w, d: pick.d, shape: pick.shape, color: pick.color, name: pick.name }, s, ox, oy, { ghost: true });
    // alttaki katın merdiveni burada boşluk olarak görünür (hayalet çizildi)
    if (tool === "stair" && hover) {
      const prev: Stair = { id: "p", kind: "straight", x: hover.x, y: hover.y, rot: 0, w: 1, mirror: false };
      drawStair(g, prev, data.height, s, ox, oy, { color: "#d9822b", fill: "rgba(217,130,43,0.25)", lw: 1.5 });
    }

    // duvar çizim önizlemesi
    if (tool === "wall" && chain && hover) {
      const t = data.defT;
      const dx = hover.x - chain.x;
      const dy = hover.y - chain.y;
      const L = Math.hypot(dx, dy);
      if (L > 1e-6) {
        const n = { x: -dy / L, y: dx / L };
        poly(chain, hover, n, t / 2);
        g.fillStyle = "rgba(122,114,102,0.5)";
        g.fill();
        g.strokeStyle = "#d9822b";
        g.lineWidth = 1.5;
        g.stroke();
        const a = S(chain);
        const b = S(hover);
        label(g, fmt(L) + " m", (a.x + b.x) / 2, (a.y + b.y) / 2 - 16, "#8a4b0b");
      }
    }
    if (tool === "wall" && hover) {
      const h = S(hover);
      g.fillStyle = "#d9822b";
      g.beginPath();
      g.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    // kapı/pencere önizlemesi
    if ((tool === "door" || tool === "window") && hover) {
      const d = defaults(tool);
      const pl = placeOn(hover, d.w);
      if (pl) {
        const { u, n } = wallGeom(pl.wall, undefined);
        const cC = { x: pl.wall.a.x + u.x * pl.pos, y: pl.wall.a.y + u.y * pl.pos };
        poly(
          { x: cC.x - (u.x * d.w) / 2, y: cC.y - (u.y * d.w) / 2 },
          { x: cC.x + (u.x * d.w) / 2, y: cC.y + (u.y * d.w) / 2 },
          n,
          pl.wall.t / 2
        );
        g.fillStyle = "rgba(217,130,43,0.55)";
        g.fill();
      }
    }

    // arsa etiketleri / köşeler (yalnızca arsa aracında)
    if (!plot.closed && pts.length >= 1 && hover && plotTool) {
      const last = sp[sp.length - 1];
      const h = S(hover);
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
    if (plotTool) {
      const ne = plot.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < ne; i++) {
        const a = sp[i];
        const b = sp[(i + 1) % sp.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 50) continue;
        label(g, fmt(dist(pts[i], pts[(i + 1) % pts.length])) + " m", (a.x + b.x) / 2, (a.y + b.y) / 2, "#2c4a1c");
      }
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
      sp.forEach((p, i) => {
        const isSel = sel?.k === "pv" && sel.i === i;
        g.beginPath();
        g.arc(p.x, p.y, isSel ? 9 : 7, 0, Math.PI * 2);
        g.fillStyle = isSel ? "#d9822b" : i === 0 && !plot.closed ? "#c2410c" : "#fff";
        g.fill();
        g.strokeStyle = "#3f6b2a";
        g.lineWidth = 2.5;
        g.stroke();
      });
    }

    // seçili duvar uç tutamaçları
    if (sel?.k === "wall") {
      const w = walls.find((x) => x.id === sel.id);
      if (w) {
        for (const p of [w.a, w.b]) {
          const q = S(p);
          g.beginPath();
          g.arc(q.x, q.y, 8, 0, Math.PI * 2);
          g.fillStyle = "#fff";
          g.fill();
          g.strokeStyle = "#d9822b";
          g.lineWidth = 3;
          g.stroke();
        }
      }
    }
    // oda etiketleri
    for (const r of rooms) {
      const reg = regions.get(r.id);
      const isSel = sel?.k === "room" && sel.id === r.id;
      if (!reg || reg.open) {
        const q = S(r.seed);
        label(g, "⚠ " + r.name + " (açık)", q.x, q.y, "#b3392b", isSel);
        continue;
      }
      const q = S({ x: reg.cx, y: reg.cy });
      label(g, r.name, q.x, q.y - 9, isSel ? "#8a4b0b" : "#2a2a24", true);
      label(g, fmt(reg.area) + " m²", q.x, q.y + 9, isSel ? "#8a4b0b" : "#4a4638", false);
    }

    // duvar ölçüleri
    for (const w of walls) {
      const a = S(w.a);
      const b = S(w.b);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const isSel = sel?.k === "wall" && sel.id === w.id;
      if (!isSel && !(tool === "wall" && len > 90)) continue;
      const L = dist(w.a, w.b);
      const nx = -(b.y - a.y) / (len || 1);
      const ny = (b.x - a.x) / (len || 1);
      const off = (w.t * s) / 2 + 14;
      const cxw = walls.reduce((q, z) => q + (z.a.x + z.b.x) / 2, 0) / walls.length;
      const cyw = walls.reduce((q, z) => q + (z.a.y + z.b.y) / 2, 0) / walls.length;
      const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      const sgn = nx * (mid.x - cxw) + ny * (mid.y - cyw) >= 0 ? 1 : -1;
      label(g, fmt(L) + " m", (a.x + b.x) / 2 + nx * off * sgn, (a.y + b.y) / 2 + ny * off * sgn, isSel ? "#8a4b0b" : "#6a6454", isSel);
    }
    // çatı taslağı
    if (tool === "roof") {
      const ri = roofInfo(full);
      if (ri) {
        const a = S({ x: ri.x0, y: ri.y0 });
        const b = S({ x: ri.x1, y: ri.y1 });
        const kind = full.roof.kind;
        g.fillStyle = full.roof.color + "33";
        g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        g.setLineDash([9, 6]);
        g.strokeStyle = full.roof.color;
        g.lineWidth = 2.5;
        g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        g.setLineDash([]);
        const cx2 = (a.x + b.x) / 2;
        const cy2 = (a.y + b.y) / 2;
        g.lineWidth = 3;
        if (kind === "gable") {
          g.beginPath();
          if (ri.ridgeAlongX) {
            g.moveTo(a.x, cy2);
            g.lineTo(b.x, cy2);
          } else {
            g.moveTo(cx2, a.y);
            g.lineTo(cx2, b.y);
          }
          g.stroke();
        } else if (kind === "hip") {
          const inset = (ri.spanDim / 2) * s;
          g.beginPath();
          if (ri.ridgeAlongX) {
            g.moveTo(a.x + inset, cy2);
            g.lineTo(b.x - inset, cy2);
          } else {
            g.moveTo(cx2, a.y + inset);
            g.lineTo(cx2, b.y - inset);
          }
          g.stroke();
          for (const [x, y] of [[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y]]) {
            const tx = ri.ridgeAlongX ? (x < cx2 ? a.x + inset : b.x - inset) : cx2;
            const ty = ri.ridgeAlongX ? cy2 : y < cy2 ? a.y + inset : b.y - inset;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(tx, ty);
            g.lineWidth = 1.5;
            g.stroke();
          }
        } else if (kind === "shed") {
          label(g, "yüksek kenar → alçak kenar", cx2, cy2, full.roof.color);
        } else {
          label(g, "düz çatı", cx2, cy2, full.roof.color);
        }
      }
    }

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
  }, [data, full, fi, view, sel, hover, chain, tool, pick, regions, roomCanvases, joins]);

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
  type Drag =
    | null
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean; click?: () => void }
    | { kind: "pv"; i: number; before: FullData }
    | { kind: "wend"; id: string; which: "a" | "b"; from: Pt; before: FullData }
    | { kind: "wmove"; id: string; start: Pt; a0: Pt; b0: Pt; before: FullData; moved: boolean }
    | { kind: "op"; id: string; before: FullData; moved: boolean }
    | { kind: "imove"; id: string; start: Pt; x0: number; y0: number; before: FullData; moved: boolean }
    | { kind: "smove"; id: string; start: Pt; x0: number; y0: number; before: FullData; moved: boolean }
    | { kind: "pinch"; d: number; s: number; cx: number; cy: number };
  const drag = useRef<Drag>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const coarse = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

  function hitPlotVertex(sx: number, sy: number) {
    const pts = dataRef.current.plot.points;
    const R = coarse() ? 22 : 13;
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = toScreen(pts[i]);
      if (Math.hypot(p.x - sx, p.y - sy) <= R) return i;
    }
    return -1;
  }
  function hitPlotMid(sx: number, sy: number) {
    const pts = dataRef.current.plot.points;
    for (let i = 0; i < pts.length; i++) {
      const a = toScreen(pts[i]);
      const b = toScreen(pts[(i + 1) % pts.length]);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 40) continue;
      if (Math.hypot((a.x + b.x) / 2 - sx, (a.y + b.y) / 2 + 16 - sy) <= 14) return i;
    }
    return -1;
  }

  function moveEndpoints(d: PlanData, from: Pt, to: Pt, skip?: { id: string; which: "a" | "b" }): Wall[] {
    return d.walls.map((w) => {
      const nw = { ...w };
      if (near(w.a, from) && !(skip && skip.id === w.id && skip.which !== "a" && false)) nw.a = { ...to };
      if (near(w.b, from)) nw.b = { ...to };
      return nw;
    });
  }

  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      drag.current = { kind: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), s: viewRef.current.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    const d = dataRef.current;
    const w = toWorld(p.x, p.y);
    const t = toolRef.current;
    const pan = (click?: () => void): Drag => ({ kind: "pan", sx: p.x, sy: p.y, ox: viewRef.current.ox, oy: viewRef.current.oy, moved: false, click });

    if (t === "plot") {
      if (d.plot.closed) {
        const vi = hitPlotVertex(p.x, p.y);
        if (vi >= 0) {
          setSel({ k: "pv", i: vi });
          drag.current = { kind: "pv", i: vi, before: cloneFull() };
          return;
        }
        const mi = hitPlotMid(p.x, p.y);
        if (mi >= 0) {
          const a = d.plot.points[mi];
          const b = d.plot.points[(mi + 1) % d.plot.points.length];
          const before = cloneFull();
          const pts = d.plot.points.map((q) => ({ ...q }));
          pts.splice(mi + 1, 0, sn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
          setData({ ...d, plot: { ...d.plot, points: pts } });
          setSel({ k: "pv", i: mi + 1 });
          drag.current = { kind: "pv", i: mi + 1, before };
          return;
        }
        drag.current = pan(() => setSel(null));
        return;
      }
      drag.current = pan(() => {
        const cur = dataRef.current;
        const ww = sn(toWorld(p.x, p.y));
        if (cur.plot.points.length >= 3) {
          const f = toScreen(cur.plot.points[0]);
          if (Math.hypot(f.x - p.x, f.y - p.y) <= 14) {
            apply({ ...cur, plot: { ...cur.plot, closed: true } });
            setHover(null);
            setTool("select");
            return;
          }
        }
        const last = cur.plot.points[cur.plot.points.length - 1];
        if (last && dist(last, ww) < 1e-6) return;
        apply({ ...cur, plot: { ...cur.plot, points: [...cur.plot.points.map((q) => ({ ...q })), ww] } });
      });
      return;
    }

    if (t === "wall") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const ch = chainRef.current;
        const w2 = snapWall(toWorld(p.x, p.y), ch);
        if (!ch) {
          setChain(w2);
          chainFirst.current = w2;
          chainCount.current = 0;
          return;
        }
        if (dist(ch, w2) < 1e-6) {
          setChain(null);
          return;
        }
        const wall: Wall = { id: uid(), a: ch, b: w2, t: cur.defT, color: WALL_COLOR };
        apply({ ...cur, walls: [...cur.walls, wall] });
        chainCount.current += 1;
        if (chainFirst.current && near(w2, chainFirst.current) && chainCount.current >= 2) setChain(null);
        else setChain(w2);
      });
      return;
    }

    if (t === "door" || t === "window") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const df = defaults(t);
        const pl = placeOn(toWorld(p.x, p.y), df.w);
        if (!pl) {
          setNote("Bir duvarın üstüne dokun.");
          return;
        }
        const L = dist(pl.wall.a, pl.wall.b);
        const o: Opening = {
          id: uid(),
          wall: pl.wall.id,
          pos: pl.pos,
          w: Math.min(df.w, round3(L - 0.1)),
          h: df.h,
          sill: df.sill,
          kind: t,
          shape: df.shape,
          flip: false,
          hinge: false,
        };
        apply({ ...cur, openings: [...cur.openings, o] });
        setSel({ k: "op", id: o.id });
        setTool("select");
        setHover(null);
      });
      return;
    }

    if (t === "furn") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const pk = pickRef.current;
        const wp = toWorld(p.x, p.y);
        if (!pk) {
          const hit = [...cur.items].reverse().find((it) => {
            const lp = itemLocal(it, wp);
            return Math.abs(lp.x) <= it.w / 2 && Math.abs(lp.y) <= it.d / 2;
          });
          if (hit) {
            setSel({ k: "item", id: hit.id });
            setTool("select");
          } else setNote("Önce listeden bir eşya seç.");
          return;
        }
        const pos = sn(wp);
        const it: Item = { id: uid(), key: pk.key, name: pk.name, shape: pk.shape, x: pos.x, y: pos.y, rot: 0, w: pk.w, d: pk.d, h: pk.h, elev: pk.elev ?? 0, color: pk.color };
        apply({ ...cur, items: [...cur.items, it] });
        setSel({ k: "item", id: it.id });
      });
      return;
    }

    if (t === "stair") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const pos = sn(toWorld(p.x, p.y));
        const st: Stair = { id: uid(), kind: "straight", x: pos.x, y: pos.y, rot: 0, w: 1, mirror: false };
        apply({ ...cur, stairs: [...cur.stairs, st] });
        setSel({ k: "stair", id: st.id });
        setTool("select");
        setHover(null);
      });
      return;
    }

    if (t === "room") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const seed = toWorld(p.x, p.y);
        for (const r of cur.rooms) {
          const reg = regionAt(rasterize(cur.walls), r.seed);
          if (reg && !reg.open && inRegion(reg, seed)) {
            setSel({ k: "room", id: r.id });
            setTool("select");
            return;
          }
        }
        const reg = regionAt(rasterize(cur.walls), seed);
        if (!reg) {
          setNote(cur.walls.length ? "Duvarın üstüne değil, odanın içine dokun." : "Önce duvarları çiz.");
          return;
        }
        if (reg.open) {
          setNote("Burası kapalı bir alan değil. Duvarların köşeleri birleşmeli.");
          return;
        }
        const room: Room = { id: uid(), name: "Oda " + (cur.rooms.length + 1), seed: { x: round3(seed.x), y: round3(seed.y) }, color: ROOM_COLORS[cur.rooms.length % ROOM_COLORS.length] };
        apply({ ...cur, rooms: [...cur.rooms, room] });
        setSel({ k: "room", id: room.id });
        setTool("select");
      });
      return;
    }

    // ---- select ----
    const s = selRef.current;
    if (s?.k === "wall") {
      const wl = d.walls.find((x) => x.id === s.id);
      if (wl) {
        const R = coarse() ? 24 : 14;
        for (const which of ["a", "b"] as const) {
          const q = toScreen(wl[which]);
          if (Math.hypot(q.x - p.x, q.y - p.y) <= R) {
            drag.current = { kind: "wend", id: wl.id, which, from: { ...wl[which] }, before: cloneFull() };
            return;
          }
        }
      }
    }
    for (let i = d.items.length - 1; i >= 0; i--) {
      const it = d.items[i];
      const lp = itemLocal(it, w);
      if (Math.abs(lp.x) <= it.w / 2 && Math.abs(lp.y) <= it.d / 2) {
        setSel({ k: "item", id: it.id });
        drag.current = { kind: "imove", id: it.id, start: w, x0: it.x, y0: it.y, before: cloneFull(), moved: false };
        return;
      }
    }
    for (const st of d.stairs) {
      const lp = stairLocal(st, w);
      const bx = stairBox(st, d.height);
      if (Math.abs(lp.x) <= bx.W / 2 && Math.abs(lp.y) <= bx.D / 2) {
        setSel({ k: "stair", id: st.id });
        drag.current = { kind: "smove", id: st.id, start: w, x0: st.x, y0: st.y, before: cloneFull(), moved: false };
        return;
      }
    }
    const op = hitOpening(w);
    if (op) {
      setSel({ k: "op", id: op.id });
      drag.current = { kind: "op", id: op.id, before: cloneFull(), moved: false };
      return;
    }
    const wl = hitWall(w);
    if (wl) {
      setSel({ k: "wall", id: wl.id });
      drag.current = { kind: "wmove", id: wl.id, start: w, a0: { ...wl.a }, b0: { ...wl.b }, before: cloneFull(), moved: false };
      return;
    }
    const rs = rasterize(d.walls);
    let hitRoom: Room | null = null;
    for (const r of d.rooms) {
      const reg = regionAt(rs, r.seed);
      if (reg && !reg.open && inRegion(reg, w)) {
        hitRoom = r;
        break;
      }
    }
    drag.current = pan(() => setSel(hitRoom ? { k: "room", id: hitRoom.id } : null));
  }

  function onMove(e: React.PointerEvent) {
    const p = local(e);
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, p);
    const d = drag.current;
    const t = toolRef.current;
    const wpt = toWorld(p.x, p.y);
    const updateHover = () => {
      if (t === "wall") setHover(snapWall(wpt, chainRef.current));
      else if (t === "plot" && !dataRef.current.plot.closed) setHover(sn(wpt));
      else if (t === "door" || t === "window") setHover(wpt);
      else if (t === "stair" || t === "furn") setHover(sn(wpt));
    };
    if (!d) {
      updateHover();
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
      if (Math.hypot(dx, dy) > 6) d.moved = true;
      if (d.moved) setView({ ...viewRef.current, ox: d.ox + dx, oy: d.oy + dy });
      else updateHover();
    } else if (d.kind === "pv") {
      const cur = dataRef.current;
      const pts = cur.plot.points.map((q) => ({ ...q }));
      pts[d.i] = sn(wpt);
      setData({ ...cur, plot: { ...cur.plot, points: pts } });
    } else if (d.kind === "wend") {
      const cur = dataRef.current;
      const target = snapWall(wpt, null);
      const w0 = cur.walls.find((x) => x.id === d.id);
      if (!w0) return;
      const other = d.which === "a" ? w0.b : w0.a;
      let tt = target;
      if (!near(tt, target)) tt = target;
      const dx = Math.abs(tt.x - other.x);
      const dy = Math.abs(tt.y - other.y);
      if (dy < dx * 0.07 && !cur.walls.some((q) => near(q.a, tt) || near(q.b, tt))) tt = { x: tt.x, y: other.y };
      else if (dx < dy * 0.07 && !cur.walls.some((q) => near(q.a, tt) || near(q.b, tt))) tt = { x: other.x, y: tt.y };
      const from = { ...w0[d.which] };
      if (near(from, tt, 1e-6)) return;
      setData({ ...cur, walls: moveEndpoints(cur, from, tt) });
    } else if (d.kind === "wmove") {
      const cur = dataRef.current;
      const dx = wpt.x - d.start.x;
      const dy = wpt.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * viewRef.current.s < 6) return;
      d.moved = true;
      const na = sn({ x: d.a0.x + dx, y: d.a0.y + dy });
      const ddx = na.x - d.a0.x;
      const ddy = na.y - d.a0.y;
      // bağlı uçlarla birlikte taşı
      const base = flatten(d.before, fiRef.current).walls;
      const nb = { x: round3(d.b0.x + ddx), y: round3(d.b0.y + ddy) };
      const walls2 = base.map((w) => {
        const nw = { ...w };
        if (w.id === d.id) {
          nw.a = na;
          nw.b = nb;
          return nw;
        }
        if (near(w.a, d.a0) || near(w.a, d.b0)) nw.a = near(w.a, d.a0) ? na : nb;
        if (near(w.b, d.a0) || near(w.b, d.b0)) nw.b = near(w.b, d.a0) ? na : nb;
        return nw;
      });
      setData({ ...cur, walls: walls2 });
    } else if (d.kind === "imove") {
      const cur = dataRef.current;
      const dx = wpt.x - d.start.x;
      const dy = wpt.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * viewRef.current.s < 6) return;
      d.moved = true;
      const np = sn({ x: d.x0 + dx, y: d.y0 + dy });
      setData({ ...cur, items: cur.items.map((q) => (q.id === d.id ? { ...q, x: np.x, y: np.y } : q)) });
    } else if (d.kind === "smove") {
      const cur = dataRef.current;
      const dx = wpt.x - d.start.x;
      const dy = wpt.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * viewRef.current.s < 6) return;
      d.moved = true;
      const np = sn({ x: d.x0 + dx, y: d.y0 + dy });
      setData({ ...cur, stairs: cur.stairs.map((q) => (q.id === d.id ? { ...q, x: np.x, y: np.y } : q)) });
    } else if (d.kind === "op") {
      const cur = dataRef.current;
      const o = cur.openings.find((x) => x.id === d.id);
      if (!o) return;
      const pl = placeOn(wpt, o.w);
      if (!pl) return;
      d.moved = true;
      setData({ ...cur, openings: cur.openings.map((x) => (x.id === d.id ? { ...x, wall: pl.wall.id, pos: pl.pos } : x)) });
    }
  }

  function onUp(e: React.PointerEvent) {
    const d = drag.current;
    ptrs.current.delete(e.pointerId);
    drag.current = null;
    if (!d || d.kind === "pinch") return;
    if (d.kind === "pan") {
      if (!d.moved) d.click?.();
      return;
    }
    if (d.kind === "wmove" && !d.moved) return;
    if (d.kind === "smove" && !d.moved) return;
    if (d.kind === "imove" && !d.moved) return;
    if (d.kind === "op" && !d.moved) return;
    if (JSON.stringify(fullRef.current) !== JSON.stringify(d.before)) commit(d.before);
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

  // ---------- eylemler ----------
  function deleteSel() {
    const s = selRef.current;
    const d = dataRef.current;
    if (!s) return;
    if (s.k === "pv") {
      if (d.plot.closed && d.plot.points.length <= 3) return;
      apply({ ...d, plot: { ...d.plot, points: d.plot.points.filter((_, i) => i !== s.i) } });
    } else if (s.k === "wall") {
      apply({ ...d, walls: d.walls.filter((w) => w.id !== s.id), openings: d.openings.filter((o) => o.wall !== s.id) });
    } else if (s.k === "op") {
      apply({ ...d, openings: d.openings.filter((o) => o.id !== s.id) });
    } else if (s.k === "room") {
      apply({ ...d, rooms: d.rooms.filter((r) => r.id !== s.id) });
    } else if (s.k === "stair") {
      apply({ ...d, stairs: d.stairs.filter((q) => q.id !== s.id) });
    } else if (s.k === "item") {
      apply({ ...d, items: d.items.filter((q) => q.id !== s.id) });
    }
    setSel(null);
  }
  function chooseTool(t: Tool) {
    setTool(t);
    setChain(null);
    chainFirst.current = null;
    setHover(null);
    if (t !== "select") setSel(null);
    if (t !== "furn") setPick(null);
  }
  const patchWall = (id: string, f: (w: Wall) => Wall) => apply({ ...dataRef.current, walls: dataRef.current.walls.map((w) => (w.id === id ? f(w) : w)) });
  const patchOp = (id: string, f: (o: Opening) => Opening) => apply({ ...dataRef.current, openings: dataRef.current.openings.map((o) => (o.id === id ? f(o) : o)) });
  const patchItem = (id: string, f: (q: Item) => Item) => apply({ ...dataRef.current, items: dataRef.current.items.map((q) => (q.id === id ? f(q) : q)) });
  function dupItem(it: Item) {
    const n: Item = { ...it, id: uid(), x: round3(it.x + 0.3), y: round3(it.y + 0.3) };
    apply({ ...dataRef.current, items: [...dataRef.current.items, n] });
    setSel({ k: "item", id: n.id });
  }
  function addCustom() {
    const num = (t: string, def: number) => {
      const v = parseFloat(t.replace(",", "."));
      return isFinite(v) && v > 0 ? v : def;
    };
    const ci: CatItem = {
      key: "c" + uid(),
      name: cust.name.trim() || "Özel eşya",
      cat: "Özel",
      w: round3(Math.min(20, num(cust.w, 100) / 100)),
      d: round3(Math.min(20, num(cust.d, 60) / 100)),
      h: round3(Math.min(5, num(cust.h, 75) / 100)),
      shape: "rect",
      color: cust.color,
    };
    apply({ ...dataRef.current, custom: [...dataRef.current.custom, ci] });
    setPick(ci);
    setCat("Özel");
  }
  const patchStair = (id: string, f: (q: Stair) => Stair) => apply({ ...dataRef.current, stairs: dataRef.current.stairs.map((q) => (q.id === id ? f(q) : q)) });
  function chooseFloor(i: number) {
    setFi(i);
    setSel(null);
    setChain(null);
    chainFirst.current = null;
    setHover(null);
  }
  function addFloor() {
    const f = fullRef.current;
    commit(f);
    const nf = newFloor(`${f.floors.length}. kat`);
    setFull({ ...f, floors: [...f.floors, nf] });
    setFi(f.floors.length);
    setSel(null);
    setTool("select");
  }
  function deleteFloor() {
    const f = fullRef.current;
    if (f.floors.length <= 1) return;
    commit(f);
    setFull({ ...f, floors: f.floors.filter((_, k) => k !== fiRef.current) });
    setFi(Math.max(0, fiRef.current - 1));
    setSel(null);
  }
  function copyBelow() {
    const f = fullRef.current;
    const i = fiRef.current;
    if (i < 1) return;
    commit(f);
    const copy = f.floors[i - 1].walls.map((w) => ({ ...w, id: uid(), a: { ...w.a }, b: { ...w.b } }));
    setFull({ ...f, floors: f.floors.map((fl, k) => (k === i ? { ...fl, walls: [...fl.walls, ...copy] } : fl)) });
  }
  const patchRoom = (id: string, f: (r: Room) => Room) => apply({ ...dataRef.current, rooms: dataRef.current.rooms.map((r) => (r.id === id ? f(r) : r)) });

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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selRef.current) {
        deleteSel();
      } else if (e.key === "Escape") {
        setSel(null);
        setChain(null);
        chainFirst.current = null;
        if (pickRef.current) setPick(null);
        else if (toolRef.current !== "plot") setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo]);

  // ---------- panel ----------
  const nP = plot.points.length;
  const stat = saved === "saving" ? "Kaydediliyor…" : saved === "error" ? "Kaydedilemedi!" : "Kaydedildi ✓";
  const selWall = sel?.k === "wall" ? walls.find((w) => w.id === sel.id) : undefined;
  const selOp = sel?.k === "op" ? openings.find((o) => o.id === sel.id) : undefined;
  const selOpWall = selOp ? walls.find((w) => w.id === selOp.wall) : undefined;
  const selRoom = sel?.k === "room" ? rooms.find((r) => r.id === sel.id) : undefined;
  const selItem = sel?.k === "item" ? items.find((q) => q.id === sel.id) : undefined;
  const selStair = sel?.k === "stair" ? stairs.find((q) => q.id === sel.id) : undefined;
  const totalRoomArea = rooms.reduce((s, r) => {
    const reg = regions.get(r.id);
    return s + (reg && !reg.open ? reg.area : 0);
  }, 0);

  function hint() {
    if (tool === "plot") {
      if (plot.closed) return "Arsa köşelerini sürükle, kenarın altındaki + ile yeni köşe ekle.";
      return nP === 0
        ? "Arsanın köşelerine sırayla dokun. Fare tekerleği ile yakınlaş."
        : nP < 3
        ? "Köşe eklemeye devam et."
        : "İlk (turuncu) noktaya dokun ya da “Arsayı tamamla”.";
    }
    return TOOL_HINT[tool];
  }

  const modes: [Tool, string][] = [
    ["select", "Seç"],
    ["plot", "Arsa"],
    ["wall", "Duvar"],
    ["door", "Kapı"],
    ["window", "Pencere"],
    ["room", "Oda"],
    ["furn", "Eşya"],
    ["stair", "Merdiven"],
    ["roof", "Çatı"],
  ];

  return (
    <div className="editor">
      <div className="bar">
        <button onClick={goBack}>← Evlerim</button>
        <input className="nm" value={name} onChange={(e) => setName(e.target.value)} aria-label="Ev adı" />
        <span className={"stat " + saved}>{stat}</span>
        <span className="ver">Köy Evi Tasarım {VERSION}</span>
      </div>

      <div className="tools floors">
        {full.floors.map((fl, i) => (
          <button key={fl.id} className={fi === i ? "on" : ""} onClick={() => chooseFloor(i)}>
            {fl.name}
          </button>
        ))}
        <button className="add" onClick={addFloor}>+ Kat</button>
      </div>
      <div className="tools modes">
        {modes.map(([t, l]) => (
          <button key={t} className={tool === t ? "on" : ""} onClick={() => chooseTool(t)}>
            {l}
          </button>
        ))}
      </div>
      <div className="tools">
        <button onClick={undo} disabled={!past.current.length}>↶ Geri al</button>
        <button onClick={redo} disabled={!future.current.length}>↷ İleri al</button>
        <label className="snap">
          <span className="lbl">Izgara</span>
          <select value={data.snap} onChange={(e) => apply({ ...data, snap: parseFloat(e.target.value) })}>
            <option value={0}>Kapalı</option>
            <option value={0.05}>5 cm</option>
            <option value={0.1}>10 cm</option>
            <option value={0.25}>25 cm</option>
            <option value={0.5}>50 cm</option>
            <option value={1}>1 m</option>
          </select>
        </label>
        <button onClick={() => fit()}>Sığdır</button>
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
            onContextMenu={(e) => {
              e.preventDefault();
              setChain(null);
            }}
          />
          <div className="hint">{note || hint()}</div>
          {tool === "wall" && chain && (
            <button className="floatbtn" onClick={() => setChain(null)}>
              Duvarı bitir
            </button>
          )}
        </div>

        {panel && (
          <aside className="side">
            {/* --- Arsa aracı --- */}
            {tool === "plot" && (
              <>
                <h3>Arsa</h3>
                {!plot.closed ? (
                  <>
                    <div className="muted">Çizim sürüyor · {nP} köşe</div>
                    <div className="row">
                      <button onClick={undo} disabled={nP === 0}>Son noktayı geri al</button>
                      <button
                        className="primary"
                        disabled={nP < 3}
                        onClick={() => {
                          apply({ ...data, plot: { ...plot, closed: true } });
                          setHover(null);
                          setTool("select");
                        }}
                      >
                        Arsayı tamamla
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="stats">
                      <div><span>Alan</span><b>{fmt(area(plot.points))} m²</b></div>
                      <div><span>Çevre</span><b>{fmt(perimeter(plot.points, true))} m</b></div>
                    </div>
                    <h4>Kenar uzunlukları (m)</h4>
                    <div className="edges">
                      {plot.points.map((p, i) => (
                        <NumField
                          key={i + ":" + nP}
                          label={"Kenar " + (i + 1)}
                          value={dist(p, plot.points[(i + 1) % nP])}
                          onCommit={(v) => apply({ ...data, plot: { ...plot, points: setEdgeLength(plot.points, i, round3(v)) } })}
                        />
                      ))}
                    </div>
                    <div className="muted small">Bir kenarın uzunluğunu değiştirince o kenarın sonundaki köşe kayar.</div>
                    {sel?.k === "pv" && (
                      <button className="danger" onClick={deleteSel} disabled={nP <= 3}>Seçili köşeyi sil</button>
                    )}
                    <button onClick={() => apply({ ...data, plot: { points: [], closed: false } })}>Arsayı sil ve yeniden çiz</button>
                  </>
                )}
              </>
            )}

            {/* --- Duvar özellikleri --- */}
            {tool !== "plot" && selWall && (
              <>
                <h3>Duvar</h3>
                <NumField
                  key={selWall.id + ":len:" + fmt(dist(selWall.a, selWall.b), 3)}
                  label="Uzunluk (m)"
                  value={dist(selWall.a, selWall.b)}
                  onCommit={(v) => {
                    const d = dataRef.current;
                    const nb = setEdgeLength([selWall.a, selWall.b], 0, round3(v))[1];
                    apply({ ...d, walls: moveEndpoints(d, selWall.b, nb) });
                  }}
                />
                <NumField
                  key={selWall.id + ":t:" + selWall.t}
                  label="Kalınlık (cm)"
                  value={selWall.t * 100}
                  decimals={0}
                  onCommit={(v) => patchWall(selWall.id, (w) => ({ ...w, t: round3(Math.max(0.05, Math.min(1.5, v / 100))) }))}
                />
                <label className="edge">
                  <span>Renk</span>
                  <input type="color" value={selWall.color} onChange={(e) => patchWall(selWall.id, (w) => ({ ...w, color: e.target.value }))} />
                </label>
                <div className="muted small">Uçlardaki turuncu noktaları sürükleyerek uzat, duvarın gövdesini sürükleyerek taşı.</div>
                <button className="danger" onClick={deleteSel}>Duvarı sil</button>
              </>
            )}

            {/* --- Kapı / pencere --- */}
            {tool !== "plot" && selOp && selOpWall && (
              <>
                <h3>{selOp.kind === "door" ? "Kapı" : "Pencere"}</h3>
                <NumField key={selOp.id + ":w:" + selOp.w} label="Genişlik (cm)" value={selOp.w * 100} decimals={0}
                  onCommit={(v) => {
                    const L = dist(selOpWall.a, selOpWall.b);
                    const w = Math.max(0.3, Math.min(L - 0.1, v / 100));
                    patchOp(selOp.id, (o) => ({ ...o, w: round3(w), pos: round3(Math.max(w / 2 + 0.05, Math.min(L - w / 2 - 0.05, o.pos))) }));
                  }} />
                <NumField key={selOp.id + ":h:" + selOp.h} label="Yükseklik (cm)" value={selOp.h * 100} decimals={0}
                  onCommit={(v) => patchOp(selOp.id, (o) => ({ ...o, h: round3(Math.max(0.3, Math.min(4, v / 100))) }))} />
                {selOp.kind === "window" && (
                  <NumField key={selOp.id + ":s:" + selOp.sill} label="Yerden yükseklik (cm)" value={selOp.sill * 100} decimals={0}
                    onCommit={(v) => patchOp(selOp.id, (o) => ({ ...o, sill: round3(Math.max(0, Math.min(3, v / 100))) }))} />
                )}
                <NumField key={selOp.id + ":p:" + selOp.pos} label="Duvar başından (cm)" value={selOp.pos * 100} decimals={0}
                  onCommit={(v) => {
                    const L = dist(selOpWall.a, selOpWall.b);
                    patchOp(selOp.id, (o) => ({ ...o, pos: round3(Math.max(o.w / 2 + 0.05, Math.min(L - o.w / 2 - 0.05, v / 100))) }));
                  }} />
                {selOp.kind === "window" ? (
                  <label className="edge">
                    <span>Şekil</span>
                    <select value={selOp.shape} onChange={(e) => patchOp(selOp.id, (o) => ({ ...o, shape: e.target.value as Opening["shape"] }))}>
                      <option value="rect">Dikdörtgen</option>
                      <option value="arch">Kemerli</option>
                      <option value="round">Yuvarlak</option>
                    </select>
                  </label>
                ) : (
                  <div className="row">
                    <button onClick={() => patchOp(selOp.id, (o) => ({ ...o, flip: !o.flip }))}>İçe/dışa aç</button>
                    <button onClick={() => patchOp(selOp.id, (o) => ({ ...o, hinge: !o.hinge }))}>Menteşe yanı</button>
                  </div>
                )}
                <div className="muted small">Kapıyı veya pencereyi sürükleyerek duvar boyunca kaydırabilirsin.</div>
                <button className="danger" onClick={deleteSel}>Sil</button>
              </>
            )}

            {/* --- Oda --- */}
            {tool !== "plot" && selRoom && (
              <>
                <h3>Oda</h3>
                <label className="edge">
                  <span>Ad</span>
                  <input value={selRoom.name} onChange={(e) => patchRoom(selRoom.id, (r) => ({ ...r, name: e.target.value }))} />
                </label>
                <label className="edge">
                  <span>Zemin rengi</span>
                  <input type="color" value={selRoom.color} onChange={(e) => patchRoom(selRoom.id, (r) => ({ ...r, color: e.target.value }))} />
                </label>
                {(() => {
                  const reg = regions.get(selRoom.id);
                  return reg && !reg.open ? (
                    <div className="stats"><div><span>Alan (net)</span><b>{fmt(reg.area)} m²</b></div></div>
                  ) : (
                    <div className="err">Bu oda artık kapalı değil. Duvarların köşelerini birleştir.</div>
                  );
                })()}
                <button className="danger" onClick={deleteSel}>Odayı sil</button>
              </>
            )}

            {/* --- Eşya listesi --- */}
            {tool === "furn" && !selItem && (
              <>
                <h3>Eşya</h3>
                <div className="chips">
                  {CATS.map((c) => (
                    <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
                      {c}
                    </button>
                  ))}
                </div>
                <div className="catgrid">
                  {[...CATALOG, ...custom].filter((c) => c.cat === cat).map((c) => (
                    <button key={c.key} className={pick?.key === c.key ? "on" : ""} onClick={() => setPick(c)}>
                      <b>{c.name}</b>
                      <span>{Math.round(c.w * 100)} × {Math.round(c.d * 100)} cm</span>
                    </button>
                  ))}
                  {cat === "Özel" && custom.length === 0 && <div className="muted small">Henüz özel eşyan yok. Aşağıdan ekle.</div>}
                </div>
                <h4>Özel eşya ekle (kendi ölçünle)</h4>
                <label className="edge"><span>Ad</span><input value={cust.name} placeholder="Örn. Dolap" onChange={(e) => setCust({ ...cust, name: e.target.value })} /></label>
                <div className="row3">
                  <label>Genişlik (cm)<input inputMode="decimal" value={cust.w} onChange={(e) => setCust({ ...cust, w: e.target.value })} /></label>
                  <label>Derinlik (cm)<input inputMode="decimal" value={cust.d} onChange={(e) => setCust({ ...cust, d: e.target.value })} /></label>
                  <label>Yükseklik (cm)<input inputMode="decimal" value={cust.h} onChange={(e) => setCust({ ...cust, h: e.target.value })} /></label>
                </div>
                <label className="edge"><span>Renk</span><input type="color" value={cust.color} onChange={(e) => setCust({ ...cust, color: e.target.value })} /></label>
                <button className="primary" onClick={addCustom}>Listeye ekle ve seç</button>
                {pick && (
                  <div className="muted small">Seçili: <b>{pick.name}</b>. Yerleştirmek için plana dokun. Bitirince Esc veya başka bir araç seç.</div>
                )}
              </>
            )}

            {/* --- Eşya özellikleri --- */}
            {tool !== "plot" && selItem && (
              <>
                <h3>{selItem.name}</h3>
                <label className="edge">
                  <span>Ad</span>
                  <input value={selItem.name} onChange={(e) => patchItem(selItem.id, (q) => ({ ...q, name: e.target.value }))} />
                </label>
                <NumField key={selItem.id + ":w:" + selItem.w} label="Genişlik (cm)" value={selItem.w * 100} decimals={0}
                  onCommit={(v) => patchItem(selItem.id, (q) => ({ ...q, w: round3(Math.max(0.05, Math.min(20, v / 100))) }))} />
                <NumField key={selItem.id + ":d:" + selItem.d} label="Derinlik (cm)" value={selItem.d * 100} decimals={0}
                  onCommit={(v) => patchItem(selItem.id, (q) => ({ ...q, d: round3(Math.max(0.05, Math.min(20, v / 100))) }))} />
                <NumField key={selItem.id + ":h:" + selItem.h} label="Yükseklik (cm)" value={selItem.h * 100} decimals={0}
                  onCommit={(v) => patchItem(selItem.id, (q) => ({ ...q, h: round3(Math.max(0.01, Math.min(5, v / 100))) }))} />
                <NumField key={selItem.id + ":r:" + selItem.rot} label="Açı (derece)" value={selItem.rot || 0.0001} decimals={0}
                  onCommit={(v) => patchItem(selItem.id, (q) => ({ ...q, rot: ((Math.round(v) % 360) + 360) % 360 }))} />
                <label className="edge">
                  <span>Renk</span>
                  <input type="color" value={selItem.color} onChange={(e) => patchItem(selItem.id, (q) => ({ ...q, color: e.target.value }))} />
                </label>
                <div className="row">
                  <button onClick={() => patchItem(selItem.id, (q) => ({ ...q, rot: (q.rot + 90) % 360 }))}>↻ 90° döndür</button>
                  <button onClick={() => dupItem(selItem)}>Çoğalt</button>
                </div>
                <div className="muted small">Eşyayı sürükleyerek taşı.</div>
                <button className="danger" onClick={deleteSel}>Eşyayı sil</button>
              </>
            )}

            {/* --- Merdiven --- */}
            {tool !== "plot" && selStair && (
              <>
                <h3>Merdiven</h3>
                <label className="edge">
                  <span>Tür</span>
                  <select value={selStair.kind} onChange={(e) => patchStair(selStair.id, (q) => ({ ...q, kind: e.target.value as Stair["kind"] }))}>
                    <option value="straight">Düz</option>
                    <option value="L">L şeklinde</option>
                    <option value="U">U şeklinde</option>
                    <option value="spiral">Sarmal</option>
                  </select>
                </label>
                <NumField key={selStair.id + ":w:" + selStair.w} label="Genişlik (cm)" value={selStair.w * 100} decimals={0}
                  onCommit={(v) => patchStair(selStair.id, (q) => ({ ...q, w: round3(Math.max(0.6, Math.min(2, v / 100))) }))} />
                <div className="row">
                  <button onClick={() => patchStair(selStair.id, (q) => ({ ...q, rot: (q.rot + 90) % 360 }))}>↻ 90° döndür</button>
                  <button onClick={() => patchStair(selStair.id, (q) => ({ ...q, mirror: !q.mirror }))}>Aynala</button>
                </div>
                {(() => {
                  const st = stairSteps(data.height);
                  const bx = stairBox(selStair, data.height);
                  return (
                    <div className="stats">
                      <div><span>Basamak</span><b>{st.risers} × {fmt(st.riser * 100, 1)} cm</b></div>
                      <div><span>Kapladığı alan</span><b>{fmt(bx.W)} × {fmt(bx.D)} m</b></div>
                    </div>
                  );
                })()}
                <div className="muted small">Basamak sayısı, bu katın yüksekliğinden ({fmt(data.height * 100, 0)} cm) hesaplanır. Üst katta merdiven boşluğu kesikli çizgiyle görünür.</div>
                <button className="danger" onClick={deleteSel}>Merdiveni sil</button>
              </>
            )}

            {/* --- Çatı --- */}
            {tool === "roof" && (
              <>
                <h3>Çatı</h3>
                <label className="edge">
                  <span>Tür</span>
                  <select value={full.roof.kind} onChange={(e) => apply({ ...data, roof: { ...full.roof, kind: e.target.value as FullData["roof"]["kind"] } })}>
                    <option value="gable">Beşik (iki yöne eğimli)</option>
                    <option value="hip">Kırma (dört yöne eğimli)</option>
                    <option value="shed">Tek eğimli</option>
                    <option value="flat">Düz</option>
                  </select>
                </label>
                {full.roof.kind !== "flat" && (
                  <NumField key={"pitch" + full.roof.pitch} label="Eğim (derece)" value={full.roof.pitch} decimals={0}
                    onCommit={(v) => apply({ ...data, roof: { ...full.roof, pitch: Math.max(5, Math.min(70, Math.round(v))) } })} />
                )}
                <NumField key={"ov" + full.roof.overhang} label="Saçak çıkıntısı (cm)" value={full.roof.overhang * 100} decimals={0}
                  onCommit={(v) => apply({ ...data, roof: { ...full.roof, overhang: round3(Math.max(0, Math.min(2, v / 100))) } })} />
                {(full.roof.kind === "gable" || full.roof.kind === "hip" || full.roof.kind === "shed") && (
                  <label className="edge">
                    <span>Mahya yönü</span>
                    <select value={full.roof.ridge} onChange={(e) => apply({ ...data, roof: { ...full.roof, ridge: e.target.value as FullData["roof"]["ridge"] } })}>
                      <option value="auto">Otomatik (uzun kenar)</option>
                      <option value="x">Yatay (sağ-sol)</option>
                      <option value="y">Dikey (yukarı-aşağı)</option>
                    </select>
                  </label>
                )}
                <label className="edge">
                  <span>Renk</span>
                  <input type="color" value={full.roof.color} onChange={(e) => apply({ ...data, roof: { ...full.roof, color: e.target.value } })} />
                </label>
                {(() => {
                  const ri = roofInfo(full);
                  if (!ri) return <div className="muted small">Çatıyı görmek için önce duvarları çiz.</div>;
                  return (
                    <>
                      <div className="stats">
                        <div><span>Tepe yüksekliği</span><b>{full.roof.kind === "flat" ? "—" : fmt(ri.ridgeHeight) + " m"}</b></div>
                        <div><span>Tavan arası ({fmt(ATTIC_MIN)} m üstü)</span><b>{ri.usable > 0 ? fmt(ri.usable) + " m²" : "yok"}</b></div>
                      </div>
                      <div className="muted small">Çatı, en üst katın dış sınırına göre hesaplanır. Tavan arasını kat olarak kullanmak istersen “+ Kat” ile ekleyip duvarlarını alt kattan kopyalayabilirsin.</div>
                    </>
                  );
                })()}
              </>
            )}

            {/* --- Genel --- */}
            {tool !== "plot" && tool !== "roof" && tool !== "furn" && !selWall && !selOp && !selRoom && !selStair && !selItem && (
              <>
                <h3>{data.name}</h3>
                <label className="edge">
                  <span>Kat adı</span>
                  <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} onBlur={() => bump((n) => n + 1)} />
                </label>
                <NumField key={"fh" + fi + data.height} label="Kat yüksekliği (cm)" value={data.height * 100} decimals={0}
                  onCommit={(v) => apply({ ...data, height: round3(Math.max(2, Math.min(5, v / 100))) })} />
                <div className="row">
                  {fi > 0 && <button onClick={copyBelow}>Alt katın duvarlarını kopyala</button>}
                  {full.floors.length > 1 && <button className="danger" onClick={deleteFloor}>Bu katı sil</button>}
                </div>
                <div className="stats">
                  <div><span>Arsa</span><b>{plot.closed ? fmt(area(plot.points)) + " m²" : "—"}</b></div>
                  <div><span>Oda toplamı</span><b>{fmt(totalRoomArea)} m²</b></div>
                </div>
                <NumField key={"dt" + data.defT} label="Yeni duvar kalınlığı (cm)" value={data.defT * 100} decimals={0}
                  onCommit={(v) => apply({ ...data, defT: round3(Math.max(0.05, Math.min(1.5, v / 100))) })} />
                <div className="muted small">
                  {walls.length} duvar · {openings.filter((o) => o.kind === "door").length} kapı · {openings.filter((o) => o.kind === "window").length} pencere · {rooms.length} oda · {items.length} eşya
                </div>
                {tool === "select" && walls.length === 0 && <div className="muted small">Başlamak için “Duvar” aracını seç.</div>}
              </>
            )}
            <div className="ver pushb">Köy Evi Tasarım {VERSION}</div>
          </aside>
        )}
      </div>
    </div>
  );
}

function NumField({ label, value, onCommit, decimals = 2 }: { label: string; value: number; onCommit: (v: number) => void; decimals?: number }) {
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

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, bold = true) {
  g.font = `${bold ? 600 : 400} 12px system-ui`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const w = g.measureText(text).width + 10;
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(x - w / 2, y - 10, w, 20);
  g.fillStyle = color;
  g.fillText(text, x, y);
}
