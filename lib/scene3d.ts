import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EnvObj, FullData, Finish, Floor, Item, Opening, Stair } from "./types";
import { FLOOR_DEFAULT, ROUGH, TEX_SIZE, getNormal, getTex } from "./textures";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { inRegion, rasterize, regionAt, wallGeom } from "./rooms";
import { roofInfo } from "./roof";
import { balconyRect } from "./balcony";
import { terrainFn } from "./terrain";
import type { Balcony } from "./types";
import { LAND, stairBox, stairLocal, stairRise, stairSteps, TREAD } from "./stairs";
import { buildStages, floorCols, reached } from "./stages";
import { defaultBuild } from "./types";

/** 3B görünüm ayarları */
export type V3 = {
  floors: "all" | "upto" | "only";
  roof: boolean;
  items: boolean;
  /** kesit: yok / yatay (kat planı) / doğu–batı (x) / kuzey–güney (z) */
  sec: "none" | "h" | "x" | "z";
  /** eski sabit kesit (yalnızca iç kullanım) */
  cut?: boolean;
  /** inşaat aşaması (buildStages dizini); yoksa bitmiş ev */
  stage?: number;
};

/** Kesit düzlemini ayarla: düzlemin "korunan" tarafı görünür kalır */
export function setSecPlane(pl: THREE.Plane, sec: V3["sec"], pos: number, flip: boolean) {
  if (sec === "h") pl.set(new THREE.Vector3(0, -1, 0), pos);
  else if (sec === "x") pl.set(new THREE.Vector3(flip ? 1 : -1, 0, 0), flip ? -pos : pos);
  else if (sec === "z") pl.set(new THREE.Vector3(0, 0, flip ? 1 : -1), flip ? -pos : pos);
  else pl.set(new THREE.Vector3(0, -1, 0), 1e6);
  return pl;
}

/**
 * Evdeki her parçayı kesit düzlemiyle kırp ve kesilen yüzlere koyu dolgu (arka yüz) ekle.
 * Malzemeler kopyalanır; ortak önbellek bozulmaz. Düzlem nesnesi değişince yeniden kurmaya gerek yok.
 */
export function applySection(house: THREE.Object3D, plane: THREE.Plane) {
  const cap = new THREE.MeshBasicMaterial({ color: CUT_CAP, side: THREE.BackSide, clippingPlanes: [plane] });
  const clones = new Map<THREE.Material, THREE.Material>();
  const meshes: THREE.Mesh[] = [];
  house.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.isCap) meshes.push(m);
  });
  for (const m of meshes) {
    const src = m.material as THREE.Material;
    if (Array.isArray(src)) continue;
    let c = clones.get(src);
    if (!c) {
      c = src.clone();
      c.clippingPlanes = [plane];
      if (!c.transparent) c.side = THREE.FrontSide;
      clones.set(src, c);
    }
    m.material = c;
    if (!c.transparent) {
      const capMesh = new THREE.Mesh(m.geometry, cap);
      capMesh.userData.isCap = true;
      capMesh.raycast = () => {}; // dolgu seçilemez
      m.add(capMesh);
    }
  }
}

export const CUT_H = 1.25; // kesit görünümde duvarların kesildiği yükseklik (m)
const SLAB = 0.2; // döşeme kalınlığı (m)
const CUT_CAP = "#6d6155";

/** Her katın döşeme üst kotu (m) */
export function floorBases(f: FullData) {
  let e = Math.max(0, f.build?.plinth ?? 0); // kaide: ev zeminden bu kadar yüksekte başlar
  return f.floors.map((fl) => {
    const b = e;
    e += fl.height;
    return b;
  });
}

const ni = (q: THREE.BufferGeometry) => (q.index ? q.toNonIndexed() : q);

/** Plan (x, y) + yükseklik h → three (X, Y, Z) */
const V = (x: number, h: number, y: number) => new THREE.Vector3(x, h, y);

type Mats = ReturnType<typeof makeMats>;
function makeMats(clip: THREE.Plane[], fin: Finish) {
  const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, clippingPlanes: clip, ...extra });
  const side = clip.length ? THREE.DoubleSide : THREE.FrontSide;
  const ns = (k: string, v = 1) => ({ normalMap: getNormal(k), normalScale: new THREE.Vector2(v, v) });
  const baseTex = fin.baseTex ?? "stone";
  return {
    wallExt: std("#ffffff", { vertexColors: true, map: getTex(fin.extTex), ...ns(fin.extTex), roughness: ROUGH[fin.extTex] ?? 0.92, side }),
    wallInt: std("#ffffff", { vertexColors: true, map: getTex(fin.intTex), ...ns(fin.intTex, 0.6), roughness: ROUGH[fin.intTex] ?? 0.92, side }),
    wallSide: std("#ffffff", { vertexColors: true, side }),
    frame: std(fin.frameColor, { roughness: 0.45 }),
    slab: std("#ebe6dd", { roughness: 0.95 }),
    concrete: std("#a3a19b", { roughness: 0.97 }),
    soil: new THREE.MeshStandardMaterial({ color: "#5a4230", roughness: 1 }),
    floorTop: std("#cdb894"),
    cap: new THREE.MeshStandardMaterial({ color: CUT_CAP, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: "#a9c6d6", roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: clip, envMapIntensity: 2.2 }),
    door: std(fin.doorColor, { roughness: 0.55, map: getTex("wood"), ...ns("wood", 0.5) }),
    doorPanel: std("#" + new THREE.Color(fin.doorColor).multiplyScalar(0.82).getHexString(), { roughness: 0.55, map: getTex("wood") }),
    stair: std("#c9b79c"),
    white: std("#f7f7f4", { roughness: 0.35 }),
    dark: std("#3a3a3a"),
    metal: std("#c4c8cc", { metalness: 0.85, roughness: 0.3 }),
    sill: std("#ece8e0", { roughness: 0.4, map: getTex("marble"), ...ns("marble", 0.4) }),
    plinth: std(fin.baseColor ?? "#a39b8e", { roughness: ROUGH[baseTex] ?? 0.9, map: getTex(baseTex), ...ns(baseTex, 1) }),
    band: std("#f1ede5", { roughness: 0.7 }),
    pave: std("#cbc5b8", { roughness: 0.85, map: getTex("fayans"), ...ns("fayans", 1.2) }),
    gutter: std("#8d9196", { metalness: 0.6, roughness: 0.45 }),
    brick: std("#b8664a", { map: getTex("brick"), ...ns("brick", 1) }),
    infill: new THREE.MeshStandardMaterial({ color: fin.extColor, roughness: 0.9, side: THREE.DoubleSide, map: getTex(fin.extTex), ...ns(fin.extTex) }),
    clip,
    fin,
  };
}

/** Yerel (duvar) koordinatında kutu → dünya; üst/alt yüzlere dünya dokusu */
function lbox(M: THREE.Matrix4, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, uvSize = 0) {
  const b = new THREE.BoxGeometry(Math.max(0.002, Math.abs(x1 - x0)), Math.max(0.002, Math.abs(y1 - y0)), Math.max(0.002, Math.abs(z1 - z0)));
  b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.applyMatrix4(M);
  if (uvSize > 0) {
    const P = b.attributes.position;
    const Nn = b.attributes.normal;
    const uv = b.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const [u, v] = worldUV(P.getX(i), P.getY(i), P.getZ(i), Nn.getX(i), Nn.getY(i), Nn.getZ(i), uvSize);
      uv.setXY(i, u, v);
    }
  }
  return b;
}

/** İki nokta arasında silindir (boru) */
function pipe(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 10) {
  const L = a.distanceTo(b);
  const c = new THREE.CylinderGeometry(r, r, L, seg);
  c.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  c.applyQuaternion(q);
  c.translate(a.x, a.y, a.z);
  return c;
}

/* ---------------- açıklık şekli ---------------- */
function openingPath(p: THREE.Path, a: number, b: number, bottom: number, top: number, shape: Opening["shape"], fromBottom: boolean) {
  const w = b - a;
  const cx = (a + b) / 2;
  if (shape === "round") {
    const r = Math.min(w, top - bottom) / 2;
    const cy = (bottom + top) / 2;
    p.moveTo(cx + r, cy);
    p.absarc(cx, cy, r, 0, Math.PI * 2, false);
    return;
  }
  const arch = shape === "arch" && top - bottom > w / 2;
  if (fromBottom) {
    // dış kontura gömülü kapı (zemine değen) – soldan sağa
    p.lineTo(a, bottom);
    if (arch) {
      p.lineTo(a, top - w / 2);
      p.absarc(cx, top - w / 2, w / 2, Math.PI, 0, true);
    } else {
      p.lineTo(a, top);
      p.lineTo(b, top);
    }
    p.lineTo(b, bottom);
    return;
  }
  p.moveTo(a, bottom);
  p.lineTo(b, bottom);
  if (arch) {
    p.lineTo(b, top - w / 2);
    p.absarc(cx, top - w / 2, w / 2, 0, Math.PI, false);
  } else {
    p.lineTo(b, top);
    p.lineTo(a, top);
  }
  p.lineTo(a, bottom);
}

/** Açıklığın kendi şekli (cam / kapı kanadı için) */
function openingShape(a: number, b: number, bottom: number, top: number, shape: Opening["shape"]) {
  const s = new THREE.Shape();
  openingPath(s, a, b, bottom, top, shape, false);
  return s;
}

/** Dışarıdan erişilebilen hücreler (bina dışı) */
export function outsideMask(r: NonNullable<ReturnType<typeof rasterize>>) {
  const { w: W, h: H, blocked } = r;
  const out = new Uint8Array(W * H);
  const q = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  const push = (i: number, j: number) => {
    const k = j * W + i;
    if (out[k] || blocked[k]) return;
    out[k] = 1;
    q[tail++] = k;
  };
  for (let i = 0; i < W; i++) {
    push(i, 0);
    push(i, H - 1);
  }
  for (let j = 0; j < H; j++) {
    push(0, j);
    push(W - 1, j);
  }
  while (head < tail) {
    const k = q[head++];
    const i = k % W;
    const j = (k - i) / W;
    if (i > 0) push(i - 1, j);
    if (i < W - 1) push(i + 1, j);
    if (j > 0) push(i, j - 1);
    if (j < H - 1) push(i, j + 1);
  }
  return out;
}

export function outsideFn(fl: Floor) {
  const r = rasterize(fl.walls);
  if (!r) return () => true;
  const out = outsideMask(r);
  return (x: number, y: number) => {
    const i = Math.floor((x - r.x0) / r.cell);
    const j = Math.floor((y - r.y0) / r.cell);
    if (i < 0 || j < 0 || i >= r.w || j >= r.h) return true;
    return out[j * r.w + i] === 1;
  };
}

type Bucket = { pos: number[]; nor: number[]; uv: number[]; col: number[]; ids: string[] };
const mkB = (): Bucket => ({ pos: [], nor: [], uv: [], col: [], ids: [] });
function bucketGeo(b: Bucket) {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  return g;
}
/** Dünya koordinatından doku koordinatı (metre / dokuboyu) */
function worldUV(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number): [number, number] {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ay >= ax && ay >= az) return [x / size, z / size];
  if (ax >= az) return [z / size, y / size];
  return [x / size, y / size];
}

/* ---------------- duvarlar ---------------- */
const same = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 0.002;
/** Her duvar ucunun 3B uzatması: birleşimde ilk duvar t/2 uzar, diğerleri onun t/2'si kadar kısalır */
function wallExt(walls: Floor["walls"]) {
  const m = new Map<string, [number, number]>();
  walls.forEach((w) => m.set(w.id, [0, 0]));
  walls.forEach((w, i) => {
    (["a", "b"] as const).forEach((end, k) => {
      const p = w[end];
      const others = walls.filter((o, j) => j !== i && (same(o.a, p) || same(o.b, p)));
      if (!others.length) return;
      const firstIdx = Math.min(i, ...others.map((o) => walls.indexOf(o)));
      const ext = m.get(w.id)!;
      if (firstIdx === i) ext[k] = w.t / 2;
      else ext[k] = -walls[firstIdx].t / 2;
    });
  });
  return m;
}

