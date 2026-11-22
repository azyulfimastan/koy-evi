import type { Stair } from "./types";

export const RISER_MAX = 0.18;
export const TREAD = 0.28;

export function stairSteps(height: number) {
  const risers = Math.max(2, Math.ceil(height / RISER_MAX));
  return { risers, treads: risers - 1, riser: height / risers };
}

/** Yerel (merkez orijinli) kutu boyutları */
export function stairBox(st: Stair, height: number) {
  const { treads } = stairSteps(height);
  const w = st.w;
  if (st.kind === "straight") return { W: w, D: treads * TREAD };
  if (st.kind === "spiral") {
    const R = Math.max(0.8, w);
    return { W: 2 * R, D: 2 * R };
  }
  const k1 = Math.ceil(treads / 2);
  const k2 = treads - k1;
  if (st.kind === "L") return { W: w + k2 * TREAD, D: k1 * TREAD + w };
  return { W: 2 * w + 0.1, D: k1 * TREAD + w }; // U
}

export function stairLocal(st: Stair, p: { x: number; y: number }) {
  const a = (-st.rot * Math.PI) / 180;
  const dx = p.x - st.x;
  const dy = p.y - st.y;
  let lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  if (st.mirror) lx = -lx;
  return { x: lx, y: ly };
}

export function drawStair(g: CanvasRenderingContext2D, st: Stair, height: number, s: number, ox: number, oy: number, opts: { color: string; fill: string; lw: number; ghost?: boolean }) {
  const { treads } = stairSteps(height);
  const { W, D } = stairBox(st, height);
  const w = st.w;
  g.save();
  g.translate(st.x * s + ox, st.y * s + oy);
  g.rotate((st.rot * Math.PI) / 180);
  g.scale(st.mirror ? -s : s, s);
  g.lineWidth = opts.lw / s;
  g.strokeStyle = opts.color;
  g.fillStyle = opts.fill;
  if (opts.ghost) {
    g.setLineDash([6 / s, 4 / s]);
    g.strokeRect(-W / 2, -D / 2, W, D);
    g.restore();
    return;
  }
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  const rect = (x: number, y: number, w2: number, h2: number) => {
    g.fillRect(x, y, w2, h2);
    g.strokeRect(x, y, w2, h2);
  };
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    line(x1, y1, x2, y2);
    const a = Math.atan2(y2 - y1, x2 - x1);
    const h = 0.14;
    line(x2, y2, x2 - h * Math.cos(a - 0.5), y2 - h * Math.sin(a - 0.5));
    line(x2, y2, x2 - h * Math.cos(a + 0.5), y2 - h * Math.sin(a + 0.5));
  };
  if (st.kind === "straight") {
    rect(-W / 2, -D / 2, W, D);
    for (let i = 1; i < treads; i++) line(-W / 2, -D / 2 + i * TREAD, W / 2, -D / 2 + i * TREAD);
    arrow(0, D / 2 - 0.12, 0, -D / 2 + 0.12);
  } else if (st.kind === "spiral") {
    const R = W / 2;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    for (let i = 0; i < treads; i++) {
      const a = (i / treads) * Math.PI * 2;
      line(0.12 * Math.cos(a), 0.12 * Math.sin(a), R * Math.cos(a), R * Math.sin(a));
    }
    g.beginPath();
    g.arc(0, 0, 0.12, 0, Math.PI * 2);
    g.stroke();
  } else {
    const k1 = Math.ceil(treads / 2);
    const k2 = treads - k1;
    if (st.kind === "L") {
      const x0 = -W / 2;
      const y0 = -D / 2;
      rect(x0, y0 + w, w, k1 * TREAD); // 1. kol (dikey)
      rect(x0, y0, w, w); // sahanlık
      rect(x0 + w, y0, k2 * TREAD, w); // 2. kol (yatay)
      for (let i = 1; i < k1; i++) line(x0, y0 + w + i * TREAD, x0 + w, y0 + w + i * TREAD);
      for (let i = 1; i < k2; i++) line(x0 + w + i * TREAD, y0, x0 + w + i * TREAD, y0 + w);
      arrow(x0 + w / 2, D / 2 - 0.12, x0 + w / 2, y0 + w / 2);
      arrow(x0 + w / 2, y0 + w / 2, W / 2 - 0.1, y0 + w / 2);
    } else {
      const x0 = -W / 2;
      const y0 = -D / 2;
      rect(x0, y0 + w, w, k1 * TREAD); // yukarı kol
      rect(W / 2 - w, y0 + w, w, k2 * TREAD); // aşağı kol
      rect(x0, y0, W, w); // sahanlık
      for (let i = 1; i < k1; i++) line(x0, y0 + w + i * TREAD, x0 + w, y0 + w + i * TREAD);
      for (let i = 1; i < k2; i++) line(W / 2 - w, y0 + w + i * TREAD, W / 2, y0 + w + i * TREAD);
      arrow(x0 + w / 2, D / 2 - 0.12, x0 + w / 2, y0 + w / 2);
      arrow(x0 + w / 2, y0 + w / 2, W / 2 - w / 2, y0 + w / 2);
    }
  }
  g.restore();
}
