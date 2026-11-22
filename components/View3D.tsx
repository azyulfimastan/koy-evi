"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FullData } from "@/lib/types";
import { buildHouse, disposeTree, type V3 } from "@/lib/scene3d";

type Preset = "corner" | "front" | "side" | "top" | "keep";

export default function View3D({ full, fi, v3, name }: { full: FullData; fi: number; v3: V3; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sun: THREE.DirectionalLight;
    root: THREE.Group | null;
    render: () => void;
    framed: boolean;
  } | null>(null);
  const viewKey = useRef("");

  // kurulum
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;
    renderer.domElement.className = "v3cv";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dbe8f3");
    scene.fog = new THREE.Fog("#dbe8f3", 90, 300);
    scene.add(new THREE.HemisphereLight("#f2f6ff", "#a89a7c", 1.7));
    scene.add(new THREE.AmbientLight("#ffffff", 0.35));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(18, 14, 18);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 1;
    controls.maxDistance = 250;
    controls.screenSpacePanning = true;

    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    api.current = { renderer, scene, camera, controls, sun, root: null, render, framed: false };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      if (api.current?.root) disposeTree(api.current.root);
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  // sahneyi (yeniden) kur
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (a.root) {
      a.scene.remove(a.root);
      disposeTree(a.root);
    }
    const { house, ground } = buildHouse(full, fi, v3);
    const root = new THREE.Group();
    root.add(ground, house);
    a.scene.add(root);
    a.root = root;
    // gölge kamerasını evi kapsayacak şekilde ayarla
    const box = new THREE.Box3().setFromObject(house);
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 2, 10));
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(6, box.getSize(new THREE.Vector3()).length() / 2);
    a.sun.position.set(c.x - r * 1.2, c.y + r * 2, c.z + r * 0.9);
    a.sun.target.position.copy(c);
    const sc = a.sun.shadow.camera;
    sc.left = sc.bottom = -r * 1.6;
    sc.right = sc.top = r * 1.6;
    sc.near = 0.5;
    sc.far = r * 6;
    sc.updateProjectionMatrix();
    const key = `${v3.floors}|${v3.cut}|${fi}`;
    if (!a.framed) {
      frame(a, house, "corner");
      a.framed = true;
    } else if (key !== viewKey.current) frame(a, house, "keep");
    viewKey.current = key;
    a.render();
  }, [full, fi, v3]);

  function go(p: Preset) {
    const a = api.current;
    if (!a?.root) return;
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
    link.download = (name || "ev").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") + "-3d.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="v3" ref={host}>
      <div className="v3bar">
        <button onClick={() => go("corner")}>Köşe</button>
        <button onClick={() => go("front")}>Ön</button>
        <button onClick={() => go("side")}>Yan</button>
        <button onClick={() => go("top")}>Üst</button>
        <button onClick={snapshot}>📷 Resim indir</button>
      </div>
    </div>
  );
}

function frame(a: { camera: THREE.PerspectiveCamera; controls: OrbitControls }, house: THREE.Object3D, p: Preset) {
  const box = new THREE.Box3().setFromObject(house);
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 2, 10));
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(3, size.length() / 2);
  const fov = (a.camera.fov * Math.PI) / 180;
  const fit = r / Math.sin(fov / 2) / Math.min(1, Math.max(0.55, a.camera.aspect)) * 0.95;
  const dir =
    p === "keep"
      ? a.camera.position.clone().sub(a.controls.target)
      : p === "front" ? new THREE.Vector3(0, 0.25, 1) : p === "side" ? new THREE.Vector3(1, 0.25, 0) : p === "top" ? new THREE.Vector3(0, 1, 0.02) : new THREE.Vector3(0.9, 0.7, 1);
  dir.normalize();
  a.controls.target.copy(c);
  a.camera.position.copy(c).addScaledVector(dir, fit);
  a.camera.near = Math.max(0.05, fit / 200);
  a.camera.updateProjectionMatrix();
  a.controls.update();
}
