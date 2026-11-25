import {
  BufferAttribute,
  CanvasTexture,
  DoubleSide,
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
 * Each sprite is a curved patch in the 3D scene, built from a few slices stacked outward so the
 * print has thickness. It bends with the planet, shrinks with distance and slips behind the limb.
 *
 * Motion: frames cross-fade, sprites glide to new spots, fireballs arrive head first with the tail
 * drawing out behind, selection grows a sprite on a damped spring, and hover gives each kind its own
 * move (see HoverStyle). Reduced motion keeps fades only.
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

export function atlas(kind: TapestryKind): Promise<Atlas> {
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
      if (kind === 'aurora') {
        // the curtain is light: green throughout, thinning out where the page print used shade
        ink.p = ink.a;
        ink.s = ink.a;
        alpha.p = 0.6;
        alpha.s = 0.28;
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
  uniform float uFrames, uFrameA, uFrameB, uMix, uOpacity, uReveal, uShade, uHover, uTime, uFlare;
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
    // deeper slices are printed darker, so the stack reads as a solid block of characters
    vec3 rgb = c.rgb * uShade;
    // hover: a band of heat runs along the sprite toward the head (uFlare picks how much)
    float band = smoothstep(0.82, 1.0, sin(vUv.x * 9.0 - uTime * 7.0) * 0.5 + 0.5);
    rgb += uHover * uFlare * band * 0.45 * c.a;
    rgb *= 1.0 + uHover * 0.18;
    gl_FragColor = vec4(rgb, a); // poster inks as printed: no lighting, no tone mapping
  }
`;

// ---------------------------------------------------------------- sprites

export interface Shell {
  widthDeg: number; // arc covered by the sprite's width; height follows the sprite's aspect
  alt: number; // anchor altitude, fraction of the globe radius
  lift?: number; // extra altitude toward the left edge (a streak's tail climbing into the sky)
  layers?: number; // slices stacked outward to give the print thickness
  depth?: number; // total thickness of the stack, fraction of the globe radius
}

export interface Placement {
  lat: number;
  lng: number;
  /** direction of the sprite's +x axis, degrees clockwise from north */
  heading?: number;
}

/** What hover does, per kind: each thing moves in its own way. */
export interface HoverStyle {
  rise: number; // extra altitude, fraction of the globe radius
  grow: number; // extra scale
  roll: number; // side-to-side roll amplitude, radians (the ISS banks on its orbit)
  flare: number; // heat band running along the print (the fireball burns)
  quicken: number; // frame-rate multiplier at full hover
}

export interface SkySprite {
  /** null fades it out (and, if it was made with `disposable`, removes it once gone) */
  setPlace(p: Placement | null): void;
  setOpacity(a: number): void;
  setScale(s: number): void;
  setHover(on: boolean): void;
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

/** A critically damped spring step: quick, and it settles without wobbling. */
function spring(s: { x: number; v: number }, to: number, omega: number, dt: number) {
  if (reduced.matches) return void ((s.x = to), (s.v = 0));
  const k = omega * dt;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const d = s.x - to;
  const tmp = (s.v + omega * d) * dt;
  s.v = (s.v - omega * tmp) * e;
  s.x = to + (d + tmp) * e;
}

export function createSkySprite(
  globe: Globeish,
  kind: TapestryKind,
  anchor: [number, number],
  shell: Shell,
  hoverStyle: HoverStyle,
  { reveal = false, disposable = false } = {},
): SkySprite {
  const R = globe.getGlobeRadius();
  const nLayers = Math.max(1, shell.layers ?? 1);
  const segX = 16;
  const segY = 6;
  const layers = Array.from({ length: nLayers }, (_, li) => {
    const geo = new PlaneGeometry(1, 1, segX, segY);
    const front = li === nLayers - 1;
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
        uShade: { value: nLayers === 1 ? 1 : 0.42 + 0.58 * (li / (nLayers - 1)) },
        uHover: { value: 0 },
        uTime: { value: 0 },
        uFlare: { value: front ? hoverStyle.flare : 0 },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3 + li; // back slice first, front slice last
    mesh.visible = false;
    mesh.raycast = () => {}; // decoration: clicks go to the globe's own hit targets underneath
    globe.scene().add(mesh);
    return {
      geo,
      mat,
      mesh,
      pos: geo.getAttribute('position') as BufferAttribute,
      uv: geo.getAttribute('uv') as BufferAttribute,
      offset: nLayers === 1 ? 0 : li / (nLayers - 1),
    };
  });
  const uniforms = (name: string, value: number) => {
    for (const l of layers) l.mat.uniforms[name].value = value;
  };

  let def: SpriteDef | null = null;
  const cur = new Vector3();
  const target = new Vector3();
  let heading = 0;
  let headingTarget = 0;
  const scale = { x: 1, v: 0 };
  let scaleTarget = 1;
  const hover = { x: 0, v: 0 };
  let hoverTarget = 0;
  let opacity = 0;
  let base = 1;
  let wanted = false;
  let placed = false;
  let revealT = reveal && !reduced.matches ? 0 : 1;
  let frame = Math.floor(Math.random() * 4);
  let acc = Math.random() * (1000 / FPS); // so a field of fireballs doesn't flip frames in unison
  let fadeT = 1;
  let dirty = true;
  const phase = Math.random() * Math.PI * 2;

  // scratch
  const east = new Vector3();
  const north = new Vector3();
  const fwd = new Vector3();
  const left = new Vector3();
  const b = new Vector3();
  const o = new Vector3();

  const layout = (time: number) => {
    if (!def) return;
    const [ax, ay] = anchor;
    const h = hover.x;
    const s = scale.x * (1 + hoverStyle.grow * h);
    const w = ((shell.widthDeg * Math.PI) / 180) * s;
    const hh = w * (def.rows / def.cols);
    east.copy(Y).cross(cur);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    north.copy(cur).cross(east);
    const hr = (heading * Math.PI) / 180;
    fwd.copy(north).multiplyScalar(Math.cos(hr)).addScaledVector(east, Math.sin(hr));
    left.copy(cur).cross(fwd);
    // banking: tip the patch about its own long axis, side to side
    const roll = reduced.matches ? 0 : hoverStyle.roll * h * Math.sin(time * 2.4 + phase);
    const rise = hoverStyle.rise * h;
    for (const L of layers) {
      const depth = (shell.depth ?? 0) * L.offset * s;
      for (let i = 0; i < L.pos.count; i++) {
        const u = L.uv.getX(i);
        const v = 1 - L.uv.getY(i);
        const ta = Math.tan((u - ax) * w);
        const tb = Math.tan((v - ay) * hh);
        // gnomonic step over the sphere: the patch hugs the curvature instead of lying flat on it
        b.copy(cur).addScaledVector(fwd, ta).addScaledVector(left, -tb * Math.cos(roll)).normalize();
        const lift = shell.lift ? Math.max(ax - u, 0) * shell.lift * s : 0;
        const bank = -tb * Math.sin(roll); // the rolled-up side rises, the other dips
        o.copy(b).multiplyScalar(R * (1 + shell.alt + lift + rise + depth + bank));
        L.pos.setXYZ(i, o.x, o.y, o.z);
      }
      L.pos.needsUpdate = true;
    }
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
      if (Math.abs(scaleTarget - scale.x) > 0.0005 || Math.abs(scale.v) > 0.001) {
        spring(scale, scaleTarget, GROW, dt);
        moved = true;
      }
      if (Math.abs(hoverTarget - hover.x) > 0.0005 || Math.abs(hover.v) > 0.001 || hover.x > 0.001) {
        spring(hover, hoverTarget, 14, dt); // hover lands fast and leaves a touch slower than it came
        moved = true;
      }
      if (moved) layout(time);
      uniforms('uHover', hover.x);
      uniforms('uTime', time);

      const want = wanted ? Math.min(1, base + 0.25 * hover.x) : 0;
      opacity += (want - opacity) * approach(OPACITY_RATE, dt);
      if (Math.abs(want - opacity) < 0.002) opacity = want;
      uniforms('uOpacity', opacity);
      for (const L of layers) L.mesh.visible = opacity > 0.002;

      if (revealT < 1 && wanted) {
        revealT = Math.min(revealT + (dt * 1000) / REVEAL_MS, 1);
        uniforms('uReveal', 1 - Math.pow(1 - revealT, 3)); // fast arrival, soft landing
      }

      if (!reduced.matches && !document.hidden && def.frames.length > 1) {
        acc += dt * 1000 * (1 + (hoverStyle.quicken - 1) * hover.x);
        if (acc >= 1000 / FPS) {
          acc %= 1000 / FPS;
          uniforms('uFrameA', frame);
          frame = (frame + 1) % def.frames.length;
          uniforms('uFrameB', frame);
          fadeT = 0;
        }
      }
      if (fadeT < 1) {
        fadeT = Math.min(fadeT + (dt * 1000) / FADE_MS, 1);
        uniforms('uMix', fadeT * fadeT * (3 - 2 * fadeT));
      }

      if (!wanted && opacity === 0) {
        if (disposable)
          for (const L of layers) {
            L.mesh.removeFromParent();
            L.geo.dispose();
            L.mat.dispose();
          }
        return false;
      }
      return true;
    },
  };

  void atlas(kind).then((a) => {
    def = a.def;
    frame %= def.frames.length;
    uniforms('uFrames', def.frames.length);
    uniforms('uFrameA', frame);
    uniforms('uFrameB', frame);
    for (const L of layers) L.mat.uniforms.map.value = a.tex;
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
      } else hoverTarget = 0;
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
    setHover(on) {
      const t = on ? 1 : 0;
      if (t === hoverTarget) return;
      hoverTarget = t;
      if (wanted) wake(self);
    },
  };
}
