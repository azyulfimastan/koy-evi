import * as THREE from "three";

/** Kaplama seçenekleri (Türkçe adlarıyla) */
export const EXT_TEX: [string, string][] = [["plain", "Düz sıva"], ["brick", "Tuğla"], ["stone", "Taş"], ["wood", "Ahşap kaplama"]];
export const INT_TEX: [string, string][] = [["plain", "Düz boya"], ["wood", "Ahşap lambri"]];
export const ROOF_TEX: [string, string][] = [["tile", "Kiremit"], ["metal", "Sac (metal)"], ["shingle", "Şingle"], ["plain", "Düz"]];
export const FLOOR_TEX: [string, string][] = [["none", "Varsayılan"], ["parquet", "Parke"], ["fayans", "Fayans"], ["concrete", "Beton"], ["carpet", "Halı / düz"]];
export const FLOOR_DEFAULT: Record<string, string> = { parquet: "#c89a64", fayans: "#e6eef0", concrete: "#b9b6b0", carpet: "#cdbfa8" };
export const SWATCHES = ["#f4f0e8", "#e9e1d3", "#d9c9a8", "#c9a37a", "#a5523a", "#8a5a36", "#7a8f6a", "#8fa8b8", "#b9b6b0", "#5d5a55", "#2f3a4a", "#ffffff"];

/** Dokunun metre cinsinden kapladığı kenar uzunluğu */
export const TEX_SIZE: Record<string, number> = { brick: 1, stone: 1.5, wood: 1, tile: 1, metal: 1, shingle: 1, parquet: 1.2, fayans: 1.2, concrete: 2 };

const cache = new Map<string, THREE.CanvasTexture>();

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gray = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`;

export function getTex(key: string): THREE.CanvasTexture | null {
  if (!TEX_SIZE[key]) return null;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const N = 512;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const r = rng(key.length * 977 + key.charCodeAt(0));
  const rect = (x: number, y: number, w: number, h: number) => {
    // kenarlardan taşan parçaları karşı kenara da çiz (kesintisiz döşeme)
    for (const dx of [0, -N]) for (const dy of [0, -N]) g.fillRect(x + dx, y + dy, w, h);
  };
  if (key === "brick") {
    g.fillStyle = gray(150);
    g.fillRect(0, 0, N, N);
    const rows = 14;
    const rh = N / rows;
    const bw = N / 4;
    for (let i = 0; i < rows; i++)
      for (let k = 0; k < 4; k++) {
        g.fillStyle = gray(205 + r() * 50);
        rect(k * bw + (i % 2) * (bw / 2) + 2, i * rh + 2, bw - 4, rh - 4);
      }
  } else if (key === "stone") {
    g.fillStyle = gray(135);
    g.fillRect(0, 0, N, N);
    const rows = 5;
    let y = 0;
    for (let i = 0; i < rows; i++) {
      const h = i === rows - 1 ? N - y : N / rows + (r() - 0.5) * 40;
      let x = -r() * 60;
      while (x < N) {
        const w = 90 + r() * 110;
        g.fillStyle = gray(185 + r() * 65);
        rect(x + 3, y + 3, w - 6, h - 6);
        x += w;
      }
      y += h;
    }
  } else if (key === "wood") {
    const n = 8;
    for (let i = 0; i < n; i++) {
      g.fillStyle = gray(215 + r() * 40);
      g.fillRect((i * N) / n, 0, N / n, N);
      g.strokeStyle = "rgba(90,90,90,0.18)";
      for (let k = 0; k < 6; k++) {
        const x = (i * N) / n + 6 + r() * (N / n - 12);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + (r() - 0.5) * 6, N);
        g.stroke();
      }
      g.fillStyle = "rgba(60,60,60,0.55)";
      g.fillRect((i * N) / n, 0, 2.5, N);
    }
  } else if (key === "tile") {
    const rows = 6;
    const cols = 8;
    const rh = N / rows;
    const cw = N / cols;
    g.fillStyle = gray(120);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < rows; i++)
      for (let k = 0; k < cols; k++) {
        const x = k * cw + (i % 2) * (cw / 2);
        const y = i * rh;
        const base = 205 + r() * 40;
        for (const dx of [0, -N]) {
          const gr = g.createLinearGradient(0, y, 0, y + rh);
          gr.addColorStop(0, gray(base - 55));
          gr.addColorStop(0.35, gray(base));
          gr.addColorStop(1, gray(base - 25));
          g.fillStyle = gr;
          g.fillRect(x + dx + 1.5, y, cw - 3, rh - 1);
        }
        g.fillStyle = "rgba(0,0,0,0.25)";
        for (const dx of [0, -N]) g.fillRect(x + dx, y + rh - 2.5, cw, 2.5);
      }
  } else if (key === "metal") {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const gr = g.createLinearGradient((i * N) / n, 0, ((i + 1) * N) / n, 0);
      gr.addColorStop(0, gray(250));
      gr.addColorStop(0.45, gray(215));
      gr.addColorStop(0.55, gray(150));
      gr.addColorStop(1, gray(235));
      g.fillStyle = gr;
      g.fillRect((i * N) / n, 0, N / n, N);
    }
  } else if (key === "shingle") {
    const rows = 8;
    const rh = N / rows;
    const cw = N / 6;
    g.fillStyle = gray(120);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < rows; i++)
      for (let k = 0; k < 6; k++) {
        g.fillStyle = gray(180 + r() * 60);
        rect(k * cw + (i % 2) * (cw / 2) + 1.5, i * rh, cw - 3, rh - 2);
        g.fillStyle = "rgba(0,0,0,0.3)";
        rect(k * cw + (i % 2) * (cw / 2) + 1.5, i * rh + rh - 5, cw - 3, 3);
      }
  } else if (key === "parquet") {
    const rows = 8;
    const rh = N / rows;
    g.fillStyle = gray(120);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < rows; i++)
      for (let k = 0; k < 2; k++) {
        const x = k * (N / 2) + (i % 2) * (N / 4);
        g.fillStyle = gray(205 + r() * 50);
        rect(x + 1.5, i * rh + 1.5, N / 2 - 3, rh - 3);
        g.strokeStyle = "rgba(80,80,80,0.2)";
        for (let q = 0; q < 3; q++) {
          const yy = i * rh + 8 + r() * (rh - 16);
          g.beginPath();
          g.moveTo(x + 4, yy);
          g.lineTo(x + N / 2 - 4, yy + (r() - 0.5) * 4);
          g.stroke();
        }
      }
  } else if (key === "fayans") {
    g.fillStyle = gray(165);
    g.fillRect(0, 0, N, N);
    const n = 4;
    for (let i = 0; i < n; i++)
      for (let k = 0; k < n; k++) {
        g.fillStyle = gray(240 + r() * 15);
        g.fillRect((k * N) / n + 2.5, (i * N) / n + 2.5, N / n - 5, N / n - 5);
      }
  } else {
    g.fillStyle = gray(200);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + r() * 0.08})`;
      rect(r() * N, r() * N, 2 + r() * 6, 2 + r() * 6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