function buildWalls(fl: Floor, base: number, m: Mats, cut: boolean, g: THREE.Group, level = 0, fit = true) {
  const exts = wallExt(fl.walls);
  const FH = fl.height;
  const isOut = outsideFn(fl);
  const bExt = mkB();
  const bInt = mkB();
  const bSide = mkB();
  const fin = m.fin;
  const sizeExt = TEX_SIZE[fin.extTex] ?? 1;
  const sizeInt = TEX_SIZE[fin.intTex] ?? 1;
  const glassGeoms: THREE.BufferGeometry[] = [];
  const doorGeoms: THREE.BufferGeometry[] = [];
  const capGeoms: THREE.BufferGeometry[] = [];
  const frameGeoms: THREE.BufferGeometry[] = [];
  const sillGeoms: THREE.BufferGeometry[] = [];
  const plinthGeoms: THREE.BufferGeometry[] = [];
  const bandGeoms: THREE.BufferGeometry[] = [];
  const paveGeoms: THREE.BufferGeometry[] = [];
  const panelGeoms: THREE.BufferGeometry[] = [];
  const metalGeoms: THREE.BufferGeometry[] = [];
  let wi = 0;
  for (const w of fl.walls) {
    wi++;
    const H = Math.max(0.3, Math.min(8, w.h ?? FH));
    const { L, u, n } = wallGeom(w, undefined);
    const [ea, eb] = exts.get(w.id) ?? [0, 0];
    if (L < 0.01 || L + ea + eb < 0.01) continue;
    const ops = fl.openings
      .filter((o) => o.wall === w.id)
      .map((o) => {
        const a = Math.max(-ea + 0.01, o.pos - o.w / 2);
        const b = Math.min(L + eb - 0.01, o.pos + o.w / 2);
        const bottom = Math.max(0, Math.min(H - 0.1, o.sill));
        const top = Math.min(H - 0.05, bottom + o.h);
        return { o, a, b, bottom, top };
      })
      .filter((q) => q.b - q.a > 0.05 && q.top - q.bottom > 0.05)
      .sort((p, q) => p.a - q.a);
    const floorOps = ops.filter((q) => q.bottom < 0.005 && q.o.shape !== "round");
    const holeOps = ops.filter((q) => !(q.bottom < 0.005 && q.o.shape !== "round"));

    const sh = new THREE.Shape();
    sh.moveTo(-ea, 0);
    let x = -ea;
    for (const q of floorOps) {
      if (q.a <= x + 0.005) continue; // üst üste binen kapılar
      openingPath(sh, q.a, q.b, 0, q.top, q.o.shape, true);
      x = q.b;
    }
    sh.lineTo(L + eb, 0);
    sh.lineTo(L + eb, H);
    sh.lineTo(-ea, H);
    sh.lineTo(-ea, 0);
    for (const q of holeOps) {
      const h = new THREE.Path();
      openingPath(h, q.a, q.b, q.bottom, q.top, q.o.shape, false);
      sh.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: w.t, bevelEnabled: false, curveSegments: 16 });
    geo.translate(0, 0, -w.t / 2);
    const M = new THREE.Matrix4().makeBasis(V(u.x, 0, u.y), V(0, 1, 0), V(n.x, 0, n.y)).setPosition(w.a.x, base, w.a.y);
    geo.applyMatrix4(M);
    const mx = (w.a.x + w.b.x) / 2;
    const my = (w.a.y + w.b.y) / 2;
    const dd = w.t / 2 + 0.25;
    const outN = isOut(mx + n.x * dd, my + n.y * dd);
    const outM = isOut(mx - n.x * dd, my - n.y * dd);
    const zOut = outN && !outM ? 1 : outM && !outN ? -1 : 0; // dış yüz yerel +z mi -z mi
    const T2 = w.t / 2;
    // yüzleri dış / iç / kenar olarak ayır, renk ve doku koordinatı ver
    {
      const g2 = ni(geo);
      const P = g2.attributes.position;
      const Nn = g2.attributes.normal;
      const cExt = new THREE.Color(w.ext ?? fin.extColor);
      const cInt = new THREE.Color(w.int ?? fin.intColor);
      for (let i = 0; i + 2 < P.count; i += 3) {
        const nd = Nn.getX(i) * n.x + Nn.getZ(i) * n.y;
        let b = bSide;
        let col = cExt;
        let size = sizeExt;
        if (Math.abs(nd) > 0.5) {
          const faceOut = nd > 0 ? outN : outM;
          b = faceOut ? bExt : bInt;
          col = faceOut ? cExt : cInt;
          size = faceOut ? sizeExt : sizeInt;
        }
        b.ids.push(w.id);
        for (let k = 0; k < 3; k++) {
          const x = P.getX(i + k);
          const y = P.getY(i + k);
          const z = P.getZ(i + k);
          const nx = Nn.getX(i + k);
          const ny = Nn.getY(i + k);
          const nz = Nn.getZ(i + k);
          b.pos.push(x, y, z);
          b.nor.push(nx, ny, nz);
          b.uv.push(...worldUV(x, y, z, nx, ny, nz, size));
          b.col.push(col.r, col.g, col.b);
        }
      }
      geo.dispose();
      g2.dispose();
    }

    for (const q of ops) {
      if (q.o.kind === "window") {
        // pencere dış yüze yakın oturur: içeride derin bir pervaz boşluğu kalır
        const rz = zOut ? zOut * (T2 - 0.07) : 0;
        const gg = new THREE.ShapeGeometry(openingShape(q.a, q.b, q.bottom, q.top, q.o.shape), 16);
        gg.translate(0, 0, rz);
        gg.applyMatrix4(M);
        glassGeoms.push(gg);
        const fw = Math.min(0.07, (q.b - q.a) / 6, (q.top - q.bottom) / 6);
        const fr = openingShape(q.a, q.b, q.bottom, q.top, q.o.shape);
        const inner = new THREE.Path();
        openingPath(inner, q.a + fw, q.b - fw, q.bottom + fw, q.top - fw, q.o.shape, false);
        fr.holes.push(inner);
        const fg = new THREE.ExtrudeGeometry(fr, { depth: 0.09, bevelEnabled: false, curveSegments: 16 });
        fg.translate(0, 0, -0.045 + rz);
        fg.applyMatrix4(M);
        frameGeoms.push(ni(fg));
        if (q.o.shape === "rect") {
          const wd = q.b - q.a;
          const ht = q.top - q.bottom;
          const transom = ht > 1.15 ? q.top - Math.min(0.42, ht * 0.3) : 0;
          if (wd > 0.7) frameGeoms.push(lbox(M, (q.a + q.b) / 2 - fw * 0.45, (q.a + q.b) / 2 + fw * 0.45, q.bottom + fw, transom || q.top - fw, rz - 0.035, rz + 0.035));
          if (transom) frameGeoms.push(lbox(M, q.a + fw, q.b - fw, transom - fw * 0.45, transom + fw * 0.45, rz - 0.035, rz + 0.035));
          // kanat çerçeveleri (ince iç kasa)
          const sash = 0.035;
          const cols = wd > 0.7 ? [[q.a + fw, (q.a + q.b) / 2 - fw * 0.45], [(q.a + q.b) / 2 + fw * 0.45, q.b - fw]] : [[q.a + fw, q.b - fw]];
          for (const [x0, x1] of cols) {
            const y0 = q.bottom + fw;
            const y1 = (transom || q.top) - (transom ? fw * 0.45 : fw);
            for (const [a0, a1, b0, b1] of [[x0, x1, y0, y0 + sash], [x0, x1, y1 - sash, y1], [x0, x0 + sash, y0, y1], [x1 - sash, x1, y0, y1]]) frameGeoms.push(lbox(M, a0, a1, b0, b1, rz - 0.025, rz + 0.025));
          }
          if (zOut) {
            // dış denizlik (öne taşar) ve iç denizlik
            sillGeoms.push(lbox(M, q.a - 0.06, q.b + 0.06, q.bottom - 0.05, q.bottom, rz, zOut * (T2 + 0.07)));
            if (q.bottom > 0.3) sillGeoms.push(lbox(M, q.a - 0.04, q.b + 0.04, q.bottom - 0.03, q.bottom + 0.004, rz, -zOut * (T2 + 0.035)));
          }
        }
      } else {
        const zc = (q.o.flip ? -1 : 1) * (T2 - 0.06);
        const dg = new THREE.ExtrudeGeometry(openingShape(q.a + 0.01, q.b - 0.01, q.bottom, q.top - 0.01, q.o.shape), { depth: 0.045, bevelEnabled: false, curveSegments: 16 });
        dg.translate(0, 0, zc - 0.0225);
        dg.applyMatrix4(M);
        doorGeoms.push(ni(dg));
        if (q.o.shape === "rect" && q.top - q.bottom > 1.7) {
          // kapı kanadı panelleri ve kol
          const px0 = q.a + 0.13;
          const px1 = q.b - 0.13;
          const hgt = q.top - q.bottom;
          const panels = q.b - q.a > 1.15 ? [[q.bottom + 0.15, q.bottom + hgt * 0.42], [q.bottom + hgt * 0.5, q.top - 0.15]] : [[q.bottom + 0.15, q.bottom + hgt * 0.42], [q.bottom + hgt * 0.5, q.top - 0.15]];
          for (const [y0, y1] of panels)
            for (const sz of [1, -1]) panelGeoms.push(lbox(M, px0, px1, y0, y1, zc + sz * 0.0225, zc + sz * 0.034));
          const hx = q.o.hinge ? q.a + 0.09 : q.b - 0.09;
          const dir = q.o.hinge ? 1 : -1;
          for (const sz of [1, -1]) {
            metalGeoms.push(lbox(M, hx - 0.025, hx + 0.025, q.bottom + 0.96, q.bottom + 1.1, zc + sz * 0.0225, zc + sz * 0.03));
            metalGeoms.push(lbox(M, Math.min(hx, hx + dir * 0.13), Math.max(hx, hx + dir * 0.13), q.bottom + 1.03, q.bottom + 1.055, zc + sz * 0.05, zc + sz * 0.075));
            metalGeoms.push(lbox(M, hx - 0.012, hx + 0.012, q.bottom + 1.03, q.bottom + 1.055, zc + sz * 0.03, zc + sz * 0.06));
          }
          // pervaz (iki yüzde) ve kasa
          if (q.bottom < 0.005) {
            const pw = 0.075;
            for (const sz of [1, -1]) {
              const z0 = sz * T2;
              const z1 = sz * (T2 + 0.018);
              panelGeoms.push(lbox(M, q.a - pw, q.a, 0, q.top + pw, z0, z1));
              panelGeoms.push(lbox(M, q.b, q.b + pw, 0, q.top + pw, z0, z1));
              panelGeoms.push(lbox(M, q.a - pw, q.b + pw, q.top, q.top + pw, z0, z1));
            }
            panelGeoms.push(lbox(M, q.a, q.a + 0.02, 0, q.top, -T2, T2));
            panelGeoms.push(lbox(M, q.b - 0.02, q.b, 0, q.top, -T2, T2));
            panelGeoms.push(lbox(M, q.a, q.b, q.top - 0.02, q.top, -T2, T2));
          }
        }
      }
    }
    // dış cephe detayları
    if (zOut && !cut) {
      const xs = -(T2 + 0.035);
      const xe = L + T2 + 0.035;
      const gaps = floorOps.map((q) => [q.a - (q.o.shape === "rect" ? 0.08 : 0.01), q.b + (q.o.shape === "rect" ? 0.08 : 0.01)] as [number, number]).sort((p, q) => p[0] - q[0]);
      const spans: [number, number][] = [];
      let x0 = xs;
      for (const [ga, gb] of gaps) {
        if (ga > x0) spans.push([x0, ga]);
        x0 = Math.max(x0, gb);
      }
      if (x0 < xe) spans.push([x0, xe]);
      if (level === 0) {
        // subasman (taş taban) ve çevre kaldırımı
        for (const [a0, a1] of spans) plinthGeoms.push(lbox(M, a0, a1, 0, 0.5, zOut * (T2 - 0.01), zOut * (T2 + 0.035), 1.2));
        const hz = 0.022 + (wi % 5) * 0.0012;
        paveGeoms.push(lbox(M, -(T2 + 0.9), L + T2 + 0.9, -0.03, hz, zOut * (T2 - 0.02), zOut * (T2 + 0.9), 0.6));
        // giriş kapısından bahçeye taş yol
        for (const q of floorOps) paveGeoms.push(lbox(M, q.a - 0.2, q.b + 0.2, -0.03, hz + 0.002, zOut * (T2 + 0.5), zOut * (T2 + 3.6), 0.6));
      } else {
        // kat silmesi (iki kat arasındaki kuşak)
        for (const [a0, a1] of spans) bandGeoms.push(lbox(M, a0, a1, -0.22, 0.06, zOut * (T2 - 0.01), zOut * (T2 + 0.04)));
      }
    }
    if (cut) {
      const cg = new THREE.BoxGeometry(L + ea + eb, 0.015, w.t);
      cg.translate((L + eb - ea) / 2, CUT_H, 0);
      cg.applyMatrix4(M);
      capGeoms.push(ni(cg));
    }
  }
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!geos.length) return null;
    const merged = mergeGeometries(geos.map(ni));
    geos.forEach((q) => q.dispose());
    if (!merged) return null;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    g.add(mesh);
    return mesh;
  };
  for (const [b, mat, face] of [[bExt, m.wallExt, "ext"], [bInt, m.wallInt, "int"], [bSide, m.wallSide, "side"]] as [Bucket, THREE.Material, string][]) {
    const bg = bucketGeo(b);
    if (!bg) continue;
    const mesh = new THREE.Mesh(bg, mat);
    mesh.userData = { pick: "wall", face, ids: b.ids };
    mesh.castShadow = !cut;
    mesh.receiveShadow = !cut;
    g.add(mesh);
  }
  if (fit) {
    const gm = add(glassGeoms, m.glass, false);
    if (gm) gm.userData.glass = true;
    add(doorGeoms, m.door, !cut);
    add(frameGeoms, m.frame, !cut);
    add(sillGeoms, m.sill, !cut);
    add(panelGeoms, m.doorPanel, !cut);
    add(metalGeoms, m.metal, false);
  }
  add(capGeoms, m.cap, false);
  add(plinthGeoms, m.plinth, true);
  add(bandGeoms, m.band, true);
  add(paveGeoms, m.pave, true);
}

