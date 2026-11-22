import * as THREE from "three";
import type { FullData } from "./types";
import { computeReport, type Line } from "./quantities";
import { buildHouse, disposeTree, setNight } from "./scene3d";
import { applyLookSun, disposeLook, renderLook, setupLook } from "./look";
import { rasterize, regionAt, wallGeom, endJoins } from "./rooms";
import { drawItem } from "./furniture";
import { drawStair } from "./stairs";
import { fmt, bounds } from "./geo";
import { fillMaskWithPattern, floorColor, texPattern } from "./plan2d";

const PW = 1240;
const PH = 1754;
const M = 80;
const INK = "#2b2a26";
const MUTE = "#7a7466";
const FONT = "system-ui, 'Segoe UI', Roboto, Arial, sans-serif";

/** Ev için 3B resim (ekran dışı) */
export function render3d(f: FullData, dir: [number, number, number], w = 1100, h = 700, ortho = false, zoom = 1, shadow = 4096): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#cfdbe6", 120, 640);
  const look = setupLook(renderer, scene, { shadow, composer: true, msaa: 4 });
  look.composer?.setSize(w, h);
  const top = Math.max(0, f.floors.length - 1);
  const b = buildHouse(f, top, { floors: "all", roof: true, items: true, sec: "none" });
  b.house.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  b.ground.traverse((o) => ((o as THREE.Mesh).receiveShadow = true));
  b.env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  scene.add(b.ground, b.env, b.house);
  const box = new THREE.Box3().setFromObject(b.house);
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 2, 10));
  const c = box.getCenter(new THREE.Vector3());
  const R = Math.max(8, box.getSize(new THREE.Vector3()).length() / 2);
  const all = box.clone();
  all.union(new THREE.Box3().setFromObject(b.env));
  applyLookSun(look, { ...f.env.sun, hour: Math.min(17, Math.max(9, f.env.sun.hour)) }, all);
  setNight(b.house, 0);
  const v = new THREE.Vector3(...dir).normalize();
  let cam: THREE.Camera;
  if (ortho) {
    const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    oc.position.copy(c).addScaledVector(v, R * 4);
    oc.lookAt(c);
    oc.updateMatrixWorld(true);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const px of [box.min.x, box.max.x]) for (const py of [box.min.y, box.max.y]) for (const pz of [box.min.z, box.max.z]) {
      const q = new THREE.Vector3(px, py, pz).applyMatrix4(oc.matrixWorldInverse);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let hw = ((x1 - x0) / 2) * 1.12, hh = ((y1 - y0) / 2) * 1.12;
    if (hw / hh < w / h) hw = hh * (w / h); else hh = hw / (w / h);
    oc.left = cx - hw; oc.right = cx + hw; oc.top = cy + hh; oc.bottom = cy - hh;
    oc.updateProjectionMatrix();
    cam = oc;
  } else {
    const pc = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    const fov = (pc.fov * Math.PI) / 180;
    const fit = (R / Math.sin(fov / 2) / Math.min(1, pc.aspect)) * 0.95 * zoom;
    pc.position.copy(c).addScaledVector(v, fit);
    pc.near = Math.max(0.05, fit / 200);
    pc.lookAt(c);
    pc.updateProjectionMatrix();
    cam = pc;
  }
  renderLook(look, cam, true);
  // sonucu kalıcı 2D tuvale kopyala, GL'yi bırak
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(canvas, 0, 0);
  disposeTree(scene);
  disposeLook(look);
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

