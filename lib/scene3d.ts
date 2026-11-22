import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EnvObj, FullData, Finish, Floor, Item, Opening, Stair } from "./types";
import { FLOOR_DEFAULT, TEX_SIZE, getTex } from "./textures";
import { inRegion, rasterize, regionAt, wallGeom } from "./rooms";
import { roofInfo } from "./roof";
import { stairBox, stairLocal, stairSteps, TREAD } from "./stairs";

/** 3B görünüm ayarları */
export type V3 = {
  floors: "all" | "upto" | "only";
  roof: boolean;
  items: boolean;
  cut: boolean;
};

export const CUT_H = 1.25; // kesit görünümde duvarların kesildiği yükseklik (m)
const SLAB = 0.2; // döşeme kalınlığı (m)
const CUT_CAP = "#6d6155";

/** Her katın döşeme üst kotu (m) */
export function floorBases(f: FullData) {
  let e = 0;
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
  return {
    wallExt: std("#ffffff", { vertexColors: true, map: getTex(fin.extTex), side: clip.length ? THREE.DoubleSide : THREE.FrontSide }),
    wallInt: std("#ffffff", { vertexColors: true, map: getTex(fin.intTex), side: clip.length ? THREE.DoubleSide : THREE.FrontSide }),
    wallSide: std("#ffffff", { vertexColors: true, side: clip.length ? THREE.DoubleSide : THREE.FrontSide }),
    frame: std(fin.frameColor),
    slab: std("#d8d0c2"),
    floorTop: std("#cdb894"),
    cap: new THREE.MeshStandardMaterial({ color: CUT_CAP, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: "#9cc7e0", roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: clip }),
    door: std(fin.doorColor),
    stair: std("#c9b79c"),
    white: std("#f7f7f4"),
    dark: std("#3a3a3a"),
    metal: std("#b8bcc0", { metalness: 0.3, roughness: 0.4 }),
    infill: new THREE.MeshStandardMaterial({ color: fin.extColor, roughness: 0.9, side: THREE.DoubleSide }),
    clip,
    fin,
  };
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

function buildWalls(fl: Floor, base: number, m: Mats, cut: boolean, g: THREE.Group) {
  const exts = wallExt(fl.walls);
  const H = fl.height;
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
  for (const w of fl.walls) {
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
    // yüzleri dış / iç / kenar olarak ayır, renk ve doku koordinatı ver
    {
      const g2 = ni(geo);
      const P = g2.attributes.position;
      const Nn = g2.attributes.normal;
      const mx = (w.a.x + w.b.x) / 2;
      const my = (w.a.y + w.b.y) / 2;
      const d = w.t / 2 + 0.25;
      const outN = isOut(mx + n.x * d, my + n.y * d);
      const outM = isOut(mx - n.x * d, my - n.y * d);
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
        const gg = new THREE.ShapeGeometry(openingShape(q.a, q.b, q.bottom, q.top, q.o.shape), 16);
        gg.applyMatrix4(M);
        glassGeoms.push(gg);
        const fw = Math.min(0.06, (q.b - q.a) / 6, (q.top - q.bottom) / 6);
        const fr = openingShape(q.a, q.b, q.bottom, q.top, q.o.shape);
        const inner = new THREE.Path();
        openingPath(inner, q.a + fw, q.b - fw, q.bottom + fw, q.top - fw, q.o.shape, false);
        fr.holes.push(inner);
        const fg = new THREE.ExtrudeGeometry(fr, { depth: 0.08, bevelEnabled: false, curveSegments: 16 });
        fg.translate(0, 0, -0.04);
        fg.applyMatrix4(M);
        frameGeoms.push(ni(fg));
        if (q.o.shape === "rect" && q.b - q.a > 0.7) {
          const mb = new THREE.BoxGeometry(fw * 0.8, q.top - q.bottom - 2 * fw, 0.06);
          mb.translate((q.a + q.b) / 2, (q.top + q.bottom) / 2, 0);
          mb.applyMatrix4(M);
          frameGeoms.push(ni(mb));
        }
      } else {
        const dg = new THREE.ExtrudeGeometry(openingShape(q.a + 0.01, q.b - 0.01, q.bottom, q.top - 0.01, q.o.shape), { depth: 0.04, bevelEnabled: false, curveSegments: 16 });
        dg.translate(0, 0, (q.o.flip ? -1 : 1) * (w.t / 2 - 0.06) - 0.02);
        dg.applyMatrix4(M);
        doorGeoms.push(ni(dg));
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
    if (!geos.length) return;
    const merged = mergeGeometries(geos.map(ni));
    geos.forEach((q) => q.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    g.add(mesh);
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
  add(glassGeoms, m.glass, false);
  add(doorGeoms, m.door, !cut);
  add(capGeoms, m.cap, false);
  add(frameGeoms, m.frame, !cut);
}

/* ---------------- döşeme ---------------- */
function buildSlab(fl: Floor, below: Floor | null, base: number, m: Mats, g: THREE.Group) {
  const r = rasterize(fl.walls);
  if (!r) return;
  const { w: W, h: H, cell, blocked } = r;
  const out = outsideMask(r);
  const inside = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) inside[k] = out[k] || blocked[k] ? 0 : 1;
  // alt kattan gelen merdiven boşluğu
  if (below) {
    for (const st of below.stairs) {
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
    const bg = new THREE.BoxGeometry(x1 - x0, SLAB, y1 - y0);
    bg.translate((x0 + x1) / 2, base - SLAB / 2, (y0 + y1) / 2);
    return ni(bg);
  });
  const merged = mergeGeometries(geos.map(ni));
  geos.forEach((q2) => q2.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, base > 0.01 ? m.slab : m.floorTop);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
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
          for (const st of below.stairs) {
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
    const mt = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, map: getTex(key), roughness: key === "fayans" ? 0.35 : 0.85, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(merged, mt);
    mesh.position.y = base + 0.004;
    mesh.userData = { pick: "room", ids: idsByTex.get(key) };
    mesh.receiveShadow = true;
    g.add(mesh);
  });
}

/* ---------------- merdiven ---------------- */
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
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ig.add(mesh);
  };
  // yerel kutu: x [-w/2,w/2], plan-y (z) [-d/2,d/2], arka taraf = -d/2
  const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, mat: THREE.Material = main) => {
    const b = new THREE.BoxGeometry(Math.max(0.005, x1 - x0), Math.max(0.005, y1 - y0), Math.max(0.005, z1 - z0));
    b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    add(b, mat);
  };
  const W2 = w / 2;
  const D2 = d / 2;
  const isTable = /masa|sehpa|ada/i.test(it.name) || it.key.startsWith("table") || it.key === "desk" || it.key.startsWith("coffee");
  switch (it.shape) {
    case "round": {
      const cyl = (rTop: number, y0: number, y1: number, mat: THREE.Material) => {
        const c = new THREE.CylinderGeometry(rTop, rTop, y1 - y0, 28);
        c.scale(1, 1, d / w);
        c.translate(0, (y0 + y1) / 2, 0);
        add(c, mat);
      };
      if (it.key === "ochair") {
        cyl(W2 * 0.85, 0.42, 0.5, main);
        box(-W2 * 0.7, W2 * 0.7, -D2 * 0.85, -D2 * 0.7, 0.5, h, main);
        cyl(0.03, 0.05, 0.42, m.metal);
        cyl(W2 * 0.8, 0, 0.05, m.dark);
      } else if (isTable || it.key === "tableR") {
        cyl(W2, h - 0.04, h, main);
        cyl(0.06, 0, h - 0.04, main);
        cyl(Math.min(W2, 0.3), 0, 0.03, main);
      } else cyl(W2, 0, h, main);
      break;
    }
    case "rug":
      box(-W2, W2, -D2, D2, 0, Math.max(0.01, h), main);
      break;
    case "bed": {
      const bunk = h > 1.2;
      const levels = bunk ? [0.25, 1.25] : [0];
      for (const y of levels) {
        box(-W2, W2, -D2, D2, y, y + 0.3, colorMat("#9a7b5a", m.clip));
        box(-W2 + 0.03, W2 - 0.03, -D2 + 0.03, D2 - 0.03, y + 0.3, y + 0.48, m.white);
        box(-W2 + 0.02, W2 - 0.02, -D2 + d * 0.32, D2 - 0.01, y + 0.48, y + 0.53, main);
        const n = w > 1.2 ? 2 : 1;
        const pw = (w - 0.1 * (n + 1)) / n;
        for (let i = 0; i < n; i++) box(-W2 + 0.1 + i * (pw + 0.1), -W2 + 0.1 + i * (pw + 0.1) + pw, -D2 + 0.08, -D2 + 0.45, y + 0.48, y + 0.6, m.white);
      }
      box(-W2, W2, -D2 - 0.06, -D2, 0, bunk ? h : 1.0, colorMat("#8a6a4a", m.clip));
      if (bunk) for (const sx of [-1, 1]) box(sx * W2 - 0.03, sx * W2 + 0.03, D2 - 0.06, D2, 0, h, colorMat("#8a6a4a", m.clip));
      break;
    }
    case "sofa": {
      const arm = Math.min(0.18, w * 0.15);
      box(-W2, W2, -D2, D2, 0.05, 0.42, main);
      box(-W2, W2, -D2, -D2 + d * 0.28, 0.42, h, main);
      box(-W2, -W2 + arm, -D2, D2, 0.42, Math.min(h, 0.62), main);
      box(W2 - arm, W2, -D2, D2, 0.42, Math.min(h, 0.62), main);
      box(-W2 + arm, W2 - arm, -D2 + d * 0.28, D2 - 0.02, 0.42, 0.5, colorMat("#f1e6d2", m.clip));
      break;
    }
    case "chair": {
      const leg = 0.035;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(sx * W2 - (sx > 0 ? leg : 0), sx * W2 + (sx < 0 ? leg : 0), sz * D2 - (sz > 0 ? leg : 0), sz * D2 + (sz < 0 ? leg : 0), 0, 0.43, main);
      box(-W2, W2, -D2, D2, 0.43, 0.47, main);
      box(-W2, W2, -D2, -D2 + 0.04, 0.47, h, main);
      break;
    }
    case "cooker":
      box(-W2, W2, -D2, D2, 0, h - 0.02, m.white);
      box(-W2, W2, -D2, D2, h - 0.02, h, m.dark);
      box(-W2 + 0.05, W2 - 0.05, D2, D2 + 0.005, 0.12, h - 0.2, m.dark);
      break;
    case "sink": {
      box(-W2, W2, -D2, D2, 0, h - 0.03, main);
      const n = w > 0.9 ? 2 : 1;
      const bw = (w - 0.1 * (n + 1)) / n;
      box(-W2, W2, -D2, D2, h - 0.03, h, m.white);
      for (let i = 0; i < n; i++) box(-W2 + 0.1 + i * (bw + 0.1), -W2 + 0.1 + i * (bw + 0.1) + bw, -D2 + 0.1, D2 - 0.1, h - 0.005, h + 0.002, m.metal);
      box(-0.015, 0.015, -D2 + 0.03, -D2 + 0.06, h, h + 0.25, m.metal);
      break;
    }
    case "toilet": {
      box(-W2, W2, -D2, -D2 + d * 0.28, 0, h, m.white);
      const c = new THREE.CylinderGeometry(W2 * 0.95, W2 * 0.75, 0.42, 20);
      c.scale(1, 1, (d * 0.7) / w);
      c.translate(0, 0.21, -D2 + d * 0.28 + d * 0.33);
      add(c, m.white);
      break;
    }
    case "tub":
      box(-W2, W2, -D2, D2, 0, h, m.white);
      box(-W2 + 0.07, W2 - 0.07, -D2 + 0.07, D2 - 0.07, h - 0.01, h + 0.002, colorMat("#cfe6ee", m.clip));
      break;
    case "shower":
      box(-W2, W2, -D2, D2, 0, Math.max(0.05, h), m.white);
      box(-W2, W2, D2 - 0.01, D2, h, 2.0, m.glass);
      box(W2 - 0.01, W2, -D2, D2, h, 2.0, m.glass);
      box(-0.015, 0.015, -D2, -D2 + 0.03, 0.8, 2.0, m.metal);
      break;
    case "stove":
      box(-W2, W2, -D2, D2, 0, h, colorMat("#3d3a37", m.clip));
      box(-W2 + 0.06, W2 - 0.06, D2, D2 + 0.005, h * 0.2, h * 0.7, colorMat("#d9822b", m.clip));
      if (w < 0.8) {
        const c = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 12);
        c.translate(0, h + 0.7, -D2 + 0.1);
        add(c, m.dark);
      }
      break;
    case "wardrobe":
      box(-W2, W2, -D2, D2, 0, h, main);
      box(-0.004, 0.004, D2, D2 + 0.005, 0.05, h - 0.05, colorMat("#8a7a66", m.clip));
      break;
    default:
      if (isTable) {
        const leg = 0.05;
        box(-W2, W2, -D2, D2, h - 0.04, h, main);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(sx * (W2 - 0.04) - leg / 2, sx * (W2 - 0.04) + leg / 2, sz * (D2 - 0.04) - leg / 2, sz * (D2 - 0.04) + leg / 2, 0, h - 0.04, main);
      } else box(-W2, W2, -D2, D2, 0, h, main);
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
    const mat = new THREE.MeshStandardMaterial({ color: rf.color, roughness: rt === "metal" ? 0.45 : 0.8, metalness: rt === "metal" ? 0.35 : 0, side: THREE.DoubleSide, flatShading: true, map: rt ? getTex(rt) : null });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { pick: "roof" };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  mkRoof(pos);
  mk(inf, m.infill);
}

