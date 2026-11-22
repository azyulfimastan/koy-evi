import type { EnvKind, EnvObj, Sun } from "./types";

export const ENV_KINDS: { kind: EnvKind; name: string; w: number; d: number; h: number; color: string }[] = [
  { kind: "tree", name: "Ağaç", w: 4, d: 4, h: 6, color: "#4f8a3a" },
  { kind: "pine", name: "Çam", w: 3, d: 3, h: 8, color: "#2f6b45" },
  { kind: "bush", name: "Çalı", w: 1.2, d: 1.2, h: 1, color: "#5b9a45" },
  { kind: "road", name: "Yol", w: 4, d: 20, h: 0.05, color: "#6a6a6a" },
  { kind: "building", name: "Komşu bina", w: 8, d: 10, h: 6, color: "#d8cdb8" },
  { kind: "fence", name: "Çit / duvar", w: 10, d: 0.2, h: 1.5, color: "#9a7b55" },
];

export const envDefaults = (kind: EnvKind) => ENV_KINDS.find((k) => k.kind === kind)!;

export function newEnv(kind: EnvKind, x: number, y: number, id: string): EnvObj {
  const k = envDefaults(kind);
  return { id, kind, name: k.name, x, y, rot: 0, w: k.w, d: k.d, h: k.h, color: k.color };
}

export function drawEnv(g: CanvasRenderingContext2D, o: Pick<EnvObj, "kind" | "x" | "y" | "rot" | "w" | "d" | "color" | "name">, s: number, ox: number, oy: number, opt: { selected?: boolean; ghost?: boolean }) {
  g.save();
  g.translate(o.x * s + ox, o.y * s + oy);
  g.rotate((o.rot * Math.PI) / 180);
  g.scale(s, s);
  if (opt.ghost) g.globalAlpha = 0.5;
  g.lineWidth = (opt.selected ? 2.5 : 1.2) / s;
  g.strokeStyle = opt.selected ? "#d9822b" : "rgba(40,50,30,0.7)";
  const w = o.w;
  const d = o.d;
  if (o.kind === "tree" || o.kind === "bush") {
    g.fillStyle = o.color + "cc";
    g.beginPath();
    g.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#5a3d22";
    g.beginPath();
    g.arc(0, 0, Math.min(0.15, w * 0.08), 0, Math.PI * 2);
    g.fill();
  } else if (o.kind === "pine") {
    g.fillStyle = o.color + "cc";
    g.beginPath();
    g.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.lineWidth = 1 / s;
    g.strokeStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo((Math.cos(a) * w) / 2, (Math.sin(a) * d) / 2);
      g.stroke();
    }
  } else if (o.kind === "road") {
    g.fillStyle = o.color;
    g.fillRect(-w / 2, -d / 2, w, d);
    g.strokeRect(-w / 2, -d / 2, w, d);
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 2 / s;
    g.setLineDash([12 / s, 10 / s]);
    g.beginPath();
    if (d >= w) {
      g.moveTo(0, -d / 2);
      g.lineTo(0, d / 2);
    } else {
      g.moveTo(-w / 2, 0);
      g.lineTo(w / 2, 0);
    }
    g.stroke();
    g.setLineDash([]);
  } else if (o.kind === "building") {
    g.fillStyle = "#c9c2b4";
    g.fillRect(-w / 2, -d / 2, w, d);
    g.strokeStyle = opt.selected ? "#d9822b" : "#6b6455";
    g.strokeRect(-w / 2, -d / 2, w, d);
    g.lineWidth = 1 / s;
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    if (w >= d) {
      g.moveTo(-w / 2, 0);
      g.lineTo(w / 2, 0);
    } else {
      g.moveTo(0, -d / 2);
      g.lineTo(0, d / 2);
    }
    g.stroke();
  } else {
    g.fillStyle = o.color;
    g.fillRect(-w / 2, -d / 2, w, Math.max(d, 0.12));
    g.strokeRect(-w / 2, -d / 2, w, Math.max(d, 0.12));
  }
  g.restore();
  if (!opt.ghost && (o.kind === "building" || o.kind === "road") && Math.min(w, d) * s > 40) {
    g.font = "11px system-ui";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = o.kind === "road" ? "#fff" : "#3a362d";
    g.fillText(o.name, o.x * s + ox, o.y * s + oy);
  }
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Güneşin yüksekliği ve yönü (kuzeyden saat yönünde, derece). Basit astronomik hesap. */
export function sunPos(sun: Sun) {
  const mid = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][Math.max(0, Math.min(11, Math.round(sun.month) - 1))];
  const decl = 23.44 * Math.sin(rad((360 / 365) * (284 + mid)));
  const H = 15 * (sun.hour - 12);
  const sinAlt = Math.sin(rad(sun.lat)) * Math.sin(rad(decl)) + Math.cos(rad(sun.lat)) * Math.cos(rad(decl)) * Math.cos(rad(H));
  const alt = (Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180) / Math.PI;
  const cosAz = (Math.sin(rad(decl)) - sinAlt * Math.sin(rad(sun.lat))) / (Math.cos(rad(alt)) * Math.cos(rad(sun.lat)) || 1e-9);
  let az = (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
  if (H > 0) az = 360 - az;
  return { alt, az };
}

/** Güneşe doğru yön vektörü: plan x, plan y (aşağı), yukarı (y3d) */
export function sunDir(sun: Sun) {
  const { alt, az } = sunPos(sun);
  const n = rad(sun.north);
  // plan'da kuzey: (sin n, -cos n), doğu: (cos n, sin n)
  const e = { x: Math.cos(n), y: Math.sin(n) };
  const no = { x: Math.sin(n), y: -Math.cos(n) };
  const hx = e.x * Math.sin(rad(az)) + no.x * Math.cos(rad(az));
  const hy = e.y * Math.sin(rad(az)) + no.y * Math.cos(rad(az));
  const c = Math.cos(rad(alt));
  return { x: hx * c, y: Math.sin(rad(alt)), z: hy * c, alt, az };
}

export const COMPASS = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"];
export const compassName = (az: number) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];
export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