/** Bir katın planını çiz (metre → piksel) */
export function renderPlan(f: FullData, fi: number, w = 1080, h = 1000): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#fffdf7";
  g.fillRect(0, 0, w, h);
  const fl = f.floors[fi];
  const pts: { x: number; y: number }[] = [];
  f.floors.forEach((q) => q.walls.forEach((wl) => pts.push(wl.a, wl.b)));
  f.plot.points.forEach((p) => pts.push(p));
  if (!pts.length) return cv;
  const bb = bounds(pts);
  const pad = 70;
  const s = Math.min((w - 2 * pad) / Math.max(1, bb.maxX - bb.minX), (h - 2 * pad) / Math.max(1, bb.maxY - bb.minY));
  const ox = (w - s * (bb.maxX - bb.minX)) / 2 - bb.minX * s;
  const oy = (h - s * (bb.maxY - bb.minY)) / 2 - bb.minY * s;
  const X = (x: number) => x * s + ox;
  const Y = (y: number) => y * s + oy;
  // arsa (çim dokulu)
  if (f.plot.points.length > 1) {
    g.beginPath();
    f.plot.points.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
    if (f.plot.closed) {
      g.closePath();
      g.fillStyle = texPattern(g, "grass", "#a9c98a", s, ox, oy, 0.12) ?? "#e4eed8";
      g.fill();
    }
    g.strokeStyle = "#7a9a5a";
    g.lineWidth = 2;
    g.setLineDash([10, 6]);
    g.stroke();
    g.setLineDash([]);
  }
  // odalar
  const ras = rasterize(fl.walls);
  const labels: { t: string; a: string; x: number; y: number }[] = [];
  for (const rm of fl.rooms) {
    const reg = regionAt(ras, rm.seed);
    if (!reg || reg.open) continue;
    const mk = document.createElement("canvas");
    mk.width = reg.w;
    mk.height = reg.h;
    const mg = mk.getContext("2d")!;
    const img = mg.createImageData(reg.w, reg.h);
    for (let i = 0; i < reg.mask.length; i++) if (reg.mask[i]) img.data[i * 4 + 3] = 255;
    mg.putImageData(img, 0, 0);
    const tex = rm.floor && rm.floor !== "none" ? rm.floor : "";
    const pat = tex ? texPattern(g, tex, floorColor(rm.floor, rm.floorColor, rm.color), s, ox, oy) : null;
    fillMaskWithPattern(g, mk, X(reg.x0), Y(reg.y0), reg.w * reg.cell * s, reg.h * reg.cell * s, pat ?? rm.color + "c0", 1);
    labels.push({ t: rm.name, a: fmt(reg.area, 1) + " m²", x: reg.cx, y: reg.cy });
  }
  // duvarlar
  const joins = endJoins(fl.walls);
  g.fillStyle = "#3a3630";
  for (const wl of fl.walls) {
    const { L, u, n, ea, eb } = wallGeom(wl, joins.get(wl.id));
    const ax = wl.a.x - u.x * ea;
    const ay = wl.a.y - u.y * ea;
    const len = L + ea + eb;
    const hx = (n.x * wl.t) / 2;
    const hy = (n.y * wl.t) / 2;
    g.beginPath();
    g.moveTo(X(ax + hx), Y(ay + hy));
    g.lineTo(X(ax + u.x * len + hx), Y(ay + u.y * len + hy));
    g.lineTo(X(ax + u.x * len - hx), Y(ay + u.y * len - hy));
    g.lineTo(X(ax - hx), Y(ay - hy));
    g.closePath();
    g.fill();
  }
  // açıklıklar
  for (const o of fl.openings) {
    const wl = fl.walls.find((q) => q.id === o.wall);
    if (!wl) continue;
    const { L, u, n } = wallGeom(wl, undefined);
    const cx = wl.a.x + u.x * o.pos;
    const cy = wl.a.y + u.y * o.pos;
    const hw = o.w / 2;
    const ht = wl.t / 2;
    void L;
    g.fillStyle = "#fffdf7";
    g.beginPath();
    g.moveTo(X(cx - u.x * hw + n.x * ht), Y(cy - u.y * hw + n.y * ht));
    g.lineTo(X(cx + u.x * hw + n.x * ht), Y(cy + u.y * hw + n.y * ht));
    g.lineTo(X(cx + u.x * hw - n.x * ht), Y(cy + u.y * hw - n.y * ht));
    g.lineTo(X(cx - u.x * hw - n.x * ht), Y(cy - u.y * hw - n.y * ht));
    g.closePath();
    g.fill();
    g.strokeStyle = o.kind === "door" ? "#8a5a36" : "#4a86a8";
    g.lineWidth = o.kind === "door" ? 3 : 4;
    g.beginPath();
    g.moveTo(X(cx - u.x * hw), Y(cy - u.y * hw));
    g.lineTo(X(cx + u.x * hw), Y(cy + u.y * hw));
    g.stroke();
  }
  for (const st of fl.stairs) drawStair(g, st, fl.height, s, ox, oy, { color: "#6d6155", fill: "#e8dcc4", lw: 1.5 });
  for (const it of fl.items) drawItem(g, it, s, ox, oy, { label: false });
  // duvar ölçüleri
  {
    const wp: { x: number; y: number }[] = [];
    fl.walls.forEach((q) => wp.push(q.a, q.b));
    if (wp.length) {
      const mcx = wp.reduce((a, p) => a + p.x, 0) / wp.length;
      const mcy = wp.reduce((a, p) => a + p.y, 0) / wp.length;
      g.font = `600 17px ${FONT}`;
      g.textAlign = "center";
      for (const wl of fl.walls) {
        const L = Math.hypot(wl.b.x - wl.a.x, wl.b.y - wl.a.y);
        if (L < 0.8) continue;
        const ux = (wl.b.x - wl.a.x) / L;
        const uy = (wl.b.y - wl.a.y) / L;
        let nx = -uy;
        let ny = ux;
        const mx = (wl.a.x + wl.b.x) / 2;
        const my = (wl.a.y + wl.b.y) / 2;
        if ((mx - mcx) * nx + (my - mcy) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        const off = wl.t / 2 + 26 / s;
        const tx = X(mx + nx * off);
        const ty = Y(my + ny * off);
        const t = fmt(L, 2) + " m";
        const tw = g.measureText(t).width + 10;
        g.fillStyle = "rgba(255,253,247,0.92)";
        g.fillRect(tx - tw / 2, ty - 13, tw, 24);
        g.fillStyle = "#2f5f8a";
        g.fillText(t, tx, ty + 5);
      }
    }
  }
  // etiketler
  g.textAlign = "center";
  for (const l of labels) {
    g.fillStyle = INK;
    g.font = `600 22px ${FONT}`;
    g.fillText(l.t, X(l.x), Y(l.y) - 2);
    g.fillStyle = MUTE;
    g.font = `20px ${FONT}`;
    g.fillText(l.a, X(l.x), Y(l.y) + 22);
  }
  // ölçek çubuğu
  const bar = [1, 2, 5, 10].find((v) => v * s > 120) ?? 10;
  g.fillStyle = INK;
  g.fillRect(pad, h - 36, bar * s, 5);
  g.textAlign = "left";
  g.font = `20px ${FONT}`;
  g.fillText(`${bar} m`, pad + bar * s + 10, h - 28);
  // kuzey oku
  const na = (f.env.sun.north * Math.PI) / 180;
  g.save();
  g.translate(w - 70, 70);
  g.rotate(na);
  g.fillStyle = "#b3402a";
  g.beginPath();
  g.moveTo(0, -34);
  g.lineTo(12, 10);
  g.lineTo(-12, 10);
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = INK;
  g.textAlign = "center";
  g.font = `700 22px ${FONT}`;
  g.fillText("K", w - 70, 112);
  return cv;
}

