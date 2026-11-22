import * as THREE from "three";

/** Kaplama seçenekleri (Türkçe adlarıyla) */
export const EXT_TEX: [string, string][] = [["plain", "Düz sıva"], ["brick", "Tuğla"], ["stone", "Taş"], ["wood", "Ahşap kaplama"], ["rough", "Kaba sıva"], ["adobe", "Kerpiç / toprak sıva"]];
export const BASE_TEX: [string, string][] = [["stone", "Taş"], ["brick", "Tuğla"], ["rough", "Kaba sıva"], ["concrete", "Beton"]];
export const INT_TEX: [string, string][] = [["plain", "Düz boya"], ["wood", "Ahşap lambri"], ["fayans", "Fayans"], ["rough", "Kaba sıva"]];
export const ROOF_TEX: [string, string][] = [["tile", "Kiremit"], ["metal", "Sac (metal)"], ["shingle", "Şingle"], ["slate", "Kayrak taş"], ["plain", "Düz"]];
export const FLOOR_TEX: [string, string][] = [["none", "Varsayılan"], ["parquet", "Parke"], ["fayans", "Fayans"], ["concrete", "Beton"], ["carpet", "Halı / düz"], ["laminate", "Laminat"], ["marble", "Mermer"]];
export const FLOOR_DEFAULT: Record<string, string> = { laminate: "#b98a5c", marble: "#e8e6e1", parquet: "#c89a64", fayans: "#e6eef0", concrete: "#b9b6b0", carpet: "#cdbfa8" };
export const SWATCHES = ["#f4f0e8", "#e9e1d3", "#d9c9a8", "#c9a37a", "#a5523a", "#8a5a36", "#7a8f6a", "#8fa8b8", "#b9b6b0", "#5d5a55", "#2f3a4a", "#ffffff"];

/** Dokunun metre cinsinden kapladığı kenar uzunluğu */
export const TEX_SIZE: Record<string, number> = { brick: 1, stone: 1.5, wood: 1, tile: 1, metal: 1, shingle: 1, parquet: 1.2, fayans: 1.2, rough: 1.5, adobe: 2, grass: 4, slate: 1.2, laminate: 1.4, marble: 2, concrete: 2 };

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
  } else if (key === "rough") {
    g.fillStyle = gray(215);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 7000; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${0.05 + r() * 0.12})`;
      rect(r() * N, r() * N, 1 + r() * 3, 1 + r() * 3);
    }
  } else if (key === "adobe") {
    g.fillStyle = gray(225);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 90; i++) {
      const x = r() * N;
      const y = r() * N;
      const rad = 25 + r() * 70;
      for (const dx of [0, -N, N]) {
        const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
        const a = 0.05 + r() * 0.1;
        gr.addColorStop(0, `rgba(${r() > 0.5 ? "0,0,0" : "255,255,255"},${a})`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2);
      }
    }
  } else if (key === "slate") {
    const rows = 7;
    const rh = N / rows;
    const cw = N / 4;
    g.fillStyle = gray(90);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < rows; i++)
      for (let k = 0; k < 4; k++) {
        g.fillStyle = gray(150 + r() * 70);
        rect(k * cw + (i % 2) * (cw / 2) + 2, i * rh + 2, cw - 4, rh - 4);
        g.fillStyle = "rgba(0,0,0,0.25)";
        rect(k * cw + (i % 2) * (cw / 2) + 2, i * rh + rh - 6, cw - 4, 4);
      }
  } else if (key === "laminate") {
    const rows = 6;
    const rh = N / rows;
    g.fillStyle = gray(150);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < rows; i++) {
      let x = -r() * N * 0.6;
      while (x < N) {
        const w = N * (0.5 + r() * 0.5);
        g.fillStyle = gray(210 + r() * 40);
        rect(x + 1, i * rh + 1, w - 2, rh - 2);
        g.strokeStyle = "rgba(90,90,90,0.15)";
        g.beginPath();
        g.moveTo(x + 4, i * rh + rh * 0.3);
        g.lineTo(x + w - 4, i * rh + rh * 0.35);
        g.moveTo(x + 4, i * rh + rh * 0.7);
        g.lineTo(x + w - 4, i * rh + rh * 0.66);
        g.stroke();
        x += w;
      }
    }
  } else if (key === "marble") {
    g.fillStyle = gray(240);
    g.fillRect(0, 0, N, N);
    g.strokeStyle = "rgba(90,90,100,0.3)";
    for (let i = 0; i < 14; i++) {
      g.lineWidth = 0.5 + r() * 2;
      g.beginPath();
      const y0 = r() * N;
      g.moveTo(0, y0);
      g.bezierCurveTo(N * 0.3, y0 + (r() - 0.5) * 160, N * 0.6, y0 + (r() - 0.5) * 160, N, y0 + (r() - 0.5) * 90);
      g.stroke();
    }
    g.strokeStyle = "rgba(60,60,60,0.45)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, N, N);
  } else if (key === "grass") {
    g.fillStyle = gray(225);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 260; i++) {
      const x = r() * N;
      const y = r() * N;
      const rad = 18 + r() * 50;
      for (const dx of [0, -N, N])
        for (const dy of [0, -N, N]) {
          const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
          gr.addColorStop(0, `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${0.025 + r() * 0.04})`);
          gr.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = gr;
          g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
        }
    }
    for (let i = 0; i < 9000; i++) {
      g.strokeStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${0.05 + r() * 0.08})`;
      g.lineWidth = 1;
      const x = r() * N;
      const y = r() * N;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6);
      g.stroke();
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

/** Doku için kabartma (normal) haritası: açık renk = yüksek, koyu derz = çukur */
const NSTR: Record<string, number> = { brick: 3, stone: 3.5, wood: 1.2, tile: 3, metal: 2.2, shingle: 2.2, slate: 2.4, parquet: 0.9, laminate: 0.6, fayans: 2, marble: 0.35, rough: 2.5, adobe: 1.4, concrete: 0.8, grass: 1.6, carpet: 1 };
const ncache = new Map<string, THREE.CanvasTexture>();
export function getNormal(key: string): THREE.CanvasTexture | null {
  if (!NSTR[key]) return null;
  const hit = ncache.get(key);
  if (hit) return hit;
  const t = getTex(key);
  if (!t) return null;
  const src = t.image as HTMLCanvasElement;
  const N = src.width;
  const d = src.getContext("2d")!.getImageData(0, 0, N, N).data;
  const hgt = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) hgt[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const out = g.createImageData(N, N);
  const s = NSTR[key];
  const H = (x: number, y: number) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * s;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * s;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * N + x) * 4;
      out.data[k] = (-dx / l) * 127.5 + 127.5;
      out.data[k + 1] = (dy / l) * 127.5 + 127.5;
      out.data[k + 2] = (1 / l) * 127.5 + 127.5;
      out.data[k + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  const nt = new THREE.CanvasTexture(c);
  nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
  nt.colorSpace = THREE.NoColorSpace;
  nt.anisotropy = 4;
  ncache.set(key, nt);
  return nt;
}

/** Kaplamaya göre pürüzlülük (parlaklık) */
export const ROUGH: Record<string, number> = { parquet: 0.5, laminate: 0.45, fayans: 0.22, marble: 0.15, concrete: 0.85, carpet: 1, metal: 0.4, tile: 0.75, slate: 0.6, shingle: 0.9, brick: 0.9, stone: 0.92, wood: 0.7, plain: 0.92, rough: 0.97, adobe: 0.97 };
