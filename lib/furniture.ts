import type { CatItem, Item } from "./types";

export const CATS = ["Yatak odası", "Oturma", "Yemek", "Mutfak", "Banyo", "Isıtma", "Çalışma / Diğer", "Özel"];

const C = {
  bed: "#c9d9f0",
  sit: "#e4cfae",
  eat: "#ddc7a1",
  kit: "#d4d9dd",
  bath: "#cfe6ee",
  heat: "#e8b9a0",
  oth: "#d9d3b8",
};

// ölçüler metre: w (genişlik), d (derinlik), h (yükseklik)
export const CATALOG: CatItem[] = [
  { key: "bed2", name: "Çift kişilik yatak", cat: "Yatak odası", w: 1.6, d: 2.0, h: 0.5, shape: "bed", color: C.bed },
  { key: "bed1", name: "Tek kişilik yatak", cat: "Yatak odası", w: 0.9, d: 2.0, h: 0.5, shape: "bed", color: C.bed },
  { key: "bunk", name: "Ranza", cat: "Yatak odası", w: 0.9, d: 2.0, h: 1.7, shape: "bed", color: C.bed },
  { key: "night", name: "Komodin", cat: "Yatak odası", w: 0.45, d: 0.4, h: 0.5, shape: "rect", color: C.bed },
  { key: "ward", name: "Gardırop", cat: "Yatak odası", w: 1.8, d: 0.6, h: 2.2, shape: "wardrobe", color: C.bed },
  { key: "ward2", name: "Gardırop (kapaklı küçük)", cat: "Yatak odası", w: 1.0, d: 0.55, h: 2.1, shape: "wardrobe", color: C.bed },
  { key: "dresser", name: "Şifonyer", cat: "Yatak odası", w: 1.0, d: 0.5, h: 0.9, shape: "rect", color: C.bed },
  { key: "sofa3", name: "Üçlü kanepe", cat: "Oturma", w: 2.2, d: 0.95, h: 0.85, shape: "sofa", color: C.sit },
  { key: "sofa2", name: "İkili kanepe", cat: "Oturma", w: 1.6, d: 0.9, h: 0.85, shape: "sofa", color: C.sit },
  { key: "arm", name: "Koltuk", cat: "Oturma", w: 0.9, d: 0.9, h: 0.85, shape: "sofa", color: C.sit },
  { key: "coffee", name: "Orta sehpa", cat: "Oturma", w: 1.0, d: 0.6, h: 0.45, shape: "rect", color: C.sit },
  { key: "coffeeR", name: "Yuvarlak sehpa", cat: "Oturma", w: 0.7, d: 0.7, h: 0.45, shape: "round", color: C.sit },
  { key: "tv", name: "TV ünitesi", cat: "Oturma", w: 1.8, d: 0.4, h: 0.5, shape: "rect", color: C.sit },
  { key: "shelf", name: "Kitaplık", cat: "Oturma", w: 0.9, d: 0.3, h: 2.0, shape: "rect", color: C.sit },
  { key: "table4", name: "Yemek masası (4 kişilik)", cat: "Yemek", w: 1.4, d: 0.8, h: 0.75, shape: "rect", color: C.eat },
  { key: "table6", name: "Yemek masası (6 kişilik)", cat: "Yemek", w: 1.8, d: 0.9, h: 0.75, shape: "rect", color: C.eat },
  { key: "tableR", name: "Yuvarlak masa", cat: "Yemek", w: 1.1, d: 1.1, h: 0.75, shape: "round", color: C.eat },
  { key: "chair", name: "Sandalye", cat: "Yemek", w: 0.45, d: 0.45, h: 0.9, shape: "chair", color: C.eat },
  { key: "buffet", name: "Büfe", cat: "Yemek", w: 1.4, d: 0.45, h: 0.9, shape: "rect", color: C.eat },
  { key: "counter", name: "Mutfak tezgâhı (60 cm)", cat: "Mutfak", w: 0.6, d: 0.6, h: 0.9, shape: "rect", color: C.kit },
  { key: "counter120", name: "Mutfak tezgâhı (120 cm)", cat: "Mutfak", w: 1.2, d: 0.6, h: 0.9, shape: "rect", color: C.kit },
  { key: "cooker", name: "Ocak / fırın", cat: "Mutfak", w: 0.6, d: 0.6, h: 0.9, shape: "cooker", color: C.kit },
  { key: "sinkK", name: "Evye", cat: "Mutfak", w: 1.2, d: 0.6, h: 0.9, shape: "sink", color: C.kit },
  { key: "fridge", name: "Buzdolabı", cat: "Mutfak", w: 0.7, d: 0.7, h: 1.8, shape: "rect", color: C.kit },
  { key: "dish", name: "Bulaşık makinesi", cat: "Mutfak", w: 0.6, d: 0.6, h: 0.85, shape: "rect", color: C.kit },
  { key: "island", name: "Mutfak adası", cat: "Mutfak", w: 1.6, d: 0.9, h: 0.9, shape: "rect", color: C.kit },
  { key: "tub", name: "Küvet", cat: "Banyo", w: 0.75, d: 1.7, h: 0.55, shape: "tub", color: C.bath },
  { key: "shower", name: "Duş teknesi", cat: "Banyo", w: 0.9, d: 0.9, h: 0.1, shape: "shower", color: C.bath },
  { key: "wc", name: "Klozet", cat: "Banyo", w: 0.4, d: 0.7, h: 0.8, shape: "toilet", color: C.bath },
  { key: "basin", name: "Lavabo", cat: "Banyo", w: 0.6, d: 0.45, h: 0.85, shape: "sink", color: C.bath },
  { key: "washer", name: "Çamaşır makinesi", cat: "Banyo", w: 0.6, d: 0.6, h: 0.85, shape: "rect", color: C.bath },
  { key: "stove", name: "Odun sobası", cat: "Isıtma", w: 0.5, d: 0.5, h: 0.9, shape: "stove", color: C.heat },
  { key: "fire", name: "Şömine", cat: "Isıtma", w: 1.2, d: 0.5, h: 1.1, shape: "stove", color: C.heat },
  { key: "rad", name: "Radyatör", cat: "Isıtma", w: 1.0, d: 0.1, h: 0.6, shape: "rect", color: C.heat },
  { key: "boiler", name: "Kombi", cat: "Isıtma", w: 0.4, d: 0.3, h: 0.7, shape: "rect", color: C.heat },
  { key: "desk", name: "Çalışma masası", cat: "Çalışma / Diğer", w: 1.2, d: 0.6, h: 0.75, shape: "rect", color: C.oth },
  { key: "ochair", name: "Ofis sandalyesi", cat: "Çalışma / Diğer", w: 0.55, d: 0.55, h: 1.0, shape: "round", color: C.oth },
  { key: "rug", name: "Halı (2 × 3 m)", cat: "Çalışma / Diğer", w: 2.0, d: 3.0, h: 0.02, shape: "rug", color: "#e9c9c0" },
  { key: "shoe", name: "Ayakkabılık", cat: "Çalışma / Diğer", w: 0.8, d: 0.35, h: 1.0, shape: "rect", color: C.oth },
  { key: "coat", name: "Portmanto", cat: "Çalışma / Diğer", w: 0.6, d: 0.3, h: 1.8, shape: "rect", color: C.oth },
];