/* ---------- sayfa yardımcıları ---------- */
class Page {
  cv = document.createElement("canvas");
  g: CanvasRenderingContext2D;
  y = M;
  constructor(public title: string, public n: number) {
    this.cv.width = PW;
    this.cv.height = PH;
    this.g = this.cv.getContext("2d")!;
    this.g.fillStyle = "#ffffff";
    this.g.fillRect(0, 0, PW, PH);
    this.g.fillStyle = MUTE;
    this.g.font = `18px ${FONT}`;
    this.g.textAlign = "left";
    this.g.fillText(`Köy Evi Tasarım · ${title}`, M, PH - 40);
    this.g.textAlign = "right";
    this.g.fillText(String(n), PW - M, PH - 40);
    this.g.textAlign = "left";
  }
  h1(t: string) {
    this.g.fillStyle = INK;
    this.g.font = `700 44px ${FONT}`;
    this.g.fillText(t, M, this.y + 36);
    this.y += 70;
  }
  h2(t: string) {
    this.y += 14;
    this.g.fillStyle = "#3f6b2a";
    this.g.font = `700 30px ${FONT}`;
    this.g.fillText(t, M, this.y + 26);
    this.g.fillRect(M, this.y + 36, PW - 2 * M, 2);
    this.y += 56;
  }
  text(t: string, c = INK, sz = 24) {
    this.g.fillStyle = c;
    this.g.font = `${sz}px ${FONT}`;
    this.g.fillText(t, M, this.y + sz);
    this.y += sz + 12;
  }
  img(src: HTMLCanvasElement, maxH: number) {
    const w = PW - 2 * M;
    const k = Math.min(w / src.width, maxH / src.height);
    const dw = src.width * k;
    const dh = src.height * k;
    this.g.drawImage(src, M + (w - dw) / 2, this.y, dw, dh);
    this.y += dh + 16;
  }
  imgAt(src: HTMLCanvasElement, x: number, y: number, w: number, label: string) {
    const h = (src.height / src.width) * w;
    this.g.drawImage(src, x, y, w, h);
    this.g.strokeStyle = "#ddd6c2";
    this.g.lineWidth = 2;
    this.g.strokeRect(x, y, w, h);
    this.g.fillStyle = INK;
    this.g.font = `600 22px ${FONT}`;
    this.g.fillText(label, x + 6, y + h + 28);
    return h;
  }
  row(cols: [string, number, ("l" | "r")?][], bold = false, shade = false) {
    const g = this.g;
    if (shade) {
      g.fillStyle = "#f3efe3";
      g.fillRect(M, this.y, PW - 2 * M, 38);
    }
    g.fillStyle = INK;
    g.font = `${bold ? "700" : "400"} 22px ${FONT}`;
    let x = M + 10;
    for (const [t, wd, al] of cols) {
      g.textAlign = al === "r" ? "right" : "left";
      let s = t;
      while (g.measureText(s).width > wd - 14 && s.length > 3) s = s.slice(0, -2);
      if (s !== t) s += "…";
      g.fillText(s, al === "r" ? x + wd - 14 : x, this.y + 27);
      x += wd;
    }
    g.textAlign = "left";
    this.y += 38;
  }
  get left() {
    return PH - 90 - this.y;
  }
}

