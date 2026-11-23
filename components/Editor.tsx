"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Balcony, CatItem, FullData, Item, Opening, PlanData, Pt, Room, Stair, Wall } from "@/lib/types";
import { flatten, newFloor, normalizeFull, uid, unflatten, defaultFull, defaultBuild } from "@/lib/types";
import { roofInfo, ATTIC_MIN } from "@/lib/roof";
import { buildStages, floorCols } from "@/lib/stages";
import { defaultBalcony, inBalcony } from "@/lib/balcony";
import { placeExtStair, stairBox, stairLocal, stairRise, stairSteps } from "@/lib/stairs";
import { CATALOG, CATS, itemLocal } from "@/lib/furniture";
import { area, bounds, dist, fmt, perimeter, round3, setEdgeLength, snapTo, segProject } from "@/lib/geo";
import { endJoins, inRegion, rasterize, regionAt, wallGeom } from "@/lib/rooms";
import type { Region } from "@/lib/rooms";
import { VERSION } from "./App";
import dynamic from "next/dynamic";
import { floorBases, totalHeight, type V3 } from "@/lib/scene3d";
import { BASE_TEX, EXT_TEX, FLOOR_DEFAULT, FLOOR_TEX, INT_TEX, ROOF_TEX } from "@/lib/textures";
import type { Finish, EnvKind, EnvObj } from "@/lib/types";
import { ENV_KINDS, MONTHS, compassName, newEnv, sunPos } from "@/lib/env";
import type { Pick3, View3DCmd, Walk } from "./View3D";

import Replay from "./Replay";
import Tour, { type DemoKind } from "./Tour";
import Guide from "./Guide";
const Backup = dynamic(() => import("./Backup"), { ssr: false });
const Report = dynamic(() => import("./Report"), { ssr: false });
const View3D = dynamic(() => import("./View3D"), { ssr: false, loading: () => <div className="v3 v3load">3D hazırlanıyor…</div> });

import { ROOM_COLORS, TOOL_HINT, WALL_COLOR, cloneF, defaults, near, type Saved, type Sel, type SnapInfo, type Tool, type View } from "./editor/shared";
import { drawPlan } from "./editor/drawPlan";
import { MatRow, NumField } from "./editor/fields";

