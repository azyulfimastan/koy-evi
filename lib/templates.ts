/* Hazır ev şablonları: yeni ev oluştururken seçilir. Sunucuda normalizeFull ile tamamlanır. */
type P = [number, number];
let n = 0;
const uid = () => `t${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const C = { sit: "#8c9aa6", eat: "#a07a52", kit: "#e8e2d6", bath: "#f4f6f7", heat: "#5a5550", wood: "#8a6a4a" };

/* eslint-disable @typescript-eslint/no-explicit-any */
function floor(name: string, height: number) {
  const f = { id: uid(), name, height, walls: [] as any[], openings: [] as any[], rooms: [] as any[], stairs: [] as any[], items: [] as any[] };
  const W = (a: P, b: P, t: number) => {
    const id = uid();
    f.walls.push({ id, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, t, color: "#7a7266" });
    return id;
  };
  const O = (wall: string, pos: number, w: number, h: number, sill: number, kind: "door" | "window", shape = "rect", flip = false) =>
    f.openings.push({ id: uid(), wall, pos, w, h, sill, kind, shape, flip, hinge: false });
  const R = (name: string, x: number, y: number, color: string, fl: string) => f.rooms.push({ id: uid(), name, seed: { x, y }, color, floor: fl });
  const I = (key: string, name: string, shape: string, x: number, y: number, rot: number, w: number, d: number, h: number, color: string, elev = 0) =>
    f.items.push({ id: uid(), key, name, shape, x, y, rot, w, d, h, elev, color });
  /** dört dış duvar: kuzey, doğu, güney, batı */
  const box = (w: number, d: number, t = 0.3) => [W([0, 0], [w, 0], t), W([w, 0], [w, d], t), W([w, d], [0, d], t), W([0, d], [0, 0], t)];
  return { f, W, O, R, I, box };
}

const env = (objs: any[], sun = { month: 6, hour: 15, lat: 52, north: 0, shadows: true }) => ({ sun, objs: objs.map((o) => ({ id: uid(), rot: 0, ...o })) });
const plot = (x0: number, y0: number, x1: number, y1: number) => ({ points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true });
const fin = { extColor: "#efe6d6", extTex: "plain", intColor: "#f4f0e8", intTex: "plain", doorColor: "#7a4a2a", frameColor: "#ffffff", groundColor: "#8fb45f", baseColor: "#a39b8e", baseTex: "stone" };
const tree = (x: number, y: number, s = 1) => ({ kind: "tree", name: "Ağaç", x, y, w: 3.5 * s, d: 3.5 * s, h: 6.5 * s, color: "#5b8f3c" });
const pine = (x: number, y: number, s = 1) => ({ kind: "pine", name: "Çam", x, y, w: 2.8 * s, d: 2.8 * s, h: 8.5 * s, color: "#2f6a3a" });

/** Küçük köy evi: tek kat, 2+1, 9 × 7 m */
function small() {
  const { f, W, O, R, I, box } = floor("Zemin kat", 2.8);
  const [n, e, s, w] = box(9, 7);
  const mid = W([0, 4], [9, 4], 0.15);
  W([5, 0], [5, 4], 0.15);
  W([3.6, 4], [3.6, 7], 0.15);
  W([5.6, 4], [5.6, 7], 0.15);
  // giriş kapısı batıdan salona; salon-mutfak arası kemerli geçiş
  O(w, 5.2, 1, 2.2, 0, "door");
  O(n, 1.5, 1.2, 1.4, 0.9, "window"); O(n, 3.6, 1.2, 1.4, 0.9, "window"); O(n, 7, 1.2, 1.2, 1, "window");
  O(e, 2, 1, 1.2, 1, "window"); O(e, 5.5, 1.2, 1.4, 0.9, "window"); O(w, 1.5, 1.2, 1.4, 0.9, "window");
  O(s, 8, 1.2, 1.4, 0.9, "window"); O(s, 4.4, 0.6, 0.6, 1.5, "window"); O(s, 1.7, 1.2, 1.4, 0.9, "window");
  O(f.walls[5].id, 2.2, 1.2, 2.2, 0, "door", "arch");
  O(mid, 1.8, 0.9, 2.1, 0, "door"); O(mid, 4.6, 0.8, 2.1, 0, "door"); O(mid, 7, 0.9, 2.1, 0, "door");
  R("Salon", 2.5, 2, "#f3d9a6", "parquet"); R("Mutfak", 7, 2, "#cfe3d0", "fayans"); R("Yatak odası", 1.8, 5.5, "#d9d2ef", "laminate"); R("Banyo", 4.6, 5.5, "#cde6f2", "fayans"); R("Yatak odası 2", 7.3, 5.5, "#f6d6c8", "laminate");
  I("sofa3", "Üçlü kanepe", "sofa", 2.5, 0.65, 0, 2.2, 0.95, 0.85, C.sit); I("coffee", "Orta sehpa", "rect", 2.5, 1.9, 0, 1, 0.6, 0.45, C.wood);
  I("stove", "Odun sobası", "stove", 4.4, 3.4, 180, 0.5, 0.5, 0.9, C.heat); I("tv", "TV ünitesi", "rect", 2.5, 3.7, 180, 1.8, 0.4, 0.5, "#6b5440");
  I("counter120", "Mutfak tezgâhı (120 cm)", "rect", 5.75, 0.45, 0, 1.2, 0.6, 0.9, C.kit); I("cooker", "Ocak / fırın", "cooker", 6.65, 0.45, 0, 0.6, 0.6, 0.9, C.kit);
  I("sinkK", "Evye", "sink", 7.6, 0.45, 0, 1.2, 0.6, 0.9, C.kit); I("fridge", "Buzdolabı", "rect", 8.45, 0.5, 0, 0.7, 0.7, 1.8, "#eef0f2");
  I("table4", "Yemek masası (4 kişilik)", "rect", 7, 2.6, 0, 1.4, 0.8, 0.75, C.eat);
  for (const [x, y, r] of [[6.55, 2, 180], [7.45, 2, 180], [6.55, 3.2, 0], [7.45, 3.2, 0]]) I("chair", "Sandalye", "chair", x, y, r, 0.45, 0.45, 0.9, C.eat);
  I("bed2", "Çift kişilik yatak", "bed", 1.8, 5.85, 180, 1.6, 2, 0.5, "#d9c3a0"); I("ward2", "Gardırop (kapaklı küçük)", "wardrobe", 3.0, 4.36, 0, 1, 0.55, 2.1, "#b59472");
  I("wc", "Klozet", "toilet", 4.1, 6.45, 180, 0.4, 0.7, 0.8, C.bath); I("vanity", "Lavabo dolabı", "sink", 5.05, 6.6, 180, 0.8, 0.45, 0.85, C.bath); I("shower", "Duş teknesi", "shower", 4.6, 4.6, 0, 0.9, 0.9, 0.1, C.bath);
  I("bed1", "Tek kişilik yatak", "bed", 8.2, 5.8, 180, 0.9, 2, 0.5, "#9fc3d9");
  return {
    plot: plot(-4, -5, 14, 11), snap: 0.1, defT: 0.25, roof: { kind: "hip", pitch: 30, overhang: 0.5, ridge: "auto", color: "#a5523a", tex: "tile" },
    floors: [f], custom: [], fin,
    env: env([tree(-2, -2.5), pine(12, -3), tree(12, 9, 0.9), { kind: "bush", name: "Çalı", x: 0.5, y: 8.5, w: 1.2, d: 1.2, h: 0.9, color: "#5d8a4a" }, { kind: "fence", name: "Çit", x: 5, y: 10.5, w: 18, d: 0.08, h: 1, color: "#8a6a4a" }]),
  };
}

/** İki katlı köy evi: 4+1, 10 × 8 m */
function big() {
  const a = floor("Zemin kat", 2.8);
  {
    const { O, R, I, W, box, f } = a;
    const [n, e, s, w] = box(10, 8);
    const mid = W([0, 4.5], [10, 4.5], 0.15); const k1 = W([6, 0], [6, 4.5], 0.15); W([4, 4.5], [4, 8], 0.15); W([6, 4.5], [6, 8], 0.15);
    O(s, 3, 1, 2.2, 0, "door"); O(s, 8, 1.2, 1.4, 0.9, "window"); O(s, 5, 0.6, 0.6, 1.5, "window");
    O(n, 1.8, 1.2, 1.4, 0.9, "window"); O(n, 4.2, 1.2, 1.4, 0.9, "window"); O(n, 8, 1.2, 1.2, 1, "window");
    O(w, 6, 1.2, 1.4, 0.9, "window"); O(w, 2, 1.2, 1.4, 0.9, "window"); O(e, 2, 1.2, 1.2, 1, "window"); O(e, 6, 0.8, 1.2, 1, "window");
    O(mid, 2.5, 0.9, 2.1, 0, "door"); O(mid, 5, 0.8, 2.1, 0, "door", "rect", true); O(mid, 7.2, 0.9, 2.1, 0, "door"); O(k1, 2.6, 1.2, 2.2, 0, "door", "arch");
    R("Salon", 3, 2, "#f3d9a6", "parquet"); R("Mutfak", 8, 2, "#cfe3d0", "fayans"); R("Yatak odası", 2, 6.2, "#d9d2ef", "laminate"); R("Banyo", 5, 6.2, "#cde6f2", "fayans"); R("Hol", 8, 6.2, "#eadfcf", "marble");
    I("sofa3", "Üçlü kanepe", "sofa", 2.6, 0.65, 0, 2.2, 0.95, 0.85, C.sit); I("coffee", "Orta sehpa", "rect", 2.6, 1.9, 0, 1, 0.6, 0.45, C.wood);
    I("rug", "Halı (2 × 3 m)", "rug", 2.6, 1.9, 90, 2, 3, 0.02, "#c98f7a"); I("arm", "Koltuk", "sofa", 0.75, 2.3, 270, 0.9, 0.9, 0.85, C.sit);
    I("tv", "TV ünitesi", "rect", 2.6, 4.2, 180, 1.8, 0.4, 0.5, "#6b5440"); I("stove", "Odun sobası", "stove", 5.4, 3.7, 180, 0.5, 0.5, 0.9, C.heat); I("shelf", "Kitaplık", "rect", 4.9, 0.33, 0, 0.9, 0.3, 2, C.wood);
    I("plant", "Saksı bitkisi", "round", 0.5, 0.5, 0, 0.4, 0.4, 1.2, "#5d8a4a");
    I("counter120", "Mutfak tezgâhı (120 cm)", "rect", 6.75, 0.45, 0, 1.2, 0.6, 0.9, C.kit); I("cooker", "Ocak / fırın", "cooker", 7.65, 0.45, 0, 0.6, 0.6, 0.9, C.kit);
    I("sinkK", "Evye", "sink", 8.6, 0.45, 0, 1.2, 0.6, 0.9, C.kit); I("fridge", "Buzdolabı", "rect", 9.48, 0.5, 0, 0.7, 0.7, 1.8, "#eef0f2");
    I("upper", "Mutfak üst dolabı", "rect", 6.75, 0.33, 0, 1.2, 0.35, 0.7, C.kit, 1.4); I("hood", "Aspiratör", "rect", 7.65, 0.4, 0, 0.6, 0.5, 0.2, "#b8bcc0", 1.65);
    I("table4", "Yemek masası (4 kişilik)", "rect", 8, 2.6, 0, 1.4, 0.8, 0.75, C.eat);
    for (const [x, y, r] of [[7.55, 2, 180], [8.45, 2, 180], [7.55, 3.2, 0], [8.45, 3.2, 0]]) I("chair", "Sandalye", "chair", x, y, r, 0.45, 0.45, 0.9, C.eat);
    I("bed2", "Çift kişilik yatak", "bed", 1.8, 6.85, 180, 1.6, 2, 0.5, "#d9c3a0"); I("night", "Komodin", "rect", 0.6, 7.6, 180, 0.45, 0.4, 0.5, "#9a7b5a"); I("night", "Komodin", "rect", 3, 7.6, 180, 0.45, 0.4, 0.5, "#9a7b5a");
    I("ward2", "Gardırop (kapaklı küçük)", "wardrobe", 3.35, 4.86, 0, 1, 0.55, 2.1, "#b59472");
    I("wc", "Klozet", "toilet", 4.45, 7.45, 180, 0.4, 0.7, 0.8, C.bath); I("vanity", "Lavabo dolabı", "sink", 5.45, 7.6, 180, 0.8, 0.45, 0.85, C.bath); I("shower", "Duş teknesi", "shower", 4.55, 5.1, 0, 0.9, 0.9, 0.1, C.bath);
    I("shoe", "Ayakkabılık", "rect", 6.6, 7.65, 180, 0.8, 0.35, 1, "#b9a58a");
    f.stairs.push({ id: uid(), kind: "U", x: 9, y: 6.25, rot: 0, w: 0.9, mirror: false });
  }
  const b = floor("1. kat", 2.7);
  {
    const { O, R, I, W, box } = b;
    const [n, e, s, w] = box(10, 8);
    const mid = W([0, 4.5], [10, 4.5], 0.15); W([5, 0], [5, 4.5], 0.15); const b1 = W([4, 4.5], [4, 8], 0.15); W([6, 4.5], [6, 8], 0.15);
    O(s, 2, 1.2, 1.4, 0.9, "window"); O(s, 8, 1.2, 1.4, 0.9, "window"); O(s, 5, 0.6, 0.6, 1.5, "window");
    O(n, 2.5, 1.2, 1.4, 0.9, "window"); O(n, 7.5, 1.2, 1.4, 0.9, "window"); O(w, 2, 1.2, 1.4, 0.9, "window"); O(w, 6, 1.2, 1.4, 0.9, "window"); O(e, 2, 1.2, 1.4, 0.9, "window");
    O(mid, 2.5, 0.9, 2.1, 0, "door"); O(mid, 7.5, 0.9, 2.1, 0, "door"); O(b1, 1.5, 0.8, 2.1, 0, "door");
    R("Çocuk odası", 2.5, 2, "#f6d6c8", "laminate"); R("Yatak odası 2", 7.5, 2, "#d9d2ef", "parquet"); R("Oda 3", 2, 6.2, "#e3efd0", "laminate"); R("Banyo 2", 5, 6.2, "#cde6f2", "fayans"); R("Hol", 8, 6.2, "#eadfcf", "parquet");
    I("bed1", "Tek kişilik yatak", "bed", 0.75, 1.2, 0, 0.9, 2, 0.5, "#9fc3d9"); I("kdesk", "Çocuk çalışma masası", "rect", 3.8, 0.45, 0, 1, 0.55, 0.7, "#d8b48a");
    I("bed2", "Çift kişilik yatak", "bed", 7.5, 1.2, 0, 1.6, 2, 0.5, "#d9c3a0"); I("ward", "Gardırop", "wardrobe", 7.5, 4.05, 180, 1.8, 0.6, 2.2, "#b59472");
    I("tub", "Küvet", "tub", 5, 7, 0, 0.75, 1.7, 0.55, C.bath);
  }
  return {
    plot: plot(-4, -5, 16, 11), snap: 0.1, defT: 0.25, roof: { kind: "gable", pitch: 35, overhang: 0.5, ridge: "auto", color: "#a5523a", tex: "tile" },
    floors: [a.f, b.f], custom: [], fin,
    env: env([tree(-2, -2.5, 1.1), tree(13.5, 9), pine(14, -3), pine(-2.5, 9.5, 0.9), { kind: "bush", name: "Çalı", x: 1, y: 9.2, w: 1.2, d: 1.2, h: 0.9, color: "#5d8a4a" }, { kind: "road", name: "Yol", x: 6, y: 13, w: 30, d: 5, h: 0.05, color: "#5e5e5e" }, { kind: "fence", name: "Çit", x: 6, y: 11, w: 20, d: 0.08, h: 1, color: "#8a6a4a" }]),
  };
}

/** Süper ev: 2 kat, 12 × 9 m, açık mutfak + salon, yarım yükseklikte bar duvarı, renkli duvarlar */
function villa() {
  const paint = (f: any, id: string, patch: { int?: string; ext?: string; h?: number }) => {
    const w = f.walls.find((x: any) => x.id === id);
    if (w) Object.assign(w, patch);
  };
  const a = floor("Zemin kat", 2.9);
  {
    const { f, W, O, R, I, box } = a;
    const [n, e, s, w] = box(12, 9);
    const M = W([0, 5.5], [12, 5.5], 0.15);
    const V1 = W([4, 5.5], [4, 9], 0.15);
    const V2 = W([8, 5.5], [8, 9], 0.15);
    const bar = W([6.5, 0], [6.5, 2.6], 0.2); // yarım yükseklikte bar duvarı
    paint(f, bar, { h: 1.1 });
    paint(f, n, { int: "#b7cdbd" }); paint(f, w, { int: "#f0dfb8", ext: "#d6c3a3" }); paint(f, e, { ext: "#d6c3a3" });
    // açıklıklar
    O(s, 7, 1.1, 2.2, 0, "door"); O(s, 10, 1.2, 1.4, 0.9, "window"); O(s, 2, 1.2, 1.4, 0.9, "window"); O(s, 5, 0.6, 0.6, 1.5, "window");
    O(n, 2, 1.5, 1.4, 0.9, "window"); O(n, 5, 1.5, 1.4, 0.9, "window"); O(w, 6.5, 1.6, 1.5, 0.8, "window"); O(w, 2, 1.2, 1.4, 0.9, "window");
    O(e, 1.2, 1, 1.2, 1, "window"); O(e, 3.5, 1.6, 2.2, 0, "door"); O(e, 7.5, 0.6, 0.6, 1.5, "window");
    O(M, 6, 1.6, 2.2, 0, "door", "arch"); O(V1, 1.4, 0.9, 2.1, 0, "door"); O(V2, 1.4, 0.8, 2.1, 0, "door", "rect", true);
    R("Salon ve mutfak", 3, 3, "#f3d9a6", "parquet"); R("Misafir odası", 2, 7, "#d9d2ef", "laminate"); R("Hol", 6, 8, "#eadfcf", "marble"); R("Banyo", 10, 7.5, "#cde6f2", "fayans");
    // salon
    I("sofa3", "Üçlü kanepe", "sofa", 3.2, 4.9, 180, 2.2, 0.95, 0.85, C.sit); I("coffee", "Orta sehpa", "rect", 3.2, 3.4, 0, 1, 0.6, 0.45, C.wood);
    I("rug", "Halı (2 × 3 m)", "rug", 3.2, 3.4, 90, 2, 3, 0.02, "#c98f7a"); I("arm", "Koltuk", "sofa", 0.75, 2.8, 270, 0.9, 0.9, 0.85, C.sit); I("arm", "Koltuk", "sofa", 5.7, 3.0, 90, 0.9, 0.9, 0.85, C.sit);
    I("tv", "TV ünitesi", "rect", 3.5, 0.3, 0, 1.8, 0.4, 0.5, "#6b5440"); I("stove", "Odun sobası", "stove", 0.6, 4.8, 0, 0.5, 0.5, 0.9, C.heat); I("plant", "Saksı bitkisi", "round", 0.5, 0.55, 0, 0.4, 0.4, 1.2, "#5d8a4a");
    // mutfak
    I("counter120", "Mutfak tezgâhı (120 cm)", "rect", 7.8, 0.45, 0, 1.2, 0.6, 0.9, C.kit); I("cooker", "Ocak / fırın", "cooker", 8.8, 0.45, 0, 0.6, 0.6, 0.9, C.kit);
    I("sinkK", "Evye", "sink", 9.7, 0.45, 0, 1.2, 0.6, 0.9, C.kit); I("fridge", "Buzdolabı", "rect", 11.3, 0.5, 0, 0.7, 0.7, 1.8, "#eef0f2");
    I("upper", "Mutfak üst dolabı", "rect", 7.8, 0.33, 0, 1.2, 0.35, 0.7, C.kit, 1.4); I("hood", "Aspiratör", "rect", 8.8, 0.4, 0, 0.6, 0.5, 0.2, "#b8bcc0", 1.65);
    I("island", "Mutfak adası", "rect", 9.3, 2.2, 0, 1.8, 0.7, 0.9, "#c9c2b4");
    for (const x of [8.7, 9.9]) I("chair", "Bar taburesi", "chair", x, 2.9, 0, 0.4, 0.4, 0.75, C.eat);
    I("table4", "Yemek masası (4 kişilik)", "rect", 10, 4.5, 0, 1.4, 0.8, 0.75, C.eat);
    for (const [x, y, r] of [[9.55, 3.9, 180], [10.45, 3.9, 180], [9.55, 5.1, 0], [10.45, 5.1, 0]]) I("chair", "Sandalye", "chair", x, y, r, 0.45, 0.45, 0.9, C.eat);
    // misafir odası
    I("bed2", "Çift kişilik yatak", "bed", 1.8, 7.9, 180, 1.6, 2, 0.5, "#d9c3a0"); I("night", "Komodin", "rect", 0.6, 8.7, 180, 0.45, 0.4, 0.5, "#9a7b5a"); I("night", "Komodin", "rect", 3.0, 8.7, 180, 0.45, 0.4, 0.5, "#9a7b5a");
    I("ward2", "Gardırop (kapaklı küçük)", "wardrobe", 3.2, 5.85, 0, 1, 0.55, 2.1, "#b59472");
    // hol
    I("shoe", "Ayakkabılık", "rect", 4.35, 8.35, 270, 0.8, 0.35, 1, "#b9a58a");
    // banyo
    I("shower", "Duş teknesi", "shower", 11.45, 6.0, 0, 0.9, 0.9, 0.1, C.bath); I("vanity", "Lavabo dolabı", "sink", 10, 8.65, 180, 0.8, 0.45, 0.85, C.bath);
    I("wc", "Klozet", "toilet", 11.5, 8.55, 180, 0.4, 0.7, 0.8, C.bath); I("washer", "Çamaşır makinesi", "rect", 8.7, 8.6, 180, 0.6, 0.6, 0.85, "#eef0f2");
    f.stairs.push({ id: uid(), kind: "U", x: 7, y: 7.1, rot: 0, w: 0.8, mirror: false });
  }
  const b = floor("1. kat", 2.7);
  {
    const { f, W, O, R, I, box } = b;
    const [n, e, s, w] = box(12, 9);
    const M = W([0, 5.5], [12, 5.5], 0.15);
    W([6.5, 0], [6.5, 5.5], 0.15);
    const V1 = W([4, 5.5], [4, 9], 0.15); const V2 = W([8, 5.5], [8, 9], 0.15);
    paint(f, n, { int: "#c4cfe3" }); paint(f, w, { int: "#e6cfd3", ext: "#d6c3a3" }); paint(f, e, { ext: "#d6c3a3" });
    O(n, 5.5, 0.8, 1.4, 0.9, "window"); O(n, 9.5, 1.4, 1.4, 0.9, "window"); O(w, 6.5, 1.4, 1.4, 0.9, "window"); O(w, 2, 0.8, 0.6, 1.5, "window");
    O(s, 2, 0.8, 0.6, 1.5, "window"); O(s, 6, 1.6, 2.2, 0, "door"); O(s, 10, 1.4, 1.3, 0.9, "window"); (f as any).balconies = [{ id: uid(), wall: s, pos: 6, w: 3.2, d: 1.4, side: -1, rail: "glass", railH: 1.0, slabT: 0.15 }]; O(e, 2.5, 1.2, 1.4, 0.9, "window"); O(e, 7, 1.2, 1.3, 0.9, "window");
    O(M, 5, 0.9, 2.1, 0, "door"); O(M, 7.4, 0.9, 2.1, 0, "door", "rect", true); O(V1, 1.4, 0.8, 2.1, 0, "door"); O(V2, 1.4, 0.9, 2.1, 0, "door");
    R("Ana yatak odası", 3, 3, "#d9d2ef", "parquet"); R("Çocuk odası", 9, 3, "#f6d6c8", "laminate"); R("Banyo 2", 2, 7, "#cde6f2", "fayans"); R("Sahanlık", 6, 8, "#eadfcf", "parquet"); R("Çalışma odası", 10, 7.5, "#e3efd0", "laminate");
    I("bed2", "Çift kişilik yatak", "bed", 3.2, 1.15, 0, 1.6, 2, 0.5, "#d9c3a0"); I("night", "Komodin", "rect", 2.0, 0.4, 0, 0.45, 0.4, 0.5, "#9a7b5a"); I("night", "Komodin", "rect", 4.4, 0.4, 0, 0.45, 0.4, 0.5, "#9a7b5a");
    I("ward", "Gardırop", "wardrobe", 1.6, 5.1, 180, 1.8, 0.6, 2.2, "#b59472"); I("rug", "Halı (2 × 3 m)", "rug", 3.2, 2.9, 90, 2, 3, 0.02, "#a9b7c9"); I("plant", "Saksı bitkisi", "round", 6.0, 0.5, 0, 0.4, 0.4, 1.2, "#5d8a4a");
    I("bed1", "Tek kişilik yatak", "bed", 7.4, 1.2, 0, 0.9, 2, 0.5, "#9fc3d9"); I("bed1", "Tek kişilik yatak", "bed", 9.3, 1.2, 0, 0.9, 2, 0.5, "#e7b7a4"); I("kdesk", "Çocuk çalışma masası", "rect", 11.2, 0.45, 0, 1, 0.55, 0.7, "#d8b48a");
    I("ward", "Gardırop", "wardrobe", 9.2, 5.1, 180, 1.8, 0.6, 2.2, "#b59472");
    I("tub", "Küvet", "tub", 0.5, 7.4, 0, 0.75, 1.7, 0.55, C.bath); I("vanity", "Lavabo dolabı", "sink", 2.5, 8.65, 180, 0.8, 0.45, 0.85, C.bath); I("wc", "Klozet", "toilet", 3.4, 8.55, 180, 0.4, 0.7, 0.8, C.bath);
    I("kdesk", "Çalışma masası", "rect", 10, 8.55, 180, 1.6, 0.7, 0.75, C.wood); I("chair", "Ofis sandalyesi", "chair", 10, 7.9, 180, 0.5, 0.5, 0.9, "#4d5560");
    I("shelf", "Kitaplık", "rect", 10, 5.8, 0, 1.6, 0.3, 2, C.wood);
  }
  return {
    plot: plot(-5, -6, 17, 14), snap: 0.1, defT: 0.25, roof: { kind: "hip", pitch: 28, overhang: 0.6, ridge: "auto", color: "#7a3f2e", tex: "tile" },
    floors: [a.f, b.f], custom: [], fin: { ...fin, extColor: "#efe4d0", intColor: "#f6f2ea" },
    env: env([tree(-3, -3.5, 1.1), tree(14.5, 11), pine(15, -3.5), pine(-3.5, 11.5, 0.9), { kind: "bush", name: "Çalı", x: 1, y: 10.2, w: 1.2, d: 1.2, h: 0.9, color: "#5d8a4a" }, { kind: "bush", name: "Çalı", x: 11, y: 10.2, w: 1.2, d: 1.2, h: 0.9, color: "#5d8a4a" }, { kind: "road", name: "Yol", x: 6, y: 15, w: 30, d: 5, h: 0.05, color: "#5e5e5e" }, { kind: "fence", name: "Çit", x: 6, y: 12.5, w: 20, d: 0.08, h: 1, color: "#8a6a4a" }]),
  };
}

/** Bağ evi: tek oda + küçük banyo, 6 × 5 m, sobalı */
function cabin() {
  const { f, W, O, R, I, box } = floor("Zemin kat", 2.6);
  const [n, e, s, w] = box(6, 5, 0.25);
  const bw = W([4.4, 0], [4.4, 2.2], 0.12); W([4.4, 2.2], [6, 2.2], 0.12);
  O(s, 3, 1, 2.1, 0, "door"); O(s, 1.2, 1.2, 1.3, 0.9, "window"); O(w, 2.5, 1.2, 1.3, 0.9, "window"); O(n, 2.2, 1.2, 1.3, 0.9, "window"); O(e, 3.6, 1, 1.2, 1, "window"); O(n, 5.2, 0.6, 0.6, 1.5, "window");
  O(bw, 1.6, 0.8, 2.1, 0, "door");
  R("Oda", 2, 2.5, "#f3d9a6", "parquet"); R("Banyo", 5.2, 1.1, "#cde6f2", "fayans");
  I("stove", "Odun sobası", "stove", 0.55, 0.55, 0, 0.5, 0.5, 0.9, C.heat); I("bed2", "Çift kişilik yatak", "bed", 1.0, 3.8, 90, 1.4, 2, 0.5, "#d9c3a0");
  I("table4", "Yemek masası (4 kişilik)", "rect", 2.8, 1.4, 0, 1.2, 0.8, 0.75, C.eat);
  for (const [x, y, r] of [[2.4, 0.85, 180], [3.2, 0.85, 180], [2.4, 1.95, 0], [3.2, 1.95, 0]]) I("chair", "Sandalye", "chair", x, y, r, 0.45, 0.45, 0.9, C.eat);
  I("counter120", "Mutfak tezgâhı (120 cm)", "rect", 5.1, 4.45, 180, 1.2, 0.6, 0.9, C.kit); I("wc", "Klozet", "toilet", 5.6, 0.5, 0, 0.4, 0.7, 0.8, C.bath); I("shower", "Duş teknesi", "shower", 4.95, 0.62, 0, 0.8, 0.8, 0.1, C.bath);
  return {
    plot: plot(-6, -6, 14, 12), snap: 0.1, defT: 0.25, roof: { kind: "gable", pitch: 30, overhang: 0.6, ridge: "auto", color: "#6f6a63", tex: "metal" },
    floors: [f], custom: [], fin: { ...fin, extTex: "wood", extColor: "#b48a5e" },
    env: env([tree(-3, -3), tree(10, -2, 0.8), tree(11, 8, 1.1), tree(-3, 8, 0.9), pine(12, 3), { kind: "bush", name: "Çalı", x: 1, y: 6.5, w: 1, d: 1, h: 0.8, color: "#5d8a4a" }]),
  };
}

import { EXAMPLES } from "./exampleHouses";

export const LEGACY_TEMPLATES: { key: string; name: string; desc: string; make: () => unknown }[] = [
  { key: "small", name: "Küçük köy evi", desc: "Tek kat · 2+1 · 9\u00a0×\u00a07\u00a0m", make: small },
  { key: "big", name: "İki katlı köy evi", desc: "2 kat · 4+1 · 10\u00a0×\u00a08\u00a0m", make: big },
  { key: "villa", name: "Süper iki katlı ev", desc: "2 kat · 4+1 · açık mutfak · 12\u00a0×\u00a09\u00a0m", make: villa },
  { key: "cabin", name: "Bağ evi", desc: "Tek oda + banyo · 6\u00a0×\u00a05\u00a0m", make: cabin },
];

export const TEMPLATES: { key: string; name: string; desc: string; make: () => unknown }[] = [
  { key: "empty", name: "Boş arsa", desc: "Sıfırdan kendin çiz", make: () => null },
  ...EXAMPLES,
];
