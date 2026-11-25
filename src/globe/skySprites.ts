import {
  BufferAttribute,
  CanvasTexture,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three';
import type { TapestryKind } from '../ui/tapestry';

/**
 * The tapestry sprites printed onto the globe itself instead of floating over it.
 * Each sprite is a curved sheet in the 3D scene, so it bends with the planet, shrinks with
 * distance and slips behind the limb like everything else.
 *
 *   curtain  the aurora: a sheet standing on a circle round the geomagnetic pole, swaying slowly
 *   shell    fireballs / ISS: a patch laid over the sphere, hugging its curvature
 *
 * Motion: frames cross-fade, sprites glide to new spots, fireballs arrive head first with the tail
 * drawing out behind, and selection grows a sprite on a damped curve. Reduced motion keeps fades only.
 */

interface Frame {
  glyph: string[];
  fg: string[];
  bg: string[];
}
interface SpriteDef {
  cols: number;
  rows: number;
  frames: Frame[];
}

const INK: Record<string, string> = {
  g: '--ink-ground',
  t: '--ink-type',
  p: '--ink-planet',
  s: '--ink-planet-shade',
  a: '--ink-aurora',
  f: '--ink-fire',
};

const CELL_PX = 8; // texture pixels per cell: enough for the glyphs to survive a close look
const FPS = 4; // the sprites drift, they don't flicker
const FADE_MS = 220; // frame cross-fade
const REVEAL_MS = 700; // a fireball's arrival
const GLIDE = 5; // per second, position/heading approach
const GROW = 9; // per second, selection scale approach
const OPACITY_RATE = 8; // per second
const Y = new Vector3(0, 1, 0);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- atlas: every frame, stacked

interface Atlas {
  tex: CanvasTexture;
  def: SpriteDef;
}
let sheet: Promise<Record<TapestryKind, SpriteDef>> | null = null;
const atlases = new Map<TapestryKind, Promise<Atlas>>();

function atlas(kind: TapestryKind): Promise<Atlas> {
  let a = atlases.get(kind);
  if (a) return a;
  sheet ??= fetch('/sprites/tapestry.json')
    .then((r) => r.json())
    .then((j: { sprites: Record<TapestryKind, SpriteDef> }) => j.sprites);
  a = Promise.all([sheet, document.fonts.load(`500 ${CELL_PX}px "DM Mono"`).catch(() => [])]).then(([s]) => {
    const def = s[kind];
    const canvas = document.createElement('canvas');
    canvas.width = def.cols * CELL_PX;
    canvas.height = def.rows * CELL_PX * def.frames.length;
    const ctx = canvas.getContext('2d')!;
    const tex = new CanvasTexture(canvas);
    tex.magFilter = NearestFilter; // keep the cells crisp, like the print
    tex.minFilter = LinearMipmapLinearFilter; // but don't sparkle when small
    tex.anisotropy = 4;

    const paint = () => {
      const css = getComputedStyle(document.documentElement);
      const ink: Record<string, string> = {};
      for (const k in INK) ink[k] = css.getPropertyValue(INK[k]).trim();
      // On the page the fireball's tail is printed in the planet inks against navy; over the black
      // night side those vanish, so on the globe the tail is printed in fire, thinning to nothing.
      const alpha: Record<string, number> = {};
      if (kind === 'fireball') {
        ink.p = ink.f;
        ink.s = ink.f;
        alpha.p = 0.75;
        alpha.s = 0.38;
      }
      const c = CELL_PX;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `500 ${c}px "DM Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      def.frames.forEach((f, k) => {
        const y0 = k * def.rows * c;
        for (let y = 0; y < def.rows; y++)
          for (let x = 0; x < def.cols; x++) {
            const b = f.bg[y]?.[x];
            if (!b || b === '.') continue;
            ctx.fillStyle = ink[b];
            ctx.globalAlpha = alpha[b] ?? 1;
            ctx.fillRect(x * c, y0 + y * c, c, c);
          }
        ctx.globalAlpha = 1;
        for (let y = 0; y < def.rows; y++)
          for (let x = 0; x < def.cols; x++) {
            const ch = f.glyph[y]?.[x];
            const fg = f.fg[y]?.[x];
            if (!ch || ch === ' ' || !fg || fg === '.') continue;
            ctx.fillStyle = ink[fg];
            ctx.fillText(ch, (x + 0.5) * c, y0 + (y + 0.55) * c);
          }
      });
      tex.needsUpdate = true;
    };
    paint();
    // the inks follow the sun: reprint when the phase changes
    new MutationObserver(paint).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-phase'],
    });
    return { tex, def };
  });
  atlases.set(kind, a);
  return a;
}

// ---------------------------------------------------------------- material

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform sampler2D map;
  uniform float uFrames, uFrameA, uFrameB, uMix, uOpacity, uReveal;
  varying vec2 vUv;
  vec4 frameAt(float k) {
    return texture2D(map, vec2(vUv.x, 1.0 - (k + 1.0 - vUv.y) / uFrames));
  }
  void main() {
    vec4 c = mix(frameAt(uFrameA), frameAt(uFrameB), uMix);
    // arrival: the head (right) shows first, the tail draws out to the left behind it
    float edge = 1.0 - uReveal * 1.12;
    float m = smoothstep(edge, edge + 0.12, vUv.x);
    float a = c.a * m * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(c.rgb, a); // poster inks as printed: no lighting, no tone mapping
  }
`;

// ---------------------------------------------------------------- sprites

export type Layout =
  | {
      type: 'curtain';
      pole: Vector3; // unit vector the curtain wraps around
      spanDeg: number; // arc covered by the sprite's width
      height: number; // fraction of the globe radius covered by its height
      tiltDeg: number; // lean away from the pole so it reads from above as well as side-on
      alt: number; // anchor altitude, fraction of the globe radius
    }
  | {
      type: 'shell';
      widthDeg: number; // arc covered by the sprite's width; height follows the sprite's aspect
      alt: number;
      lift?: number; // extra altitude toward the left edge (a streak's tail rising into the sky)
    };

export interface Placement {
  lat: number;
  lng: number;
  /** direction of the sprite's +x axis, degrees clockwise from north (shell only) */
  heading?: number;
}

export interface SkySprite {
  /** null fades it out (and, if it was made with `disposable`, removes it once gone) */
  setPlace(p: Placement | null): void;
  setOpacity(a: number): void;
  setScale(s: number): void;
}

interface Globeish {
  scene(): Scene;
  getCoords(lat: number, lng: number, alt?: number): { x: number; y: number; z: number };
  getGlobeRadius(): number;
}

interface Live {
  update(dt: number, t: number): boolean;
}
const live = new Set<Live>();
let raf = 0;
let last = 0;
const loop = (now: number) => {
  raf = 0;
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
  last = now;
  for (const s of live) if (!s.update(dt, now / 1000)) live.delete(s);
  if (live.size) raf = requestAnimationFrame(loop);
  else last = 0;
};
const wake = (s: Live) => {
  live.add(s);
  if (!raf) raf = requestAnimationFrame(loop);
};
document.addEventListener('visibilitychange', () => (last = 0));

const approach = (rate: number, dt: number) => (reduced.matches ? 1 : 1 - Math.exp(-rate * dt));

export function createSkySprite(
  globe: Globeish,
  kind: TapestryKind,
  anchor: [number, number],
  layout: Layout,
  { reveal = false, disposable = false } = {},
): SkySprite {
  const R = globe.getGlobeRadius();
  const segX = layout.type === 'curtain' ? 48 : 16;
  const segY = layout.type === 'curtain' ? 6 : 6;
  const geo = new PlaneGeometry(1, 1, segX, segY);
  const pos = geo.getAttribute('position') as BufferAttribute;
  const uv = geo.getAttribute('uv') as BufferAttribute;
  const mat = new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      map: { value: null },
      uFrames: { value: 1 },
      uFrameA: { value: 0 },
      uFrameB: { value: 0 },
      uMix: { value: 1 },
      uOpacity: { value: 0 },
      uReveal: { value: reveal && !reduced.matches ? 0 : 1 },
    },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  mesh.raycast = () => {}; // decoration: clicks go to the globe's own hit targets underneath
  globe.scene().add(mesh);

  let def: SpriteDef | null = null;
  const cur = new Vector3();
  const target = new Vector3();
  let heading = 0;
  let headingTarget = 0;
  let scale = 1;
  let scaleTarget = 1;
  let opacity = 0;
  let base = 1;
  let wanted = false;
  let placed = false;
  let revealT = reveal && !reduced.matches ? 0 : 1;
  let frame = Math.floor(Math.random() * 4);
  let acc = Math.random() * (1000 / FPS); // so a field of fireballs doesn't flip frames in unison
  let fadeT = 1;
  let dirty = true;

  // scratch
  const t0 = new Vector3();
  const east = new Vector3();
  const north = new Vector3();
  const fwd = new Vector3();
  const left = new Vector3();
  const b = new Vector3();
  const o = new Vector3();
  const axial = new Vector3();
  const radial = new Vector3();
  const tangent = new Vector3();
  const lean = new Vector3();

  const layoutVerts = (time: number) => {
    if (!def) return;
    const [ax, ay] = anchor;
    if (layout.type === 'curtain') {
      const span = ((layout.spanDeg * Math.PI) / 180) * scale;
      const tilt = (layout.tiltDeg * Math.PI) / 180;
      const H = layout.height * R * scale;
      // wrap round whichever pole is nearer, so a southern curtain leans toward the equator too
      const p = cur.dot(layout.pole) < 0 ? t0.copy(layout.pole).negate().clone() : layout.pole;
      axial.copy(p).multiplyScalar(cur.dot(p));
      radial.copy(cur).sub(axial);
      tangent.copy(p).cross(radial);
      const still = reduced.matches;
      for (let i = 0; i < pos.count; i++) {
        const u = uv.getX(i);
        const v = 1 - uv.getY(i);
        // a slow sway along the curtain, strongest at the top, like light on a breeze
        const sway = still ? 0 : Math.sin(u * 7 + time * 0.55) * 0.012 * (ay - v + 0.2);
        const th = (u - ax) * span + sway;
        b.copy(axial).addScaledVector(radial, Math.cos(th)).addScaledVector(tangent, Math.sin(th)).normalize();
        lean.copy(b).multiplyScalar(b.dot(p)).sub(p).normalize(); // equatorward along the surface
        t0.copy(b).multiplyScalar(Math.cos(tilt)).addScaledVector(lean, Math.sin(tilt));
        const breathe = still ? 1 : 1 + 0.05 * Math.sin(time * 0.8 + u * 3);
        o.copy(b).multiplyScalar(R * (1 + layout.alt)).addScaledVector(t0, (ay - v) * H * breathe);
        pos.setXYZ(i, o.x, o.y, o.z);
      }
    } else {
      const w = ((layout.widthDeg * Math.PI) / 180) * scale;
      const h = w * (def.rows / def.cols);
      east.copy(Y).cross(cur);
      if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
      east.normalize();
      north.copy(cur).cross(east);
      const hr = (heading * Math.PI) / 180;
      fwd.copy(north).multiplyScalar(Math.cos(hr)).addScaledVector(east, Math.sin(hr));
      left.copy(cur).cross(fwd);
      for (let i = 0; i < pos.count; i++) {
        const u = uv.getX(i);
        const v = 1 - uv.getY(i);
        // gnomonic step over the sphere: the patch hugs the curvature instead of lying flat on it
        b.copy(cur)
          .addScaledVector(fwd, Math.tan((u - ax) * w))
          .addScaledVector(left, -Math.tan((v - ay) * h))
          .normalize();
        const lift = layout.lift ? Math.max(ax - u, 0) * layout.lift * scale : 0;
        o.copy(b).multiplyScalar(R * (1 + layout.alt + lift));
        pos.setXYZ(i, o.x, o.y, o.z);
      }
    }
    pos.needsUpdate = true;
  };

  const self: Live = {
    update(dt, time) {
      if (!def) return true;
      let moved = dirty;
      dirty = false;
      if (cur.distanceToSquared(target) > 1e-12) {
        cur.lerp(target, approach(GLIDE, dt)).normalize();
        moved = true;
      }
      const dh = ((((headingTarget - heading) % 360) + 540) % 360) - 180;
      if (Math.abs(dh) > 0.01) {
        heading += dh * approach(GLIDE, dt);
        moved = true;
      }
      if (Math.abs(scaleTarget - scale) > 0.0005) {
        scale += (scaleTarget - scale) * approach(GROW, dt);
        moved = true;
      } else scale = scaleTarget;
      if (moved || layout.type === 'curtain') layoutVerts(time);

      const want = wanted ? base : 0;
      opacity += (want - opacity) * approach(OPACITY_RATE, dt);
      if (Math.abs(want - opacity) < 0.002) opacity = want;
      mat.uniforms.uOpacity.value = opacity;
      mesh.visible = opacity > 0.002;

      if (revealT < 1 && wanted) {
        revealT = Math.min(revealT + (dt * 1000) / REVEAL_MS, 1);
        mat.uniforms.uReveal.value = 1 - Math.pow(1 - revealT, 3); // fast arrival, soft landing
      }

      if (!reduced.matches && !document.hidden && def.frames.length > 1) {
        acc += dt * 1000;
        if (acc >= 1000 / FPS) {
          acc %= 1000 / FPS;
          mat.uniforms.uFrameA.value = frame;
          frame = (frame + 1) % def.frames.length;
          mat.uniforms.uFrameB.value = frame;
          fadeT = 0;
        }
      }
      if (fadeT < 1) {
        fadeT = Math.min(fadeT + (dt * 1000) / FADE_MS, 1);
        mat.uniforms.uMix.value = fadeT * fadeT * (3 - 2 * fadeT);
      }

      if (!wanted && opacity === 0) {
        if (disposable) {
          mesh.removeFromParent();
          geo.dispose();
          mat.dispose();
        }
        return false;
      }
      return true;
    },
  };

  void atlas(kind).then((a) => {
    def = a.def;
    frame %= def.frames.length;
    mat.uniforms.map.value = a.tex;
    mat.uniforms.uFrames.value = def.frames.length;
    mat.uniforms.uFrameA.value = frame;
    mat.uniforms.uFrameB.value = frame;
    dirty = true;
    if (wanted) wake(self);
  });

  return {
    setPlace(p) {
      wanted = !!p;
      if (p) {
        const c = globe.getCoords(p.lat, p.lng);
        target.set(c.x, c.y, c.z).normalize();
        headingTarget = p.heading ?? 0;
        if (!placed) {
          // first appearance: start on the spot and ink in, rather than sliding in from nowhere
          cur.copy(target);
          heading = headingTarget;
          placed = true;
          dirty = true;
        }
      }
      wake(self);
    },
    setOpacity(a) {
      base = a;
      if (wanted) wake(self);
    },
    setScale(s) {
      scaleTarget = s;
      if (wanted) wake(self);
    },
  };
}