/* ---------------- döşeme ---------------- */
function buildSlab(fl: Floor, below: Floor | null, base: number, m: Mats, g: THREE.Group, matOverride?: THREE.Material, T = SLAB) {
  const r = rasterize(fl.walls);
  if (!r) return;
  const { w: W, h: H, cell, blocked } = r;
  const out = outsideMask(r);
  const inside = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) inside[k] = out[k] || blocked[k] ? 0 : 1;
  // alt kattan gelen merdiven boşluğu
  if (below) {
    for (const st of below.stairs.filter((q) => !q.ext)) {
      const { W: sw, D: sd } = stairBox(st, below.height);
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const k = j * W + i;
          if (!inside[k] || blocked[k]) continue;
          const lp = stairLocal(st, { x: r.x0 + (i + 0.5) * cell, y: r.y0 + (j + 0.5) * cell });
          if (Math.abs(lp.x) <= sw / 2 && Math.abs(lp.y) <= sd / 2) inside[k] = 0;
        }
    }
  }
  // satır koşularını dikdörtgenlere birleştir
  const rects: { i0: number; i1: number; j0: number; j1: number }[] = [];
  let open = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
  for (let j = 0; j <= H; j++) {
    const runs: [number, number][] = [];
    if (j < H) {
      let i = 0;
      while (i < W) {
        if (inside[j * W + i]) {
          const s = i;
          while (i < W && inside[j * W + i]) i++;
          runs.push([s, i]);
        } else i++;
      }
    }
    const next = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
    for (const [a, b] of runs) {
      const key = a + ":" + b;
      const prev = open.get(key);
      if (prev) {
        prev.j1 = j + 1;
        next.set(key, prev);
        open.delete(key);
      } else next.set(key, { i0: a, i1: b, j0: j, j1: j + 1 });
    }
    open.forEach((v) => rects.push(v));
    open = next;
  }
  if (!rects.length) return;
  const geos = rects.map((rc) => {
    const x0 = r.x0 + rc.i0 * cell;
    const x1 = r.x0 + rc.i1 * cell;
    const y0 = r.y0 + rc.j0 * cell;
    const y1 = r.y0 + rc.j1 * cell;
    const bg = new THREE.BoxGeometry(x1 - x0, T, y1 - y0);
    bg.translate((x0 + x1) / 2, base - T / 2, (y0 + y1) / 2);
    return ni(bg);
  });
  const merged = mergeGeometries(geos.map(ni));
  geos.forEach((q2) => q2.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, matOverride ?? (base > 0.01 ? m.slab : m.floorTop));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  g.add(mesh);
}

/* ---------------- yapı: direk ve temel ---------------- */
function buildCols(f: FullData, fi: number, base: number, m: Mats, g: THREE.Group) {
  const b = f.build ?? defaultBuild();
  const H = f.floors[fi].height;
  const cs = floorCols(f, fi);
  if (!cs.length) return;
  const geos = cs.map((c) => {
    const bg = new THREE.BoxGeometry(b.colSize, H, b.colSize);
    bg.translate(c.x, base + H / 2, c.y);
    return ni(bg);
  });
  const merged = mergeGeometries(geos);
  geos.forEach((q) => q.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, m.concrete);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
}

/** Temel: "dig" = hendek (koyu toprak), "found" = beton (zeminin altında) */
function buildFoundation(f: FullData, fi: number, mode: "dig" | "found", m: Mats, g: THREE.Group) {
  const b = f.build ?? defaultBuild();
  const fl = f.floors[fi];
  if (b.foundation === "none" || !fl.walls.length) return;
  const geos: THREE.BufferGeometry[] = [];
  if (b.foundation === "raft") {
    const xs = fl.walls.flatMap((w) => [w.a.x, w.b.x]);
    const ys = fl.walls.flatMap((w) => [w.a.y, w.b.y]);
    const x0 = Math.min(...xs) - 0.45;
    const x1 = Math.max(...xs) + 0.45;
    const y0 = Math.min(...ys) - 0.45;
    const y1 = Math.max(...ys) + 0.45;
    const h = mode === "dig" ? 0.02 : 0.4;
    const bg = new THREE.BoxGeometry(x1 - x0 + (mode === "dig" ? 0.6 : 0), h, y1 - y0 + (mode === "dig" ? 0.6 : 0));
    bg.translate((x0 + x1) / 2, mode === "dig" ? 0.012 : -0.2, (y0 + y1) / 2);
    geos.push(ni(bg));
  } else {
    for (const w of fl.walls) {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const L = Math.hypot(dx, dy);
      if (L < 0.05) continue;
      const fw = b.fWidth + (mode === "dig" ? 0.6 : 0);
      const bg = new THREE.BoxGeometry(L + fw, mode === "dig" ? 0.02 : b.fDepth, fw);
      bg.rotateY(-Math.atan2(dy, dx));
      bg.translate((w.a.x + w.b.x) / 2, mode === "dig" ? 0.012 : -b.fDepth / 2, (w.a.y + w.b.y) / 2);
      geos.push(ni(bg));
    }
  }
  const merged = geos.length ? mergeGeometries(geos) : null;
  geos.forEach((q) => q.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, mode === "dig" ? m.soil : m.concrete);
  mesh.receiveShadow = true;
  g.add(mesh);
}

/** Kaide: ev zeminden yükseltilmişse duvarların altında zeminden döşemeye kadar beton / taş blok */
function buildPlinth(f: FullData, fi: number, m: Mats, g: THREE.Group) {
  const b = f.build ?? defaultBuild();
  const fl = f.floors[fi];
  if (!(b.plinth > 0.01) || !fl || !fl.walls.length) return;
  const mat = b.plinthTex === "stone" ? m.plinth : m.concrete;
  const geos: THREE.BufferGeometry[] = [];
  for (const w of fl.walls) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const L = Math.hypot(dx, dy);
    if (L < 0.05) continue;
    const bg = new THREE.BoxGeometry(L + w.t, b.plinth + 0.3, w.t + 0.04);
    bg.rotateY(-Math.atan2(dy, dx));
    bg.translate((w.a.x + w.b.x) / 2, (b.plinth - 0.3) / 2, (w.a.y + w.b.y) / 2);
    geos.push(ni(bg));
  }
  const merged = geos.length ? mergeGeometries(geos) : null;
  geos.forEach((q) => q.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
}

/* ---------------- oda zemin kaplamaları ---------------- */
function buildRoomFloors(fl: Floor, below: Floor | null, base: number, clip: THREE.Plane[], g: THREE.Group) {
  const rs = fl.rooms.filter((rm) => rm.floor && rm.floor !== "none");
  if (!rs.length) return;
  const r = rasterize(fl.walls);
  if (!r) return;
  const byTex = new Map<string, THREE.BufferGeometry[]>();
  const idsByTex = new Map<string, string[]>();
  for (const rm of rs) {
    const reg = regionAt(r, rm.seed);
    if (!reg || reg.open) continue;
    const { w: W, h: H, cell } = reg;
    const mask = reg.mask;
    if (below)
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          if (!mask[j * W + i]) continue;
          for (const st of below.stairs.filter((q) => !q.ext)) {
            const { W: sw, D: sd } = stairBox(st, below.height);
            const lp = stairLocal(st, { x: reg.x0 + (i + 0.5) * cell, y: reg.y0 + (j + 0.5) * cell });
            if (Math.abs(lp.x) <= sw / 2 && Math.abs(lp.y) <= sd / 2) mask[j * W + i] = 0;
          }
        }
    const col = new THREE.Color(rm.floorColor ?? FLOOR_DEFAULT[rm.floor!] ?? "#cccccc");
    const size = TEX_SIZE[rm.floor!] ?? 1;
    const key = rm.floor!;
    // satır koşularını dikdörtgenlere birleştir
    let open = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
    const rects: { i0: number; i1: number; j0: number; j1: number }[] = [];
    for (let j = 0; j <= H; j++) {
      const runs: [number, number][] = [];
      if (j < H) {
        let i = 0;
        while (i < W) {
          if (mask[j * W + i]) {
            const st = i;
            while (i < W && mask[j * W + i]) i++;
            runs.push([st, i]);
          } else i++;
        }
      }
      const next = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
      for (const [a, b] of runs) {
        const k = a + ":" + b;
        const pv = open.get(k);
        if (pv) {
          pv.j1 = j + 1;
          next.set(k, pv);
          open.delete(k);
        } else next.set(k, { i0: a, i1: b, j0: j, j1: j + 1 });
      }
      open.forEach((v) => rects.push(v));
      open = next;
    }
    for (const rc of rects) {
      const x0 = reg.x0 + rc.i0 * cell;
      const x1 = reg.x0 + rc.i1 * cell;
      const y0 = reg.y0 + rc.j0 * cell;
      const y1 = reg.y0 + rc.j1 * cell;
      // yalnızca üst yüz: iki üçgen
      const pos = [x0, 0, y0, x0, 0, y1, x1, 0, y1, x0, 0, y0, x1, 0, y1, x1, 0, y0];
      const uv: number[] = [];
      const colr: number[] = [];
      for (let k = 0; k < 6; k++) {
        uv.push(pos[k * 3] / size, pos[k * 3 + 2] / size);
        colr.push(col.r, col.g, col.b);
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      bg.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      bg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      bg.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
      if (!byTex.has(key)) {
        byTex.set(key, []);
        idsByTex.set(key, []);
      }
      byTex.get(key)!.push(bg);
      idsByTex.get(key)!.push(rm.id, rm.id);
    }
  }
  byTex.forEach((geos, key) => {
    const merged = mergeGeometries(geos);
    geos.forEach((q) => q.dispose());
    if (!merged) return;
    const mt = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, map: getTex(key), normalMap: getNormal(key), roughness: ROUGH[key] ?? 0.85, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(merged, mt);
    mesh.position.y = base + 0.004;
    mesh.userData = { pick: "room", ids: idsByTex.get(key) };
    mesh.receiveShadow = true;
    g.add(mesh);
  });
}

/* ---------------- merdiven ---------------- */
function buildBalconies(fl: Floor, base: number, m: Mats, g: THREE.Group) {
  for (const b of fl.balconies ?? []) {
    const w = fl.walls.find((q) => q.id === b.wall);
    if (!w) continue;
    const r = balconyRect(w, b);
    const grp = new THREE.Group();
    grp.position.set(r.c.x, base, r.c.y);
    grp.rotation.y = -Math.atan2(r.u.y, r.u.x);
    const s = b.side;
    const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const me = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      me.position.set(x, y, s * z);
      me.castShadow = true;
      me.receiveShadow = true;
      grp.add(me);
    };
    const z0 = r.o0, z1 = r.o0 + b.d;
    add(b.w, b.slabT, b.d, 0, -b.slabT / 2, (z0 + z1) / 2, m.concrete);
    const H = b.railH;
    // korkuluk: ön ve iki yan
    const runs: [number, number, number, number][] = [
      [-b.w / 2, z1 - 0.03, b.w / 2, z1 - 0.03],
      [-b.w / 2 + 0.03, z0, -b.w / 2 + 0.03, z1],
      [b.w / 2 - 0.03, z0, b.w / 2 - 0.03, z1],
    ];
    for (const [xa, za, xb, zb] of runs) {
      const len = Math.hypot(xb - xa, zb - za);
      const cx = (xa + xb) / 2, cz = (za + zb) / 2;
      const alongX = Math.abs(xb - xa) > 0.001;
      if (b.rail === "solid") add(alongX ? len : 0.1, H, alongX ? 0.1 : len, cx, H / 2, cz, m.concrete);
      else {
        if (b.rail === "glass") add(alongX ? len : 0.02, H - 0.08, alongX ? 0.02 : len, cx, (H - 0.08) / 2 + 0.02, cz, m.glass);
        else {
          const n = Math.max(2, Math.round(len / 0.12));
          for (let k = 0; k <= n; k++) {
            const t = k / n;
            add(0.03, H, 0.03, xa + (xb - xa) * t, H / 2, za + (zb - za) * t, m.metal);
          }
        }
        add(alongX ? len : 0.06, 0.05, alongX ? 0.06 : len, cx, H, cz, m.metal);
        if (b.rail === "bars") add(alongX ? len : 0.02, 0.025, alongX ? 0.02 : len, cx, 0.1, cz, m.metal);
      }
    }
    g.add(grp);
  }
}

