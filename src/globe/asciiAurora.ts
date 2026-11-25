import {
  BufferAttribute,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three';
import type { SkyEvent } from '../data/skyEvents';
import { darkness, type LatLng } from '../sky/sun';
import { atlas } from './skySprites';

/**
 * The aurora as a curtain of characters hung all the way round the auroral oval.
 *
 * It stands on the ring like the real thing on its field lines, so the near side passes in front
 * of the far side and the planet hides what is behind it. Its height follows the data: tall where
 * the probability is high and the sky is dark, gone where there is nothing to see. The sheet folds
 * in and out as it runs round the pole, and the folds drift slowly; the print scrolls along it.
 */

const BINS = 120; // azimuth bins round the pole
const SEG_X = 360; // vertices round the ring: enough for the folds to stay smooth
const SEG_Y = 12;
const REPEATS = 7; // the sprite is printed this many times round the ring
const HEIGHT = 0.22; // tallest curtain, as a fraction of the globe radius
const BASE_ALT = 0.014; // just above the heatmap glow it stands on
const TEX_V0 = 0.03; // crop: the sprite's own painted ground band would read as a flat card
const TEX_V1 = 0.84;
const FPS = 4;
const FADE_MS = 260;
const SETTLE = 2.5; // per second: how fast the curtain grows / shrinks to new data
const RAD = Math.PI / 180;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

interface Globeish {
  scene(): Scene;
  getCoords(lat: number, lng: number, alt?: number): { x: number; y: number; z: number };
  getGlobeRadius(): number;
}

export interface AuroraCurtain {
  setData(aurora: SkyEvent[], sun: LatLng): void;
  /** Where the pointer is on the globe; a surge rises from the nearest stretch of curtain. */
  setHover(p: LatLng | null): void;
}

const vert = /* glsl */ `
  attribute float aStrength;
  attribute float aGlow;
  varying vec2 vUv;
  varying float vS;
  varying float vGlow;
  void main() {
    vUv = uv;
    vS = aStrength;
    vGlow = aGlow;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform sampler2D map;
  uniform float uFrames, uFrameA, uFrameB, uMix, uDrift, uRepeats, uV0, uV1;
  varying vec2 vUv;
  varying float vS;
  varying float vGlow;
  vec4 at(float k, vec2 g, vec2 dx, vec2 dy) {
    float ty = mix(uV0, uV1, vUv.y);
    vec2 c = vec2(fract(g.x), 1.0 - (k + 1.0 - ty) / uFrames);
    return textureGrad(map, c, dx, dy); // explicit gradients: no mip seam where the print repeats
  }
  void main() {
    vec2 g = vec2(vUv.x * uRepeats + uDrift, mix(uV0, uV1, vUv.y) / uFrames);
    vec2 dx = dFdx(g), dy = dFdy(g);
    vec4 c = mix(at(uFrameA, g, dx, dy), at(uFrameB, g, dx, dy), uMix);
    float a = c.a
      * smoothstep(0.03, 0.25, vS)                 // fades out where there is no aurora
      * smoothstep(0.0, 0.08, vUv.y)               // soft foot where it meets the glow
      * (1.0 - smoothstep(0.55, 1.0, vUv.y));      // and no hard top edge: it thins into the sky
    a = min(1.0, a * (1.0 + vGlow * 0.9));
    if (a < 0.004) discard;
    gl_FragColor = vec4(c.rgb * (1.0 + vGlow * 0.35), a); // printed inks; the surge burns a touch brighter
  }
`;

export function createAuroraCurtain(globe: Globeish, northPole: Vector3): AuroraCurtain {
  const R = globe.getGlobeRadius();
  const geo = new PlaneGeometry(1, 1, SEG_X, SEG_Y);
  const pos = geo.getAttribute('position') as BufferAttribute;
  const uv = geo.getAttribute('uv') as BufferAttribute;
  const strengthAttr = new BufferAttribute(new Float32Array(pos.count), 1);
  geo.setAttribute('aStrength', strengthAttr);
  const glowAttr = new BufferAttribute(new Float32Array(pos.count), 1);
  geo.setAttribute('aGlow', glowAttr);

  const mat = new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      map: { value: null },
      uFrames: { value: 1 },
      uFrameA: { value: 0 },
      uFrameB: { value: 0 },
      uMix: { value: 1 },
      uDrift: { value: 0 },
      uRepeats: { value: REPEATS },
      uV0: { value: TEX_V0 },
      uV1: { value: TEX_V1 },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  mesh.raycast = () => {}; // clicks go through to the heatmap pick underneath
  globe.scene().add(mesh);

  // ring frame round the pole in use (north or south, whichever hemisphere has the aurora)
  const pole = northPole.clone();
  const A = new Vector3();
  const B = new Vector3();
  const frameFor = (p: Vector3) => {
    A.set(0, 1, 0).cross(p);
    if (A.lengthSq() < 1e-6) A.set(1, 0, 0);
    A.normalize();
    B.copy(p).cross(A);
  };
  frameFor(pole);

  const target = new Float32Array(BINS);
  const cur = new Float32Array(BINS);
  let radiusTarget = 22 * RAD;
  let radius = radiusTarget;
  let hasData = false;
  // hover: azimuth of the surge, and how far it has risen (critically damped)
  let hoverAz = 0;
  let hoverOn = false;
  const surge = { x: 0, v: 0 };

  // ---------------------------------------------------------------- data -> per-azimuth strength
  const dir = new Vector3();
  const setData = (aurora: SkyEvent[], sun: LatLng) => {
    // pick the hemisphere with more visible aurora
    let north = 0;
    let south = 0;
    const lit = aurora.map((e) => {
      const w = (e.intensity / 100) * darkness(e, sun);
      if (e.lat >= 0) north += w;
      else south += w;
      return w;
    });
    const want = north >= south ? 1 : -1;
    if (Math.sign(pole.dot(northPole)) !== want) {
      pole.copy(northPole).multiplyScalar(want);
      frameFor(pole);
      cur.fill(0); // a hemisphere switch fades the new curtain up rather than morphing across
    }

    target.fill(0);
    let wSum = 0;
    let angSum = 0;
    aurora.forEach((e, i) => {
      const w = lit[i];
      if (w <= 0 || Math.sign(e.lat || 1) !== want) return;
      const c = globe.getCoords(e.lat, e.lng);
      dir.set(c.x, c.y, c.z).normalize();
      const az = Math.atan2(dir.dot(B), dir.dot(A));
      const bin = ((Math.floor(((az / (2 * Math.PI)) + 1) * BINS) % BINS) + BINS) % BINS;
      if (w > target[bin]) target[bin] = w;
      wSum += w;
      angSum += w * Math.acos(Math.max(-1, Math.min(1, dir.dot(pole))));
    });
    if (wSum > 0) radiusTarget = angSum / wSum;

    // blur round the ring so the curtain is one continuous sheet, not a picket fence
    const tmp = new Float32Array(BINS);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < BINS; i++)
        tmp[i] = 0.25 * target[(i + BINS - 1) % BINS] + 0.5 * target[i] + 0.25 * target[(i + 1) % BINS];
      target.set(tmp);
    }
    // weak nights stay short: normalise against a floor, not just the brightest bin
    let max = 0;
    for (let i = 0; i < BINS; i++) max = Math.max(max, target[i]);
    const norm = Math.max(max, 0.45);
    for (let i = 0; i < BINS; i++) target[i] /= norm;

    if (!hasData) radius = radiusTarget;
    hasData = true;
    wake();
  };

  const sample = (arr: Float32Array, u: number) => {
    const x = u * BINS - 0.5;
    const i0 = Math.floor(x);
    const f = x - i0;
    const a = arr[((i0 % BINS) + BINS) % BINS];
    const b = arr[(((i0 + 1) % BINS) + BINS) % BINS];
    return a + (b - a) * (f * f * (3 - 2 * f));
  };

  // ---------------------------------------------------------------- per-frame layout
  const base = new Vector3();
  const out = new Vector3();
  const layout = (time: number) => {
    const t = reduced.matches ? 0 : time;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i); // 0 at the foot, 1 at the top
      const az = u * 2 * Math.PI;
      const s = sample(cur, u);
      // folds: the sheet meanders in and out of the ring, and the folds drift round the pole
      const fold =
        0.022 * Math.sin(az * 5 + t * 0.22) + 0.011 * Math.sin(az * 13 - t * 0.37) + 0.005 * Math.sin(az * 29 + t * 0.6);
      const r = radius + fold * (0.6 + 0.4 * v); // tops sway a touch more than feet
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      base
        .copy(pole)
        .multiplyScalar(Math.cos(r))
        .addScaledVector(A, ca * Math.sin(r))
        .addScaledVector(B, sa * Math.sin(r));
      const ripple = 1 + 0.07 * Math.sin(az * 9 + t * 0.7);
      // the surge: a swell under the pointer with rings of ripple running out along the curtain
      const d = Math.atan2(Math.sin(az - hoverAz), Math.cos(az - hoverAz));
      const g = surge.x * Math.exp(-(d * d) / 0.18);
      const wave = surge.x * Math.exp(-(d * d) / 0.9) * Math.sin(Math.abs(d) * 16 - time * 6) * 0.08;
      const h = HEIGHT * R * (0.2 + 0.8 * Math.pow(s, 0.7)) * v * (ripple + g * 0.75 + wave);
      glowAttr.setX(i, g);
      // straight up from the ground, the way field lines stand at high latitude
      out.copy(base).multiplyScalar(R * (1 + BASE_ALT) + h);
      pos.setXYZ(i, out.x, out.y, out.z);
      strengthAttr.setX(i, s);
    }
    pos.needsUpdate = true;
    strengthAttr.needsUpdate = true;
    glowAttr.needsUpdate = true;
  };

  // ---------------------------------------------------------------- loop
  let raf = 0;
  let last = 0;
  let acc = 0;
  let frame = 0;
  let fadeT = 1;
  let frames = 1;
  let ready = false;
  const tick = (now: number) => {
    raf = 0;
    if (document.hidden) return void (last = 0);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;

    const k = reduced.matches ? 1 : 1 - Math.exp(-SETTLE * dt);
    let any = 0;
    for (let i = 0; i < BINS; i++) {
      cur[i] += (target[i] - cur[i]) * k;
      any = Math.max(any, cur[i]);
    }
    radius += (radiusTarget - radius) * k;
    // hover surge: critically damped, so it swells quickly and sinks back without wobbling
    {
      const to = hoverOn ? 1 : 0;
      if (reduced.matches) surge.x = to;
      else {
        const w = 9;
        const e = Math.exp(-w * dt);
        const d0 = surge.x - to;
        const nx = to + (d0 + (surge.v + w * d0) * dt) * e;
        surge.v = (surge.v - w * (surge.v + w * d0) * dt) * e;
        surge.x = nx;
      }
    }
    mesh.visible = ready && any > 0.02;
    if (mesh.visible) layout(now / 1000);

    if (!reduced.matches) {
      mat.uniforms.uDrift.value += dt * 0.006; // the print creeps along the curtain
      acc += dt * 1000;
      if (frames > 1 && acc >= 1000 / FPS) {
        acc %= 1000 / FPS;
        mat.uniforms.uFrameA.value = frame;
        frame = (frame + 1) % frames;
        mat.uniforms.uFrameB.value = frame;
        fadeT = 0;
      }
      if (fadeT < 1) {
        fadeT = Math.min(fadeT + (dt * 1000) / FADE_MS, 1);
        mat.uniforms.uMix.value = fadeT * fadeT * (3 - 2 * fadeT);
      }
    }
    raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', wake);

  void atlas('aurora').then((a) => {
    mat.uniforms.map.value = a.tex;
    frames = a.def.frames.length;
    mat.uniforms.uFrames.value = frames;
    ready = true;
    wake();
  });

  const setHover = (p: LatLng | null) => {
    if (!p) {
      hoverOn = false;
      return;
    }
    const c = globe.getCoords(p.lat, p.lng);
    dir.set(c.x, c.y, c.z).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, dir.dot(pole))));
    // only near the ring, and only where there is curtain to surge
    const az = Math.atan2(dir.dot(B), dir.dot(A));
    const near = Math.abs(ang - radius) < 9 * RAD && sample(cur, ((az / (2 * Math.PI)) + 1) % 1) > 0.05;
    if (near) {
      if (!hoverOn || surge.x < 0.05) hoverAz = az;
      else hoverAz += Math.atan2(Math.sin(az - hoverAz), Math.cos(az - hoverAz)) * 0.35; // follows the pointer softly
    }
    hoverOn = near;
  };
  return { setData, setHover };
}