/* ---------------- arsa ---------------- */
function grassMat(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, map: getTex("grass")! });
}

function buildGround(f: FullData, g: THREE.Group) {
  const gc = f.fin.groundColor;
  const pts = f.plot.points;
  if (pts.length >= 3) {
    const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
    const geo = new THREE.ShapeGeometry(s);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.01, 0);
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
      new THREE.BufferGeometry().setFromPoints(pts.map((p) => V(p.x, 0.02, p.y))),
      new THREE.LineDashedMaterial({ color: "#4f7a33", dashSize: 0.4, gapSize: 0.25 })
    );
    line.computeLineDistances();
    g.add(line);
  }
  const bigGeo = new THREE.PlaneGeometry(1200, 1200);
  const buv = bigGeo.attributes.uv;
  for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 300, buv.getY(i) * 300);
  const big = new THREE.Mesh(bigGeo, grassMat("#a9b98a"));
  big.rotateX(-Math.PI / 2);
  big.position.y = -0.03;
  big.receiveShadow = true;
  g.add(big);
  // uzak tepeler (sis ile karışır)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hillMat = new THREE.MeshStandardMaterial({ color: "#7d9a6a", roughness: 1, flatShading: false });
  const hillMat2 = new THREE.MeshStandardMaterial({ color: "#6a8a63", roughness: 1 });
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rnd() * 0.2;
    const rad = 230 + rnd() * 90;
    const hr = 26 + rnd() * 46;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), rnd() > 0.5 ? hillMat : hillMat2);
    m.scale.set(hr * 1.8, hr * (0.28 + rnd() * 0.3), hr * 1.1);
    m.position.set(Math.cos(a) * rad, -hr * 0.1, Math.sin(a) * rad);
    m.rotation.y = -a;
    g.add(m);
  }
}