export default function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  const [name, setName] = useState("");
  const [full, setFull] = useState<FullData>(defaultFull());
  const [fi, setFi] = useState(0);
  const [view, setView] = useState<View>({ s: 40, ox: 0, oy: 0 });
  const [tool, setTool] = useState<Tool>("plot");
  const [sel, setSel] = useState<Sel>(null);
  // imleç önizlemesi: React yeniden çizimi tetiklemeden, karede bir kez tuvale çizilir
  const hoverRef = useRef<Pt | null>(null);
  const snapRef = useRef<SnapInfo>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const [lenEdit, setLenEdit] = useState<{ kind: "wall" | "draw"; id?: string; x: number; y: number; v: string } | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const rafDraw = useRef(0);
  const setHover = useCallback((p: Pt | null) => {
    const cur = hoverRef.current;
    if (cur === p || (cur && p && cur.x === p.x && cur.y === p.y)) return;
    hoverRef.current = p;
    if (!rafDraw.current)
      rafDraw.current = requestAnimationFrame(() => {
        rafDraw.current = 0;
        drawRef.current();
      });
  }, []);
  const [chain, setChain] = useState<Pt | null>(null);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState<CatItem | null>(null);
  const [envPick, setEnvPick] = useState<EnvKind | null>(null);
  const envPickRef = useRef(envPick);
  envPickRef.current = envPick;
  const [walk, setWalk] = useState<Walk>(null);
  const [pan3, setPan3] = useState(false);
  const [pick3, setPick3] = useState<Pick3 | null>(null);
  const [playing, setPlaying] = useState(false);
  const [walkRoom, setWalkRoom] = useState("center");
  const [is3d, setIs3d] = useState(false);
  const [live3, setLive3] = useState(false);
  // Çift/üç tıkla tam ekran: hangi panel tam ekran (null = normal)
  const [fs, setFs] = useState<null | "plan" | "live" | "main3d">(null);
  const fsRef = useRef(fs);
  fsRef.current = fs;
  const mt = useRef<{ zone: string; up: number; x: number; y: number; n: number; ok: boolean; snap: { full: FullData; pl: number; chain: Pt | null } | null }>({ zone: "", up: 0, x: 0, y: 0, n: 0, ok: false, snap: null });
  const live3First = useRef(true);
  const [showRep, setShowRep] = useState(false);
  const [showBak, setShowBak] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [helpMenu, setHelpMenu] = useState(false);
  const [helpPos, setHelpPos] = useState({ top: 100, right: 8 });
  const [more, setMore] = useState(() => {
    try {
      return localStorage.getItem("kte_fold") === "open" || window.innerWidth >= 900; // geniş ekranda hepsi açık
    } catch {
      return true;
    }
  });
  const is3dRef = useRef(is3d);
  is3dRef.current = is3d;
  const [v3, setV3] = useState<V3>({ floors: "all", roof: true, items: true, sec: "none" });
  const [secPos, setSecPos] = useState(1.3);
  const [secFlip, setSecFlip] = useState(false);
  const [cmd3, setCmd3] = useState<View3DCmd | undefined>(undefined);
  const inWalk = !!walk;
  const dfull = useDeferredValue(full);
  useEffect(() => { if (live3First.current) { live3First.current = false; return; } const t = window.setTimeout(() => fit(), 120); return () => window.clearTimeout(t); }, [live3]);
  const liveV3 = useMemo<V3>(() => ({ floors: "all", roof: full.roof.kind !== "none", items: true, sec: "none" }), [full.roof.kind]);
  const noop = useCallback(() => {}, []);
  const v3eff = useMemo<V3>(() => (inWalk ? { ...v3, sec: "none", floors: "all" } : v3), [v3, inWalk]);
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

  const { plot, walls, openings, rooms, stairs, items, custom, env } = data;
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
          img.data[i * 4 + 3] = 255;
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
        hasThumb.current = !!p.thumb;
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

  const hasThumb = useRef(false);
  const [leaving, setLeaving] = useState(false);
  async function goBack() {
    const changed = ver.current > 0 || !hasThumb.current;
    setLeaving(true);
    if (dirty.current) await putNow();
    const snap = full;
    onBack();
    // evler listesinde görünecek küçük 3B resim (arka planda)
    let skip = false;
    try {
      skip = localStorage.getItem("kte_nothumb") === "1"; // otomatik testlerde
    } catch {
      /* yok say */
    }
    if (!skip && changed && snap.floors.some((f) => f.walls.length)) {
      setTimeout(async () => {
        try {
          const { render3d } = await import("@/lib/report");
          const cv = render3d(snap, [0.9, 0.5, 1], 640, 400, false, 0.72, 1024);
          const thumb = cv.toDataURL("image/jpeg", 0.78);
          await fetch("/api/projects/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thumb }) });
          window.dispatchEvent(new CustomEvent("kte-thumb"));
        } catch {
          /* resim olmasa da sorun değil */
        }
      }, 50);
    }
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
    const pad = W < 600 ? 50 : 140;
    const extra = tourOpen ? Math.min(230, H * 0.3) : 0; // demo kartı altta yer kaplar
    const s = Math.min((W - pad) / w, (H - pad - extra) / h);
    setView({ s, ox: W / 2 - ((b.minX + b.maxX) / 2) * s, oy: (H - extra) / 2 - ((b.minY + b.maxY) / 2) * s });
  }
  const toWorld = (sx: number, sy: number): Pt => ({
    x: (sx - viewRef.current.ox) / viewRef.current.s,
    y: (sy - viewRef.current.oy) / viewRef.current.s,
  });
  const toScreen = (p: Pt) => ({ x: p.x * viewRef.current.s + viewRef.current.ox, y: p.y * viewRef.current.s + viewRef.current.oy });

  // ---------- yardımcılar ----------
  const sn = (p: Pt): Pt => ({ x: round3(snapTo(p.x, dataRef.current.snap)), y: round3(snapTo(p.y, dataRef.current.snap)) });

  /** zincirdeki son noktadan w2'ye duvar ekler (ilk tıklamada zinciri başlatır) */
  function addWallTo(w2: Pt) {
    const cur = dataRef.current;
    const ch = chainRef.current;
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
  }

  /** seçili duvarı en yakın dik/düz açıya getirir (başlangıç ucu sabit, uzunluk korunur) */
  function straightenWall(id: string) {
    const d = dataRef.current;
    const w = d.walls.find((x) => x.id === id);
    if (!w) return;
    const L = dist(w.a, w.b);
    if (L < 0.01) return;
    const th = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
    const angs: number[] = [];
    for (let k = 0; k < 4; k++) angs.push((k * Math.PI) / 2);
    for (const o of d.walls) {
      if (o.id === id) continue;
      let phi: number | null = null;
      if (near(o.a, w.a) || near(o.b, w.a)) phi = Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x);
      if (phi !== null) for (let k = 0; k < 4; k++) angs.push(phi + (k * Math.PI) / 2);
    }
    let bestA = angs[0];
    let bestD = Infinity;
    for (const a of angs) {
      const df = Math.abs(((th - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (df < bestD) {
        bestD = df;
        bestA = a;
      }
    }
    const nb = { x: round3(w.a.x + Math.cos(bestA) * L), y: round3(w.a.y + Math.sin(bestA) * L) };
    if (near(nb, w.b, 1e-4)) {
      setNote("Bu duvar zaten düz/dik.");
      return;
    }
    apply({ ...d, walls: moveEndpoints(d, w.b, nb) });
  }

  /** çift tıklama / çizerken rakam yazma: ölçü kutusunu açar */
  function openLenWall(id: string) {
    const w = dataRef.current.walls.find((x) => x.id === id);
    if (!w) return;
    const m = toScreen({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
    setLenEdit({ kind: "wall", id, x: m.x, y: m.y, v: dist(w.a, w.b).toFixed(2).replace(".", ",") });
  }
  function openLenDraw(first = "") {
    const ch = chainRef.current;
    const hv = hoverRef.current;
    if (!ch) return;
    const m = toScreen(hv ? { x: (ch.x + hv.x) / 2, y: (ch.y + hv.y) / 2 } : ch);
    setLenEdit({ kind: "draw", x: m.x, y: m.y, v: first });
  }
  function commitLen() {
    const le = lenEdit;
    setLenEdit(null);
    if (!le) return;
    const v = parseFloat(le.v.replace(",", "."));
    if (!isFinite(v) || v < 0.1 || v > 200) {
      if (le.v.trim()) setNote("Ölçü 0,1 ile 200 m arasında olmalı.");
      return;
    }
    const d = dataRef.current;
    if (le.kind === "wall" && le.id) {
      const w = d.walls.find((x) => x.id === le.id);
      if (!w) return;
      const nb = setEdgeLength([w.a, w.b], 0, round3(v))[1];
      apply({ ...d, walls: moveEndpoints(d, w.b, nb) });
    } else if (le.kind === "draw") {
      const ch = chainRef.current;
      if (!ch) return;
      const hv = hoverRef.current;
      let ux = 1;
      let uy = 0;
      if (hv && dist(hv, ch) > 1e-6) {
        const L = dist(hv, ch);
        ux = (hv.x - ch.x) / L;
        uy = (hv.y - ch.y) / L;
      }
      addWallTo({ x: round3(ch.x + ux * v), y: round3(ch.y + uy * v) });
    }
  }

  function snapWall(raw: Pt, from: Pt | null): Pt {
    const d = dataRef.current;
    const R = 12 / viewRef.current.s;
    const set = (kind: NonNullable<SnapInfo>["kind"], label: string, guides: { a: Pt; b: Pt }[] = []) => {
      snapRef.current = { kind, label, guides };
    };
    // 1) uç noktalar
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
    if (best) {
      set("end", "Uç nokta");
      return { x: best.x, y: best.y };
    }
    // 2) duvar orta noktaları
    for (const w of d.walls) {
      const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      if (dist(m, raw) < R) {
        set("mid", "Orta nokta");
        return { x: round3(m.x), y: round3(m.y) };
      }
    }
    // 3) açı kilidi (çizilen duvarın başlangıcına göre)
    if (from) {
      const dx = raw.x - from.x;
      const dy = raw.y - from.y;
      const L = Math.hypot(dx, dy);
      if (L > 0.05) {
        const th = Math.atan2(dy, dx);
        // önceki duvar (zincirin son duvarı) yönü
        let phi: number | null = null;
        for (const w of d.walls) {
          if (near(w.b, from) && dist(w.a, w.b) > 0.01) phi = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
          else if (near(w.a, from) && dist(w.a, w.b) > 0.01) phi = Math.atan2(w.a.y - w.b.y, w.a.x - w.b.x);
        }
        const D = Math.PI / 180;
        const cs: { a: number; tol: number; label: string }[] = [];
        for (let k = 0; k < 4; k++) cs.push({ a: (k * Math.PI) / 2, tol: 5 * D, label: k % 2 ? "Dikey" : "Yatay" });
        if (phi !== null) {
          for (let k = 0; k < 4; k++) {
            const a = phi + (k * Math.PI) / 2;
            cs.push({ a, tol: 5 * D, label: k % 2 ? "90° (önceki duvara dik)" : "Önceki duvarla düz" });
          }
        }
        for (let k = 0; k < 8; k++) if (k % 2) cs.push({ a: (k * Math.PI) / 4, tol: 3 * D, label: "45°" });
        let pick: { a: number; diff: number; label: string } | null = null;
        for (const c of cs) {
          const df = Math.abs(((th - c.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); // açı farkı, 0 = aynı yön
          if (df < c.tol && (!pick || df < pick.diff - 1e-9)) pick = { a: c.a, diff: df, label: c.label };
        }
        if (pick) {
          let lab = pick.label;
          // eksen + önceki duvara dik aynı anda: "90°" göster
          if (phi !== null && (lab === "Yatay" || lab === "Dikey")) {
            const rel = Math.abs((((pick.a - phi) % Math.PI) + Math.PI) % Math.PI);
            if (Math.abs(rel - Math.PI / 2) < 0.02) lab = "90° " + lab.toLowerCase();
          }
          const ux = Math.cos(pick.a);
          const uy = Math.sin(pick.a);
          const Lq = Math.max(d.snap, snapTo(L, d.snap));
          const p = { x: round3(from.x + ux * Lq), y: round3(from.y + uy * Lq) };
          const ext = 0.6;
          set("ang", lab, [{ a: from, b: { x: p.x + ux * ext, y: p.y + uy * ext } }]);
          return p;
        }
      }
    }
    // 4) duvara dik ayak noktası
    if (from) {
      for (const w of d.walls) {
        if (near(w.a, from) || near(w.b, from)) continue;
        const pr = segProject(from, w.a, w.b);
        if (pr.t <= 0.02 || pr.t >= 0.98 || pr.d < 0.05) continue;
        if (dist(pr.q, raw) < R) {
          set("perp", "Duvara dik", [{ a: from, b: pr.q }]);
          return { x: round3(pr.q.x), y: round3(pr.q.y) };
        }
      }
    }
    // 5) mevcut noktalarla hizalama + ızgara
    const p = sn(raw);
    const guides: { a: Pt; b: Pt }[] = [];
    for (const c of cands) {
      if (Math.abs(c.x - raw.x) < R * 0.6 && !guides.some((g) => g.a.x === c.x && g.a.y === c.y)) {
        p.x = c.x;
        guides.push({ a: c, b: { x: c.x, y: p.y } });
        break;
      }
    }
    for (const c of cands) {
      if (Math.abs(c.y - raw.y) < R * 0.6) {
        p.y = c.y;
        guides.push({ a: c, b: { x: p.x, y: c.y } });
        break;
      }
    }
    if (guides.length) set("align", "Hizalı", guides);
    else set("grid", "");
    return p;
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

  // ---------- çizim (components/editor/drawPlan.ts) ----------
  const draw = useCallback(() => {
    if (!cv.current || !wrap.current) return;
    drawPlan(cv.current, wrap.current, { data, full, fi, view, sel, hover: hoverRef.current, chain, snapInfo: snapRef.current, tool, pick, envPick, regions, roomCanvases, joins, placeOn });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, full, fi, view, sel, chain, tool, pick, envPick, regions, roomCanvases, joins]);
  drawRef.current = draw;

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
    | { kind: "emove"; id: string; start: Pt; x0: number; y0: number; before: FullData; moved: boolean }
    | { kind: "imove"; id: string; start: Pt; x0: number; y0: number; before: FullData; moved: boolean }
    | { kind: "bmove"; id: string; start: Pt; pos0: number; before: FullData; moved: boolean }
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
      drag.current = pan(() => addWallTo(snapWall(toWorld(p.x, p.y), chainRef.current)));
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

    if (t === "env") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const pk = envPickRef.current;
        const wp = toWorld(p.x, p.y);
        if (!pk) {
          const hit = [...cur.env.objs].reverse().find((o) => {
            const lp = itemLocal(o, wp);
            return Math.abs(lp.x) <= Math.max(o.w, 0.3) / 2 && Math.abs(lp.y) <= Math.max(o.d, 0.3) / 2;
          });
          if (hit) {
            setSel({ k: "env", id: hit.id });
            setTool("select");
          } else setNote("Önce listeden bir nesne seç.");
          return;
        }
        const pos = sn(wp);
        const o = newEnv(pk, pos.x, pos.y, uid());
        apply({ ...cur, env: { ...cur.env, objs: [...cur.env.objs, o] } });
        setSel({ k: "env", id: o.id });
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

    if (t === "balcony") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const pos = toWorld(p.x, p.y);
        const wl = hitWall(pos, 24);
        if (!wl) return;
        const pr = segProject(pos, wl.a, wl.b);
        const L = pr.L;
        const df = defaultBalcony();
        const bw = Math.min(df.w, Math.max(0.6, L - 0.2));
        const cross = (wl.b.x - wl.a.x) * (pos.y - wl.a.y) - (wl.b.y - wl.a.y) * (pos.x - wl.a.x);
        const b: Balcony = { id: uid(), wall: wl.id, pos: round3(Math.max(bw / 2, Math.min(L - bw / 2, pr.t * L))), side: cross >= 0 ? 1 : -1, ...df, w: bw };
        apply({ ...cur, balconies: [...(cur.balconies ?? []), b] });
        setSel({ k: "balcony", id: b.id });
        setTool("select");
        setHover(null);
      });
      return;
    }

    if (t === "build") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const pos = sn(toWorld(p.x, p.y));
        const list = cur.cols ?? [];
        const ex = list.find((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < 0.3);
        if (ex) apply({ ...cur, cols: list.filter((c) => c.id !== ex.id) });
        else apply({ ...cur, cols: [...list, { id: uid(), x: pos.x, y: pos.y }] });
      });
      return;
    }

    if (t === "xstair") {
      drag.current = pan(() => {
        const cur = dataRef.current;
        const pos = toWorld(p.x, p.y);
        const wl = hitWall(pos, 28);
        if (!wl) { setNote("Dış merdiven için evin bir duvarına dokun."); return; }
        const fullNow = fullRef.current;
        const rise = stairRise(fullNow, fiRef.current, { ext: true } as Stair);
        const { stair, pos: pw } = placeExtStair(cur.walls, wl, pos, 1.0, rise);
        const st: Stair = { id: uid(), ...stair };
        // o duvarda bu noktada kapı yoksa kapı ekle
        const has = cur.openings.some((o) => o.wall === wl.id && o.kind === "door" && Math.abs(o.pos - pw) < 0.8);
        const ops = has ? cur.openings : [...cur.openings, { id: uid(), wall: wl.id, pos: round3(pw), w: 1, h: 2.1, sill: 0, kind: "door" as const, shape: "rect" as const, flip: false, hinge: false }];
        apply({ ...cur, stairs: [...cur.stairs, st], openings: ops });
        setSel({ k: "stair", id: st.id });
        setTool("select");
        setHover(null);
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
    for (const b of d.balconies ?? []) {
      const bw = d.walls.find((q) => q.id === b.wall);
      if (bw && inBalcony(bw, b, w)) {
        setSel({ k: "balcony", id: b.id });
        drag.current = { kind: "bmove", id: b.id, start: w, pos0: b.pos, before: cloneFull(), moved: false };
        return;
      }
    }
    for (const st of d.stairs) {
      const lp = stairLocal(st, w);
      const bx = stairBox(st, stairRise(fullRef.current, fiRef.current, st));
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
    if (!hitRoom) {
      for (let i = d.env.objs.length - 1; i >= 0; i--) {
        const o = d.env.objs[i];
        const lp = itemLocal(o, w);
        if (Math.abs(lp.x) <= Math.max(o.w, 0.3) / 2 && Math.abs(lp.y) <= Math.max(o.d, 0.3) / 2) {
          setSel({ k: "env", id: o.id });
          drag.current = { kind: "emove", id: o.id, start: w, x0: o.x, y0: o.y, before: cloneFull(), moved: false };
          return;
        }
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
      if (t !== "wall") snapRef.current = null;
      if (t === "wall") setHover(snapWall(wpt, chainRef.current));
      else if (t === "plot" && !dataRef.current.plot.closed) setHover(sn(wpt));
      else if (t === "door" || t === "window" || t === "xstair") setHover(wpt);
      else if (t === "stair" || t === "furn" || t === "env" || t === "build") setHover(sn(wpt));
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
    } else if (d.kind === "emove") {
      const cur = dataRef.current;
      const dx = wpt.x - d.start.x;
      const dy = wpt.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * viewRef.current.s < 6) return;
      d.moved = true;
      const np = sn({ x: d.x0 + dx, y: d.y0 + dy });
      setData({ ...cur, env: { ...cur.env, objs: cur.env.objs.map((q) => (q.id === d.id ? { ...q, x: np.x, y: np.y } : q)) } });
    } else if (d.kind === "imove") {
      const cur = dataRef.current;
      const dx = wpt.x - d.start.x;
      const dy = wpt.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * viewRef.current.s < 6) return;
      d.moved = true;
      const np = sn({ x: d.x0 + dx, y: d.y0 + dy });
      setData({ ...cur, items: cur.items.map((q) => (q.id === d.id ? { ...q, x: np.x, y: np.y } : q)) });
    } else if (d.kind === "bmove") {
      const cur = dataRef.current;
      const b = (cur.balconies ?? []).find((q) => q.id === d.id);
      const bw = b && cur.walls.find((q) => q.id === b.wall);
      if (!b || !bw) return;
      const L = Math.hypot(bw.b.x - bw.a.x, bw.b.y - bw.a.y) || 1;
      const ux = (bw.b.x - bw.a.x) / L, uy = (bw.b.y - bw.a.y) / L;
      const along = (wpt.x - d.start.x) * ux + (wpt.y - d.start.y) * uy;
      if (!d.moved && Math.abs(along) * viewRef.current.s < 6) return;
      d.moved = true;
      const np = round3(Math.max(b.w / 2, Math.min(L - b.w / 2, Math.round((d.pos0 + along) * 20) / 20)));
      setData({ ...cur, balconies: (cur.balconies ?? []).map((q) => (q.id === d.id ? { ...q, pos: np } : q)) });
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

  // ---------- çift / üç tıkla tam ekran ----------
  function fsZone(t: EventTarget | null): "plan" | "live" | "main3d" | null {
    const el = t as HTMLElement | null;
    if (!el || !el.closest) return null;
    if (el.closest("button,input,select,textarea,aside,.pad,.lenbox,.floatbtn,.h3handle,.v3bar,.fsback")) return null;
    if (el.closest(".live3")) return "live";
    if (el.closest(".cv")) return "plan";
    if (el.closest(".v3")) return "main3d";
    return null;
  }
  function stageDownCap(e: React.PointerEvent) {
    if (!e.isPrimary) return;
    const z = fsZone(e.target);
    const m = mt.current;
    const now = e.nativeEvent.timeStamp; // olayın gerçek zamanı (ağır 3B çizim yavaşlatsa da doğru)
    if (!z) {
      m.n = 0;
      return;
    }
    const near = Math.hypot(e.clientX - m.x, e.clientY - m.y) < 30;
    const lt = lastTap.current;
    if (m.n >= 1 && m.zone === z && m.ok && near && now - m.up < 450 && !(lt && now - lt.t < 450)) {
      if (m.n === 1) {
        // ikinci tık: tam ekranı aç/kapat; ilk tıkın çizime etkisini geri al
        if (z === "plan" && m.snap && (past.current.length !== m.snap.pl || chainRef.current !== m.snap.chain)) {
          past.current.length = Math.min(past.current.length, m.snap.pl);
          setFull(m.snap.full);
          setChain(m.snap.chain);
          setSel(null);
        }
        setFs(fsRef.current ? null : z);
      }
      m.n += 1; // 3. tık da yutulur, nokta eklemez
      m.up = now;
      if (z === "plan") e.stopPropagation();
      return;
    }
    m.zone = z;
    m.n = 1;
    m.ok = true;
    m.x = e.clientX;
    m.y = e.clientY;
    m.up = now;
    m.snap = { full: cloneF(fullRef.current), pl: past.current.length, chain: chainRef.current };
  }
  function stageMoveCap(e: React.PointerEvent) {
    const m = mt.current;
    if (m.ok && m.n === 1 && Math.hypot(e.clientX - m.x, e.clientY - m.y) > 12) m.ok = false;
  }
  function stageUpCap(e: React.PointerEvent) {
    mt.current.up = e.nativeEvent.timeStamp;
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
    if (d.kind === "wmove" && !d.moved) {
      const now = performance.now();
      const lt = lastTap.current;
      if (lt && lt.id === d.id && now - lt.t < 450) {
        lastTap.current = null;
        openLenWall(d.id);
      } else lastTap.current = { id: d.id, t: now };
      return;
    }
    if (d.kind === "bmove" && !d.moved) return;
    if (d.kind === "smove" && !d.moved) return;
    if (d.kind === "imove" && !d.moved) return;
    if (d.kind === "emove" && !d.moved) return;
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
      apply({ ...d, walls: d.walls.filter((w) => w.id !== s.id), openings: d.openings.filter((o) => o.wall !== s.id), balconies: (d.balconies ?? []).filter((b) => b.wall !== s.id) });
    } else if (s.k === "op") {
      apply({ ...d, openings: d.openings.filter((o) => o.id !== s.id) });
    } else if (s.k === "room") {
      apply({ ...d, rooms: d.rooms.filter((r) => r.id !== s.id) });
    } else if (s.k === "balcony") {
      apply({ ...d, balconies: (d.balconies ?? []).filter((q) => q.id !== s.id) });
    } else if (s.k === "stair") {
      apply({ ...d, stairs: d.stairs.filter((q) => q.id !== s.id) });
    } else if (s.k === "item") {
      apply({ ...d, items: d.items.filter((q) => q.id !== s.id) });
    } else if (s.k === "env") {
      apply({ ...d, env: { ...d.env, objs: d.env.objs.filter((q) => q.id !== s.id) } });
    }
    setSel(null);
  }
  /** Demo: o adımı plana örnek olarak uygular (Geri al ile silinir) */
  function applyDemo(kind: DemoKind): string {
    const d = dataRef.current;
    const ptsAll = d.walls.flatMap((w) => [w.a, w.b]);
    const bb = ptsAll.length ? bounds(ptsAll) : null;
    if (kind === "plot") {
      if (d.plot.closed && d.plot.points.length >= 3) return "Arsa zaten çizili.";
      apply({ ...d, plot: { points: [{ x: -3, y: -3 }, { x: 11, y: -3 }, { x: 11, y: 8.5 }, { x: -3, y: 8.5 }], closed: true } });
      return "Arsa çizildi. İstersen Geri al ile silebilirsin.";
    }
    if (kind === "walls") {
      if (d.walls.length) return "Bu katta zaten duvar var.";
      const P = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 5.5 }, { x: 0, y: 5.5 }];
      const ws: Wall[] = P.map((a, k) => ({ id: uid(), a, b: P[(k + 1) % 4], t: d.defT, color: "#cccccc" }));
      apply({ ...d, walls: ws });
      return "4 duvar çizildi (8 × 5,5 m).";
    }
    if (!d.walls.length || !bb) return "Önce duvar adımındaki “Örnek duvarları çiz”e bas.";
    if (kind === "door" || kind === "window") {
      const w = kind === "door" ? d.walls[Math.min(2, d.walls.length - 1)] : d.walls[0];
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const o: Opening = kind === "door" ? { id: uid(), wall: w.id, pos: L / 2, w: 1, h: 2.1, sill: 0, kind: "door", shape: "rect", flip: false, hinge: false } : { id: uid(), wall: w.id, pos: L / 2, w: 1.4, h: 1.3, sill: 0.9, kind: "window", shape: "rect", flip: false, hinge: false };
      apply({ ...d, openings: [...d.openings, o] });
      return kind === "door" ? "Kapı eklendi." : "Pencere eklendi.";
    }
    const c = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    if (kind === "room") {
      if (d.rooms.length) return "Bu katta zaten oda var.";
      apply({ ...d, rooms: [{ id: uid(), name: "Salon", seed: c, color: "#f3d9a6", floor: "parquet" }] });
      return "Oda oluştu; alanı otomatik hesaplandı.";
    }
    const cat = CATALOG.find((q) => q.key === "sofa3");
    if (!cat) return "";
    const it: Item = { id: uid(), key: cat.key, name: cat.name, shape: cat.shape, x: c.x, y: c.y + 1.2, rot: 0, w: cat.w, d: cat.d, h: cat.h, elev: cat.elev ?? 0, color: cat.color };
    apply({ ...d, items: [...d.items, it] });
    return "Kanepe eklendi. Seç aracıyla sürükleyip taşıyabilirsin.";
  }
  function chooseTool(t: Tool) {
    setTool(t);
    setChain(null);
    chainFirst.current = null;
    setHover(null);
    if (t !== "select") setSel(null);
    if (t !== "furn") setPick(null);
    if (t !== "env") setEnvPick(null);
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
  const patchEnv = (id: string, f: (o: EnvObj) => EnvObj) => apply({ ...dataRef.current, env: { ...dataRef.current.env, objs: dataRef.current.env.objs.map((q) => (q.id === id ? f(q) : q)) } });
  function dupEnv(o: EnvObj) {
    const n: EnvObj = { ...o, id: uid(), x: round3(o.x + 1), y: round3(o.y + 1) };
    apply({ ...dataRef.current, env: { ...dataRef.current.env, objs: [...dataRef.current.env.objs, n] } });
    setSel({ k: "env", id: n.id });
  }
  /** Güneş ayarı: geri alma listesine yazılmaz */
  const setSun = (p: Partial<typeof env.sun>) => setFull({ ...fullRef.current, env: { ...fullRef.current.env, sun: { ...fullRef.current.env.sun, ...p } } });
  /** Başka bir kattaki öğeyi de değiştirebilen genel düzenleme (3D'de seçilenler için) */
  const onWallH = (floor: number, id: string, h: number, phase: "start" | "move") => {
    const f = fullRef.current;
    if (phase === "start") {
      commit(f);
      return;
    }
    const nf = cloneF(f);
    nf.floors = nf.floors.map((fl, i) => (i === floor ? { ...fl, walls: fl.walls.map((q) => (q.id === id ? { ...q, h } : q)) } : fl));
    setFull(nf);
  };
  const edit3d = (fn: (f: FullData) => FullData) => {
    const f = fullRef.current;
    commit(f);
    setFull(fn(cloneF(f)));
  };
  function enterWalk(roomId: string) {
    const f = fullRef.current;
    const i = fiRef.current;
    const fl = f.floors[i];
    let id2 = roomId;
    if (id2 === "center" && fl.rooms.length) id2 = fl.rooms[0].id;
    let x = 0;
    let y = 0;
    let ok = false;
    if (id2 !== "center") {
      const r = fl.rooms.find((q) => q.id === id2);
      const reg = r ? regionAt(rasterize(fl.walls), r.seed) : null;
      if (r && reg && !reg.open) {
        const c = { x: reg.cx, y: reg.cy };
        const q = inRegion(reg, c) ? c : r.seed;
        x = q.x;
        y = q.y;
        ok = true;
      }
    }
    if (!ok) {
      const pts = fl.walls.flatMap((w) => [w.a, w.b]);
      const src = pts.length ? pts : f.plot.points;
      if (src.length) {
        x = (Math.min(...src.map((q) => q.x)) + Math.max(...src.map((q) => q.x))) / 2;
        y = (Math.min(...src.map((q) => q.y)) + Math.max(...src.map((q) => q.y))) / 2;
      }
    }
    setPick3(null);
    setWalk({ x, y, floor: i, yaw: 0 });
  }
  useEffect(() => {
    if (walk && walk.floor !== fi) enterWalk("center");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fi]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const s0 = fullRef.current.env.sun;
      let h = s0.hour + 0.1;
      if (h > 21) h = 5;
      setFull({ ...fullRef.current, env: { ...fullRef.current.env, sun: { ...s0, hour: Math.round(h * 100) / 100 } } });
    }, 150);
    return () => clearInterval(t);
  }, [playing]);
  const selEnv = sel?.k === "env" ? env.objs.find((q) => q.id === sel.id) : undefined;
  const setFin = (p: Partial<Finish>) => apply({ ...dataRef.current, fin: { ...dataRef.current.fin, ...p } });
  const patchRoom = (id: string, f: (r: Room) => Room) => apply({ ...dataRef.current, rooms: dataRef.current.rooms.map((r) => (r.id === id ? f(r) : r)) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT") return;
      if (is3dRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selRef.current) {
        deleteSel();
      } else if (toolRef.current === "wall" && chainRef.current && /^[0-9.,]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openLenDraw(e.key);
      } else if (e.key === "Escape" && fsRef.current) {
        setFs(null);
      } else if (e.key === "Escape") {
        setLenEdit(null);
        setSel(null);
        setChain(null);
        chainFirst.current = null;
        if (envPickRef.current) setEnvPick(null);
        else if (pickRef.current) setPick(null);
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
  const selBal = sel?.k === "balcony" ? (data.balconies ?? []).find((q) => q.id === sel.id) : undefined;
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

  // 3D panelindeki başlıklar tıklanınca bölüm açılır / kapanır (telefonda varsayılan: sık kullanılmayanlar kapalı)
  const foldState = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!is3d) return;
    const root = document.querySelector<HTMLElement>(".editor .side");
    if (!root) return;
    const phone = (() => { try { return window.innerWidth < 700 && localStorage.getItem("kte_fold") !== "open"; } catch { return false; } })();
    const closedByDefault = (t: string) => phone && /Kesit|Kata tepeden|Güneş|Malzeme/.test(t);
    const apply = () => {
      let cur: HTMLElement | null = null;
      for (const el of Array.from(root.children) as HTMLElement[]) {
        if (el.tagName === "H4" && !el.textContent?.startsWith("Seçilen")) {
          cur = el;
          const key = el.textContent ?? "";
          if (foldState.current[key] === undefined) foldState.current[key] = closedByDefault(key);
          el.classList.add("foldh");
          el.classList.toggle("closed", foldState.current[key]);
          el.setAttribute("role", "button");
          continue;
        }
        if (el.tagName === "H4" || el.tagName === "H3") { cur = null; el.classList.remove("fold-hide"); continue; }
        el.classList.toggle("fold-hide", !!cur && foldState.current[cur.textContent ?? ""] === true);
      }
    };
    apply();
    const mo = new MutationObserver(() => { mo.disconnect(); apply(); mo.observe(root, { childList: true, subtree: false }); });
    mo.observe(root, { childList: true });
    const click = (e: Event) => {
      const h = (e.target as HTMLElement).closest("h4.foldh") as HTMLElement | null;
      if (!h) return;
      const key = h.textContent ?? "";
      foldState.current[key] = !foldState.current[key];
      apply();
    };
    root.addEventListener("click", click);
    return () => { mo.disconnect(); root.removeEventListener("click", click); };
  });
  const EXTRA_TOOLS: Tool[] = ["env", "build", "roof"];
  const showMore = more || EXTRA_TOOLS.includes(tool);
  const modes: [Tool, string][] = [
    ["select", "Seç"],
    ["plot", "Arsa"],
    ["wall", "Duvar"],
    ["door", "Kapı"],
    ["window", "Pencere"],
    ["room", "Oda"],
    ["furn", "Eşya"],
    ["env", "Çevre"],
    ["stair", "Merdiven"],
    ["xstair", "Dış merdiven"],
    ["balcony", "Balkon"],
    ["build", "Yapı"],
    ["roof", "Çatı"],
  ];

  return (
    <div className="editor">
      <div className="bar">
        <button onClick={goBack} disabled={leaving}>{leaving ? "Kaydediliyor…" : "← Evlerim"}</button>
        <input className="nm" value={name} onChange={(e) => setName(e.target.value)} aria-label="Ev adı" />
        <span className={"stat " + saved}>{stat}</span>
        <button className="bak" onClick={() => setShowBak(true)} title="Yedek ve sürüm geçmişi">💾<span className="lg"> Yedek</span></button>
        <span className="ver">Köy Evi Tasarım {VERSION}</span>
      </div>

      <div className="tools floors">
        {full.floors.map((fl, i) => (
          <button key={fl.id} className={fi === i ? "on" : ""} onClick={() => chooseFloor(i)}>
            {fl.name}
          </button>
        ))}
        {!is3d && <button className="add" onClick={addFloor}>+ Kat</button>}
        <button className={"v3btn" + (is3d ? " on" : "")} onClick={() => { setIs3d((v) => !v); setSel(null); setChain(null); setWalk(null); setPick3(null); setPlaying(false); }}>
          {is3d ? <>◧ <span className="lg">2D plana dön</span><span className="sm">2D</span></> : <>🧊 <span className="lg">3D görünüm</span><span className="sm">3D</span></>}
        </button>
        {!is3d && <button className={"v3btn live" + (live3 ? " on" : "")} onClick={() => setLive3((v) => !v)} aria-pressed={live3} title="Çizerken yanda canlı 3D göster"><span>◫ <span className="lg">Yan 3D</span><span className="sm">Yan</span></span></button>}
        <button className="v3btn rep" onClick={() => setShowRep(true)}>📋 Rapor</button>
        <span className="helpwrap">
          <button className="v3btn gd tourbtn" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHelpPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }); setHelpMenu((v) => !v); }} aria-expanded={helpMenu} title="Yardım: demo ve adım adım izle">🎬</button>
          {helpMenu && (
            <div className="helpmenu" role="menu" style={{ top: helpPos.top, right: helpPos.right }}>
              <button role="menuitem" onClick={() => { setHelpMenu(false); setTourOpen(true); setIs3d(false); }}>🎬 Nasıl kullanılır? (demo)</button>
              <button role="menuitem" className="replaybtn" onClick={() => { setHelpMenu(false); setReplayOpen(true); }}>🎞️ Bu evi adım adım izle</button>
            </div>
          )}
        </span>
      </div>
      {!is3d && (<>
      <div className="tools modes">
        {modes.filter(([t]) => !EXTRA_TOOLS.includes(t) || showMore).map(([t, l]) => (
          <button key={t} className={tool === t ? "on" : ""} onClick={() => chooseTool(t)}>
            {l}
          </button>
        ))}
        {!(EXTRA_TOOLS.includes(tool) && showMore && more === false) && (
          <button className="more" onClick={() => setMore((v) => !v)} aria-expanded={showMore}>{showMore ? "Daha az ▴" : "Daha fazla ▾"}</button>
        )}
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
      </>)}

      {!is3d && (
        <Guide
          full={full}
          is3d={is3d}
          forceOpen={guideOpen}
          onForceDone={() => setGuideOpen(false)}
          onAct={(a) => {
            if (a === "3d") setIs3d(true);
            else if (a === "report") setShowRep(true);
            else chooseTool(a);
          }}
        />
      )}
      {replayOpen && <Replay full={full} name={name} onClose={() => setReplayOpen(false)} />}
      {tourOpen && <Tour onClose={() => setTourOpen(false)} onStep={(t) => { setIs3d(false); setShowRep(false); if (t) chooseTool(t as Tool); }} onDemo={(k) => { const m = applyDemo(k); window.setTimeout(() => fit(), 80); return m; }} />}
      {showBak && (
        <Backup
          id={id}
          name={name}
          full={full}
          flush={async () => {
            if (dirty.current) await putNow();
          }}
          onRestore={(d) => {
            past.current.push(full);
            future.current = [];
            const nd = normalizeFull(d);
            setFull(nd);
            setSel(null);
            setFi((i) => Math.min(i, nd.floors.length - 1));
          }}
          onClose={() => setShowBak(false)}
        />
      )}
      {showRep && <Report full={full} name={name} onClose={() => setShowRep(false)} onPrices={(pr) => setFull((f) => ({ ...f, prices: pr }))} />}
      <div className={"stage" + (fs ? " fs fs-" + fs : "")} onPointerDownCapture={stageDownCap} onPointerMoveCapture={stageMoveCap} onPointerUpCapture={stageUpCap}>
        {fs && <button className="fsback" onClick={() => setFs(null)} aria-label="Tam ekrandan çık">⤡ Geri dön</button>}
        {is3d && <View3D full={full} fi={fi} v3={v3eff} name={name} walk={walk} pan={pan3} sel={pick3} onPick={setPick3} onExit={() => setWalk(null)} onWallH={onWallH} secPos={secPos} secFlip={secFlip} cmd={cmd3} />}
        {!is3d && live3 && (
          <div className="live3" aria-label="Canlı 3D önizleme">
            <View3D full={dfull} fi={fi} v3={liveV3} name={name} walk={null} pan={false} sel={null} onPick={noop} onExit={noop} />
            <span className="live3tag">Canlı 3D</span>
          </div>
        )}
        <div className="cv" ref={wrap} style={is3d ? { display: "none" } : undefined}>
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
          {lenEdit && (
            <div className="lenbox" style={{ left: Math.max(8, lenEdit.x - 60), top: Math.max(8, lenEdit.y - 52) }}>
              <input
                autoFocus
                inputMode="decimal"
                value={lenEdit.v}
                aria-label="Duvar uzunluğu (m)"
                onFocus={(e) => (lenEdit.kind === "wall" ? e.currentTarget.select() : e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length))}
                onChange={(e) => setLenEdit({ ...lenEdit, v: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitLen();
                  else if (e.key === "Escape") setLenEdit(null);
                  e.stopPropagation();
                }}
                onBlur={() => commitLen()}
              />
              <span>m</span>
            </div>
          )}
          {tool === "wall" && chain && (
            <div className="floatbtn">
              <button onClick={() => openLenDraw("")}>📏 Ölçü yaz</button>
              <button onClick={() => setChain(null)}>Duvarı bitir</button>
            </div>
          )}
        </div>

        {panel && (
          <aside className="side">
            {is3d ? (
              <>
                <h3>{walk ? "İç mekan" : "3D görünüm"}</h3>
                {(() => {
                  const fl = full.floors[fi];
                  const closed = fl?.rooms ?? [];
                  return (
                    <>
                      <label className="edge">
                        <span>{walk ? "Odaya git" : "Odaya gir"}</span>
                        <select value={walkRoom} onChange={(e) => setWalkRoom(e.target.value)}>
                          {closed.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                          <option value="center">Evin ortası</option>
                        </select>
                      </label>
                      <div className="row">
                        <button className="primary" onClick={() => enterWalk(walkRoom)}>{walk ? "🚶 Git" : "🚶 İçeri gir (360°)"}</button>
                        {walk && <button onClick={() => setWalk(null)}>Dışarı çık</button>}
                      </div>
                    </>
                  );
                })()}
                {walk && <div className="muted small">{full.floors[walk.floor]?.name} içindesin. Etrafına bakmak için sürükle (360°), yürümek için ▲▼◀▶ düğmeleri veya W A S D. Kat değiştirmek için üstteki kat düğmelerine dokun.</div>}

                {/* 3B'de seçilen nesne: rengini / kaplamasını değiştir */}
                {(() => {
                  if (!pick3) return <div className="muted small">Bir duvara, zemine, eşyaya, çatıya veya ağaca dokun; rengini burada değiştirirsin.</div>;
                  if (pick3.k === "wall") {
                    const w = full.floors[pick3.floor]?.walls.find((q) => q.id === pick3.id);
                    if (!w) return null;
                    const face = pick3.face === "int" ? "int" : "ext";
                    const col = face === "int" ? (w.int ?? full.fin.intColor) : (w.ext ?? full.fin.extColor);
                    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
                    const setW = (c: string | undefined) => edit3d((f) => ({ ...f, floors: f.floors.map((fl, i) => (i === pick3.floor ? { ...fl, walls: fl.walls.map((q) => (q.id === w.id ? (face === "int" ? { ...q, int: c } : { ...q, ext: c }) : q)) } : fl)) }));
                    return (
                      <div className="pk">
                        <h4>Seçilen: duvar, {face === "int" ? "iç yüz" : "dış yüz"} ({fmt(L)} m)</h4>
                        <MatRow label="Bu yüzün rengi" color={col} onColor={(c) => setW(c)} />
                        {(face === "int" ? w.int : w.ext) && <button onClick={() => setW(undefined)}>Genel renge dön</button>}
                      </div>
                    );
                  }
                  if (pick3.k === "room") {
                    const r = full.floors[pick3.floor]?.rooms.find((q) => q.id === pick3.id);
                    if (!r) return null;
                    const setR = (fn: (x: Room) => Room) => edit3d((f) => ({ ...f, floors: f.floors.map((fl, i) => (i === pick3.floor ? { ...fl, rooms: fl.rooms.map((q) => (q.id === r.id ? fn(q) : q)) } : fl)) }));
                    return (
                      <div className="pk">
                        <h4>Seçilen: {r.name} zemini</h4>
                        <label className="edge">
                          <span>Kaplama</span>
                          <select value={r.floor ?? "none"} onChange={(e) => setR((q) => ({ ...q, floor: e.target.value === "none" ? undefined : e.target.value, floorColor: undefined }))}>
                            {FLOOR_TEX.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
                          </select>
                        </label>
                        {r.floor && r.floor !== "none" && <MatRow label="Kaplama rengi" color={r.floorColor ?? FLOOR_DEFAULT[r.floor] ?? "#cccccc"} onColor={(c) => setR((q) => ({ ...q, floorColor: c }))} />}
                      </div>
                    );
                  }
                  if (pick3.k === "item") {
                    const it = full.floors[pick3.floor]?.items.find((q) => q.id === pick3.id);
                    if (!it) return null;
                    const setI = (fn: (x: Item) => Item) => edit3d((f) => ({ ...f, floors: f.floors.map((fl, i) => (i === pick3.floor ? { ...fl, items: fl.items.map((q) => (q.id === it.id ? fn(q) : q)) } : fl)) }));
                    return (
                      <div className="pk">
                        <h4>Seçilen: {it.name}</h4>
                        <MatRow label="Renk" color={it.color} onColor={(c) => setI((q) => ({ ...q, color: c }))} />
                        <div className="row">
                          <button onClick={() => setI((q) => ({ ...q, rot: (q.rot + 90) % 360 }))}>↻ 90° döndür</button>
                          <button className="danger" onClick={() => { edit3d((f) => ({ ...f, floors: f.floors.map((fl, i) => (i === pick3.floor ? { ...fl, items: fl.items.filter((q) => q.id !== it.id) } : fl)) })); setPick3(null); }}>Sil</button>
                        </div>
                      </div>
                    );
                  }
                  if (pick3.k === "roof") {
                    return (
                      <div className="pk">
                        <h4>Seçilen: çatı</h4>
                        <MatRow label="Çatı" color={full.roof.color} tex={full.roof.tex} opts={ROOF_TEX}
                          onColor={(c) => edit3d((f) => ({ ...f, roof: { ...f.roof, color: c } }))}
                          onTex={(t) => edit3d((f) => ({ ...f, roof: { ...f.roof, tex: t } }))} />
                      </div>
                    );
                  }
                  const eo = full.env.objs.find((q) => q.id === pick3.id);
                  if (!eo) return null;
                  return (
                    <div className="pk">
                      <h4>Seçilen: {eo.name}</h4>
                      <MatRow label="Renk" color={eo.color} onColor={(c) => edit3d((f) => ({ ...f, env: { ...f.env, objs: f.env.objs.map((q) => (q.id === eo.id ? { ...q, color: c } : q)) } }))} />
                      <button className="danger" onClick={() => { edit3d((f) => ({ ...f, env: { ...f.env, objs: f.env.objs.filter((q) => q.id !== eo.id) } })); setPick3(null); }}>Sil</button>
                    </div>
                  );
                })()}

                {!walk && (() => {
                  // kesit aralığı: evin sınırları ve yüksekliği
                  const pts = full.floors.flatMap((fl) => fl.walls.flatMap((w) => [w.a, w.b]));
                  const bb = pts.length ? bounds(pts) : { minX: 0, maxX: 10, minY: 0, maxY: 10 };
                  const bases = floorBases(full);
                  const H = Math.max(0.5, totalHeight(full));
                  const rng: [number, number] = v3.sec === "h" ? [0.1, H] : v3.sec === "x" ? [bb.minX - 0.5, bb.maxX + 0.5] : [bb.minY - 0.5, bb.maxY + 0.5];
                  const setSec = (sec: V3["sec"]) => {
                    if (sec === "h") setSecPos(+((bases[fi] ?? 0) + 1.3).toFixed(2));
                    if (sec === "x") setSecPos(+((bb.minX + bb.maxX) / 2).toFixed(2));
                    if (sec === "z") setSecPos(+((bb.minY + bb.maxY) / 2).toFixed(2));
                    setV3({ ...v3, sec });
                  };
                  const fromTop = (k: number) => {
                    setFi(k);
                    setSecPos(+((bases[k] ?? 0) + 1.3).toFixed(2));
                    setV3({ ...v3, sec: "h", floors: "upto", roof: false });
                    setCmd3({ preset: "top", n: Date.now() });
                  };
                  return (
                    <>
                      <h4>✂️ Kesit</h4>
                      <div className="chips seg">
                        {([["none", "Yok"], ["h", "Yatay"], ["x", "Doğu–Batı"], ["z", "Kuzey–Güney"]] as [V3["sec"], string][]).map(([k, l]) => (
                          <button key={k} className={v3.sec === k ? "on" : ""} onClick={() => setSec(k)}>{l}</button>
                        ))}
                      </div>
                      {v3.sec !== "none" && (
                        <>
                          <label className="rng">
                            <span>{v3.sec === "h" ? "Kesit yüksekliği" : "Kesit yeri"}: <b>{fmt(secPos, 2)} m</b></span>
                            <input type="range" min={rng[0]} max={rng[1]} step={0.05} value={Math.min(rng[1], Math.max(rng[0], secPos))} onChange={(e) => setSecPos(parseFloat(e.target.value))} aria-label="Kesit yeri" />
                          </label>
                          {v3.sec !== "h" && <button onClick={() => setSecFlip((v) => !v)}>⇄ Diğer tarafı göster</button>}
                          <div className="muted small">Kaydırıcıyı sürükle; düzlemin ötesi gizlenir, kesilen duvarlar koyu görünür.</div>
                        </>
                      )}
                      <h4>🔝 Kata tepeden bak</h4>
                      <div className="chips seg">
                        {full.floors.map((fl, k) => (
                          <button key={fl.id} className={v3.sec === "h" && v3.floors === "upto" && fi === k ? "on" : ""} onClick={() => fromTop(k)}>{fl.name}</button>
                        ))}
                        {(v3.sec !== "none" || v3.floors !== "all" || !v3.roof) && (
                          <button onClick={() => { setV3({ ...v3, sec: "none", floors: "all", roof: true }); setCmd3({ preset: "corner", n: Date.now() }); }}>🏠 Bütün ev</button>
                        )}
                      </div>
                    </>
                  );
                })()}
                <h4>🏗️ İnşaat aşamaları</h4>
                {(() => {
                  const stages = buildStages(full);
                  const last = stages.length - 1;
                  const si = v3.stage === undefined ? last : Math.min(v3.stage, last);
                  const go = (n: number) => setV3({ ...v3, stage: n >= last ? undefined : Math.max(0, n), sec: "none", floors: "all", roof: true });
                  return (
                    <div className="stagebox">
                      <div className="muted small">{si + 1} / {stages.length}</div>
                      <div className="stagename">{stages[si].label}</div>
                      <input type="range" min={0} max={last} value={si} aria-label="İnşaat aşaması" onChange={(e) => go(+e.target.value)} />
                      <div className="row">
                        <button onClick={() => go(si - 1)} disabled={si <= 0}>◀ Geri</button>
                        <button onClick={() => go(si + 1)} disabled={si >= last}>İleri ▶</button>
                        {si < last && <button onClick={() => go(last)}>Tamamlandı</button>}
                      </div>
                      <div className="muted small">Kazı, temel, şap, direk, duvar, kapı-pencere ve betonu sırayla gör. Ayarlar: Yapı aracı.</div>
                    </div>
                  );
                })()}
                <h4>Güneş ve gölge</h4>
                {(() => {
                  const sp = sunPos(env.sun);
                  const hh = Math.floor(env.sun.hour);
                  const mm = Math.round((env.sun.hour - hh) * 60);
                  return (
                    <>
                      <label className="chk"><input type="checkbox" checked={env.sun.shadows} onChange={(e) => setSun({ shadows: e.target.checked })} /> Gölgeleri göster</label>
                      <label className="edge">
                        <span>Ay</span>
                        <select value={env.sun.month} onChange={(e) => setSun({ month: parseInt(e.target.value) })}>
                          {MONTHS.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
                        </select>
                      </label>
                      <label className="rng">
                        <span>Saat: {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}</span>
                        <input type="range" min={0} max={24} step={0.25} value={env.sun.hour} onChange={(e) => setSun({ hour: parseFloat(e.target.value) })} />
                      </label>
                      <button onClick={() => setPlaying((v) => !v)}>{playing ? "⏸ Durdur" : "▶ Gün boyu oynat"}</button>
                      <label className="rng">
                        <span>Kuzey yönü: {Math.round(env.sun.north)}°</span>
                        <input type="range" min={0} max={359} step={1} value={env.sun.north} onChange={(e) => setSun({ north: parseFloat(e.target.value) })} />
                      </label>
                      <NumField key={"lat" + env.sun.lat} label="Enlem (°)" value={env.sun.lat} decimals={1} onCommit={(v) => setSun({ lat: Math.min(80, v) })} />
                      <div className="stats">
                        <div><span>Güneş yüksekliği</span><b>{sp.alt > 0 ? Math.round(sp.alt) + "°" : "Gece"}</b></div>
                        <div><span>Güneşin yönü</span><b>{sp.alt > 0 ? compassName(sp.az) + " (" + Math.round(sp.az) + "°)" : "–"}</b></div>
                      </div>
                      <div className="muted small">Planın üst kenarı kuzey sayılır. Arsanın kuzeyi başka yöndeyse “Kuzey yönü” ile çevir; 2D plandaki pusula da döner. Enlem: Polonya için yaklaşık 50–54.</div>
                    </>
                  );
                })()}

                {!walk && (
                  <>
                    <h4>Görünüm</h4>
                    <label className="edge">
                      <span>Katlar</span>
                      <select value={v3.floors} onChange={(e) => setV3({ ...v3, floors: e.target.value as V3["floors"] })}>
                        <option value="all">Tüm katlar</option>
                        <option value="upto">{full.floors[fi]?.name}’e kadar</option>
                        <option value="only">Yalnız {full.floors[fi]?.name}</option>
                      </select>
                    </label>
                    <label className="chk"><input type="checkbox" checked={v3.roof} disabled={v3.sec === "h" || full.roof.kind === "none"} onChange={(e) => setV3({ ...v3, roof: e.target.checked })} /> Çatıyı göster{full.roof.kind === "none" ? " (çatı eklenmedi)" : v3.sec === "h" ? " (yatay kesitte gizli)" : ""}</label>
                    <label className="chk"><input type="checkbox" checked={v3.items} onChange={(e) => setV3({ ...v3, items: e.target.checked })} /> Eşyaları göster</label>
                    <label className="chk"><input type="checkbox" checked={pan3} onChange={(e) => setPan3(e.target.checked)} /> Tek parmakla kaydır (telefon)</label>
                    <div className="stats">
                      <div><span>Kat sayısı</span><b>{full.floors.length}</b></div>
                      <div><span>Toplam yükseklik</span><b>{fmt(totalHeight(full), 2)} m</b></div>
                    </div>
                  </>
                )}
                <h4>Malzeme ve renkler</h4>
                <MatRow label="Dış duvar" color={full.fin.extColor} tex={full.fin.extTex} opts={EXT_TEX}
                  onColor={(c) => setFin({ extColor: c })} onTex={(t) => setFin({ extTex: t })} />
                <MatRow label="İç duvar" color={full.fin.intColor} tex={full.fin.intTex} opts={INT_TEX}
                  onColor={(c) => setFin({ intColor: c })} onTex={(t) => setFin({ intTex: t })} />
                <MatRow label="Çatı" color={full.roof.color} tex={full.roof.tex} opts={ROOF_TEX}
                  onColor={(c) => apply({ ...dataRef.current, roof: { ...dataRef.current.roof, color: c } })}
                  onTex={(t) => apply({ ...dataRef.current, roof: { ...dataRef.current.roof, tex: t } })} />
                <MatRow label="Subasman (taban taşı)" color={full.fin.baseColor ?? "#a39b8e"} tex={full.fin.baseTex ?? "stone"} opts={BASE_TEX}
                  onColor={(c) => setFin({ baseColor: c })} onTex={(t) => setFin({ baseTex: t })} />
                <MatRow label="Kapılar" color={full.fin.doorColor} onColor={(c) => setFin({ doorColor: c })} />
                <MatRow label="Pencere çerçevesi" color={full.fin.frameColor} onColor={(c) => setFin({ frameColor: c })} />
                <MatRow label="Bahçe zemini" color={full.fin.groundColor} onColor={(c) => setFin({ groundColor: c })} />
                <div className="muted small">
                  Fare: sol veya orta tuşa basılı tutup sürükle = 360° döndür · sağ tuş = kaydır · tekerlek = yakınlaştır.
                  Telefon: tek parmak = döndür · iki parmak = yakınlaştır ve döndür.
                </div>
                {full.floors.every((fl) => !fl.walls.length) && <div className="muted small">Henüz duvar yok. 2D planda duvar çizince ev burada görünür.</div>}
              </>
            ) : (<>
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
                    <h4>Arsa eğimi</h4>
                    <NumField key={"slope" + (full.terrain?.slope ?? 0)} label="Eğim (%)" value={full.terrain?.slope ?? 0} decimals={1}
                      onCommit={(v) => edit3d((f) => ({ ...f, terrain: { slope: Math.max(0, Math.min(25, Math.round(v * 10) / 10)), dir: f.terrain?.dir ?? 0 } }))} />
                    <label className="edge">
                      <span>Alçalma yönü</span>
                      <select value={full.terrain?.dir ?? 0} onChange={(e) => edit3d((f) => ({ ...f, terrain: { slope: f.terrain?.slope ?? 0, dir: +e.target.value } }))}>
                        {[["Kuzeye doğru", 0], ["Kuzeydoğu", 45], ["Doğuya doğru", 90], ["Güneydoğu", 135], ["Güneye doğru", 180], ["Güneybatı", 225], ["Batıya doğru", 270], ["Kuzeybatı", 315]].map(([l, v]) => (<option key={v as number} value={v as number}>{l as string}</option>))}
                      </select>
                    </label>
                    <div className="muted small">Eğim 3D'de görünür; ev en yüksek köşesinde zemine oturur, alçalan tarafta beton cokol çıkar ve metraja eklenir. 0 = düz arsa.</div>
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
                <button className="straightbtn" onClick={() => straightenWall(selWall.id)}>
                  📐 90° / düz yap
                </button>
                <NumField
                  key={selWall.id + ":t:" + selWall.t}
                  label="Kalınlık (cm)"
                  value={selWall.t * 100}
                  decimals={0}
                  onCommit={(v) => patchWall(selWall.id, (w) => ({ ...w, t: round3(Math.max(0.05, Math.min(1.5, v / 100))) }))}
                />
                <NumField
                  key={selWall.id + ":h:" + (selWall.h ?? "kat") + data.height}
                  label={selWall.h ? "Yükseklik (cm) · özel" : "Yükseklik (cm) · kat ile aynı"}
                  value={(selWall.h ?? data.height) * 100}
                  decimals={0}
                  onCommit={(v) =>
                    patchWall(selWall.id, (w) => {
                      const h = round3(Math.max(0.3, Math.min(8, v / 100)));
                      const { h: _old, ...rest } = w;
                      void _old;
                      return Math.abs(h - data.height) < 0.001 ? rest : { ...rest, h };
                    })
                  }
                />
                <label className="edge">
                  <span>Plan rengi (2D)</span>
                  <input type="color" value={selWall.color} onChange={(e) => patchWall(selWall.id, (w) => ({ ...w, color: e.target.value }))} />
                </label>
                <h4>Boya / kaplama rengi (3D)</h4>
                <label className="edge">
                  <span>Dış yüz</span>
                  <input type="color" value={selWall.ext ?? full.fin.extColor} onChange={(e) => patchWall(selWall.id, (w) => ({ ...w, ext: e.target.value }))} />
                </label>
                <label className="edge">
                  <span>İç yüz</span>
                  <input type="color" value={selWall.int ?? full.fin.intColor} onChange={(e) => patchWall(selWall.id, (w) => ({ ...w, int: e.target.value }))} />
                </label>
                {(selWall.ext || selWall.int) && (
                  <button onClick={() => patchWall(selWall.id, (w) => ({ ...w, ext: undefined, int: undefined }))}>Genel renge dön</button>
                )}
                <div className="muted small">Uçlardaki turuncu noktaları sürükleyerek uzat, duvarın gövdesini sürükleyerek taşı.</div>
                <button className="danger" onClick={deleteSel}>Duvarı sil</button>
              </>
            )}

            {/* --- Kapı / pencere --- */}
            {tool !== "plot" && selOp && selOpWall && (
              <>
                <h3>{selOp.kind === "door" ? "Kapı" : "Pencere"}</h3>
                <div className="muted small">Hazır ölçüler</div>
                <div className="chips seg">
                  {(selOp.kind === "door"
                    ? [["Tek kanat 90", 0.9, 2.1, 0, "rect"], ["Çift kanat 160", 1.6, 2.15, 0, "rect"], ["Giriş 100", 1.0, 2.2, 0, "rect"], ["Kemerli 100", 1.0, 2.3, 0, "arch"], ["Garaj 250", 2.5, 2.2, 0, "rect"], ["Balkon kapısı 150", 1.5, 2.2, 0, "rect"]]
                    : [["Küçük 60", 0.6, 0.6, 1.5, "rect"], ["Standart 120", 1.2, 1.2, 0.9, "rect"], ["Geniş 180", 1.8, 1.3, 0.9, "rect"], ["Fransız 150", 1.5, 2.2, 0, "rect"], ["Kemerli 90", 0.9, 1.4, 0.9, "arch"], ["Yuvarlak 60", 0.6, 0.6, 1.5, "round"]]
                  ).map(([l, w, h, sl, sh]) => (
                    <button key={l as string} onClick={() => {
                      const L = dist(selOpWall.a, selOpWall.b);
                      const ww = Math.min(w as number, Math.max(0.3, L - 0.2));
                      patchOp(selOp.id, (o) => ({ ...o, w: ww, h: h as number, sill: sl as number, shape: sh as Opening["shape"], pos: round3(Math.max(ww / 2 + 0.05, Math.min(L - ww / 2 - 0.05, o.pos))) }));
                    }}>{l as string}</button>
                  ))}
                </div>
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
                <label className="edge">
                  <span>Zemin kaplaması (3D)</span>
                  <select value={selRoom.floor ?? "none"} onChange={(e) => patchRoom(selRoom.id, (r) => ({ ...r, floor: e.target.value === "none" ? undefined : e.target.value, floorColor: undefined }))}>
                    {FLOOR_TEX.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
                  </select>
                </label>
                {selRoom.floor && selRoom.floor !== "none" && (
                  <label className="edge">
                    <span>Kaplama rengi</span>
                    <input type="color" value={selRoom.floorColor ?? FLOOR_DEFAULT[selRoom.floor] ?? "#cccccc"} onChange={(e) => patchRoom(selRoom.id, (r) => ({ ...r, floorColor: e.target.value }))} />
                  </label>
                )}
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

            {/* --- Çevre listesi --- */}
            {tool === "env" && !selEnv && (
              <>
                <h3>Çevre nesneleri</h3>
                <div className="catgrid">
                  {ENV_KINDS.map((k) => (
                    <button key={k.kind} className={envPick === k.kind ? "on" : ""} onClick={() => setEnvPick(k.kind)}>
                      <b>{k.name}</b>
                      <span>{k.w} × {k.d} m</span>
                    </button>
                  ))}
                </div>
                {envPick ? (
                  <div className="muted small">Seçili: <b>{ENV_KINDS.find((q) => q.kind === envPick)?.name}</b>. Yerleştirmek için plana dokun. Bitirince Esc veya başka bir araç seç.</div>
                ) : (
                  <div className="muted small">Arsanın dışına da koyabilirsin (yol, komşu bina). Yerleştirdikten sonra boyutunu ve rengini değiştirebilirsin.</div>
                )}
                <div className="muted small">{env.objs.length} çevre nesnesi var.</div>
              </>
            )}

            {/* --- Çevre nesnesi özellikleri --- */}
            {tool !== "plot" && selEnv && (
              <>
                <h3>{selEnv.name}</h3>
                <label className="edge">
                  <span>Ad</span>
                  <input value={selEnv.name} onChange={(e) => patchEnv(selEnv.id, (q) => ({ ...q, name: e.target.value }))} />
                </label>
                <NumField key={selEnv.id + ":w:" + selEnv.w} label="Genişlik (m)" value={selEnv.w} onCommit={(v) => patchEnv(selEnv.id, (q) => ({ ...q, w: round3(Math.min(200, v)) }))} />
                <NumField key={selEnv.id + ":d:" + selEnv.d} label="Derinlik (m)" value={selEnv.d} onCommit={(v) => patchEnv(selEnv.id, (q) => ({ ...q, d: round3(Math.min(200, v)) }))} />
                <NumField key={selEnv.id + ":h:" + selEnv.h} label="Yükseklik (m)" value={selEnv.h} onCommit={(v) => patchEnv(selEnv.id, (q) => ({ ...q, h: round3(Math.min(50, v)) }))} />
                <NumField key={selEnv.id + ":r:" + selEnv.rot} label="Açı (derece)" value={selEnv.rot || 0.0001} decimals={0}
                  onCommit={(v) => patchEnv(selEnv.id, (q) => ({ ...q, rot: ((Math.round(v) % 360) + 360) % 360 }))} />
                <label className="edge">
                  <span>Renk</span>
                  <input type="color" value={selEnv.color} onChange={(e) => patchEnv(selEnv.id, (q) => ({ ...q, color: e.target.value }))} />
                </label>
                <div className="row">
                  <button onClick={() => patchEnv(selEnv.id, (q) => ({ ...q, rot: (q.rot + 90) % 360 }))}>↻ 90° döndür</button>
                  <button onClick={() => dupEnv(selEnv)}>Çoğalt</button>
                </div>
                <div className="muted small">Nesneyi sürükleyerek taşı.</div>
                <button className="danger" onClick={deleteSel}>Nesneyi sil</button>
              </>
            )}

            {/* --- Merdiven --- */}
            {tool !== "plot" && selStair && (
              <>
                <h3>Merdiven</h3>
                {selStair.ext && <div className="muted small">🪜 Dış merdiven: zeminden bu katın döşemesine çıkar, üstünde sahanlık ve korkuluk vardır.</div>}
                {!selStair.ext && <label className="edge">
                  <span>Tür</span>
                  <select value={selStair.kind} onChange={(e) => patchStair(selStair.id, (q) => ({ ...q, kind: e.target.value as Stair["kind"] }))}>
                    <option value="straight">Düz</option>
                    <option value="L">L şeklinde</option>
                    <option value="U">U şeklinde</option>
                    <option value="spiral">Sarmal</option>
                  </select>
                </label>}
                <NumField key={selStair.id + ":w:" + selStair.w} label="Genişlik (cm)" value={selStair.w * 100} decimals={0}
                  onCommit={(v) => patchStair(selStair.id, (q) => ({ ...q, w: round3(Math.max(0.6, Math.min(2, v / 100))) }))} />
                <div className="row">
                  <button onClick={() => patchStair(selStair.id, (q) => ({ ...q, rot: (q.rot + 90) % 360 }))}>↻ 90° döndür</button>
                  <button onClick={() => patchStair(selStair.id, (q) => ({ ...q, mirror: !q.mirror }))}>Aynala</button>
                </div>
                {(() => {
                  const rise = stairRise(full, fi, selStair);
                  const st = stairSteps(rise);
                  const bx = stairBox(selStair, rise);
                  return (
                    <div className="stats">
                      <div><span>Basamak</span><b>{st.risers} × {fmt(st.riser * 100, 1)} cm</b></div>
                      <div><span>Kapladığı alan</span><b>{fmt(bx.W)} × {fmt(bx.D)} m</b></div>
                    </div>
                  );
                })()}
                {selStair.ext && stairRise(full, fi, selStair) <= 0.31 && <div className="warnbox">⚠️ Çıkılacak yükseklik yok. Yapı panelinden kaide yüksekliğini gir ya da bu merdiveni üst kata koy.</div>}
                <div className="muted small">Basamak sayısı, {selStair.ext ? "zeminden bu katın döşemesine olan yükseklikten" : "bu katın yüksekliğinden"} ({fmt(stairRise(full, fi, selStair) * 100, 0)} cm) hesaplanır. Üst katta merdiven boşluğu kesikli çizgiyle görünür.</div>
                <button className="danger" onClick={deleteSel}>Merdiveni sil</button>
              </>
            )}

            {tool !== "plot" && selBal && (() => {
              const bw = data.walls.find((q) => q.id === selBal.wall);
              const L = bw ? Math.hypot(bw.b.x - bw.a.x, bw.b.y - bw.a.y) : 0;
              const patch = (f: (q: Balcony) => Balcony) => apply({ ...data, balconies: (data.balconies ?? []).map((q) => (q.id === selBal.id ? f(q) : q)) });
              return (
                <>
                  <h3>Balkon</h3>
                  <NumField key={selBal.id + ":w:" + selBal.w} label="Genişlik (cm)" value={selBal.w * 100} decimals={0}
                    onCommit={(v) => patch((q) => { const w2 = round3(Math.max(0.6, Math.min(L || 8, v / 100))); return { ...q, w: w2, pos: round3(Math.max(w2 / 2, Math.min(L - w2 / 2, q.pos))) }; })} />
                  <NumField key={selBal.id + ":d:" + selBal.d} label="Dışarı çıkma (cm)" value={selBal.d * 100} decimals={0}
                    onCommit={(v) => patch((q) => ({ ...q, d: round3(Math.max(0.6, Math.min(4, v / 100))) }))} />
                  <NumField key={selBal.id + ":p:" + selBal.pos} label="Duvar başından konum (cm)" value={selBal.pos * 100} decimals={0}
                    onCommit={(v) => patch((q) => ({ ...q, pos: round3(Math.max(q.w / 2, Math.min(L - q.w / 2, v / 100))) }))} />
                  <label className="edge">
                    <span>Korkuluk</span>
                    <select value={selBal.rail} onChange={(e) => patch((q) => ({ ...q, rail: e.target.value as Balcony["rail"] }))}>
                      <option value="bars">Demir parmaklık</option>
                      <option value="glass">Cam</option>
                      <option value="solid">Duvar (beton)</option>
                    </select>
                  </label>
                  <NumField key={selBal.id + ":h:" + selBal.railH} label="Korkuluk yüksekliği (cm)" value={selBal.railH * 100} decimals={0}
                    onCommit={(v) => patch((q) => ({ ...q, railH: round3(Math.max(0.8, Math.min(1.4, v / 100))) }))} />
                  <NumField key={selBal.id + ":t:" + selBal.slabT} label="Döşeme kalınlığı (cm)" value={selBal.slabT * 100} decimals={0}
                    onCommit={(v) => patch((q) => ({ ...q, slabT: round3(Math.max(0.1, Math.min(0.4, v / 100))) }))} />
                  <div className="row">
                    <button onClick={() => patch((q) => ({ ...q, side: (q.side === 1 ? -1 : 1) as 1 | -1 }))}>⇄ Diğer yöne çevir</button>
                  </div>
                  <div className="stats">
                    <div><span>Alan</span><b>{fmt(selBal.w * selBal.d)} m²</b></div>
                    <div><span>Korkuluk</span><b>{fmt(selBal.w + 2 * selBal.d)} m</b></div>
                  </div>
                  <div className="muted small">Balkon kapısı için aynı duvara Kapı aracıyla kapı ekle. Korkuluk yüksekliği yönetmeliklerde en az 100 cm istenir.</div>
                  <button className="danger" onClick={deleteSel}>Balkonu sil</button>
                </>
              );
            })()}

            {/* --- Yapı: temel, şap, beton, direk --- */}
            {tool === "build" && (() => {
              const b = full.build ?? defaultBuild();
              const setB = (patch: Partial<typeof b>) => apply({ ...data, build: { ...b, ...patch } });
              const manual = (data.cols ?? []).length;
              const total = floorCols(full, fi).length;
              return (
                <>
                  <h3>Yapı: temel, şap, beton, direk</h3>
                  <div className="muted small">Burada yaptığın ayarlar 3D'deki <b>🏗️ İnşaat aşamaları</b>nda ve metrajda kullanılır.</div>
                  <h4>Temel</h4>
                  <label className="edge">
                    <span>Temel türü</span>
                    <select value={b.foundation} onChange={(e) => setB({ foundation: e.target.value as typeof b.foundation })}>
                      <option value="strip">Şerit temel (duvar altı)</option>
                      <option value="raft">Radye (tüm zemin)</option>
                      <option value="none">Temel yok</option>
                    </select>
                  </label>
                  {b.foundation === "strip" && (
                    <>
                      <NumField key={"fd" + b.fDepth} label="Temel derinliği (cm)" value={b.fDepth * 100} decimals={0} onCommit={(v) => setB({ fDepth: round3(Math.max(0.3, Math.min(2.5, v / 100))) })} />
                      <NumField key={"fw" + b.fWidth} label="Temel genişliği (cm)" value={b.fWidth * 100} decimals={0} onCommit={(v) => setB({ fWidth: round3(Math.max(0.3, Math.min(1.5, v / 100))) })} />
                    </>
                  )}
                  <h4>Kaide (yükseltilmiş temel)</h4>
                  <NumField key={"pl" + b.plinth} label="Ev zeminden ne kadar yüksekte (cm)" value={b.plinth * 100} decimals={0} onCommit={(v) => setB({ plinth: round3(Math.max(0, Math.min(2.5, v / 100))) })} />
                  {b.plinth > 0 && (
                    <label className="edge">
                      <span>Kaide görünümü</span>
                      <select value={b.plinthTex} onChange={(e) => setB({ plinthTex: e.target.value as typeof b.plinthTex })}>
                        <option value="concrete">Beton (gri)</option>
                        <option value="stone">Taş kaplama</option>
                      </select>
                    </label>
                  )}
                  <div className="muted small">0 = ev zeminle aynı seviyede. Yükseltirsen ev bu kadar yukarıdan başlar; girişe çıkmak için <b>Dış merdiven</b> aracını kullan.</div>
                  <h4>Zemin ve katlar</h4>
                  <label className="chk"><input type="checkbox" checked={b.screed} onChange={(e) => setB({ screed: e.target.checked })} /> Zemin betonu ve şap</label>
                  <NumField key={"sl" + b.slabT} label="Kat betonu kalınlığı (cm)" value={b.slabT * 100} decimals={0} onCommit={(v) => setB({ slabT: round3(Math.max(0.1, Math.min(0.4, v / 100))) })} />
                  <label className="chk"><input type="checkbox" checked={b.topSlab} onChange={(e) => setB({ topSlab: e.target.checked })} /> En üst kata da tavan betonu at</label>
                  <h4>Direkler (kolonlar)</h4>
                  <label className="chk"><input type="checkbox" checked={b.autoCols} onChange={(e) => setB({ autoCols: e.target.checked })} /> Köşelere ve uzun duvarlara otomatik direk</label>
                  <NumField key={"cs" + b.colSize} label="Direk kenarı (cm)" value={b.colSize * 100} decimals={0} onCommit={(v) => setB({ colSize: round3(Math.max(0.15, Math.min(0.6, v / 100))) })} />
                  <div className="stats">
                    <div><span>Bu katta direk</span><b>{total}</b></div>
                    <div><span>Elle koyduğun</span><b>{manual}</b></div>
                  </div>
                  {manual > 0 && <button onClick={() => apply({ ...data, cols: [] })}>Elle koyduğum direkleri sil</button>}
                  <div className="muted small">Mavi kare: elle koyduğun, gri kare: otomatik. Plana dokunarak direk ekle; elle koyduğuna tekrar dokunursan silinir.</div>
                </>
              );
            })()}

            {/* --- Çatı --- */}
            {tool === "roof" && (
              <>
                <h3>Çatı</h3>
                <label className="edge">
                  <span>Tür</span>
                  <select value={full.roof.kind} onChange={(e) => apply({ ...data, roof: { ...full.roof, kind: e.target.value as FullData["roof"]["kind"] } })}>
                    <option value="none">Çatı yok (3D'de çatı görünmez)</option>
                    <option value="gable">Beşik (iki yöne eğimli)</option>
                    <option value="hip">Kırma (dört yöne eğimli)</option>
                    <option value="shed">Tek eğimli</option>
                    <option value="flat">Düz</option>
                  </select>
                </label>
                {full.roof.kind === "none" && <div className="muted small">Çatı eklenmedi. 3D görünümde ev çatısız görünür. Çatı istersen yukarıdan bir tür seç.</div>}
                {full.roof.kind !== "none" && (
                  <>
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
                  <span>Kaplama (3D)</span>
                  <select value={full.roof.tex} onChange={(e) => apply({ ...data, roof: { ...full.roof, tex: e.target.value } })}>
                    {ROOF_TEX.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
                  </select>
                </label>
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
                      <div className="muted small">Çatı, en üst katın dış sınırına göre hesaplanır; L, T, U gibi şekillerde her kanada ayrı çatı kurulur. Tavan arasını kat olarak kullanmak istersen “+ Kat” ile ekleyip duvarlarını alt kattan kopyalayabilirsin.</div>
                    </>
                  );
                })()}
                  </>
                )}
              </>
            )}

            {/* --- Genel --- */}
            {tool !== "plot" && tool !== "roof" && tool !== "build" && tool !== "balcony" && tool !== "furn" && tool !== "env" && !selWall && !selOp && !selRoom && !selStair && !selBal && !selItem && !selEnv && (
              <>
                <h3>{data.name}</h3>
                <label className="edge">
                  <span>Kat adı</span>
                  <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} onBlur={() => bump((n) => n + 1)} />
                </label>
                <NumField key={"fh" + fi + data.height} label="Tavan / kat yüksekliği (cm)" value={data.height * 100} decimals={0}
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
            </>)}
            <div className="ver pushb">Köy Evi Tasarım {VERSION}</div>
          </aside>
        )}
      </div>
    </div>
  );
}

