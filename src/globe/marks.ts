import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Points,
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

const GLYPHS = ['#', '%', '=', '|', ':', '.']; // dense at the foot of the curtain, thin at the top

/** one row of glyphs drawn in DM Mono, the face the Paper sprites use */
function glyphAtlas(): CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S * GLYPHS.length;
  c.height = S;
  const x = c.getContext('2d')!;
  x.font = `500 ${S * 0.9}px "DM Mono", ui-monospace, monospace`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  GLYPHS.forEach((g, i) => x.fillText(g, S * i + S / 2, S / 2 + 2));
  return new CanvasTexture(c);
}

/**
 * Aurora as a 3D ASCII curtain, like the Paper sprite: on the real NOAA oval, columns of
 * characters stand up off the ground, dense '#' at the foot thinning to '.' at the top.
 * Taller columns mean a higher chance. Characters flicker to their neighbour glyph as the
 * curtain shimmers, and nothing shows where the sky isn't dark.
 */
export function createAuroraCurtain(globe: GlobeLike) {
  const GLYPH = 3.4; // world units per character; the globe radius is 100
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      atlas: { value: glyphAtlas() },
      ink: { value: new Color() },
      sunDirection: { value: new Vector3(1, 0, 0) },
      time: { value: 0 },
      intro: { value: 0 },
      pxPerUnit: { value: 400 }, // viewport height / 2 · projection scale; set in frame()
    },
    vertexShader: /* glsl */ `
      uniform float pxPerUnit;
      attribute float aProb;
      attribute float aRow;
      attribute float aPhase;
      attribute float aGlyph;
      varying float vProb, vRow, vPhase, vGlyph;
      varying vec3 vDir;
      void main() {
        vProb = aProb; vRow = aRow; vPhase = aPhase; vGlyph = aGlyph;
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = ${GLYPH.toFixed(1)} * projectionMatrix[1][1] * pxPerUnit / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas;
      uniform vec3 ink;
      uniform vec3 sunDirection;
      uniform float time, intro;
      varying float vProb, vRow, vPhase, vGlyph;
      varying vec3 vDir;
      void main() {
        // same rule as darkness() in sky/sun.ts: fade in across civil twilight
        float dark = clamp(-dot(vDir, sunDirection) / 0.1045, 0.0, 1.0);
        float wave = sin(time * 1.4 + vPhase - vRow * 2.5); // ripples up the column
        float glyph = clamp(vGlyph + step(0.55, wave), 0.0, ${GLYPHS.length - 1}.0);
        vec2 uv = vec2((glyph + gl_PointCoord.x) / ${GLYPHS.length}.0, 1.0 - gl_PointCoord.y);
        float shape = texture2D(atlas, uv).a;
        float a = shape * mix(0.5, 1.0, vProb) * dark * (0.7 + 0.3 * wave) * (1.0 - vRow * 0.55) * intro;
        if (a < 0.02) discard;
        gl_FragColor = vec4(ink, a);
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new Points(new BufferGeometry(), material);
  globe.scene().add(points);

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
      const row: number[] = [];
      const phase: number[] = [];
      const glyph: number[] = [];
      const COLUMNS = 2; // per 2° cell
      for (const a of aurora) {
        const p = Math.min(1, a.intensity / 50); // OVATION rarely passes 50% outside a storm
        for (let i = 0; i < COLUMNS; i++) {
          // spread across the cell; a slow wave in latitude makes the curtain fold
          const lng = a.lng + (i / COLUMNS - 0.5) * 2 + (Math.random() - 0.5) * 0.5;
          const lat = a.lat + Math.sin(lng * 0.35) * 0.6 + (Math.random() - 0.5) * 0.6;
          const rows = 2 + Math.round(p * 5 + Math.random() * 1.5);
          const ph = lng * 0.2 + Math.random() * 1.2;
          for (let r = 0; r < rows; r++) {
            const t = r / Math.max(1, rows - 1);
            const c = globe.getCoords(lat, lng, 0.012 + r * (GLYPH / 100));
            pos.push(c.x, c.y, c.z);
            prob.push(p);
            row.push(t);
            phase.push(ph);
            glyph.push(Math.min(GLYPHS.length - 1, Math.floor(t * (GLYPHS.length - 1))));
          }
        }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geo.setAttribute('aProb', new Float32BufferAttribute(prob, 1));
      geo.setAttribute('aRow', new Float32BufferAttribute(row, 1));
      geo.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
      geo.setAttribute('aGlyph', new Float32BufferAttribute(glyph, 1));
      points.geometry.dispose();
      points.geometry = geo;
    },
    setSun(dir: Vector3) {
      material.uniforms.sunDirection.value.copy(dir);
    },
    frame(timeSec: number, intro: number, viewportHeight: number) {
      material.uniforms.time.value = timeSec;
      material.uniforms.intro.value = intro;
      material.uniforms.pxPerUnit.value = viewportHeight / 2;
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
  let hovered: string | null = null;
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
    /** a slow twinkle: each star breathes on its own phase, so the field never looks frozen */
    /** the hovered star swells, so the pointer always knows what it is over */
    hover(id: string | null) {
      hovered = id;
    },
    frame(timeSec: number) {
      for (const e of shown) {
        const s = sprites.get(e.id);
        if (!s) continue;
        const k =
          sizeOf(e) * (e.id === hovered ? 1.8 : 1 + 0.14 * Math.sin(timeSec * 2.1 + (e.lng + e.lat) * 0.7));
        s.scale.set(k, k, 1);
      }
    },
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
