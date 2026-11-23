"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FullData } from "@/lib/types";
import { buildHouse, disposeTree, floorBases, roomAtPoint, setNight, setSecPlane, type V3 } from "@/lib/scene3d";
import dynamic from "next/dynamic";
import type { PhotoCam } from "@/lib/photo";
import { applyLookSun, disposeLook, renderLook, resizeLook, setLookClip, setupLook, type Look } from "@/lib/look";

const Photo = dynamic(() => import("./Photo"), { ssr: false });

export type Preset = "corner" | "front" | "side" | "top" | "keep";

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
  look: Look;
  lamp: THREE.PointLight;
  root: THREE.Group | null;
  hl: THREE.Object3D | null;
  render: () => void;
  framed: boolean;
  secPlane: THREE.Plane;
  bounds: THREE.Box3;
  kick: () => void;
  userMoved: boolean;
};

export type View3DCmd = { preset: Preset; n: number };

export default function View3D({ full, fi, v3, name, walk, pan, sel, onPick, onExit, onWallH, onItemMove, secPos = 0, secFlip = false, cmd }: { full: FullData; fi: number; v3: V3; name: string; walk: Walk; pan: boolean; sel: Pick3 | null; onPick: (p: Pick3 | null) => void; onExit: () => void; onWallH?: (floor: number, id: string, h: number, phase: "start" | "move") => void; onItemMove?: (floor: number, id: string, x: number, y: number, phase: "start" | "move" | "end") => void; secPos?: number; secFlip?: boolean; cmd?: View3DCmd }) {
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
  const onWallHRef = useRef(onWallH);
  onWallHRef.current = onWallH;
  const onItemMoveRef = useRef(onItemMove);
  onItemMoveRef.current = onItemMove;
  const handle = useRef<HTMLDivElement>(null);
  const placeRef = useRef<() => void>(() => {});
  /** seçili duvarın üst orta noktasını ekrana yansıt, tutamacı oraya koy */
  const wallTop = (H?: number) => {
    const a = api.current, sl = selRef.current, h = handle.current, hs = host.current;
    if (!a || !h || !hs || !sl || sl.k !== "wall") return null;
    const f = fullRef.current;
    const fl = f.floors[sl.floor];
    const w = fl?.walls.find((q) => q.id === sl.id);
    if (!w) return null;
    const base = floorBases(f)[sl.floor];
    const hh = H ?? w.h ?? fl.height;
    const r = hs.getBoundingClientRect();
    const proj = (y: number) => {
      const v = new THREE.Vector3((w.a.x + w.b.x) / 2, base + y, (w.a.y + w.b.y) / 2).project(a.camera);
      return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, z: v.z };
    };
    return { top: proj(hh), bot: proj(0), h: hh, floor: sl.floor, id: sl.id };
  };
  placeRef.current = () => {
    const h = handle.current;
    if (!h) return;
    const t = wallTop();
    if (!t || walk || t.top.z > 1) {
      h.style.display = "none";
      return;
    }
    h.style.display = "flex";
    h.style.left = t.top.x + "px";
    h.style.top = t.top.y + "px";
  };
  const secPosRef = useRef(secPos);
  secPosRef.current = secPos;
  const secFlipRef = useRef(secFlip);
  secFlipRef.current = secFlip;
  const secRef = useRef(v3.sec);
  secRef.current = v3.sec;
  // yürürken duvardan geç
  const [ghost, setGhost] = useState(() => {
    try {
      return localStorage.getItem("kte_ghost") === "1";
    } catch {
      return false;
    }
  });
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  const ws = useRef({ yaw: 0, pitch: 0, x: 0, z: 0, y: 1.6, fov: 70 });
  const held = useRef(new Set<string>());
  const raf = useRef(0);
  const [hq, setHq] = useState(() => {
    try {
      return localStorage.getItem("kte_q") !== "low";
    } catch {
      return true;
    }
  });
  const [photo, setPhoto] = useState<{ cam: PhotoCam; inside: { floor: number } | null; aspect: number } | null>(null);
  const hqRef = useRef(hq);
  hqRef.current = hq;

  // güneş dışındaki her şey değişirse sahne yeniden kurulur
  const key = useMemo(() => JSON.stringify([full.plot, full.floors, full.roof, full.fin, full.env.objs, full.custom]), [full]);

  /* ---------- kurulum ---------- */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
    renderer.setPixelRatio(dpr);
    renderer.localClippingEnabled = true;
    renderer.domElement.className = "v3cv";
    el.insertBefore(renderer.domElement, el.firstChild);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#cfdbe6", 120, 640);
    const look = setupLook(renderer, scene, { shadow: coarse ? 2048 : 4096, composer: true, msaa: coarse ? 2 : 4 });
    // gölge haritası her karede değil, yalnızca sahne / güneş değişince hesaplanır
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    // iç mekân lambası (yalnızca odaya girince yanar)
    const lamp = new THREE.PointLight("#ffe4bd", 0, 14, 1.4);
    scene.add(lamp);

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
    // dokunmatik cihazda: hareket ederken hızlı çizim, durunca yüksek kalite
    let moving = false;
    let refineT = 0;
    const render = () => {
      // hareket ederken hızlı çizim (ortam gölgesi yok), durunca yüksek kalite
      const hq = hqRef.current && !(moving || held.current.size > 0);
      renderLook(look, camera, hq);
      updCompass();
      placeRef.current();
      if (!hq && hqRef.current) {
        clearTimeout(refineT);
        refineT = window.setTimeout(() => {
          if (!moving && held.current.size === 0) {
            renderLook(look, camera, true);
          }
        }, 180);
      }
    };
    controls.addEventListener("change", render);
    controls.addEventListener("start", () => {
      moving = true;
      if (api.current) api.current.userMoved = true;
    });
    controls.addEventListener("end", () => {
      moving = false;
      render();
    });

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      resizeLook(look, w, h, dpr);
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
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
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
      const vy = (h.has("u") ? 1 : 0) - (h.has("d") ? 1 : 0);
      if (ghostRef.current && (mv || st || vy)) {
        // serbest uçuş (noclip): bakılan yöne uç, duvar/zemin/tavan engel değil
        const sp = 3.2 * dt;
        const cp = Math.cos(w.pitch);
        w.x += (-Math.sin(w.yaw) * cp * mv + Math.cos(w.yaw) * st) * sp;
        w.z += (-Math.cos(w.yaw) * cp * mv - Math.sin(w.yaw) * st) * sp;
        w.y = Math.max(0.15, Math.min(60, w.y + (Math.sin(w.pitch) * mv + vy) * sp));
        camera.position.set(w.x, w.y, w.z);
        lamp.position.set(w.x, w.y, w.z);
      } else if (mv || st) {
        const sp = 1.7 * dt;
        const nx = w.x + (-Math.sin(w.yaw) * mv + Math.cos(w.yaw) * st) * sp;
        const nz = w.z + (-Math.cos(w.yaw) * mv - Math.sin(w.yaw) * st) * sp;
        const fl = fullRef.current.floors[wk.floor];
        if (!blocked(fl, nx, w.z)) w.x = nx;
        if (!blocked(fl, w.x, nz)) w.z = nz;
        camera.position.set(w.x, w.y, w.z);
        lamp.position.x = w.x;
        lamp.position.z = w.z;
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
    api.current = { renderer, scene, camera, controls, look, lamp, root: null, hl: null, render, framed: false, secPlane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6), bounds: new THREE.Box3(), kick, userMoved: false };
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
        if (secRef.current !== "none" && a.secPlane.distanceToPoint(h.point) < -0.001) continue; // kesitle gizlenen parça
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
    /* eşyayı 3D'de tutup sürükleme: yatay düzlemde kayar, planla eş zamanlı */
    let idrag: { floor: number; id: string; plane: THREE.Plane; ox: number; oy: number; pid: number; started: boolean } | null = null;
    const planePt = (cx: number, cy: number, plane: THREE.Plane) => {
      const r = dom.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      const v = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, v) ? v : null;
    };
    const tryItemDrag = (e: PointerEvent) => {
      const a = api.current;
      if (!a?.root || !onItemMoveRef.current || walkRef.current || e.button !== 0) return;
      const r = dom.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      for (const h of ray.intersectObject(a.root, true)) {
        const o = h.object as THREE.Mesh;
        const mt = o.material as THREE.Material;
        if (mt && mt.transparent) continue;
        let pk: { pick?: string; id?: string } | null = null;
        let fl = -1;
        for (let p: THREE.Object3D | null = o; p; p = p.parent) {
          if (!pk && p.userData.pick) pk = p.userData;
          if (fl < 0 && typeof p.userData.floor === "number") fl = p.userData.floor;
        }
        if (pk?.pick !== "item" || !pk.id || fl < 0) return;
        const it = fullRef.current.floors[fl]?.items.find((q) => q.id === pk!.id);
        if (!it) return;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h.point.y);
        idrag = { floor: fl, id: pk.id, plane, ox: it.x - h.point.x, oy: it.y - h.point.z, pid: e.pointerId, started: false };
        return;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 1) e.preventDefault();
      idrag = null;
      if (e.isPrimary) tryItemDrag(e);
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
      if (idrag && e.pointerId === idrag.pid && ptrs.size === 1) {
        if (!idrag.started) {
          if (!tap || tap.ok) return; // 6 px geçilene kadar tıklama sayılır
          idrag.started = true;
          a_ctl(false);
          try { dom.setPointerCapture?.(e.pointerId); } catch { /* yoksay */ }
          onItemMoveRef.current?.(idrag.floor, idrag.id, 0, 0, "start");
        }
        const pt = planePt(e.clientX, e.clientY, idrag.plane);
        if (pt) onItemMoveRef.current?.(idrag.floor, idrag.id, pt.x + idrag.ox, pt.z + idrag.oy, "move");
        return;
      }
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
      moving = true;
      render();
    };
    const a_ctl = (on: boolean) => { if (api.current) api.current.controls.enabled = on; };
    const onUp = (e: PointerEvent) => {
      if (idrag && e.pointerId === idrag.pid) {
        if (idrag.started) {
          a_ctl(true);
          onItemMoveRef.current?.(idrag.floor, idrag.id, 0, 0, "end");
          tap = null; // sürükleme sonrası seçme yapma
        }
        idrag = null;
      }
      if (moving && walkRef.current) {
        moving = false;
        render();
      }
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
    const noMid = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    dom.addEventListener("mousedown", noMid);
    dom.addEventListener("auxclick", noMid);

    const keyMap: Record<string, string> = { w: "f", arrowup: "f", s: "b", arrowdown: "b", a: "l", d: "r", " ": "u", c: "d", shift: "d", q: "tl", arrowleft: "tl", e: "tr", arrowright: "tr" };
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
      dom.removeEventListener("mousedown", noMid);
      dom.removeEventListener("auxclick", noMid);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(raf.current);
      clearTimeout(refineT);
      if (api.current?.root) disposeTree(api.current.root);
      disposeLook(look);
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
        outline(new THREE.BoxGeometry(L, w.h ?? fl.height, w.t + 0.03), (w.a.x + w.b.x) / 2, bases[sel2.floor] + (w.h ?? fl.height) / 2, (w.a.y + w.b.y) / 2, -Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x));
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
    const t0 = performance.now();
    setSecPlane(a.secPlane, v3.sec, secPosRef.current, secFlipRef.current);
    const { house, ground, env, cutPlane } = buildHouse(f, fi, v3, a.secPlane);
    setLookClip(a.look, v3.sec !== "none" ? [a.secPlane] : v3.cut ? [cutPlane] : []);
    (window as unknown as { __v3ms?: number }).__v3ms = Math.round(performance.now() - t0);
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
    const k = `${v3.floors}|${v3.cut}|${v3.sec}|${fi}`;
    if (!a.framed) {
      frame(a, house, "corner");
      a.framed = true;
    } else if (k !== viewKey.current && !walkRef.current) frame(a, house, "keep");
    viewKey.current = k;
    applySun(a, f, !!walkRef.current);
    drawHl();
    a.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fi, v3]);

  useEffect(() => {
    placeRef.current();
  });

  /* ---------- kesit düzlemi: kaydırınca yeniden kurmadan güncelle ---------- */
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    setSecPlane(a.secPlane, v3.sec, secPos, secFlip);
    a.renderer.shadowMap.needsUpdate = true;
    a.render();
  }, [secPos, secFlip, v3.sec]);

  /* ---------- dışarıdan kamera komutu (ör. kata tepeden bak) ---------- */
  useEffect(() => {
    const a = api.current;
    if (!a || !cmd || !a.root || walkRef.current) return;
    frame(a, a.root.children[1], cmd.preset);
    a.userMoved = true;
    a.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd?.n]);

  useEffect(() => {
    try {
      localStorage.setItem("kte_ghost", ghost ? "1" : "0");
    } catch {
      /* yok say */
    }
  }, [ghost]);

  /* ---------- güneş ---------- */
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    applySun(a, full, !!walkRef.current);
    a.render();
  }, [full.env.sun]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem("kte_q", hq ? "high" : "low");
    } catch {
      /* yok say */
    }
    api.current?.render();
  }, [hq]);

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
      const fl = fullRef.current.floors[walk.floor];
      a.lamp.position.set(walk.x, (bases[walk.floor] ?? 0) + (fl?.height ?? 2.8) - 0.4, walk.y);
    } else {
      a.controls.enabled = true;
      a.camera.fov = 45;
      held.current.clear();
      if (a.root) frame(a, a.root.children[1] as THREE.Group, "corner");
    }
    applySun(a, fullRef.current, !!walk);
    a.render();
  }, [walk]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(p: Preset) {
    const a = api.current;
    if (!a?.root || walkRef.current) return;
    a.userMoved = true;
    frame(a, a.root.children[1] as THREE.Group, p);
    a.render();
  }

  function openPhoto() {
    const a = api.current;
    if (!a) return;
    const c = a.camera;
    const el = host.current;
    setPhoto({ cam: { pos: c.position.clone(), quat: c.quaternion.clone(), fov: c.fov }, inside: walk ? { floor: walk.floor } : null, aspect: el ? el.clientWidth / Math.max(1, el.clientHeight) : 16 / 9 });
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
            <button className={"ghost3" + (ghost ? " on" : "")} onClick={() => setGhost((v) => !v)} title="Serbest uçuş: duvarlardan geç, bakılan yöne uç (Boşluk yüksel, C / Shift alçal)">
              {ghost ? <>👻 <span className="lg">Serbest uçuş: açık</span><span className="sm">Uçuş: açık</span></> : <>🧱 <span className="lg">Serbest uçuş: kapalı</span><span className="sm">Uçuş: kapalı</span></>}
            </button>
            <button onClick={snapshot}>📷<span className="lg"> Resim indir</span></button>
            <button className="ph" onClick={openPhoto}>📸<span className="lg"> Gerçekçi fotoğraf</span><span className="sm"> Foto</span></button>
          </>
        ) : (
          <>
            <button onClick={() => go("corner")}>Köşe</button>
            <button onClick={() => go("front")}>Ön</button>
            <button onClick={() => go("side")}>Yan</button>
            <button onClick={() => go("top")}>Üst</button>
            <button onClick={snapshot}>📷<span className="lg"> Resim indir</span></button>
            <button className="ph" onClick={openPhoto}>📸<span className="lg"> Gerçekçi fotoğraf</span><span className="sm"> Foto</span></button>
          </>
        )}
        <button className={"hq" + (hq ? " on" : "")} onClick={() => setHq((v) => !v)} title="Gerçekçi gölgelendirme (yavaş cihazda kapat)">
          {hq ? <>✨<span className="lg"> Yüksek kalite</span></> : <>⚡<span className="lg"> Hızlı</span></>}
        </button>
      </div>
      {photo && <Photo full={full} fi={fi} cam={photo.cam} inside={photo.inside} aspect={photo.aspect} name={name} onClose={() => setPhoto(null)} />}
      <div
        ref={handle}
        className="h3handle"
        style={{ display: "none" }}
        title="Tutup yukarı / aşağı çek: duvar yüksekliği"
        onPointerDown={(e) => {
          const t = wallTop();
          const a = api.current;
          if (!t || !a) return;
          e.preventDefault();
          e.stopPropagation();
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          a.controls.enabled = false;
          const y0 = e.clientY;
          const h0 = t.h;
          const pxPerM = Math.max(8, (t.bot.y - t.top.y) / Math.max(0.3, h0));
          onWallHRef.current?.(t.floor, t.id, h0, "start");
          const mv = (ev: PointerEvent) => {
            const nh = Math.max(0.3, Math.min(8, Math.round((h0 + (y0 - ev.clientY) / pxPerM) * 20) / 20));
            onWallHRef.current?.(t.floor, t.id, nh, "move");
          };
          const up = () => {
            window.removeEventListener("pointermove", mv);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            a.controls.enabled = true;
          };
          window.addEventListener("pointermove", mv);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", up);
        }}
      >↕</div>
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
            {ghost && <button {...hold("u")} aria-label="Yüksel">⤒</button>}
            {ghost && <button {...hold("d")} aria-label="Alçal">⤓</button>}
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