function buildStair(st: Stair, H: number, base: number, m: Mats, g: THREE.Group) {
  const { treads } = stairSteps(H);
  const { W, D } = stairBox(st, H);
  const w = st.w;
  const sg = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  // yerel kutu: x [x0,x1], plan-y [y0,y1], yükseklik [0, top]
  const box = (x0: number, x1: number, y0: number, y1: number, top: number, bottom = 0) => {
    const b = new THREE.BoxGeometry(Math.abs(x1 - x0), top - bottom, Math.abs(y1 - y0));
    b.translate((x0 + x1) / 2, (top + bottom) / 2, (y0 + y1) / 2);
    geos.push(ni(b));
  };
  if (st.kind === "straight") {
    const r = H / (treads + 1);
    for (let i = 0; i < treads; i++) box(-W / 2, W / 2, D / 2 - (i + 1) * TREAD, D / 2 - i * TREAD, (i + 1) * r);
    if (st.ext) {
      // sahanlık (katı beton blok) ve iki yanda korkuluk
      box(-W / 2, W / 2, -D / 2, -D / 2 + LAND, H);
      const RH = 0.95;
      const Ls = D - LAND;
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 - 0.03);
        const len = Math.hypot(Ls, H);
        const rail = new THREE.BoxGeometry(0.05, 0.05, len);
        rail.rotateX(Math.atan2(H, Ls));
        rail.translate(x, H / 2 + RH, D / 2 - Ls / 2);
        geos.push(ni(rail));
        const flat = new THREE.BoxGeometry(0.05, 0.05, LAND);
        flat.translate(x, H + RH, -D / 2 + LAND / 2);
        geos.push(ni(flat));
        for (let i = 0; i < treads; i += 2) {
          const post = new THREE.BoxGeometry(0.04, RH, 0.04);
          post.translate(x, (i + 1) * r + RH / 2, D / 2 - (i + 0.5) * TREAD);
          geos.push(ni(post));
        }
        for (const yy of [-D / 2 + 0.04, -D / 2 + LAND - 0.04]) {
          const post = new THREE.BoxGeometry(0.04, RH, 0.04);
          post.translate(x, H + RH / 2, yy);
          geos.push(ni(post));
        }
      }
    }
  } else if (st.kind === "spiral") {
    const R = W / 2;
    const r = H / (treads + 1);
    const pole = new THREE.CylinderGeometry(0.07, 0.07, H, 12);
    pole.translate(0, H / 2, 0);
    geos.push(ni(pole));
    for (let i = 0; i < treads; i++) {
      const a0 = (i / treads) * Math.PI * 2;
      const a1 = ((i + 1.15) / treads) * Math.PI * 2;
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(R * Math.cos(a0), R * Math.sin(a0));
      s.absarc(0, 0, R, a0, a1, false);
      s.lineTo(0, 0);
      const e = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false, curveSegments: 6 });
      e.rotateX(Math.PI / 2);
      e.translate(0, (i + 1) * r, 0);
      geos.push(ni(e));
    }
  } else {
    const k1 = Math.ceil(treads / 2);
    const k2 = treads - k1;
    const r = H / (treads + 2);
    const x0 = -W / 2;
    const y0 = -D / 2;
    for (let i = 0; i < k1; i++) box(x0, x0 + w, D / 2 - (i + 1) * TREAD, D / 2 - i * TREAD, (i + 1) * r);
    if (st.kind === "L") {
      box(x0, x0 + w, y0, y0 + w, (k1 + 1) * r);
      for (let j = 0; j < k2; j++) box(x0 + w + j * TREAD, x0 + w + (j + 1) * TREAD, y0, y0 + w, (k1 + 2 + j) * r);
    } else {
      box(x0, W / 2, y0, y0 + w, (k1 + 1) * r);
      for (let j = 0; j < k2; j++) box(W / 2 - w, W / 2, y0 + w + j * TREAD, y0 + w + (j + 1) * TREAD, (k1 + 2 + j) * r);
    }
  }
  if (!geos.length) return;
  const merged = mergeGeometries(geos.map(ni));
  geos.forEach((q) => q.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, m.stair);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  sg.add(mesh);
  sg.scale.x = st.mirror ? -1 : 1;
  sg.rotation.y = (-st.rot * Math.PI) / 180;
  sg.position.set(st.x, base, st.y);
  g.add(sg);
}

/* ---------------- eşya ---------------- */
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function colorMat(color: string, clip: THREE.Plane[]) {
  const key = color + (clip.length ? ":c" : "");
  let mt = matCache.get(key);
  if (!mt) {
    mt = new THREE.MeshStandardMaterial({ color, roughness: 0.8, clippingPlanes: clip });
    matCache.set(key, mt);
  } else mt.clippingPlanes = clip;
  return mt;
}

