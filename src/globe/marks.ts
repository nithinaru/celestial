import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three';
import type { SkyEvent } from '../data/skyEvents';

interface GlobeLike {
  scene(): Scene;
  getCoords(lat: number, lng: number, altitude?: number): { x: number; y: number; z: number };
}

const cssInk = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const RAD = Math.PI / 180;

/**
 * Aurora as an engraved curtain: thousands of short vertical strokes standing on the real NOAA
 * oval. Taller and darker where the chance is higher, invisible where the sky isn't dark, and
 * each stroke breathes on its own phase so the curtain shimmers.
 */
export function createAuroraCurtain(globe: GlobeLike) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ink: { value: new Color() },
      sunDirection: { value: new Vector3(1, 0, 0) },
      time: { value: 0 },
      intro: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aProb;
      attribute float aTop;
      attribute float aPhase;
      varying float vProb;
      varying float vTop;
      varying float vPhase;
      varying vec3 vDir;
      void main() {
        vProb = aProb; vTop = aTop; vPhase = aPhase;
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 ink;
      uniform vec3 sunDirection;
      uniform float time, intro;
      varying float vProb, vTop, vPhase;
      varying vec3 vDir;
      void main() {
        // same rule as darkness() in sky/sun.ts: fade in across civil twilight
        float dark = clamp(-dot(vDir, sunDirection) / 0.1045, 0.0, 1.0);
        float shimmer = 0.62 + 0.38 * sin(time * 1.3 + vPhase);
        float fade = 1.0 - vTop * vTop; // strokes thin out toward the top, like a real curtain
        float a = mix(0.45, 1.0, vProb) * dark * shimmer * fade * intro;
        if (a < 0.01) discard;
        gl_FragColor = vec4(ink, a);
        #include <colorspace_fragment>
      }
    `,
  });
  const lines = new LineSegments(new BufferGeometry(), material);
  globe.scene().add(lines);

  const readInk = () => material.uniforms.ink.value.set(cssInk('--ink-aurora', '#9bd24a'));
  readInk();
  new MutationObserver(readInk).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-phase'],
  });

  return {
    setEvents(aurora: SkyEvent[]) {
      const pos: number[] = [];
      const prob: number[] = [];
      const top: number[] = [];
      const phase: number[] = [];
      const STROKES = 5; // per 2° cell
      for (const a of aurora) {
        const p = Math.min(1, a.intensity / 50); // OVATION rarely passes 50% outside a storm
        for (let i = 0; i < STROKES; i++) {
          // spread strokes across the cell; a slow wave in latitude makes the curtain fold
          const lng = a.lng + (i / STROKES - 0.5) * 2 + (Math.random() - 0.5) * 0.4;
          const lat = a.lat + Math.sin(lng * 0.35) * 0.6 + (Math.random() - 0.5) * 0.8;
          const h = (0.03 + 0.11 * p) * (0.6 + Math.random() * 0.4); // in globe radii
          const b = globe.getCoords(lat, lng, 0.008);
          const t = globe.getCoords(lat, lng, 0.008 + h);
          pos.push(b.x, b.y, b.z, t.x, t.y, t.z);
          const ph = lng * 0.18 + Math.random() * 1.5;
          prob.push(p, p);
          top.push(0, 1);
          phase.push(ph, ph);
        }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geo.setAttribute('aProb', new Float32BufferAttribute(prob, 1));
      geo.setAttribute('aTop', new Float32BufferAttribute(top, 1));
      geo.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
      lines.geometry.dispose();
      lines.geometry = geo;
    },
    setSun(dir: Vector3) {
      material.uniforms.sunDirection.value.copy(dir);
    },
    frame(timeSec: number, intro: number) {
      material.uniforms.time.value = timeSec;
      material.uniforms.intro.value = intro;
    },
  };
}

/**
 * Fireballs: a four-point star sized by impact energy, plus a short streak along the real
 * entry direction (JPL's pre-entry velocity), drawn from where it came in toward where it burst.
 */
export function createFireballMarks(globe: GlobeLike) {
  const fire = () => cssInk('--ink-fire', '#e8743b');
  const starTexture = drawStar(fire());

  const streakMat = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const streaks = new LineSegments(new BufferGeometry(), streakMat);
  globe.scene().add(streaks);

  let shown: SkyEvent[] = [];
  let alphaOf: (e: SkyEvent) => number = () => 1;
  let intro = 0;

  const sprites = new Map<string, Sprite>();
  const sizeOf = (e: SkyEvent) => 5 + Math.log10(1 + e.intensity) * 7; // world units; globe radius 100

  /** star sprite for globe.gl's objects layer (keeps hover labels and clicks working) */
  const sprite = (e: SkyEvent) => {
    let s = sprites.get(e.id);
    if (!s) {
      s = new Sprite(new SpriteMaterial({ map: starTexture, transparent: true, depthWrite: false }));
      const size = sizeOf(e);
      s.scale.set(size, size, 1);
      sprites.set(e.id, s);
    }
    (s.material as SpriteMaterial).opacity = alphaOf(e) * intro;
    return s;
  };

  const rebuildStreaks = () => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color(fire());
    for (const e of shown) {
      const dir = entryHeading(e);
      if (!dir) continue;
      const len = 6 + Math.log10(1 + e.intensity) * 6; // degrees of arc; long enough to clear the star
      const from = { lat: e.lat - dir.north * len, lng: e.lng - (dir.east * len) / Math.cos(e.lat * RAD) };
      const a = globe.getCoords(from.lat, from.lng, 0.03);
      const b = globe.getCoords(e.lat, e.lng, 0.012);
      const alpha = alphaOf(e) * intro;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      col.push(c.r, c.g, c.b, alpha * 0.25, c.r, c.g, c.b, alpha); // brightens toward the burst
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(col, 4));
    streaks.geometry.dispose();
    streaks.geometry = geo;
  };

  return {
    sprite,
    /** which fireballs are on the globe, and how visible each one is (darkness) */
    setShown(events: SkyEvent[], alpha: (e: SkyEvent) => number) {
      shown = events;
      alphaOf = alpha;
      for (const e of shown) sprite(e);
      rebuildStreaks();
    },
    setIntro(p: number) {
      if (p === intro) return;
      intro = p;
      for (const e of shown) sprite(e);
      rebuildStreaks();
    },
  };
}

/** Unit heading of the fireball's path over the ground, from JPL's Earth-fixed velocity. */
function entryHeading(e: SkyEvent): { north: number; east: number } | null {
  const { vx, vy, vz } = e.details;
  if (typeof vx !== 'number' || typeof vy !== 'number' || typeof vz !== 'number') return null;
  const [la, lo] = [e.lat * RAD, e.lng * RAD];
  const east = -Math.sin(lo) * vx + Math.cos(lo) * vy;
  const north = -Math.sin(la) * Math.cos(lo) * vx - Math.sin(la) * Math.sin(lo) * vy + Math.cos(la) * vz;
  const len = Math.hypot(east, north);
  return len < 1e-6 ? null : { east: east / len, north: north / len };
}

function drawStar(color: string): CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const m = S / 2;
  const outer = S * 0.48;
  const inner = S * 0.09;
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
  }
  x.closePath();
  x.fillStyle = color;
  x.fill();
  return new CanvasTexture(c);
}
