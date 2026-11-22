"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FullData } from "@/lib/types";
import { buildHouse, disposeTree, floorBases, roomAtPoint, type V3 } from "@/lib/scene3d";
import { sunDir } from "@/lib/env";

type Preset = "corner" | "front" | "side" | "top" | "keep";

export type Pick3 =
  | { k: "wall"; id: string; face: "ext" | "int" | "side"; floor: number }
  | { k: "room"; id: string; floor: number }
  | { k: "item"; id: string; floor: number }
  | { k: "roof" }
  | { k: "env"; id: string };

export type Walk = { x: number; y: number; floor: number; yaw: number } | null;

type Api = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  root: THREE.Group | null;
  hl: THREE.Object3D | null;
  render: () => void;
  framed: boolean;
  bounds: THREE.Box3;
  kick: () => void;
  userMoved: boolean;
};

export default function View3D({ full, fi, v3, name, walk, pan, sel, onPick, onExit }: { full: FullData; fi: number; v3: V3; name: string; walk: Walk; pan: boolean; sel: Pick3 | null; onPick: (p: Pick3 | null) => void; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const compass = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const viewKey = useRef("");
  const fullRef = useRef(full);
  fullRef.current = full;
  const walkRef = useRef(walk);
  walkRef.current = walk;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const selRef = useRef(sel);
  selRef.current = sel;
  const ws = useRef({ yaw: 0, pitch: 0, x: 0, z: 0, y: 1.6, fov: 70 });
  const held = useRef(new Set<string>());
  const raf = useRef(0);

  // güneş dışındaki her şey değişirse sahne yeniden kurulur
  const key = useMemo(() => JSON.stringify([full.plot, full.floors, full.roof, full.fin, full.env.objs, full.custom]), [full]);

  /* ---------- kurulum ---------- */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;
    renderer.domElement.className = "v3cv";
    el.insertBefore(renderer.domElement, el.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dbe8f3");
    scene.fog = new THREE.Fog("#dbe8f3", 90, 300);
    const hemi = new THREE.HemisphereLight("#f2f6ff", "#a89a7c", 1.7);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight("#ffffff", 0.35));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.rotation.order = "YXZ";
    camera.position.set(18, 14, 18);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 1;
    controls.maxDistance = 250;
    controls.screenSpacePanning = true;
    // sol / orta tuş: döndür (360°), sağ tuş: kaydır; iki parmak: yakınlaştır + döndür
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

    const updCompass = () => {
      const c = compass.current;
      if (!c) return;
      const n = (fullRef.current.env.sun.north * Math.PI) / 180;
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      f.y = 0;
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
      f.normalize();
      const nx = Math.sin(n);
      const nz = -Math.cos(n);
      const sx = nx * -f.z + nz * f.x;
      const sy = nx * f.x + nz * f.z;
      c.style.transform = `rotate(${(Math.atan2(sx, sy) * 180) / Math.PI}deg)`;
    };
    const render = () => {
      renderer.render(scene, camera);
      updCompass();
    };
    controls.addEventListener("change", render);
    controls.addEventListener("start", () => {
      if (api.current) api.current.userMoved = true;
    });

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // kullanıcı henüz kamerayı oynatmadıysa, ekran boyutuna göre yeniden kadrajla
      const a = api.current;
      if (a && a.root && a.framed && !a.userMoved && !walkRef.current) frame(a, a.root.children[1], "corner");
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    /* ---------- yürüme döngüsü (klavye + ekran düğmeleri) ---------- */
    const applyLook = () => {
      const w = ws.current;
      camera.rotation.set(w.pitch, w.yaw, 0);
      camera.fov = w.fov;
      camera.updateProjectionMatrix();
    };
    let last = 0;
    const tick = (now: number) => {
      raf.current = 0;
      const wk = walkRef.current;
      if (!wk || held.current.size === 0) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      const w = ws.current;
      const h = held.current;
      if (h.has("tl")) w.yaw += 1.6 * dt;
      if (h.has("tr")) w.yaw -= 1.6 * dt;
      let mv = 0;
      let st = 0;
      if (h.has("f")) mv += 1;
      if (h.has("b")) mv -= 1;
      if (h.has("l")) st -= 1;
      if (h.has("r")) st += 1;
      if (mv || st) {
        const sp = 1.7 * dt;
        const nx = w.x + (-Math.sin(w.yaw) * mv + Math.cos(w.yaw) * st) * sp;
        const nz = w.z + (-Math.cos(w.yaw) * mv - Math.sin(w.yaw) * st) * sp;
        const fl = fullRef.current.floors[wk.floor];
        if (!blocked(fl, nx, w.z)) w.x = nx;
        if (!blocked(fl, w.x, nz)) w.z = nz;
        camera.position.set(w.x, w.y, w.z);
      }
      applyLook();
      render();
      raf.current = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf.current) {
        last = 0;
        raf.current = requestAnimationFrame(tick);
      }
    };
    api.current = { renderer, scene, camera, controls, sun, hemi, root: null, hl: null, render, framed: false, bounds: new THREE.Box3(), kick, userMoved: false };
    resize();

    /* ---------- dokunma / fare: seçme + gezinme ---------- */
    const dom = renderer.domElement;
    const ptrs = new Map<number, { x: number; y: number }>();
    let tap: { x: number; y: number; t: number; ok: boolean } | null = null;
    let pinch = 0;
    const ray = new THREE.Raycaster();
    const doPick = (cx: number, cy: number) => {
      const a = api.current;
      if (!a?.root) return;
      const r = dom.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      const hits = ray.intersectObject(a.root, true);
      const floorOf = (o: THREE.Object3D | null) => {
        for (let p: THREE.Object3D | null = o; p; p = p.parent) if (typeof p.userData.floor === "number") return p.userData.floor as number;
        return -1;
      };
      for (const h of hits) {
        const o = h.object as THREE.Mesh;
        const mt = o.material as THREE.Material;
        if (mt && mt.transparent) continue; // cam
        let pk: { pick?: string; id?: string; ids?: string[]; face?: string } | null = null;
        for (let p: THREE.Object3D | null = o; p; p = p.parent) {
          if (p.userData.pick) {
            pk = p.userData;
            break;
          }
        }
        const fl = floorOf(o);
        if (pk?.pick === "wall" && pk.ids && h.faceIndex != null) {
          onPickRef.current({ k: "wall", id: pk.ids[h.faceIndex], face: (pk.face as "ext" | "int" | "side") ?? "ext", floor: fl });
        } else if (pk?.pick === "room" && pk.ids && h.faceIndex != null) {
          onPickRef.current({ k: "room", id: pk.ids[h.faceIndex], floor: fl });
        } else if (pk?.pick === "item") onPickRef.current({ k: "item", id: pk.id!, floor: fl });
        else if (pk?.pick === "env") onPickRef.current({ k: "env", id: pk.id! });
        else if (pk?.pick === "roof") onPickRef.current({ k: "roof" });
        else if (fl >= 0 && h.face && h.face.normal.y > 0.5) {
          const rm = roomAtPoint(fullRef.current.floors[fl], h.point.x, h.point.z);
          onPickRef.current(rm ? { k: "room", id: rm.id, floor: fl } : null);
        } else onPickRef.current(null);
        return;
      }
      onPickRef.current(null);
    };
    const onDown = (e: PointerEvent) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) tap = { x: e.clientX, y: e.clientY, t: performance.now(), ok: e.button === 0 || e.pointerType === "touch" };
      else if (tap) tap.ok = false;
      if (ptrs.size === 2) {
        const [p, q] = [...ptrs.values()];
        pinch = Math.hypot(p.x - q.x, p.y - q.y);
      }
      if (walkRef.current) {
        try {
          dom.setPointerCapture?.(e.pointerId);
        } catch {
          /* yoksay */
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = ptrs.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 6) tap.ok = false;
      if (!walkRef.current) return;
      const w = ws.current;
      if (ptrs.size === 1) {
        w.yaw -= dx * 0.005;
        w.pitch = Math.max(-1.45, Math.min(1.45, w.pitch - dy * 0.005));
      } else if (ptrs.size === 2) {
        const [p, q] = [...ptrs.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (pinch > 0 && d > 0) w.fov = Math.max(30, Math.min(100, w.fov * (pinch / d)));
        pinch = d;
      }
      applyLook();
      render();
    };
    const onUp = (e: PointerEvent) => {
      if (tap && tap.ok && ptrs.size === 1 && performance.now() - tap.t < 600) doPick(e.clientX, e.clientY);
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) tap = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!walkRef.current) return;
      e.preventDefault();
      const w = ws.current;
      w.fov = Math.max(30, Math.min(100, w.fov * (e.deltaY > 0 ? 1.06 : 0.94)));
      applyLook();
      render();
    };
    const noMenu = (e: Event) => e.preventDefault();
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", noMenu);

    const keyMap: Record<string, string> = { w: "f", arrowup: "f", s: "b", arrowdown: "b", a: "l", d: "r", q: "tl", arrowleft: "tl", e: "tr", arrowright: "tr" };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!walkRef.current) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      const k = keyMap[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      held.current.add(k);
      kick();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = keyMap[e.key.toLowerCase()];
      if (k) held.current.delete(k);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      ro.disconnect();
      controls.dispose();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(raf.current);
      if (api.current?.root) disposeTree(api.current.root);
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  /* ---------- dokunmatik: tek parmak döndür / kaydır ---------- */
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.controls.touches = { ONE: pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  }, [pan]);

  /* ---------- seçili nesneyi vurgula ---------- */
  function drawHl() {
    const a = api.current;
    if (!a) return;
    if (a.hl) {
      a.scene.remove(a.hl);
      a.hl.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
      a.hl = null;
    }
    const sel2 = selRef.current;
    if (!sel2 || !a.root) return;
    const f = fullRef.current;
    const mat = new THREE.LineBasicMaterial({ color: "#ff8a1f", depthTest: false, transparent: true });
    const bases = floorBases(f);
    const g = new THREE.Group();
    const outline = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry: number) => {
      const ls = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat);
      ls.position.set(x, y, z);
      ls.rotation.y = ry;
      ls.renderOrder = 999;
      g.add(ls);
    };
    if (sel2.k === "wall") {
      const fl = f.floors[sel2.floor];
      const w = fl?.walls.find((q) => q.id === sel2.id);
      if (w) {
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        outline(new THREE.BoxGeometry(L, fl.height, w.t + 0.03), (w.a.x + w.b.x) / 2, bases[sel2.floor] + fl.height / 2, (w.a.y + w.b.y) / 2, -Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x));
      }
    } else if (sel2.k === "item") {
      const it = f.floors[sel2.floor]?.items.find((q) => q.id === sel2.id);
      if (it) outline(new THREE.BoxGeometry(it.w + 0.04, it.h + 0.04, it.d + 0.04), it.x, bases[sel2.floor] + it.elev + it.h / 2, it.y, (-it.rot * Math.PI) / 180);
    } else if (sel2.k === "env") {
      const o = f.env.objs.find((q) => q.id === sel2.id);
      if (o) outline(new THREE.BoxGeometry(o.w, o.h, o.d), o.x, o.h / 2, o.y, (-o.rot * Math.PI) / 180);
    }
    if (g.children.length) {
      a.scene.add(g);
      a.hl = g;
    }
  }

  /* ---------- sahneyi (yeniden) kur ---------- */
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (a.root) {
      a.scene.remove(a.root);
      disposeTree(a.root);
    }
    const f = fullRef.current;
    const { house, ground, env } = buildHouse(f, fi, v3);
    const root = new THREE.Group();
    root.add(ground, house, env);
    a.scene.add(root);
    a.root = root;
    // kadraj ve gölge alanı: ev + çevre + arsa
    const box = new THREE.Box3().setFromObject(house);
    const eb = new THREE.Box3().setFromObject(env);
    if (!eb.isEmpty()) box.union(eb);
    f.plot.points.forEach((p) => box.expandByPoint(new THREE.Vector3(p.x, 0, p.y)));
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 2, 10));
    a.bounds = box;
    const k = `${v3.floors}|${v3.cut}|${fi}`;
    if (!a.framed) {
      frame(a, house, "corner");
      a.framed = true;
    } else if (k !== viewKey.current && !walkRef.current) frame(a, house, "keep");
    viewKey.current = k;
    applySun(a, f);
    drawHl();
    a.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fi, v3]);

  /* ---------- güneş ---------- */
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    applySun(a, full);
    a.render();
  }, [full.env.sun]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    drawHl();
    api.current?.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  /* ---------- odaya gir / çık ---------- */
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (walk) {
      const bases = floorBases(fullRef.current);
      ws.current = { yaw: walk.yaw, pitch: 0, x: walk.x, z: walk.y, y: (bases[walk.floor] ?? 0) + 1.6, fov: 70 };
      a.controls.enabled = false;
      a.camera.near = 0.05;
      a.camera.position.set(ws.current.x, ws.current.y, ws.current.z);
      a.camera.rotation.set(0, ws.current.yaw, 0);
      a.camera.fov = 70;
      a.camera.updateProjectionMatrix();
    } else {
      a.controls.enabled = true;
      a.camera.fov = 45;
      held.current.clear();
      if (a.root) frame(a, a.root.children[1] as THREE.Group, "corner");
    }
    a.render();
  }, [walk]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(p: Preset) {
    const a = api.current;
    if (!a?.root || walkRef.current) return;
    a.userMoved = true;
    frame(a, a.root.children[1] as THREE.Group, p);
    a.render();
  }

  function snapshot() {
    const a = api.current;
    if (!a) return;
    a.render();
    const url = a.renderer.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = (name || "ev").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") + (walk ? "-ic-mekan" : "-3d") + ".png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const hold = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* yoksay */
      }
      held.current.add(k);
      api.current?.kick();
    },
    onPointerUp: () => held.current.delete(k),
    onPointerCancel: () => held.current.delete(k),
    onLostPointerCapture: () => held.current.delete(k),
  });

  return (
    <div className="v3" ref={host}>
      <div className="v3bar">
        {walk ? (
          <>
            <button className="exit" onClick={onExit}>⬅ Dışarı çık</button>
            <button onClick={snapshot}>📷 Resim indir</button>
          </>
        ) : (
          <>
            <button onClick={() => go("corner")}>Köşe</button>
            <button onClick={() => go("front")}>Ön</button>
            <button onClick={() => go("side")}>Yan</button>
            <button onClick={() => go("top")}>Üst</button>
            <button onClick={snapshot}>📷 Resim indir</button>
          </>
        )}
      </div>
      <div className="compass" aria-label="Kuzey yönü">
        <div ref={compass} className="needle">
          <span>K</span>
        </div>
      </div>
      {walk && (
        <>
          <div className="pad padl">
            <button className="up" {...hold("f")} aria-label="İleri">▲</button>
            <button className="lf" {...hold("l")} aria-label="Sola kay">◀</button>
            <button className="rt" {...hold("r")} aria-label="Sağa kay">▶</button>
            <button className="dn" {...hold("b")} aria-label="Geri">▼</button>
          </div>
          <div className="pad padr">
            <button {...hold("tl")} aria-label="Sola dön">⟲</button>
            <button {...hold("tr")} aria-label="Sağa dön">⟳</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- yardımcılar ---------- */
function blocked(fl: FullData["floors"][number] | undefined, x: number, y: number) {
  if (!fl) return false;
  const R = 0.22;
  for (const w of fl.walls) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const t = Math.max(0, Math.min(L, ((x - w.a.x) * dx + (y - w.a.y) * dy) / L));
    const px = w.a.x + (dx / L) * t;
    const py = w.a.y + (dy / L) * t;
    if (Math.hypot(x - px, y - py) >= w.t / 2 + R) continue;
    // kapı açıklığından geçilebilir
    const door = fl.openings.some((o) => o.wall === w.id && o.kind === "door" && Math.abs(o.pos - t) < o.w / 2 - 0.05);
    if (!door) return true;
  }
  return false;
}

function applySun(a: Api, f: FullData) {
  const sun = f.env.sun;
  const d = sunDir(sun);
  const day = d.alt > 1;
  const b = a.bounds;
  const c = b.getCenter(new THREE.Vector3());
  const R = Math.max(8, b.getSize(new THREE.Vector3()).length() / 2);
  const up = Math.max(0.12, d.y);
  a.sun.position.set(c.x + d.x * R * 3, Math.max(2, c.y + up * R * 3), c.z + d.z * R * 3);
  a.sun.target.position.copy(c);
  const sc = a.sun.shadow.camera;
  sc.left = sc.bottom = -R * 1.5;
  sc.right = sc.top = R * 1.5;
  sc.near = 0.5;
  sc.far = R * 9;
  sc.updateProjectionMatrix();
  const k = Math.max(0, Math.min(1, d.alt / 25));
  a.sun.intensity = day ? 0.6 + 2.2 * k : 0;
  a.sun.color.set(new THREE.Color("#ff9a4d").lerp(new THREE.Color("#fff4e0"), k));
  a.sun.castShadow = sun.shadows && day;
  a.hemi.intensity = day ? 0.7 + 1.0 * k : 0.35;
  const sky = new THREE.Color("#1b2436").lerp(new THREE.Color("#f0a46b"), Math.max(0, Math.min(1, (d.alt + 6) / 12))).lerp(new THREE.Color("#dbe8f3"), Math.max(0, Math.min(1, (d.alt - 4) / 20)));
  (a.scene.background as THREE.Color).copy(sky);
  (a.scene.fog as THREE.Fog).color.copy(sky);
}

function frame(a: { camera: THREE.PerspectiveCamera; controls: OrbitControls }, house: THREE.Object3D, p: Preset) {
  const box = new THREE.Box3().setFromObject(house);
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 2, 10));
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(3, size.length() / 2);
  const fov = (a.camera.fov * Math.PI) / 180;
  const fit = (r / Math.sin(fov / 2) / Math.min(1, Math.max(0.55, a.camera.aspect))) * (a.camera.aspect < 1 ? 1.12 : 0.95);
  const dir =
    p === "keep"
      ? a.camera.position.clone().sub(a.controls.target)
      : p === "front"
        ? new THREE.Vector3(0, 0.25, 1)
        : p === "side"
          ? new THREE.Vector3(1, 0.25, 0)
          : p === "top"
            ? new THREE.Vector3(0, 1, 0.02)
            : new THREE.Vector3(0.9, 0.7, 1);
  dir.normalize();
  a.controls.target.copy(c);
  a.camera.position.copy(c).addScaledVector(dir, fit);
  a.camera.near = Math.max(0.05, fit / 200);
  a.camera.updateProjectionMatrix();
  a.controls.update();
}