function buildItem(it: Item, base: number, m: Mats, g: THREE.Group) {
  const ig = new THREE.Group();
  const { w, d, h } = it;
  const main = colorMat(it.color, m.clip);
  const shade = (c: string, k: number) => colorMat("#" + new THREE.Color(c).multiplyScalar(k).getHexString(), m.clip);
  const wood = colorMat("#8a6a4a", m.clip);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ig.add(mesh);
    return mesh;
  };
  // yerel kutu: x [-w/2,w/2], plan-y (z) [-d/2,d/2], arka taraf = -d/2; r: kenar yuvarlatma
  const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, mat: THREE.Material = main, r = 0.012) => {
    const sx = Math.max(0.004, x1 - x0);
    const sy = Math.max(0.004, y1 - y0);
    const sz = Math.max(0.004, z1 - z0);
    const rr = Math.min(r, sx / 2 - 0.001, sy / 2 - 0.001, sz / 2 - 0.001);
    const b = rr > 0.003 ? new RoundedBoxGeometry(sx, sy, sz, 2, rr) : new THREE.BoxGeometry(sx, sy, sz);
    b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return add(b, mat);
  };
  const cyl = (rx: number, y0: number, y1: number, mat: THREE.Material, x = 0, z = 0, rz = rx, seg = 28, rTop = rx) => {
    const c = new THREE.CylinderGeometry(rTop, rx, Math.max(0.002, y1 - y0), seg);
    c.scale(1, 1, rz / rx);
    c.translate(x, (y0 + y1) / 2, z);
    return add(c, mat);
  };
  const legs = (x: number, z: number, y1: number, r: number, mat: THREE.Material) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(r, 0, y1, mat, sx * x, sz * z, r, 10);
  };
  const handle = (x: number, y: number, z: number, vertical: boolean, len = 0.12) => {
    if (vertical) box(x - 0.008, x + 0.008, z, z + 0.025, y - len / 2, y + len / 2, m.metal, 0.006);
    else box(x - len / 2, x + len / 2, z, z + 0.025, y - 0.008, y + 0.008, m.metal, 0.006);
  };
  /** önden kapaklı dolap gövdesi */
  const cabinet = (y0: number, y1: number, doors: number, body: THREE.Material, front: THREE.Material, drawers = false) => {
    box(-W2, W2, -D2, D2 - 0.02, y0, y1, body, 0.01);
    const gap = 0.006;
    const dw = (w - gap * (doors + 1)) / doors;
    for (let i = 0; i < doors; i++) {
      const x0 = -W2 + gap + i * (dw + gap);
      box(x0, x0 + dw, D2 - 0.02, D2, y0 + gap, y1 - gap, front, 0.006);
      if (drawers) handle(x0 + dw / 2, y1 - 0.06, D2, false, Math.min(0.16, dw * 0.5));
      else handle(i % 2 === 0 && doors > 1 ? x0 + dw - 0.05 : x0 + 0.05, y1 - Math.min(0.12, (y1 - y0) * 0.25), D2, true, Math.min(0.14, (y1 - y0) * 0.3));
    }
  };
  const W2 = w / 2;
  const D2 = d / 2;
  const isTable = /masa|sehpa|ada/i.test(it.name) || it.key.startsWith("table") || it.key === "desk" || it.key === "kdesk" || it.key.startsWith("coffee");
  const fabric = (c: string) => colorMat(c, m.clip);
  switch (it.shape) {
    case "round": {
      if (it.key === "ochair") {
        cyl(W2 * 0.85, 0.42, 0.5, main, 0, 0, D2 * 0.85);
        box(-W2 * 0.7, W2 * 0.7, -D2 * 0.85, -D2 * 0.68, 0.52, h, main, 0.04);
        cyl(0.03, 0.08, 0.42, m.metal);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          box(Math.cos(a) * W2 * 0.4 - 0.02, Math.cos(a) * W2 * 0.4 + 0.02, Math.sin(a) * W2 * 0.4 - 0.02, Math.sin(a) * W2 * 0.4 + 0.02, 0.02, 0.07, m.dark, 0.01);
        }
        cyl(W2 * 0.75, 0.05, 0.09, m.dark, 0, 0, D2 * 0.75, 5);
      } else if (it.key === "plant") {
        cyl(W2 * 0.75, 0, h * 0.32, colorMat("#b5653f", m.clip), 0, 0, D2 * 0.75, 20, W2 * 0.95);
        cyl(W2 * 0.85, h * 0.3, h * 0.33, colorMat("#3b2a1d", m.clip), 0, 0, D2 * 0.85, 20);
        const leaf = colorMat(it.color, m.clip);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const s = new THREE.SphereGeometry(1, 14, 10);
          s.scale(W2 * 0.6, h * 0.22, D2 * 0.6);
          s.translate(Math.cos(a) * W2 * 0.45, h * (0.5 + (i % 3) * 0.12), Math.sin(a) * D2 * 0.45);
          add(s, leaf);
        }
        const s = new THREE.SphereGeometry(1, 14, 10);
        s.scale(W2 * 0.7, h * 0.25, D2 * 0.7);
        s.translate(0, h * 0.78, 0);
        add(s, leaf);
      } else if (it.key === "stool") {
        cyl(W2, h - 0.05, h, main, 0, 0, D2);
        cyl(0.025, 0.04, h - 0.05, m.metal);
        cyl(W2 * 0.8, 0, 0.03, m.metal, 0, 0, D2 * 0.8);
        cyl(W2 * 0.75, 0.25, 0.27, m.metal, 0, 0, D2 * 0.75, 20);
      } else if (it.key === "pouf" || it.key === "bin") {
        cyl(W2, 0, h, main, 0, 0, D2, 28, W2 * 0.96);
        cyl(W2 * 0.96, h - 0.01, h + 0.01, shade(it.color, 0.9), 0, 0, D2 * 0.96);
      } else if (isTable || it.key === "tableR") {
        cyl(W2, h - 0.035, h, main, 0, 0, D2, 40);
        cyl(0.05, 0.03, h - 0.035, main);
        cyl(Math.min(W2, 0.28), 0, 0.03, main, 0, 0, Math.min(D2, 0.28));
      } else cyl(W2, 0, h, main, 0, 0, D2);
      break;
    }
    case "rug": {
      box(-W2, W2, -D2, D2, 0, Math.max(0.012, h), main, 0.006);
      box(-W2 + 0.12, W2 - 0.12, -D2 + 0.12, D2 - 0.12, 0.002, Math.max(0.012, h) + 0.002, shade(it.color, 0.8), 0.004);
      box(-W2 + 0.2, W2 - 0.2, -D2 + 0.2, D2 - 0.2, 0.004, Math.max(0.012, h) + 0.003, main, 0.004);
      break;
    }
    case "bed": {
      const bunk = h > 1.2;
      const levels = bunk ? [0.25, 1.25] : [0];
      const frame = colorMat("#8b6b4c", m.clip);
      for (const y of levels) {
        box(-W2, W2, -D2, D2, y + 0.1, y + 0.3, frame, 0.02);
        box(-W2 + 0.03, W2 - 0.03, -D2 + 0.04, D2 - 0.03, y + 0.3, y + 0.5, m.white, 0.05);
        // yorgan: yanlardan sarkar
        box(-W2 - 0.005, W2 + 0.005, -D2 + d * 0.3, D2 + 0.005, y + 0.34, y + 0.535, main, 0.06);
        box(-W2 + 0.02, W2 - 0.02, -D2 + d * 0.3, -D2 + d * 0.38, y + 0.5, y + 0.56, shade(it.color, 1.12), 0.04);
        const n = w > 1.2 ? 2 : 1;
        const pw = (w - 0.12 * (n + 1)) / n;
        for (let i = 0; i < n; i++) box(-W2 + 0.12 + i * (pw + 0.12), -W2 + 0.12 + i * (pw + 0.12) + pw, -D2 + 0.08, -D2 + 0.48, y + 0.5, y + 0.64, m.white, 0.06);
      }
      if (!bunk) legs(W2 - 0.06, D2 - 0.06, 0.1, 0.025, frame);
      box(-W2 - 0.02, W2 + 0.02, -D2 - 0.07, -D2, 0, bunk ? h : 1.05, frame, 0.03);
      if (!bunk) box(-W2 + 0.05, W2 - 0.05, -D2 - 0.0, -D2 + 0.04, 0.55, 0.98, shade(it.color, 0.9), 0.03);
      else for (const sx of [-1, 1]) box(sx * W2 - 0.03, sx * W2 + 0.03, D2 - 0.06, D2, 0, h, frame);
      break;
    }
    case "sofa": {
      const arm = Math.min(0.2, w * 0.16);
      const seatH = 0.44;
      const back = d * 0.26;
      const fab = main;
      legs(W2 - 0.08, D2 - 0.08, 0.08, 0.02, colorMat("#3b2f25", m.clip));
      box(-W2, W2, -D2, D2, 0.08, 0.3, fab, 0.03);
      box(-W2, -W2 + arm, -D2, D2, 0.08, Math.min(h, 0.64), fab, 0.07);
      box(W2 - arm, W2, -D2, D2, 0.08, Math.min(h, 0.64), fab, 0.07);
      box(-W2 + arm - 0.02, W2 - arm + 0.02, -D2, -D2 + back * 0.6, 0.08, h - 0.02, fab, 0.06);
      const inner = w - 2 * arm;
      const n = Math.max(1, Math.round(inner / 0.7));
      const cw = inner / n;
      const cush = shade(it.color, 1.08);
      for (let i = 0; i < n; i++) {
        const x0 = -W2 + arm + i * cw + 0.008;
        box(x0, x0 + cw - 0.016, -D2 + back * 0.55, D2 - 0.03, 0.3, seatH, cush, 0.06);
        box(x0, x0 + cw - 0.016, -D2 + back * 0.5, -D2 + back + 0.08, seatH - 0.02, h - 0.06, cush, 0.08);
      }
      if (it.key === "sofaL") box(W2 - arm - 0.8, W2 - arm, -D2 + back, D2 - 0.03, 0.3, seatH + 0.01, cush, 0.06);
      break;
    }
    case "chair": {
      const legM = colorMat("#" + new THREE.Color(it.color).multiplyScalar(0.8).getHexString(), m.clip);
      legs(W2 - 0.04, D2 - 0.04, 0.43, 0.018, legM);
      box(-W2, W2, -D2, D2, 0.43, 0.475, main, 0.02);
      for (const sx of [-1, 1]) box(sx * (W2 - 0.04) - 0.018, sx * (W2 - 0.04) + 0.018, -D2 + 0.02, -D2 + 0.055, 0.47, h, legM, 0.01);
      box(-W2 + 0.03, W2 - 0.03, -D2 + 0.02, -D2 + 0.05, h - 0.2, h - 0.03, main, 0.015);
      box(-W2 + 0.06, W2 - 0.06, -D2 + 0.025, -D2 + 0.045, 0.55, h - 0.24, main, 0.01);
      break;
    }
    case "cooker": {
      box(-W2, W2, -D2, D2, 0, h - 0.03, m.white, 0.01);
      box(-W2, W2, -D2, D2, h - 0.03, h, colorMat("#1d1d1f", m.clip), 0.008);
      for (const [bx, bz, r] of [[-0.14, -0.12, 0.07], [0.14, -0.12, 0.055], [-0.14, 0.13, 0.055], [0.14, 0.13, 0.07]]) {
        cyl(r, h, h + 0.012, m.metal, bx * (w / 0.6), bz * (d / 0.6), r, 20);
        cyl(r * 0.55, h + 0.012, h + 0.02, m.dark, bx * (w / 0.6), bz * (d / 0.6), r * 0.55, 16);
      }
      box(-W2 + 0.05, W2 - 0.05, D2, D2 + 0.012, 0.12, h - 0.2, colorMat("#202124", m.clip), 0.008);
      box(-W2 + 0.07, W2 - 0.07, D2 + 0.012, D2 + 0.02, h - 0.24, h - 0.22, m.metal, 0.005);
      for (let i = 0; i < 4; i++) cyl(0.018, 0, 0.025, m.dark, -W2 + 0.12 + i * ((w - 0.24) / 3), D2 + 0.012, 0.018, 12).rotation.set(Math.PI / 2, 0, 0);
      break;
    }
    case "sink": {
      const tall = h > 0.6;
      if (tall) cabinet(0.1, h - 0.04, w > 0.9 ? 2 : 1, main, shade(it.color, 0.96));
      if (tall) box(-W2 + 0.02, W2 - 0.02, -D2, D2 - 0.06, 0, 0.1, shade(it.color, 0.7), 0.004);
      const top = it.key === "sinkK" ? colorMat("#5f5c58", m.clip) : m.white;
      box(-W2, W2, -D2, D2 + 0.015, h - 0.04, h, top, 0.012);
      const n = w > 1.0 && it.key === "sinkK" ? 2 : 1;
      const bw = Math.min(0.48, (w - 0.15 * (n + 1)) / n);
      for (let i = 0; i < n; i++) {
        const cx = n === 2 ? (i ? 1 : -1) * (bw / 2 + 0.06) + (it.key === "sinkK" ? -W2 * 0.15 : 0) : 0;
        box(cx - bw / 2, cx + bw / 2, -D2 + 0.12, D2 - 0.08, h - 0.005, h + 0.002, m.metal, 0.03);
      }
      const fx = 0;
      cyl(0.02, h, h + 0.22, m.metal, fx, -D2 + 0.07, 0.02, 12);
      box(fx - 0.015, fx + 0.015, -D2 + 0.06, -D2 + 0.24, h + 0.2, h + 0.23, m.metal, 0.01);
      if (it.key === "vanity" || it.key === "basin") box(-W2 + 0.05, W2 - 0.05, -D2 - 0.01, -D2 + 0.0, h + 0.3, h + 0.95, colorMat("#d9e6ec", m.clip), 0.01).material = new THREE.MeshStandardMaterial({ color: "#dfe8ee", metalness: 1, roughness: 0.05, clippingPlanes: m.clip });
      break;
    }
    case "toilet": {
      box(-W2, W2, -D2, -D2 + d * 0.26, 0.4, h, m.white, 0.04);
      const c = new THREE.CylinderGeometry(W2 * 0.95, W2 * 0.7, 0.4, 24);
      c.scale(1, 1, (d * 0.68) / w);
      c.translate(0, 0.2, -D2 + d * 0.26 + d * 0.32);
      add(c, m.white);
      const lid = new THREE.CylinderGeometry(W2 * 0.98, W2 * 0.98, 0.04, 24);
      lid.scale(1, 1, (d * 0.7) / w);
      lid.translate(0, 0.42, -D2 + d * 0.26 + d * 0.32);
      add(lid, m.white);
      box(-0.04, 0.04, -D2 + 0.06, -D2 + 0.12, h, h + 0.015, m.metal, 0.006);
      break;
    }
    case "tub": {
      box(-W2, W2, -D2, D2, 0, h, m.white, 0.05);
      box(-W2 + 0.07, W2 - 0.07, -D2 + 0.07, D2 - 0.07, h - 0.012, h + 0.001, colorMat("#cfe6ee", m.clip), 0.04);
      cyl(0.02, h, h + 0.18, m.metal, 0, -D2 + 0.04, 0.02, 12);
      box(-0.015, 0.015, -D2 + 0.03, -D2 + 0.16, h + 0.16, h + 0.19, m.metal, 0.008);
      break;
    }
    case "shower": {
      box(-W2, W2, -D2, D2, 0, Math.max(0.05, h), m.white, 0.02);
      cyl(0.04, h, h + 0.004, m.metal, 0, 0, 0.04, 16);
      box(-W2, W2, D2 - 0.01, D2, h, 2.0, m.glass, 0);
      box(W2 - 0.01, W2, -D2, D2, h, 2.0, m.glass, 0);
      box(-W2, W2, D2 - 0.02, D2, 1.98, 2.0, m.metal, 0);
      box(W2 - 0.02, W2, -D2, D2, 1.98, 2.0, m.metal, 0);
      cyl(0.012, 0.8, 2.0, m.metal, 0, -D2 + 0.03, 0.012, 10);
      cyl(0.09, 1.98, 2.0, m.metal, 0, -D2 + 0.12, 0.09, 20);
      break;
    }
    case "stove": {
      const body = colorMat("#2f2c29", m.clip);
      const fire = w >= 0.8;
      if (fire) {
        box(-W2, W2, -D2, D2, 0, h, colorMat("#d7cfc2", m.clip), 0.02);
        box(-W2 - 0.04, W2 + 0.04, -D2, D2 + 0.06, h - 0.08, h, colorMat("#efe9df", m.clip), 0.015);
        box(-W2 + 0.2, W2 - 0.2, D2 - 0.02, D2 + 0.004, 0.15, h - 0.3, colorMat("#1c1a18", m.clip), 0.01);
        box(-W2 + 0.28, W2 - 0.28, D2 - 0.03, D2 - 0.01, 0.17, 0.45, new THREE.MeshStandardMaterial({ color: "#ff8a2a", emissive: "#ff6a1a", emissiveIntensity: 1.4, clippingPlanes: m.clip }), 0.01);
      } else {
        box(-W2, W2, -D2, D2, 0.12, h, body, 0.03);
        legs(W2 - 0.05, D2 - 0.05, 0.12, 0.02, body);
        box(-W2 + 0.08, W2 - 0.08, D2, D2 + 0.012, h * 0.3, h * 0.72, colorMat("#1a1817", m.clip), 0.01);
        box(-W2 + 0.11, W2 - 0.11, D2 + 0.012, D2 + 0.014, h * 0.34, h * 0.68, new THREE.MeshStandardMaterial({ color: "#ff9a3a", emissive: "#ff6a1a", emissiveIntensity: 1.2, clippingPlanes: m.clip }), 0);
        box(-W2 - 0.01, W2 + 0.01, -D2 - 0.01, D2 + 0.01, h - 0.03, h, colorMat("#45413d", m.clip), 0.01);
        cyl(0.065, h, h + 1.3, body, 0, -D2 + 0.12, 0.065, 16);
      }
      break;
    }
    case "wardrobe": {
      const n = w > 1.4 ? 3 : 2;
      box(-W2 + 0.02, W2 - 0.02, -D2, D2 - 0.03, 0, 0.08, shade(it.color, 0.7), 0.005);
      cabinet(0.08, h, n, main, shade(it.color, 1.05));
      box(-W2 - 0.01, W2 + 0.01, -D2, D2 + 0.01, h - 0.03, h, main, 0.008);
      break;
    }
    default: {
      const k = it.key;
      if (isTable) {
        const top = Math.min(0.04, h * 0.1);
        box(-W2, W2, -D2, D2, h - top, h, main, 0.012);
        const lx = W2 - 0.06;
        const lz = D2 - 0.06;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(sx * lx - 0.025, sx * lx + 0.025, sz * lz - 0.025, sz * lz + 0.025, 0, h - top, shade(it.color, 0.9), 0.008);
        if (h > 0.6) {
          box(-lx, lx, -lz - 0.01, -lz + 0.01, h - top - 0.08, h - top, shade(it.color, 0.9), 0.004);
          box(-lx, lx, lz - 0.01, lz + 0.01, h - top - 0.08, h - top, shade(it.color, 0.9), 0.004);
        }
      } else if (k === "shelf") {
        const side = 0.025;
        box(-W2, -W2 + side, -D2, D2, 0, h, main, 0.006);
        box(W2 - side, W2, -D2, D2, 0, h, main, 0.006);
        box(-W2, W2, -D2, -D2 + 0.012, 0, h, shade(it.color, 0.8), 0.003);
        const nS = Math.max(3, Math.round(h / 0.38));
        const cols = ["#8a3b2e", "#2f4b6e", "#c9a64a", "#3f6b4a", "#e2ddd2", "#6d4a7a", "#b5653f"];
        for (let i = 0; i <= nS; i++) {
          const y = (i * (h - 0.02)) / nS;
          box(-W2 + side, W2 - side, -D2, D2, y, y + 0.022, main, 0.004);
          if (i < nS) {
            let x = -W2 + side + 0.02;
            let c = i * 3;
            while (x < W2 - side - 0.06) {
              const bw = 0.025 + ((c * 37) % 7) * 0.006;
              const bh = (h / nS) * (0.55 + ((c * 13) % 5) * 0.07);
              box(x, x + bw, -D2 + 0.03, D2 - 0.03, y + 0.022, y + 0.022 + bh, colorMat(cols[c % cols.length], m.clip), 0.003);
              x += bw + 0.004;
              c++;
            }
          }
        }
      } else if (k === "fridge") {
        box(-W2, W2, -D2, D2 - 0.03, 0, h, main, 0.03);
        box(-W2 + 0.005, W2 - 0.005, D2 - 0.03, D2, h * 0.62 + 0.004, h - 0.005, main, 0.02);
        box(-W2 + 0.005, W2 - 0.005, D2 - 0.03, D2, 0.005, h * 0.62 - 0.004, main, 0.02);
        box(W2 - 0.08, W2 - 0.06, D2, D2 + 0.03, h * 0.66, h * 0.86, m.metal, 0.008);
        box(W2 - 0.08, W2 - 0.06, D2, D2 + 0.03, h * 0.38, h * 0.58, m.metal, 0.008);
      } else if (k === "tv") {
        cabinet(0.06, h, Math.max(2, Math.round(w / 0.6)), main, shade(it.color, 1.08), true);
        legs(W2 - 0.05, D2 - 0.05, 0.06, 0.015, m.dark);
        const tw = Math.min(1.4, w * 0.75);
        box(-tw / 2, tw / 2, -0.03, 0.0, h + 0.12, h + 0.12 + tw * 0.56, colorMat("#141518", m.clip), 0.01);
        box(-tw / 2 + 0.015, tw / 2 - 0.015, 0.0, 0.003, h + 0.135, h + 0.105 + tw * 0.56, new THREE.MeshStandardMaterial({ color: "#1c2733", roughness: 0.1, metalness: 0.4, clippingPlanes: m.clip }), 0);
        box(-0.12, 0.12, -0.08, 0.06, h, h + 0.015, m.dark, 0.006);
        box(-0.02, 0.02, -0.03, 0.0, h + 0.015, h + 0.12, m.dark, 0.005);
      } else if (k === "mirror" || k === "wmirror") {
        box(-W2, W2, -D2, D2, 0, h, colorMat("#c9b08a", m.clip), 0.01);
        box(-W2 + 0.03, W2 - 0.03, D2, D2 + 0.004, 0.03, h - 0.03, new THREE.MeshStandardMaterial({ color: "#e7eef2", metalness: 1, roughness: 0.04, clippingPlanes: m.clip }), 0);
      } else if (k === "rad" || k === "heater") {
        if (k === "rad") {
          const n = Math.max(4, Math.round(w / 0.06));
          for (let i = 0; i < n; i++) {
            const x = -W2 + (i + 0.5) * (w / n);
            box(x - w / n / 2 + 0.004, x + w / n / 2 - 0.004, -D2, D2, 0.12, h, m.white, 0.015);
          }
        } else {
          cyl(W2, 0, h, m.white, 0, 0, D2, 24);
          cyl(0.015, -0.15, 0, m.metal, -0.06, 0, 0.015, 8);
          cyl(0.015, -0.15, 0, m.metal, 0.06, 0, 0.015, 8);
        }
      } else if (k === "hood") {
        box(-W2, W2, -D2, D2, 0, h, m.metal, 0.01);
        box(-0.13, 0.13, -D2, -D2 + 0.22, h, h + 0.6, m.metal, 0.01);
      } else if (k === "piano") {
        box(-W2, W2, -D2, -D2 + d * 0.55, 0, h, colorMat("#17130f", m.clip), 0.01);
        box(-W2, W2, -D2, D2 - 0.06, 0.66, 0.72, colorMat("#17130f", m.clip), 0.01);
        box(-W2 + 0.06, W2 - 0.06, -D2 + d * 0.55, D2 - 0.1, 0.72, 0.745, m.white, 0.004);
        legs(W2 - 0.05, D2 - 0.1, 0.66, 0.025, colorMat("#17130f", m.clip));
      } else if (k === "bench") {
        box(-W2, W2, -D2, D2, h - 0.05, h, main, 0.015);
        for (const sx of [-1, 1]) box(sx * (W2 - 0.08) - 0.025, sx * (W2 - 0.08) + 0.025, -D2 + 0.03, D2 - 0.03, 0, h - 0.05, shade(it.color, 0.85), 0.006);
      } else if (k === "coat") {
        cyl(0.02, 0, h, wood, 0, 0, 0.02, 10);
        cyl(0.18, 0, 0.03, wood, 0, 0, 0.18, 16);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          add(pipe(new THREE.Vector3(0, h - 0.15, 0), new THREE.Vector3(Math.cos(a) * 0.14, h - 0.05, Math.sin(a) * 0.14), 0.012, 8), wood);
        }
      } else if (h >= 0.35 && h <= 2.4 && d >= 0.25) {
        // genel dolap / tezgâh / komodin
        const counter = k.startsWith("counter") || k === "island";
        const drawers = k === "night" || k === "dresser" || k === "buffet" || k === "shoe" || k === "kdesk";
        const plinth = h > 0.6 ? 0.08 : 0.04;
        box(-W2 + 0.02, W2 - 0.02, -D2, D2 - 0.06, 0, plinth, shade(it.color, 0.6), 0.004);
        const topT = counter ? 0.035 : 0;
        const ndoor = Math.max(1, Math.round(w / (drawers ? 0.5 : 0.45)));
        if (drawers && h < 1.3) {
          const rows = Math.max(2, Math.round((h - plinth) / 0.22));
          box(-W2, W2, -D2, D2 - 0.02, plinth, h, main, 0.008);
          const rh = (h - plinth - 0.006) / rows;
          for (let r = 0; r < rows; r++) {
            const y0 = plinth + 0.006 + r * rh;
            box(-W2 + 0.006, W2 - 0.006, D2 - 0.02, D2, y0, y0 + rh - 0.006, shade(it.color, 1.05), 0.005);
            handle(0, y0 + rh / 2, D2, false, Math.min(0.2, w * 0.35));
          }
        } else cabinet(plinth, h - topT, ndoor, main, shade(it.color, 1.04));
        if (counter) box(-W2 - 0.005, W2 + 0.005, -D2, D2 + 0.025, h - topT, h, colorMat("#6f6a63", m.clip), 0.008);
      } else box(-W2, W2, -D2, D2, 0, h, main, 0.012);
    }
  }
  ig.userData = { pick: "item", id: it.id };
  ig.rotation.y = (-it.rot * Math.PI) / 180;
  ig.position.set(it.x, base + (it.elev || 0), it.y);
  g.add(ig);
}

