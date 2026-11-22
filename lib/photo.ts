import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import type { FullData } from "./types";
import { buildHouse, disposeTree, floorBases, setNight } from "./scene3d";
import { makeSky } from "./look";
import { sunDir } from "./env";

/**
 * Fotoğraf gerçekliğinde resim: ışın izleme (path tracing).
 * Işık her yüzeyden sekerek hesaplanır; resim örnek sayısı arttıkça netleşir.
 */
export type PhotoCam = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number };
export type PhotoOpts = {
  full: FullData;
  fi: number;
  cam: PhotoCam;
  inside: { floor: number } | null;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  denoise: boolean;
};
export type PhotoJob = {
  samples: () => number;
  ready: () => boolean;
  step: () => void;
  setDenoise: (on: boolean) => void;
  dispose: () => void;
  msPerSample: () => number;
};

/** Küp dokuyu (gökyüzü) eşdikdörtgen (equirect) veri dokusuna çevir — ışın izleyici CPU verisi ister */
function cubeToEquirect(renderer: THREE.WebGLRenderer, cube: THREE.Texture, w = 1024, h = 512) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const mat = new THREE.ShaderMaterial({
    uniforms: { env: { value: cube } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: [
      "uniform samplerCube env; varying vec2 vUv;",
      "void main(){",
      "  float phi = (vUv.x - 0.5) * 6.283185307179586;",
      "  float lat = (vUv.y - 0.5) * 3.141592653589793;",
      "  vec3 dir = vec3(cos(lat) * cos(phi), sin(lat), cos(lat) * sin(phi));",
      "  gl_FragColor = vec4(textureCube(env, dir).rgb, 1.0);",
      "}",
    ].join("\n"),
    depthTest: false,
    depthWrite: false,
  });
  const q = new FullScreenQuad(mat);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  q.render(renderer);
  const data = new Float32Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, data);
  renderer.setRenderTarget(prev);
  q.dispose();
  mat.dispose();
  rt.dispose();
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export async function startPhoto(o: PhotoOpts): Promise<PhotoJob> {
  const { WebGLPathTracer, DenoiseMaterial } = await import("three-gpu-pathtracer");
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: false, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(o.width, o.height, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = o.inside ? 1.15 : 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const f = o.full;
  const s = f.env.sun;
  const d = sunDir(s);
  const scene = new THREE.Scene();

  // ev + çevre (kesit yok: ışın izleyici kırpma desteklemiyor)
  const b = buildHouse(f, Math.max(0, f.floors.length - 1), { floors: "all", roof: !o.inside, items: true, sec: "none" });
  const night = Math.max(0, Math.min(1, 1 - (d.alt + 6) / 10));
  setNight(b.house, o.inside ? 0 : night);
  scene.add(b.ground, b.house, b.env);

  // cam: gerçek geçirgen cam
  const glass = new THREE.MeshPhysicalMaterial({ color: "#eaf4f8", roughness: 0.02, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.006 });
  scene.traverse((ob) => {
    const m = ob as THREE.Mesh;
    if (!m.isMesh) return;
    const mt = m.material as THREE.MeshStandardMaterial;
    if (mt && !Array.isArray(mt) && mt.transparent && mt.opacity < 0.9 && !(mt.emissiveIntensity > 0.1)) m.material = glass;
    // ışın izleyici RGBA köşe rengi bekler
    const col = m.geometry.attributes.color;
    if (col && col.itemSize === 3) {
      const n = col.count;
      const arr = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        arr[i * 4] = col.getX(i);
        arr[i * 4 + 1] = col.getY(i);
        arr[i * 4 + 2] = col.getZ(i);
        arr[i * 4 + 3] = 1;
      }
      m.geometry.setAttribute("color", new THREE.BufferAttribute(arr, 4));
    }
    // ışın izleyicide kırpma düzlemi yok
    if (mt && !Array.isArray(mt) && mt.clippingPlanes?.length) mt.clippingPlanes = [];
  });

  // güneş
  const sun = new THREE.DirectionalLight("#fff1dc", 0);
  if (d.alt > 0) {
    const k = Math.max(0, Math.min(1, d.alt / 25));
    sun.intensity = 1.6 + 2.6 * k;
    sun.color.set("#ff9a55").lerp(new THREE.Color("#fff3e2"), k);
  }
  sun.position.set(d.x, Math.max(0.05, d.y), d.z).multiplyScalar(100);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  // iç mekânda tavan lambası
  if (o.inside) {
    const bases = floorBases(f);
    const fl = f.floors[o.inside.floor];
    const lamp = new THREE.PointLight("#ffe2b8", 6 + 30 * night, 0, 2);
    lamp.position.set(o.cam.pos.x, (bases[o.inside.floor] ?? 0) + (fl?.height ?? 2.8) - 0.3, o.cam.pos.z);
    scene.add(lamp);
  }

  // gökyüzü → küp doku (arka plan + çevre ışığı)
  const skyScene = new THREE.Scene();
  const sky = makeSky();
  const sm = sky.material as THREE.ShaderMaterial;
  sm.uniforms.sunPosition.value.set(d.x, d.y, d.z).normalize();
  sm.uniforms.showSunDisc.value = 0;
  sm.uniforms.skyGain.value = 1;
  skyScene.add(sky);
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(1, 2000, cubeRT);
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  cubeCam.update(renderer, skyScene);
  renderer.toneMapping = tm;
  const eq = cubeToEquirect(renderer, cubeRT.texture);
  cubeRT.dispose();
  sky.geometry.dispose();
  sm.dispose();
  scene.background = eq;
  scene.environment = eq;
  scene.backgroundIntensity = 0.5;
  scene.environmentIntensity = o.inside ? 0.3 : 0.16;

  const cam = new THREE.PerspectiveCamera(o.cam.fov, o.width / o.height, 0.05, 3000);
  cam.position.copy(o.cam.pos);
  cam.quaternion.copy(o.cam.quat);
  cam.updateMatrixWorld();

  const pt = new WebGLPathTracer(renderer);
  pt.renderDelay = 0;
  pt.minSamples = 1;
  pt.fadeDuration = 0;
  pt.bounces = o.inside ? 6 : 5;
  pt.transmissiveBounces = 8;
  pt.filterGlossyFactor = 0.5;
  pt.renderScale = 1;
  pt.textureSize.set(1024, 1024);
  const coarse = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  pt.tiles.set(coarse ? 3 : 2, coarse ? 3 : 2);
  pt.rasterizeScene = true;

  // gürültü azaltma
  const dq = new FullScreenQuad(new DenoiseMaterial({ blending: THREE.CustomBlending, premultipliedAlpha: renderer.getContextAttributes().premultipliedAlpha }));
  let denoise = o.denoise;
  pt.renderToCanvasCallback = (target: THREE.WebGLRenderTarget, r: THREE.WebGLRenderer, quad: FullScreenQuad) => {
    if (!denoise) {
      const ac = r.autoClear;
      r.autoClear = false;
      quad.render(r);
      r.autoClear = ac;
      return;
    }
    const m = dq.material as THREE.ShaderMaterial & { map: THREE.Texture | null; sigma: number; threshold: number; kSigma: number; opacity: number };
    const n = pt.samples;
    m.sigma = n < 32 ? 6 : n < 128 ? 4.5 : 3;
    m.threshold = n < 32 ? 0.12 : n < 128 ? 0.05 : 0.025;
    m.kSigma = 1;
    m.opacity = (quad.material as THREE.ShaderMaterial).opacity;
    m.map = target.texture;
    const ac = r.autoClear;
    r.autoClear = false;
    dq.render(r);
    r.autoClear = ac;
  };

  pt.setScene(scene, cam);

  let last = 0;
  let avg = 0;
  return {
    samples: () => pt.samples,
    ready: () => !(pt as unknown as { isCompiling: boolean }).isCompiling && pt.samples > 0,
    step: () => {
      const t = performance.now();
      pt.renderSample();
      if (last) {
        const dt = t - last;
        avg = avg ? avg * 0.9 + dt * 0.1 : dt;
      }
      last = t;
    },
    setDenoise: (on) => {
      denoise = on;
    },
    msPerSample: () => {
      const tiles = pt.tiles.x * pt.tiles.y;
      return avg * tiles;
    },
    dispose: () => {
      pt.dispose();
      dq.dispose();
      eq.dispose();
      disposeTree(scene);
      glass.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