/** Tüm 3B sahneler için ortak: ton eşleme, ortam yansıması, gökyüzü kubbesi */
export function decorateScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.28;
  pm.dispose();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color("#6f9fd6") }, bottom: { value: new THREE.Color("#dbe8f3") } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform vec3 top; uniform vec3 bottom; varying vec3 vP;",
      "void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.55)), 1.0);",
      "#include <tonemapping_fragment>",
      "#include <colorspace_fragment>",
      "}",
    ].join("\n"),
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);
  scene.userData.sky = mat;
  return dome;
}

/** Gökyüzü kubbesi renklerini ufuk rengine göre ayarla */
export function setSky(scene: THREE.Scene, horizon: THREE.Color) {
  const m = scene.userData.sky as THREE.ShaderMaterial | undefined;
  if (!m) return;
  m.uniforms.bottom.value.copy(horizon);
  m.uniforms.top.value.copy(horizon).lerp(new THREE.Color("#3f78c4"), 0.55 * Math.min(1, horizon.getHSL({ h: 0, s: 0, l: 0 }).l * 1.6));
}

/* ---------------- çevre nesneleri ---------------- */
function buildEnv(objs: EnvObj[], g: THREE.Group) {
  const std = (color: string, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
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
      add(new THREE.CylinderGeometry(Math.max(0.06, w * 0.035), Math.max(0.12, w * 0.07), th, 9), std("#6b4a2b"), 0, th / 2, 0);
      const ch = h - th;
      const blobs: [number, number, number, number][] = [
        [0, 0.5, 0, 1],
        [0.28, 0.42, 0.1, 0.72],
        [-0.26, 0.45, -0.08, 0.7],
        [0.05, 0.78, -0.18, 0.62],
        [-0.1, 0.72, 0.2, 0.6],
      ];
      blobs.forEach((b, i) => {
        const m = add(new THREE.IcosahedronGeometry(0.5, 2), std("#ffffff"), b[0] * w * 0.7, th + ch * b[1], b[2] * d * 0.7);
        (m.material as THREE.MeshStandardMaterial).color = shade(o.color, i + 1);
        m.scale.set(w * 0.62 * b[3], ch * 0.62 * b[3], d * 0.62 * b[3]);
      });
    } else if (o.kind === "pine") {
      const th = h * 0.14;
      add(new THREE.CylinderGeometry(0.07, 0.14, th + 0.4, 8), std("#5a3d22"), 0, (th + 0.4) / 2, 0);
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1);
        const ch = (h - th) * 0.34;
        const k = 1 - t * 0.7;
        const cone = add(new THREE.ConeGeometry(0.5, ch, 12), std("#ffffff"), 0, th + ch / 2 + t * (h - th - ch) * 0.98, 0);
        (cone.material as THREE.MeshStandardMaterial).color = shade(o.color, i + 3);
        cone.scale.set(w * k, 1, d * k);
      }
    } else if (o.kind === "bush") {
      const m = add(new THREE.IcosahedronGeometry(0.5, 1), std(o.color), 0, h * 0.5, 0);
      m.scale.set(w, h, d);
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
    } else {
      add(new THREE.BoxGeometry(w, h, Math.max(0.1, d)), std(o.color), 0, h / 2, 0);
    }
    og.rotation.y = (-o.rot * Math.PI) / 180;
    og.position.set(o.x, 0, o.y);
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
export function buildHouse(f: FullData, fi: number, v: V3) {
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
  for (let i = lo; i <= hi; i++) {
    const fl = f.floors[i];
    const fg = new THREE.Group();
    fg.userData = { floor: i };
    house.add(fg);
    const m = v.cut && i === topShown ? clipped : plain;
    buildSlab(fl, i > 0 ? f.floors[i - 1] : null, bases[i], plain, fg);
    buildRoomFloors(fl, i > 0 ? f.floors[i - 1] : null, bases[i], m.clip, fg);
    buildWalls(fl, bases[i], m, v.cut && i === topShown, fg);
    for (const st of fl.stairs) buildStair(st, fl.height, bases[i], m, fg);
    if (v.items) for (const it of fl.items) buildItem(it, bases[i], m, fg);
  }
  // çatı: yalnızca en üst katlar gösteriliyorsa ve kesit kapalıysa
  let topWalls = -1;
  f.floors.forEach((fl, i) => fl.walls.length && (topWalls = i));
  const roofShown = v.roof && !v.cut && topWalls >= 0 && hi >= topWalls && lo <= topWalls;
  if (roofShown) {
    const rg = new THREE.Group();
    rg.userData = { floor: topWalls };
    buildRoof(f, bases[topWalls] + f.floors[topWalls].height, plain, rg);
    house.add(rg);
  }
  buildGround(f, ground);
  buildEnv(f.env.objs, env);
  return { house, ground, env, roofShown };
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
  return wallTop + (ri && f.roof.kind !== "flat" ? ri.ridgeHeight : 0.25);
}