/* ---------------- çatı ---------------- */
function buildRoof(f: FullData, base: number, m: Mats, g: THREE.Group) {
  const ri = roofInfo(f);
  if (!ri) return;
  const rf = f.roof;
  const o = rf.overhang;
  const tan = Math.tan((rf.pitch * Math.PI) / 180);
  const alongX = ri.ridgeAlongX;
  // s: mahya yönü, t: dik yön
  const s0 = alongX ? ri.x0 : ri.y0;
  const s1 = alongX ? ri.x1 : ri.y1;
  const t0 = alongX ? ri.y0 : ri.x0;
  const t1 = alongX ? ri.y1 : ri.x1;
  const P = (s: number, t: number, hh: number) => (alongX ? V(s, hh, t) : V(t, hh, s));
  const H = ri.ridgeHeight;
  const eave = base - o * tan;
  const top = base + H;
  const tc = (t0 + t1) / 2;
  const pos: THREE.Vector3[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a, b, c);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  const inf: THREE.Vector3[] = [];
  const itri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => inf.push(a, b, c);
  const sw0 = s0 + o;
  const sw1 = s1 - o;
  const tw0 = t0 + o;
  const tw1 = t1 - o;

  if (rf.kind === "flat") {
    const b = new THREE.BoxGeometry(ri.x1 - ri.x0, 0.25, ri.y1 - ri.y0);
    b.translate((ri.x0 + ri.x1) / 2, base + 0.125, (ri.y0 + ri.y1) / 2);
    const mesh = new THREE.Mesh(b, colorMat(rf.color, []));
    mesh.userData = { pick: "roof" };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return;
  }
  if (rf.kind === "gable") {
    quad(P(s0, t0, eave), P(s1, t0, eave), P(s1, tc, top), P(s0, tc, top));
    quad(P(s1, t1, eave), P(s0, t1, eave), P(s0, tc, top), P(s1, tc, top));
    for (const s of [sw0, sw1]) itri(P(s, tw0, base), P(s, tw1, base), P(s, tc, top));
  } else if (rf.kind === "hip") {
    const half = (t1 - t0) / 2;
    let r0 = s0 + half;
    let r1 = s1 - half;
    if (r0 > r1) r0 = r1 = (s0 + s1) / 2;
    quad(P(s0, t0, eave), P(s1, t0, eave), P(r1, tc, top), P(r0, tc, top));
    quad(P(s1, t1, eave), P(s0, t1, eave), P(r0, tc, top), P(r1, tc, top));
    tri(P(s0, t1, eave), P(s0, t0, eave), P(r0, tc, top));
    tri(P(s1, t0, eave), P(s1, t1, eave), P(r1, tc, top));
  } else {
    const hi = base + tan * (tw1 - tw0 + o);
    quad(P(s0, t0, eave), P(s1, t0, eave), P(s1, t1, hi), P(s0, t1, hi));
    for (const s of [sw0, sw1]) itri(P(s, tw0, base), P(s, tw1, base), P(s, tw1, top));
    itri(P(sw0, tw1, base), P(sw1, tw1, base), P(sw1, tw1, top));
    itri(P(sw0, tw1, base), P(sw1, tw1, top), P(sw0, tw1, top));
  }
  // çatı kalınlığı: her yüzeyin üstüne bir kopya + kenar yüzleri
  const THK = 0.18;
  const thick: THREE.Vector3[] = [];
  const up = (p: THREE.Vector3) => p.clone().setY(p.y + THK);
  for (let i = 0; i < pos.length; i += 3) {
    const [a, b, c] = [pos[i], pos[i + 1], pos[i + 2]];
    thick.push(a, b, c, up(a), up(c), up(b));
  }
  const edgeKey = (p: THREE.Vector3) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  const edges = new Map<string, [THREE.Vector3, THREE.Vector3, number]>();
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const p = pos[i + k];
      const q = pos[i + ((k + 1) % 3)];
      const key = [edgeKey(p), edgeKey(q)].sort().join("|");
      const e = edges.get(key);
      if (e) e[2]++;
      else edges.set(key, [p, q, 1]);
    }
  }
  edges.forEach(([p, q, n]) => {
    if (n > 1) return; // iç kenar
    thick.push(p, q, up(q), p, up(q), up(p));
  });
  pos.length = 0;
  pos.push(...thick);
  const mk = (pts: THREE.Vector3[], mat: THREE.Material) => {
    if (!pts.length) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  const rt = TEX_SIZE[rf.tex] ? rf.tex : "";
  const slopeK = 1 / Math.max(0.35, Math.cos((rf.pitch * Math.PI) / 180));
  const mkRoof = (pts: THREE.Vector3[]) => {
    if (!pts.length) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.computeVertexNormals();
    const uv: number[] = [];
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const horiz = Math.abs(nrm.getY(i)) < 0.25; // dikey kenar yüzleri
      const u = (alongX ? p.x : p.z) / 1;
      const v = horiz ? p.y : ((alongX ? p.z : p.x) * slopeK);
      uv.push(u, v);
    }
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const mat = new THREE.MeshStandardMaterial({ color: rf.color, roughness: ROUGH[rt] ?? 0.8, metalness: rt === "metal" ? 0.45 : 0, side: THREE.DoubleSide, flatShading: true, map: rt ? getTex(rt) : null, normalMap: rt ? getNormal(rt) : null });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { pick: "roof" };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  mkRoof(pos);
  mk(inf, m.infill);

  /* oluk, yağmur borusu, mahya, baca */
  const ex: THREE.BufferGeometry[] = [];
  const gut = (a: THREE.Vector3, b: THREE.Vector3) => {
    ex.push(pipe(a, b, 0.075, 12));
  };
  const eaveY = eave - 0.06;
  const ins = 0.02;
  const pipes: [number, number, number][] = []; // s, t, dış yön (t ekseninde ±1)
  if (rf.kind === "gable" || rf.kind === "shed") {
    const edges = rf.kind === "gable" ? [t0, t1] : [t0];
    for (const te of edges) {
      gut(P(s0, te + (te === t0 ? ins : -ins), eaveY), P(s1, te + (te === t0 ? ins : -ins), eaveY));
      pipes.push([sw0 + 0.18, te, te === t0 ? -1 : 1], [sw1 - 0.18, te, te === t0 ? -1 : 1]);
    }
  } else if (rf.kind === "hip") {
    gut(P(s0, t0 + ins, eaveY), P(s1, t0 + ins, eaveY));
    gut(P(s0, t1 - ins, eaveY), P(s1, t1 - ins, eaveY));
    gut(P(s0 + ins, t0, eaveY), P(s0 + ins, t1, eaveY));
    gut(P(s1 - ins, t0, eaveY), P(s1 - ins, t1, eaveY));
    pipes.push([sw0 + 0.18, t0, -1], [sw1 - 0.18, t1, 1]);
  }
  for (const [ps, te, dir] of pipes) {
    const tw = dir < 0 ? tw0 - 0.07 : tw1 + 0.07;
    const a = P(ps, te + (dir < 0 ? ins : -ins), eaveY);
    const kink = P(ps, tw, eaveY - 0.35);
    const foot = P(ps, tw, 0.05);
    ex.push(pipe(a, kink, 0.045), pipe(kink, foot, 0.045));
    ex.push(pipe(foot, P(ps, tw + (dir < 0 ? -0.25 : 0.25), 0.02), 0.045));
  }
  if (rf.kind === "gable") ex.push(pipe(P(s0 - 0.02, tc, top + THK - 0.01), P(s1 + 0.02, tc, top + THK - 0.01), 0.11, 12));
  if (ex.length) {
    const mg = mergeGeometries(ex.map(ni));
    ex.forEach((q) => q.dispose());
    if (mg) {
      const mesh = new THREE.Mesh(mg, m.gutter);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
  }
  // baca: sobası / şöminesi olan yerde çatıdan çıkar
  const roofY = (s: number, t: number) => {
    if (rf.kind === "gable") return top - Math.abs(t - tc) * tan;
    if (rf.kind === "hip") return Math.min(top - Math.abs(t - tc) * tan, base + Math.min(s - sw0, sw1 - s) * tan);
    return base + tan * (t - tw0 + o);
  };
  const seen: THREE.Vector2[] = [];
  for (const fl of f.floors)
    for (const it of fl.items) {
      if (it.shape !== "stove") continue;
      const sP = alongX ? it.x : it.y;
      const tP = alongX ? it.y : it.x;
      if (sP < sw0 || sP > sw1 || tP < tw0 || tP > tw1) continue;
      if (seen.some((v) => Math.hypot(v.x - it.x, v.y - it.y) < 1.5)) continue;
      seen.push(new THREE.Vector2(it.x, it.y));
      const cs = 0.6;
      const ry = Math.max(roofY(sP - cs / 2, tP - cs / 2), roofY(sP + cs / 2, tP + cs / 2), roofY(sP - cs / 2, tP + cs / 2), roofY(sP + cs / 2, tP - cs / 2)) + THK;
      const hTop = ry + 0.7;
      const cb = new THREE.BoxGeometry(cs, hTop - base, cs);
      const P2 = cb.attributes.position;
      const N2 = cb.attributes.normal;
      const uv2 = cb.attributes.uv;
      cb.translate(it.x, base + (hTop - base) / 2, it.y);
      for (let i = 0; i < P2.count; i++) uv2.setXY(i, ...worldUV(P2.getX(i), P2.getY(i), P2.getZ(i), N2.getX(i), N2.getY(i), N2.getZ(i), 1));
      const ch = new THREE.Mesh(cb, m.brick);
      ch.castShadow = ch.receiveShadow = true;
      g.add(ch);
      const capG = new THREE.BoxGeometry(cs + 0.12, 0.08, cs + 0.12);
      capG.translate(it.x, hTop + 0.04, it.y);
      const cap = new THREE.Mesh(capG, m.band);
      cap.castShadow = cap.receiveShadow = true;
      g.add(cap);
      const potG = pipe(new THREE.Vector3(it.x, hTop + 0.08, it.y), new THREE.Vector3(it.x, hTop + 0.32, it.y), 0.09, 12);
      const pot = new THREE.Mesh(potG, m.gutter);
      pot.castShadow = true;
      g.add(pot);
    }
}

/* ---------------- arsa ---------------- */
function grassMat(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, map: getTex("grass")! });
}

