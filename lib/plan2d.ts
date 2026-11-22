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

/* ---------- oda zemin resmi önbelleği (akıcılık) ----------
 * Her oda için dokulu zemin, dünya ölçeğinde (metre başına R piksel) bir kez çizilir;
 * sonra her karede yalnızca ölçeklenip kopyalanır. Oda şekli değişince (yeni maske) yenilenir. */
type RoomImg = { cv: HTMLCanvasElement; x: number; y: number; w: number; h: number };
const roomCache = new WeakMap<HTMLCanvasElement, Map<string, RoomImg | null>>();

export function roomImage(
  g: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  reg: { x0: number; y0: number; cell: number; w: number; h: number },
  tex: string,
  color: string,
  flat: string
): RoomImg | null {
  let per = roomCache.get(mask);
  if (!per) {
    per = new Map();
    roomCache.set(mask, per);
  }
  const key = tex + "|" + color + "|" + flat;
  if (per.has(key)) return per.get(key)!;
  // maskenin dolu kısmının sınırları (hücre)
  const md = mask.getContext("2d")!.getImageData(0, 0, mask.width, mask.height).data;
  let i0 = mask.width, i1 = -1, j0 = mask.height, j1 = -1;
  for (let j = 0; j < mask.height; j++)
    for (let i = 0; i < mask.width; i++)
      if (md[(j * mask.width + i) * 4 + 3]) {
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
      }
  if (i1 < 0) {
    per.set(key, null);
    return null;
  }
  const cw = i1 - i0 + 1;
  const ch = j1 - j0 + 1;
  const x = reg.x0 + i0 * reg.cell;
  const y = reg.y0 + j0 * reg.cell;
  const w = cw * reg.cell;
  const h = ch * reg.cell;
  const R = Math.max(8, Math.min(96, 2048 / Math.max(w, h)));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w * R));
  cv.height = Math.max(1, Math.ceil(h * R));
  const t = cv.getContext("2d")!;
  const pat = tex ? texPattern(t, tex, color, R, -x * R, -y * R) : null;
  t.fillStyle = pat ?? flat;
  t.fillRect(0, 0, cv.width, cv.height);
  t.globalCompositeOperation = "destination-in";
  t.imageSmoothingEnabled = false;
  t.drawImage(mask, i0, j0, cw, ch, 0, 0, cv.width, cv.height);
  const img = { cv, x, y, w, h };
  per.set(key, img);
  void g;
  return img;
}