/** Tüm raporu sayfa tuvalleri olarak üret */
export function buildPages(f: FullData, title: string): HTMLCanvasElement[] {
  const rep = computeReport(f);
  const pages: Page[] = [];
  const np = (t = title) => {
    const p = new Page(t, pages.length + 1);
    pages.push(p);
    return p;
  };
  const date = new Date().toLocaleDateString("tr-TR");

  let p = np();
  p.h1(title);
  p.text(`Köy Evi Tasarım raporu · ${date}`, MUTE, 22);
  p.y += 10;
  p.h2("Özet");
  if (rep.plotArea) p.text(`Arsa alanı: ${fmt(rep.plotArea, 1)} m²`);
  p.text(`Kat sayısı: ${f.floors.length} · toplam yükseklik (duvar): ${fmt(rep.height, 1)} m`);
  p.text(`Zemin kat oda alanı: ${fmt(rep.footprint, 1)} m² · tüm katlarda oda alanı: ${fmt(rep.totalArea, 1)} m²`);
  if (rep.plotArea && rep.footprint) p.text(`Arsaya oranla zemin kat: %${fmt((rep.footprint / rep.plotArea) * 100, 1)}`, MUTE, 22);
  p.h2("Görünüm");
  try {
    p.img(render3d(f, [0.9, 0.7, 1]), 620);
  } catch {
    p.text("3B resim oluşturulamadı.", MUTE);
  }
  if (p.left > 420) {
    try {
      p.img(render3d(f, [0, 0.25, 1], 1100, 520), 400);
    } catch {
      /* yok say */
    }
  }

  f.floors.forEach((fl, fi) => {
    if (!fl.walls.length && !fl.items.length) return;
    p = np();
    p.h1(`${fl.name} planı`);
    p.text(`Kat yüksekliği ${fmt(fl.height, 2)} m · ${fl.walls.length} duvar · ${fl.openings.length} kapı/pencere · ${fl.items.length} eşya`, MUTE, 22);
    p.y += 6;
    p.img(renderPlan(f, fi), 1100);
    const rs = rep.rooms.filter((r) => r.floor === fl.name);
    if (rs.length && p.left > 80 + rs.length * 38) {
      p.h2("Odalar");
      for (const r of rs) p.row([[r.name, 700], [fmt(r.area, 2) + " m²", 340, "r"]]);
    }
  });

  if (f.floors.some((q) => q.walls.length)) {
    p = np("Cepheler");
    p.h1("Cepheler");
    p.text("Dört yönden düz (ortografik) görünüm. Ölçekli değildir, yalnızca biçimi göstermek içindir.", MUTE, 20);
    p.y += 10;
    const cw = (PW - 2 * M - 24) / 2;
    const views: [string, [number, number, number]][] = [["Ön cephe", [0, 0.03, 1]], ["Arka cephe", [0, 0.03, -1]], ["Sağ cephe", [1, 0.03, 0]], ["Sol cephe", [-1, 0.03, 0]]];
    let col = 0;
    let rowH = 0;
    for (const [lab, dir] of views) {
      try {
        const im = render3d(f, dir, 900, 620, true);
        const hh = p.imgAt(im, M + col * (cw + 24), p.y, cw, lab);
        rowH = Math.max(rowH, hh);
      } catch {
        /* yok say */
      }
      if (col === 1) {
        p.y += rowH + 50;
        rowH = 0;
      }
      col = 1 - col;
    }
  }

  p = np("Oda alanları ve malzeme");
  p.h1("Oda alanları");
  if (!rep.rooms.length) p.text("Kapalı oda yok.", MUTE);
  else {
    p.row([["Kat", 300], ["Oda", 420], ["Alan", 340, "r"]], true, true);
    let tot = 0;
    for (const r of rep.rooms) {
      if (p.left < 60) p = np("Oda alanları");
      p.row([[r.floor, 300], [r.name, 420], [fmt(r.area, 2) + " m²", 340, "r"]]);
      tot += r.area;
    }
    p.row([["", 300], ["Toplam", 420], [fmt(tot, 2) + " m²", 340, "r"]], true, true);
  }
  const table = (head: string, ls: Line[], withNote: boolean) => {
    if (!ls.length) return;
    if (p.left < 200) p = np("Malzeme listesi");
    p.h2(head);
    for (const l of ls) {
      if (p.left < 70) p = np("Malzeme listesi");
      p.row([[l.name, withNote ? 560 : 760], [`${fmt(l.qty, Number.isInteger(l.qty) ? 0 : 2)} ${l.unit}`, withNote ? 200 : 340, "r"], ...(withNote ? ([[l.note ?? "", 280]] as [string, number][]) : [])]);
    }
  };
  table("Malzeme miktarı (yaklaşık)", rep.lines, true);
  table("Kaba yapı ve tesisat (tahmini)", rep.rough, true);
  table("Kapı ve pencereler", rep.openings, false);
  table("Eşya listesi", rep.items, false);
  if (p.left < 110) p = np("Notlar");
  p.y += 20;
  p.text("Miktarlar plandan otomatik hesaplanır, yaklaşıktır; satın almadan önce usta/mimarla doğrulayın.", MUTE, 20);
  p.text(`Fire payı %${rep.waste * 100} olarak eklenmiştir.`, MUTE, 20);
  return pages.map((q) => q.cv);
}

export async function makePdf(f: FullData, title: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pages = buildPages(f, title);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pages.forEach((cv, i) => {
    if (i) doc.addPage();
    doc.addImage(cv.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, 210, 297);
  });
  return doc.output("blob");
}