function applySun(a: Api, f: FullData, inside = false) {
  applyLookSun(a.look, f.env.sun, a.bounds);
  a.renderer.shadowMap.needsUpdate = true;
  if (a.root) setNight(a.root, inside ? 0 : a.look.night);
  a.lamp.intensity = inside ? 5 + 14 * a.look.night : 0;
  a.renderer.toneMappingExposure = inside ? 1.12 : 0.9;
}

function frame(a: { camera: THREE.PerspectiveCamera; controls: OrbitControls }, house: THREE.Object3D, p: Preset) {
  const box = new THREE.Box3().setFromObject(house);
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 2, 10));
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(3, size.length() / 2);
  const fov = (a.camera.fov * Math.PI) / 180;
  const fit = (r / Math.sin(fov / 2) / Math.min(1, Math.max(0.55, a.camera.aspect))) * (a.camera.aspect < 1 ? 1.0 : 0.95);
  const dir =
    p === "keep"
      ? a.camera.position.clone().sub(a.controls.target)
      : p === "front"
        ? new THREE.Vector3(0, 0.25, 1)
        : p === "side"
          ? new THREE.Vector3(1, 0.25, 0)
          : p === "top"
            ? new THREE.Vector3(0, 1, 0.02)
            : new THREE.Vector3(0.9, 0.52, 1);
  dir.normalize();
  a.controls.target.copy(c);
  a.camera.position.copy(c).addScaledVector(dir, fit);
  a.camera.near = Math.max(0.05, fit / 200);
  a.camera.updateProjectionMatrix();
  a.controls.update();
}
