import { FLOOR_DEFAULT, TEX_SIZE, getTex } from "./textures";

/** 2B plan için renklendirilmiş doku desenleri (RoomSketcher tarzı zeminler) */
const tinted = new Map<string, HTMLCanvasElement>();

function tintedTex(key: string, color: string, lift = 0): HTMLCanvasElement | null {
  const k = key + color + lift;
  const hit = tinted.get(k);
  if (hit) return hit;
  const t = getTex(key);
  if (!t) return null;
  const src = t.image as HTMLCanvasElement;
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = "multiply";
  g.drawImage(src, 0, 0, N, N);
  if (lift > 0) {
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(255,255,255,${lift})`;
    g.fillRect(0, 0, N, N);
  }
  tinted.set(k, c);
  return c;
}

/** Dünya koordinatına hizalı desen: s = piksel/metre, (ox, oy) = ekran ötelemesi */
export function texPattern(g: CanvasRenderingContext2D, key: string, color: string, s: number, ox: number, oy: number, lift = 0): CanvasPattern | null {
  const c = tintedTex(key, color, lift);
  if (!c) return null;
  const p = g.createPattern(c, "repeat");
  if (!p) return null;
  const size = TEX_SIZE[key] ?? 1;
  const k = (s * size) / c.width;
  p.setTransform(new DOMMatrix([k, 0, 0, k, ox, oy]));
  return p;
}

export function floorColor(floor: string | undefined, floorColor: string | undefined, roomColor: string) {
  return floorColor ?? (floor ? FLOOR_DEFAULT[floor] : undefined) ?? roomColor;
}

const tmp = typeof document !== "undefined" ? document.createElement("canvas") : null;
/**
 * Oda maskesini (hücre kanvası) desenle doldurup ana kanvasa çizer.
 * mask: oda bölgesinin hücre kanvası (alfa > 0 olan yerler oda)
 */
export function fillMaskWithPattern(g: CanvasRenderingContext2D, mask: HTMLCanvasElement, x: number, y: number, w: number, h: number, pattern: CanvasPattern | string, dpr = 1) {
  if (!tmp) return;
  const W = Math.min(4096, Math.ceil(w * dpr));
  const H = Math.min(4096, Math.ceil(h * dpr));
  if (W < 1 || H < 1) return;
  tmp.width = W;
  tmp.height = H;
  const t = tmp.getContext("2d")!;
  t.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
  t.fillStyle = pattern;
  t.fillRect(x, y, w, h);
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = "destination-in";
  t.imageSmoothingEnabled = true;
  t.drawImage(mask, 0, 0, W, H);
  t.globalCompositeOperation = "source-over";
  g.drawImage(tmp, x, y, w, h);
}