function buildGround(f: FullData, g: THREE.Group) {
  const hf = terrainFn(f);
  const gc = f.fin.groundColor;
  const pts = f.plot.points;
  if (pts.length >= 3) {
    const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
    const geo = new THREE.ShapeGeometry(s);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.01, 0);
    if (hf) {
      const P0 = geo.attributes.position;
      for (let i = 0; i < P0.count; i++) P0.setY(i, P0.getY(i) + hf(P0.getX(i), P0.getZ(i)));
      geo.computeVertexNormals();
    }
    // dünya UV: 1 doku = 4 m
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / 4;
      uv[i * 2 + 1] = pos.getZ(i) / 4;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const m = grassMat(gc);
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    g.add(mesh);
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts.map((p) => V(p.x, 0.02 + (hf ? hf(p.x, p.y) : 0), p.y))),
      new THREE.LineDashedMaterial({ color: "#4f7a33", dashSize: 0.4, gapSize: 0.25 })
    );
    line.computeLineDistances();
    g.add(line);
  }
  const bigGeo = new THREE.PlaneGeometry(1200, 1200, hf ? 60 : 1, hf ? 60 : 1);
  const buv = bigGeo.attributes.uv;
  for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 300, buv.getY(i) * 300);
  const big = new THREE.Mesh(bigGeo, grassMat("#a9b98a"));
  big.rotateX(-Math.PI / 2);
  big.position.y = -0.03;
  if (hf) {
    const BP = bigGeo.attributes.position;
    for (let i = 0; i < BP.count; i++) {
      const x = BP.getX(i), z = -BP.getY(i); // rotateX(-90°) sonrası dünya z = −y
      BP.setZ(i, hf(x, z));
    }
    BP.needsUpdate = true;
  }
  big.receiveShadow = true;
  g.add(big);
  // uzak tepeler (sis ile karışır)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hillMat = new THREE.MeshStandardMaterial({ color: "#86a274", roughness: 1, flatShading: false });
  const hillMat2 = new THREE.MeshStandardMaterial({ color: "#6a8a63", roughness: 1 });
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rnd() * 0.2;
    const rad = 380 + rnd() * 120;
    const hr = 30 + rnd() * 50;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), rnd() > 0.5 ? hillMat : hillMat2);
    m.scale.set(hr * 2.2, hr * (0.16 + rnd() * 0.22), hr * 1.2);
    m.position.set(Math.cos(a) * rad, -hr * 0.1, Math.sin(a) * rad);
    m.rotation.y = -a;
    g.add(m);
  }
}

/* ---------------- çevre nesneleri ---------------- */
function buildEnv(objs: EnvObj[], g: THREE.Group, hf: ((x: number, z: number) => number) | null = null) {
  const std = (color: string, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
  const leafMat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, vertexColors: true });
  /** organik yaprak kümesi: gürültüyle şişirilmiş küre, alt kısmı koyu */
  const blob = (seed: number, bump = 0.16) => {
    let q = new THREE.IcosahedronGeometry(1, 4) as THREE.BufferGeometry;
    q.deleteAttribute("uv");
    q.deleteAttribute("normal");
    q = mergeVertices(q);
    const P = q.attributes.position;
    const col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const nz = Math.sin(x * 5.1 + seed) * Math.sin(y * 4.3 + seed * 1.7) * Math.sin(z * 4.7 + seed * 0.6) + 0.5 * Math.sin(x * 11 + y * 9 + seed * 2.1) * Math.sin(z * 10 - seed);
      const k = 1 + bump * nz;
      P.setXYZ(i, x * k, y * k, z * k);
      const sh = 0.62 + 0.38 * Math.max(0, Math.min(1, (y + 1) / 1.6)) + 0.08 * nz;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = sh;
    }
    q.setAttribute("color", new THREE.BufferAttribute(col, 3));
    q.computeVertexNormals();
    return q;
  };
  for (const o of objs) {
    const og = new THREE.Group();
    og.userData = { pick: "env", id: o.id };
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      og.add(mesh);
      return mesh;
    };
    const { w, d, h } = o;
    let hs = 0;
    for (const ch of o.id) hs = (hs * 31 + ch.charCodeAt(0)) % 9973;
    const rr = (k: number) => ((Math.sin(hs * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    const shade = (c: string, k: number) => {
      const col = new THREE.Color(c);
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl);
      return col.setHSL(hsl.h + (rr(k) - 0.5) * 0.03, hsl.s, Math.min(0.8, Math.max(0.1, hsl.l + (rr(k + 9) - 0.5) * 0.12)));
    };
    if (o.kind === "tree") {
      const th = h * 0.42;
      const trunk = std("#6b4a2b");
      trunk.flatShading = false;
      add(new THREE.CylinderGeometry(Math.max(0.06, w * 0.03), Math.max(0.12, w * 0.065), th + 0.6, 10), trunk, 0, (th + 0.6) / 2, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rr(i) * 2;
        add(pipe(new THREE.Vector3(0, th * 0.75, 0), new THREE.Vector3(Math.cos(a) * w * 0.25, th + (h - th) * 0.35, Math.sin(a) * d * 0.25), Math.max(0.04, w * 0.015), 7), trunk);
      }
      const ch = h - th;
      const blobs: [number, number, number, number][] = [
        [0, 0.5, 0, 1],
        [0.3, 0.4, 0.12, 0.72],
        [-0.28, 0.44, -0.1, 0.7],
        [0.06, 0.78, -0.2, 0.62],
        [-0.12, 0.72, 0.22, 0.6],
        [0.18, 0.62, -0.28, 0.55],
      ];
      blobs.forEach((b, i) => {
        const mt = leafMat("#ffffff");
        mt.color = shade(o.color, i + 1);
        const m2 = add(blob(hs * 0.37 + i * 3.1), mt, b[0] * w * 0.7, th + ch * b[1], b[2] * d * 0.7);
        m2.scale.set(w * 0.33 * b[3], ch * 0.33 * b[3], d * 0.33 * b[3]);
      });
    } else if (o.kind === "pine") {
      const th = h * 0.12;
      const trunk = std("#5a3d22");
      trunk.flatShading = false;
      add(new THREE.CylinderGeometry(0.06, 0.15, th + 0.6, 9), trunk, 0, (th + 0.6) / 2, 0);
      const tiers = 6;
      for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1);
        const chh = (h - th) * 0.3;
        const k = 1 - t * 0.78;
        let cone = new THREE.ConeGeometry(0.5, chh, 18, 3) as THREE.BufferGeometry;
        cone.deleteAttribute("uv");
        cone.deleteAttribute("normal");
        cone = mergeVertices(cone);
        const P = cone.attributes.position;
        const col = new Float32Array(P.count * 3);
        for (let j = 0; j < P.count; j++) {
          const x = P.getX(j), y = P.getY(j), z = P.getZ(j);
          const ang = Math.atan2(z, x);
          const jag = y < -chh / 2 + 0.01 ? 1 + 0.18 * Math.sin(ang * 9 + i * 1.7) : 1 + 0.06 * Math.sin(ang * 7 + y * 6);
          P.setXYZ(j, x * jag, y + (y < -chh / 2 + 0.01 ? -0.06 * Math.abs(Math.sin(ang * 9 + i)) : 0), z * jag);
          const sh = 0.6 + 0.4 * ((y + chh / 2) / chh);
          col[j * 3] = col[j * 3 + 1] = col[j * 3 + 2] = sh;
        }
        cone.setAttribute("color", new THREE.BufferAttribute(col, 3));
        cone.computeVertexNormals();
        const mt = leafMat("#ffffff");
        mt.color = shade(o.color, i + 3);
        const cm = add(cone, mt, 0, th + chh / 2 + t * (h - th - chh) * 0.98, 0);
        cm.scale.set(w * k, 1, d * k);
        cm.rotation.y = i * 0.7;
      }
    } else if (o.kind === "bush") {
      for (let i = 0; i < 3; i++) {
        const mt = leafMat("#ffffff");
        mt.color = shade(o.color, i + 2);
        const bm = add(blob(hs * 0.21 + i * 2.3, 0.22), mt, (i - 1) * w * 0.22, h * (0.42 + (i % 2) * 0.08), (i % 2 ? 1 : -1) * d * 0.12);
        bm.scale.set(w * 0.38, h * 0.5, d * 0.38);
      }
    } else if (o.kind === "road") {
      add(new THREE.BoxGeometry(w, Math.max(0.04, h), d), std(o.color, 1), 0, Math.max(0.04, h) / 2, 0);
      const long = d >= w;
      const L = long ? d : w;
      const n = Math.floor(L / 3);
      const dash = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 1 });
      for (let i = 0; i < n; i++) {
        const t = -L / 2 + (i + 0.5) * (L / n);
        const bx = long ? new THREE.BoxGeometry(0.12, 0.01, 1.2) : new THREE.BoxGeometry(1.2, 0.01, 0.12);
        const dm = new THREE.Mesh(bx, dash);
        dm.position.set(long ? 0 : t, Math.max(0.04, h) + 0.006, long ? t : 0);
        dm.receiveShadow = true;
        og.add(dm);
      }
    } else if (o.kind === "building") {
      const rh = Math.min(h * 0.5, Math.min(w, d) * 0.35);
      add(new THREE.BoxGeometry(w, h, d), std(o.color), 0, h / 2, 0);
      // beşik çatı: kısa kenara dik, uzun kenar boyunca mahya
      const alongX = w >= d;
      const span = alongX ? d : w;
      const len = alongX ? w : d;
      const sh = new THREE.Shape();
      sh.moveTo(-span / 2 - 0.3, 0);
      sh.lineTo(span / 2 + 0.3, 0);
      sh.lineTo(0, rh);
      sh.lineTo(-span / 2 - 0.3, 0);
      const rg = new THREE.ExtrudeGeometry(sh, { depth: len + 0.6, bevelEnabled: false });
      rg.translate(0, 0, -(len + 0.6) / 2);
      const rm = add(rg, std("#8a4a3a"), 0, h, 0);
      if (alongX) rm.rotation.y = Math.PI / 2;
      // pencereler
      const win = new THREE.MeshStandardMaterial({ color: "#5f7d92", roughness: 0.1, metalness: 0.3 });
      const frm = std("#f3f1ec");
      const floors = Math.max(1, Math.floor(h / 2.7));
      for (const [len2, dep, rot] of [[w, d, 0], [d, w, Math.PI / 2]] as [number, number, number][]) {
        const nW = Math.max(1, Math.floor(len2 / 2.2));
        for (let fl = 0; fl < floors; fl++)
          for (let i = 0; i < nW; i++)
            for (const sd of [1, -1]) {
              const x = -len2 / 2 + (i + 0.5) * (len2 / nW);
              const y = 0.9 + fl * 2.7 + 0.65;
              const fg = new THREE.BoxGeometry(1.0, 1.3, 0.06);
              const gg = new THREE.BoxGeometry(0.86, 1.16, 0.07);
              for (const q of [fg, gg]) {
                q.translate(x, y, sd * (dep / 2 + 0.01));
                q.rotateY(rot);
              }
              add(fg, frm);
              add(gg, win);
            }
      }
    } else if (o.kind === "fence") {
      // ahşap çit: dikmeler, iki kuşak ve tahtalar
      const along = w >= d;
      const L = along ? w : d;
      const wd = std(o.color, 0.85);
      wd.flatShading = false;
      wd.map = getTex("wood");
      const parts: THREE.BufferGeometry[] = [];
      const bx = (a0: number, a1: number, y0: number, y1: number, th: number) => {
        const b = new THREE.BoxGeometry(along ? a1 - a0 : th, y1 - y0, along ? th : a1 - a0);
        b.translate(along ? (a0 + a1) / 2 : 0, (y0 + y1) / 2, along ? 0 : (a0 + a1) / 2);
        parts.push(b);
      };
      const np = Math.max(2, Math.round(L / 2) + 1);
      for (let i = 0; i < np; i++) {
        const t = -L / 2 + (i * L) / (np - 1);
        bx(t - 0.05, t + 0.05, 0, h + 0.05, 0.1);
      }
      bx(-L / 2, L / 2, h * 0.25, h * 0.25 + 0.07, 0.04);
      bx(-L / 2, L / 2, h * 0.75, h * 0.75 + 0.07, 0.04);
      const nb = Math.floor(L / 0.16);
      for (let i = 0; i < nb; i++) {
        const t = -L / 2 + 0.05 + i * 0.16;
        bx(t, t + 0.09, 0.05, h - ((i % 2) * 0.04), 0.02);
      }
      const mg = mergeGeometries(parts);
      parts.forEach((q) => q.dispose());
      if (mg) {
        const P = mg.attributes.position;
        const uv = new Float32Array(P.count * 2);
        for (let i = 0; i < P.count; i++) {
          uv[i * 2] = (along ? P.getX(i) : P.getZ(i)) * 2;
          uv[i * 2 + 1] = P.getY(i);
        }
        mg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        add(mg, wd);
      }
    } else {
      add(new THREE.BoxGeometry(w, h, Math.max(0.1, d)), std(o.color), 0, h / 2, 0);
    }
    og.rotation.y = (-o.rot * Math.PI) / 180;
    og.position.set(o.x, hf ? hf(o.x, o.y) : 0, o.y);
    g.add(og);
  }
}

