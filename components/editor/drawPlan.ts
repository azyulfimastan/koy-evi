import type { CatItem, EnvKind, FullData, PlanData, Pt, Stair, Wall } from "@/lib/types";
import type { Region } from "@/lib/rooms";
import { endJoins, wallGeom } from "@/lib/rooms";
import { roofInfo } from "@/lib/roof";
import { drawStair } from "@/lib/stairs";
import { drawItem } from "@/lib/furniture";
import { dist, fmt } from "@/lib/geo";
import { ENV_KINDS, drawEnv } from "@/lib/env";
import { floorColor, roomImage, texPattern } from "@/lib/plan2d";
import { WALL_COLOR, defaults, type Sel, type SnapInfo, type Tool, type View } from "./shared";

export type PlanState = {
  data: PlanData;
  full: FullData;
  fi: number;
  view: View;
  sel: Sel;
  hover: Pt | null;
  chain: Pt | null;
  snapInfo: SnapInfo;
  tool: Tool;
  pick: CatItem | null;
  envPick: EnvKind | null;
  regions: Map<string, Region | null>;
  roomCanvases: Map<string, HTMLCanvasElement>;
  joins: ReturnType<typeof endJoins>;
  /** imlecin altındaki duvar ve konum (kapı/pencere önizlemesi için) */
  placeOn: (p: Pt, w: number) => { wall: Wall; pos: number } | null;
};

/** 2B planın tamamını tuvale çizer (ızgara, arsa, odalar, duvarlar, açıklıklar, eşyalar, ölçüler) */
export function drawPlan(c: HTMLCanvasElement, el: HTMLDivElement, st: PlanState) {
  const { data, full, fi, view, sel, hover, chain, snapInfo, tool, pick, envPick, regions, roomCanvases, joins, placeOn } = st;
  const { plot, walls, openings, rooms, stairs, items, env } = data;
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
    g.fillStyle = texPattern(g, "grass", "#a9c98a", s, ox, oy, 0.12) ?? "rgba(122,160,92,0.16)";
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

  // çevre nesneleri (ağaç, yol, komşu bina...)
  for (const o of [...env.objs].sort((a, b) => (a.kind === "road" ? 0 : 1) - (b.kind === "road" ? 0 : 1))) drawEnv(g, o, s, ox, oy, { selected: sel?.k === "env" && sel.id === o.id });
  if (tool === "env" && envPick && hover) {
    const k = ENV_KINDS.find((q) => q.kind === envPick)!;
    drawEnv(g, { kind: k.kind, x: hover.x, y: hover.y, rot: 0, w: k.w, d: k.d, color: k.color, name: k.name }, s, ox, oy, { ghost: true });
  }
  // oda dolguları
  for (const r of rooms) {
    const cvs = roomCanvases.get(r.id);
    const reg = regions.get(r.id);
    if (!cvs || !reg) continue;
    const tex = r.floor && r.floor !== "none" ? r.floor : "";
    const img = roomImage(g, cvs, reg, tex, floorColor(r.floor, r.floorColor, r.color), r.color + "c0");
    if (img) g.drawImage(img.cv, img.x * s + ox, img.y * s + oy, img.w * s, img.h * s);
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
      g.fillStyle = w.color === WALL_COLOR || w.color === "#cccccc" ? "#3a352e" : w.color;
      g.fill();
      g.strokeStyle = isSel ? "#d9822b" : "#3a352e";
      g.lineWidth = isSel ? 2.5 : 0.8;
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
        poly({ x: cC.x - (u.x * o.w) / 2, y: cC.y - (u.y * o.w) / 2 }, { x: cC.x + (u.x * o.w) / 2, y: cC.y + (u.y * o.w) / 2 }, n, w.t / 2);
        g.fillStyle = "#f4f8fa";
        g.fill();
        g.strokeStyle = isOpSel ? "#d9822b" : "#3a352e";
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
    // kılavuz çizgiler (kesikli)
    if (snapInfo && snapInfo.guides.length) {
      g.save();
      g.setLineDash([6, 5]);
      g.strokeStyle = "rgba(217,130,43,0.8)";
      g.lineWidth = 1.2;
      for (const gd of snapInfo.guides) {
        const ga = S(gd.a);
        const gb = S(gd.b);
        g.beginPath();
        g.moveTo(ga.x, ga.y);
        g.lineTo(gb.x, gb.y);
        g.stroke();
      }
      g.restore();
    }
    g.strokeStyle = "#d9822b";
    g.fillStyle = "#d9822b";
    g.lineWidth = 2;
    const k = snapInfo?.kind;
    if (k === "end") {
      g.strokeRect(h.x - 6, h.y - 6, 12, 12);
    } else if (k === "mid") {
      g.beginPath();
      g.moveTo(h.x, h.y - 7);
      g.lineTo(h.x + 7, h.y + 5);
      g.lineTo(h.x - 7, h.y + 5);
      g.closePath();
      g.stroke();
    } else if (k === "perp") {
      g.beginPath();
      g.moveTo(h.x - 7, h.y + 6);
      g.lineTo(h.x - 7, h.y - 6);
      g.lineTo(h.x + 7, h.y - 6);
      g.stroke();
    } else {
      g.beginPath();
      g.arc(h.x, h.y, k === "ang" || k === "align" ? 5.5 : 4.5, 0, Math.PI * 2);
      g.fill();
    }
    if (snapInfo && snapInfo.label) {
      label(g, snapInfo.label, h.x + 14, h.y + 22, "#8a4b0b");
    }
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
    if (sel?.k === "wall") continue; // seçili duvarın ölçü etiketiyle çakışmasın
    const q = S({ x: reg.cx, y: reg.cy });
    const avail = Math.sqrt(reg.area) * s; // odanın ekrandaki yaklaşık genişliği
    if (avail < 30 && !isSel) continue;
    g.font = "600 12px system-ui";
    if (avail < 95 && !isSel) {
      let t = r.name;
      while (t.length > 2 && g.measureText(t).width + 12 > avail) t = t.slice(0, -1);
      label(g, t === r.name ? t : t.slice(0, -1) + "…", q.x, q.y, "#2a2a24", true);
      continue;
    }
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

  // pusula (kuzey oku)
  {
    const cx = W - 36;
    const cy = H - 40;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.strokeStyle = "#8a8574";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 24, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.rotate((env.sun.north * Math.PI) / 180);
    g.fillStyle = "#b3392b";
    g.beginPath();
    g.moveTo(0, -19);
    g.lineTo(6, 4);
    g.lineTo(0, 0);
    g.lineTo(-6, 4);
    g.closePath();
    g.fill();
    g.fillStyle = "#2a2a24";
    g.font = "700 11px system-ui";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("K", 0, 14);
    g.restore();
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
