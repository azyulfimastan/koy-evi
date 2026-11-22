import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Sun } from "./types";
import { sunDir } from "./env";

/**
 * Ortak "görünüm" katmanı: fiziksel gökyüzü (bulutlu), gökyüzünden ortam ışığı (IBL),
 * yumuşak gölgeli güneş, ortam gölgesi (AO) ve kenar yumuşatma.
 * Hem 3B görünüm hem de PDF görüntüleri bunu kullanır.
 */
export type Look = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  envScene: THREE.Scene;
  envSky: Sky;
  envGround: THREE.Mesh;
  pm: THREE.PMREMGenerator;
  envRT: THREE.WebGLRenderTarget | null;
  composer: EffectComposer | null;
  ao: GTAOPass | null;
  night: number; // 0 gündüz … 1 gece
};

export function makeSky() {
  const sky = new Sky();
  const m = sky.material as THREE.ShaderMaterial;
  m.uniforms.skyGain = { value: 1 };
  m.fragmentShader = "uniform float skyGain;\n" + m.fragmentShader.replace("gl_FragColor = vec4( texColor, 1.0 );", "gl_FragColor = vec4( texColor * skyGain, 1.0 );");
  m.uniforms.turbidity.value = 2.4;
  m.uniforms.rayleigh.value = 2.4;
  m.uniforms.mieCoefficient.value = 0.004;
  m.uniforms.mieDirectionalG.value = 0.82;
  if (m.uniforms.cloudCoverage) {
    m.uniforms.cloudCoverage.value = 0.32;
    m.uniforms.cloudDensity.value = 0.45;
    m.uniforms.cloudElevation.value = 0.55;
    m.uniforms.cloudScale.value = 0.00025;
  }
  sky.scale.setScalar(900);
  sky.frustumCulled = false;
  return sky;
}

export function setupLook(renderer: THREE.WebGLRenderer, scene: THREE.Scene, opt: { shadow: number; composer: boolean; msaa: number }): Look {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const sky = makeSky();
  sky.renderOrder = -10;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight("#fff4e6", "#cfc4b2", 0.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff1dc", 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opt.shadow, opt.shadow);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // ortam ışığı sahnesi: gökyüzü + toprak rengi alt yarım küre
  const envScene = new THREE.Scene();
  const envSky = makeSky();
  (envSky.material as THREE.ShaderMaterial).uniforms.showSunDisc.value = 0; // güneşi ayrı ışık veriyor
  envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(800, 32), new THREE.MeshBasicMaterial({ color: "#5d6b45" }));
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -2;
  envScene.add(envGround);
  const pm = new THREE.PMREMGenerator(renderer);

  let composer: EffectComposer | null = null;
  let ao: GTAOPass | null = null;
  if (opt.composer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: opt.msaa });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, new THREE.PerspectiveCamera()));
    ao = new GTAOPass(scene, new THREE.PerspectiveCamera(), Math.max(1, size.x), Math.max(1, size.y));
    ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 1;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
  }
  return { renderer, scene, sky, sun, hemi, envScene, envSky, envGround, pm, envRT: null, composer, ao, night: 0 };
}

/** Kamera değişince composer geçişlerini o kameraya bağla */
export function setLookCamera(l: Look, cam: THREE.Camera) {
  if (!l.composer) return;
  for (const p of l.composer.passes) {
    const q = p as unknown as { camera?: THREE.Camera };
    if ("camera" in q) q.camera = cam;
  }
}

export function resizeLook(l: Look, w: number, h: number, dpr: number) {
  if (!l.composer) return;
  l.composer.setPixelRatio(dpr);
  l.composer.setSize(w, h);
}

export function renderLook(l: Look, cam: THREE.Camera, hq: boolean) {
  if (hq && l.composer) {
    setLookCamera(l, cam);
    l.composer.render();
  } else l.renderer.render(l.scene, cam);
}

/** Kesit görünümünde AO da aynı düzlemle kırpılsın */
export function setLookClip(l: Look, planes: THREE.Plane[]) {
  if (!l.ao) return;
  const nm = (l.ao as unknown as { normalMaterial: THREE.Material }).normalMaterial;
  nm.clippingPlanes = planes;
  nm.needsUpdate = true;
}

const tmp = new THREE.Color();
/** Güneş konumu, gökyüzü, ortam ışığı ve sis rengini ayarla */
export function applyLookSun(l: Look, s: Sun, bounds: THREE.Box3) {
  const d = sunDir(s);
  const alt = d.alt;
  const day = alt > -2;
  const c = bounds.getCenter(new THREE.Vector3());
  const R = Math.max(8, bounds.getSize(new THREE.Vector3()).length() / 2);
  const up = Math.max(0.1, d.y);
  l.sun.position.set(c.x + d.x * R * 3, Math.max(2, c.y + up * R * 3), c.z + d.z * R * 3);
  l.sun.target.position.copy(c);
  const sc = l.sun.shadow.camera;
  sc.left = sc.bottom = -R * 1.25;
  sc.right = sc.top = R * 1.25;
  sc.near = 0.5;
  sc.far = R * 9;
  sc.updateProjectionMatrix();
  const k = Math.max(0, Math.min(1, alt / 25)); // 0 ufuk … 1 yüksek güneş
  const dusk = Math.max(0, Math.min(1, (alt + 6) / 10));
  l.night = 1 - dusk;
  l.sun.intensity = alt > 0 ? 0.8 + 2.2 * k : 0;
  l.sun.color.set("#ff8f4a").lerp(tmp.set("#fff3e2"), k);
  l.sun.castShadow = s.shadows && alt > 0;
  // gökyüzü güneşi: ufkun altına inse de yönünü koru
  const m = l.sky.material as THREE.ShaderMaterial;
  m.uniforms.sunPosition.value.set(d.x, d.y, d.z).normalize();
  m.uniforms.skyGain.value = 0.55;
  const em = l.envSky.material as THREE.ShaderMaterial;
  em.uniforms.sunPosition.value.set(d.x, d.y, d.z).normalize();
  em.uniforms.skyGain.value = 0.4;
  // gece mavi ışık
  l.hemi.intensity = day ? 0.7 + 0.5 * k : 0.25;
  l.hemi.color.set(day ? "#fff4e6" : "#3a4a6a");
  // ortam ışığını gökyüzünden yeniden üret
  (l.envGround.material as THREE.MeshBasicMaterial).color.set("#b4aa96").multiplyScalar(0.15 + 0.6 * dusk);
  const old = l.envRT;
  l.envRT = l.pm.fromScene(l.envScene, 0.035, 0.1, 2000);
  old?.dispose();
  l.scene.environment = l.envRT.texture;
  l.scene.environmentIntensity = 0.06 + 0.12 * dusk;
  // sis: ufuk rengine yakın
  const fog = l.scene.fog as THREE.Fog | null;
  if (fog) {
    const horizon = tmp.set("#0e1524").lerp(new THREE.Color("#e9a271"), dusk).lerp(new THREE.Color("#cfdbe6"), Math.max(0, Math.min(1, (alt - 3) / 15)));
    fog.color.copy(horizon);
  }
}

export function disposeLook(l: Look) {
  l.envRT?.dispose();
  l.pm.dispose();
  l.composer?.dispose();
  l.ao?.dispose();
}