export function drawItem(
  g: CanvasRenderingContext2D,
  it: Pick<Item, "x" | "y" | "rot" | "w" | "d" | "shape" | "color" | "name">,
  s: number,
  ox: number,
  oy: number,
  o: { selected?: boolean; ghost?: boolean; label?: boolean }
) {
  const { w, d } = it;
  g.save();
  g.translate(it.x * s + ox, it.y * s + oy);
  g.rotate((it.rot * Math.PI) / 180);
  g.scale(s, s);
  const lw = (o.selected ? 2.5 : 1.3) / s;
  g.lineWidth = lw;
  g.strokeStyle = o.selected ? "#d9822b" : o.ghost ? "#d9822b" : "#4a4638";
  g.fillStyle = o.ghost ? "rgba(217,130,43,0.3)" : it.color;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  const rect = (x: number, y: number, w2: number, h2: number, fill = true) => {
    if (fill) g.fillRect(x, y, w2, h2);
    g.strokeRect(x, y, w2, h2);
  };
  const ell = (x: number, y: number, rx: number, ry: number) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  };
  const thin = () => {
    g.lineWidth = 1 / s;
    g.strokeStyle = o.selected || o.ghost ? "#d9822b" : "#4a4638";
  };
  switch (it.shape) {
    case "round":
      ell(0, 0, w / 2, d / 2);
      break;
    case "rug":
      g.globalAlpha = 0.75;
      rect(-w / 2, -d / 2, w, d);
      g.globalAlpha = 1;
      g.setLineDash([6 / s, 4 / s]);
      thin();
      g.strokeRect(-w / 2 + 0.12, -d / 2 + 0.12, w - 0.24, d - 0.24);
      g.setLineDash([]);
      break;
    case "bed": {
      rect(-w / 2, -d / 2, w, d);
      thin();
      const n = w > 1.2 ? 2 : 1;
      const pw = (w - 0.1 * (n + 1)) / n;
      for (let i = 0; i < n; i++) rect(-w / 2 + 0.1 + i * (pw + 0.1), -d / 2 + 0.08, pw, Math.min(0.4, d * 0.2), false);
      line(-w / 2, -d / 2 + d * 0.38, w / 2, -d / 2 + d * 0.38);
      break;
    }
    case "sofa": {
      rect(-w / 2, -d / 2, w, d);
      thin();
      rect(-w / 2, -d / 2, w, d * 0.28, false);
      const arm = Math.min(0.18, w * 0.15);
      rect(-w / 2, -d / 2 + d * 0.28, arm, d * 0.72, false);
      rect(w / 2 - arm, -d / 2 + d * 0.28, arm, d * 0.72, false);
      break;
    }
    case "chair":
      rect(-w / 2, -d / 2, w, d);
      g.lineWidth = 3 / s;
      line(-w / 2, -d / 2 + 0.02, w / 2, -d / 2 + 0.02);
      break;
    case "cooker": {
      rect(-w / 2, -d / 2, w, d);
      thin();
      const r = Math.min(w, d) * 0.17;
      for (const [cx, cy] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) {
        g.beginPath();
        g.arc((cx * w) / 0.6, (cy * d) / 0.6, r, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    case "sink": {
      rect(-w / 2, -d / 2, w, d);
      thin();
      const n = w > 0.9 ? 2 : 1;
      const bw = (w - 0.1 * (n + 1)) / n;
      for (let i = 0; i < n; i++) rect(-w / 2 + 0.1 + i * (bw + 0.1), -d / 2 + 0.1, bw, d - 0.2, false);
      g.beginPath();
      g.arc(0, -d / 2 + 0.05, 0.03, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case "toilet":
      rect(-w / 2, -d / 2, w, d * 0.3);
      ell(0, d * 0.1, w * 0.42, d * 0.32);
      break;
    case "tub":
      rect(-w / 2, -d / 2, w, d);
      thin();
      g.strokeRect(-w / 2 + 0.07, -d / 2 + 0.07, w - 0.14, d - 0.14);
      g.beginPath();
      g.arc(0, d / 2 - 0.2, 0.04, 0, Math.PI * 2);
      g.stroke();
      break;
    case "shower":
      rect(-w / 2, -d / 2, w, d);
      thin();
      line(-w / 2, -d / 2, w / 2, d / 2);
      line(w / 2, -d / 2, -w / 2, d / 2);
      g.beginPath();
      g.arc(0, 0, 0.05, 0, Math.PI * 2);
      g.stroke();
      break;
    case "stove":
      rect(-w / 2, -d / 2, w, d);
      thin();
      rect(-w / 2 + 0.06, -d / 2 + 0.06, w - 0.12, d - 0.12, false);
      line(-w / 2 + 0.06, -d / 2 + 0.06, w / 2 - 0.06, d / 2 - 0.06);
      line(w / 2 - 0.06, -d / 2 + 0.06, -w / 2 + 0.06, d / 2 - 0.06);
      break;
    case "wardrobe":
      rect(-w / 2, -d / 2, w, d);
      thin();
      line(0, -d / 2, 0, d / 2);
      line(-w / 2, -d / 2, 0, d / 2);
      line(w / 2, -d / 2, 0, d / 2);
      break;
    default:
      rect(-w / 2, -d / 2, w, d);
  }
  g.restore();
  if (o.label && !o.ghost) {
    const wpx = Math.min(w, d) * s;
    if (wpx > 38) {
      g.font = "10px system-ui";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const x = it.x * s + ox;
      const y = it.y * s + oy;
      const text = it.name.length > 16 ? it.name.slice(0, 15) + "…" : it.name;
      const tw = g.measureText(text).width + 6;
      if (tw < Math.max(w, d) * s) {
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillRect(x - tw / 2, y - 7, tw, 14);
        g.fillStyle = "#2a2a24";
        g.fillText(text, x, y);
      }
    }
  }
}

export function itemLocal(it: Pick<Item, "x" | "y" | "rot">, p: { x: number; y: number }) {
  const a = (-it.rot * Math.PI) / 180;
  const dx = p.x - it.x;
  const dy = p.y - it.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}