/** Bir noktadaki oda (kapalı odalar içinde) */
export function roomAtPoint(fl: Floor, x: number, y: number) {
  const r = rasterize(fl.walls);
  if (!r) return null;
  for (const rm of fl.rooms) {
    const reg = regionAt(r, rm.seed);
    if (reg && !reg.open && inRegion(reg, { x, y })) return rm;
  }
  return null;
}

/** Tüm 3B sahneyi kur. house: ev parçaları (kadraj için), ground: zemin, env: çevre. */
export function buildHouse(f: FullData, fi: number, v: V3, secPlane?: THREE.Plane) {
  const house = new THREE.Group();
  const ground = new THREE.Group();
  const env = new THREE.Group();
  const bases = floorBases(f);
  let lo = 0;
  let hi = f.floors.length - 1;
  if (v.floors === "upto") hi = fi;
  if (v.floors === "only") lo = hi = fi;
  if (v.cut && v.floors === "all") hi = fi; // kesit: seçili katı keser
  const topShown = hi;
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), bases[topShown] + CUT_H);
  const plain = makeMats([], f.fin);
  const clipped = makeMats([cutPlane], f.fin);
  const bld = f.build ?? defaultBuild();
  let topWalls = -1;
  let firstWalls = -1;
  f.floors.forEach((fl, i) => {
    if (fl.walls.length) {
      topWalls = i;
      if (firstWalls < 0) firstWalls = i;
    }
  });
  const stages = v.stage !== undefined ? buildStages(f) : null;
  const si = stages ? Math.min(Math.max(0, v.stage ?? 0), stages.length - 1) : -1;
  const staged = !!stages && si < stages.length - 1;
  const R = (key: Parameters<typeof reached>[2], fl?: number) => !staged || reached(stages!, si, key, fl);
  if (staged && firstWalls >= 0) {
    const sg = new THREE.Group();
    sg.userData = { floor: 0 };
    house.add(sg);
    if (R("dig") && !R("found")) buildFoundation(f, firstWalls, "dig", plain, sg);
    if (R("found")) { buildFoundation(f, firstWalls, "found", plain, sg); buildPlinth(f, firstWalls, plain, sg); }
    if (R("screed")) buildSlab(f.floors[firstWalls], null, bases[firstWalls], plain, sg, plain.concrete, bld.slabT);
  }
  for (let i = lo; i <= hi; i++) {
    const fl = f.floors[i];
    const fg = new THREE.Group();
    fg.userData = { floor: i };
    house.add(fg);
    const m = v.cut && i === topShown ? clipped : plain;
    if (staged) {
      if (!fl.walls.length) continue;
      if (R("cols", i) && !R("walls", i)) buildCols(f, i, bases[i], plain, fg);
      if (R("walls", i)) buildWalls(fl, bases[i], m, false, fg, i, R("fit", i));
      if (R("slab", i)) buildSlab(fl, fl, bases[i] + fl.height, plain, fg, plain.concrete, bld.slabT);
      if (R("walls", i)) buildBalconies(fl, bases[i], plain, fg);
      continue;
    }
    if (i === firstWalls) buildPlinth(f, i, plain, fg);
    buildSlab(fl, i > 0 ? f.floors[i - 1] : null, bases[i], plain, fg, undefined, bld.slabT);
    buildRoomFloors(fl, i > 0 ? f.floors[i - 1] : null, bases[i], m.clip, fg);
    buildWalls(fl, bases[i], m, !!v.cut && i === topShown, fg, i);
    for (const st of fl.stairs) buildStair(st, st.ext ? stairRise(f, i, st) : fl.height, st.ext ? 0 : bases[i], m, fg);
    buildBalconies(fl, bases[i], plain, fg);
    if (v.items) for (const it of fl.items) buildItem(it, bases[i], m, fg);
    if (bld.topSlab && i === topWalls && !v.cut) buildSlab(fl, fl, bases[i] + fl.height, plain, fg, undefined, bld.slabT);
  }
  // eğimli arsada duvar altında açıkta kalan beton cokol
  {
    const hf = terrainFn(f);
    const fl0 = f.floors[firstWalls];
    if (hf && fl0 && firstWalls >= lo && firstWalls <= hi && (!staged || R("walls", firstWalls))) {
      const pg = new THREE.Group();
      pg.userData = { floor: firstWalls };
      for (const w of fl0.walls) {
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        const dep0 = -Math.min(hf(w.a.x, w.a.y), hf(w.b.x, w.b.y), hf((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2)) + 0.3;
        if (dep0 <= 0.31 || L < 0.01) continue;
        const dep = dep0 + bases[firstWalls];
        const me = new THREE.Mesh(new THREE.BoxGeometry(L, dep, w.t + 0.02), plain.concrete);
        me.position.set((w.a.x + w.b.x) / 2, -dep / 2 + bases[firstWalls], (w.a.y + w.b.y) / 2);
        me.rotation.y = -Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
        me.castShadow = true;
        me.receiveShadow = true;
        pg.add(me);
      }
      house.add(pg);
    }
  }
  // çatı: yalnızca en üst katlar gösteriliyorsa ve kesit kapalıysa
  const roofShown = v.roof && f.roof.kind !== "none" && R("roof") && !v.cut && v.sec !== "h" && topWalls >= 0 && hi >= topWalls && lo <= topWalls;
  if (roofShown) {
    const rg = new THREE.Group();
    rg.userData = { floor: topWalls };
    buildRoof(f, bases[topWalls] + f.floors[topWalls].height, plain, rg);
    house.add(rg);
  }
  if (v.sec !== "none" && secPlane) applySection(house, secPlane);
  buildGround(f, ground);
  if (staged && firstWalls >= 0 && R("dig") && !R("cols", firstWalls)) {
    // temel aşamalarında zemini yarı saydam yap: toprağın altındaki beton görünsün
    const gm0 = ground.children[0] as THREE.Mesh | undefined;
    if (gm0 && gm0.isMesh) {
      const mt = (gm0.material as THREE.Material).clone();
      mt.transparent = true;
      mt.opacity = 0.42;
      mt.depthWrite = false;
      gm0.material = mt;
    }
  }
  buildEnv(f.env.objs, env, terrainFn(f));
  return { house, ground, env, roofShown, cutPlane };
}

/** Gece: pencereler içeriden sıcak ışıkla parlar */
export function setNight(root: THREE.Object3D, night: number) {
  root.traverse((o) => {
    if (!o.userData.glass) return;
    const mt = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
    mt.emissive.set("#ffc27a");
    mt.emissiveIntensity = night > 0.05 ? 0.25 + 1.6 * night : 0;
    mt.opacity = 0.32 + 0.55 * night;
  });
}

/** Sahnedeki tüm geometri ve malzemeleri serbest bırak */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mt = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mt) return;
    for (const x of Array.isArray(mt) ? mt : [mt]) if (![...matCache.values()].includes(x as THREE.MeshStandardMaterial)) x.dispose();
  });
}

/** Toplam yükseklik (zemin → mahya) */
export function totalHeight(f: FullData) {
  const bases = floorBases(f);
  let topWalls = -1;
  f.floors.forEach((fl, i) => fl.walls.length && (topWalls = i));
  if (topWalls < 0) return 0;
  const ri = roofInfo(f);
  const wallTop = bases[topWalls] + f.floors[topWalls].height;
  return wallTop + (f.roof.kind === "none" ? 0 : ri && f.roof.kind !== "flat" ? ri.ridgeHeight : 0.25);
}
