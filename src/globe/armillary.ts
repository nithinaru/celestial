import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import type { LatLng } from '../sky/sun';

/** The bits of globe.gl this needs. */
interface GlobeLike {
  scene(): Scene;
  camera(): unknown;
  getGlobeRadius(): number;
  getCoords(lat: number, lng: number, altitude?: number): { x: number; y: number; z: number };
  pointOfView(pov: { lat?: number; lng?: number; altitude?: number }, ms?: number): unknown;
}

export type View = 'armillary' | 'horizon';

const OBLIQUITY = (23.44 * Math.PI) / 180;
const RING = 1.5; // ring radius, in globe radii
const RING_OPACITY = 0.6;
const ISS_ORBIT = 1.06; // matches the ISS dot's altitude (0.06) in createGlobe

const cssInk = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * An armillary sphere engraved in ink: two thin rings around the Earth, nothing else.
 *   equator    the main ring: ticks every 10°, longitude numbers every 30°
 *   ecliptic   the Sun's yearly path, tilted 23.4°; it turns with the Earth, and the Sun is always on it
 * Plus the ISS orbit plane as a dashed line, because it is an event, not part of the instrument.
 */
export function createArmillary(globe: GlobeLike) {
  const R = globe.getGlobeRadius();
  const scene = globe.scene();
  const Y = new Vector3(0, 1, 0); // three-globe's north axis

  const lineMat = new LineBasicMaterial({ transparent: true, opacity: RING_OPACITY, depthWrite: false });
  const traced: { geo: BufferGeometry; count: number }[] = [];
  const trace = (geo: BufferGeometry, count: number) => {
    geo.setDrawRange(0, 0);
    traced.push({ geo, count });
    return geo;
  };

  /** circle of radius r in the XZ plane (around the north axis) */
  const circle = (r: number, n = 360) => {
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return geo;
  };

  const ring = (withTicks: boolean) => {
    const g = new Group();
    g.add(new Line(trace(circle(R * RING), 361), lineMat));
    if (withTicks) {
      const t: number[] = [];
      for (let deg = 0; deg < 360; deg += 10) {
        const a = (deg * Math.PI) / 180;
        const len = deg % 30 === 0 ? 0.07 : 0.035;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        t.push(c * R * RING, 0, s * R * RING, c * R * (RING + len), 0, s * R * (RING + len));
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(t, 3));
      g.add(new LineSegments(trace(geo, t.length / 3), lineMat));
    }
    return g;
  };

  const rings = new Group();

  // equator: lies in the Earth's equatorial plane, so its numbers are longitudes
  const equator = ring(true);
  const labels: SpriteMaterial[] = [];
  for (let deg = 0; deg < 360; deg += 30) {
    const lng = deg > 180 ? deg - 360 : deg;
    const p = globe.getCoords(0, lng, RING + 0.13 - 1);
    const sprite = label(lng === 0 ? '0°' : `${Math.abs(lng)}°${lng > 0 ? 'E' : 'W'}`);
    sprite.position.set(p.x, p.y, p.z);
    labels.push(sprite.material);
    equator.add(sprite);
  }
  rings.add(equator);

  // ecliptic: orientation is set from the sun in setSun()
  const ecliptic = ring(false);
  rings.add(ecliptic);

  // ISS orbit
  const orbitGeo = circle(R * ISS_ORBIT, 240);
  const orbitMat = new LineDashedMaterial({ dashSize: 3, gapSize: 3, transparent: true, opacity: 0 });
  const orbit = new Line(orbitGeo, orbitMat);
  orbit.computeLineDistances();
  orbit.visible = false;
  scene.add(rings, orbit);

  const readInks = () => {
    const c = new Color(cssInk('--ink-type', '#f1e6c8'));
    lineMat.color.copy(c);
    orbitMat.color.copy(c);
  };
  readInks();
  new MutationObserver(readInks).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-phase'],
  });

  // ---- views ----
  let view: View = 'armillary';
  let shift = 0; // 0 = whole instrument, 1 = standing at the limb
  const cam = globe.camera() as PerspectiveCamera;
  const tick = () => {
    shift += ((view === 'horizon' ? 1 : 0) - shift) * 0.07;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // armillary: the instrument sits right of centre, leaving the left for the counter.
    // horizon: slide the picture down so only the top arc of the Earth stays in frame.
    const dx = w > 1100 ? -w * 0.09 * (1 - shift) : 0;
    cam.setViewOffset(w, h, dx, -h * (0.03 + 0.66 * shift), w, h);
    rings.scale.setScalar(Math.max(1 - shift, 0.001));
    rings.visible = shift < 0.97;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    /** 0..1: the rings trace themselves, then the numbers appear */
    setIntro(p: number) {
      for (const { geo, count } of traced) geo.setDrawRange(0, Math.ceil(count * p));
      for (const m of labels) m.opacity = Math.max(0, p - 0.8) * 5 * 0.75;
    },
    /** 0..1: event marks (the ISS orbit) fade in */
    setEventsIntro(p: number) {
      orbitMat.opacity = 0.7 * p;
    },
    setSun(dir: Vector3, date: Date) {
      // The ecliptic pole is tilted 23.4° from the north pole, and the Sun always lies on the
      // ecliptic. Of the two poles that fit, pick the one on the side the Sun is moving toward:
      // from June to December the Sun heads south, so the pole leans east of the Sun's meridian.
      const sinDec = dir.dot(Y);
      const toSun = dir.clone().addScaledVector(Y, -sinDec).normalize(); // horizontal, toward the Sun's meridian
      const east = new Vector3().crossVectors(Y, toSun).normalize();
      const cosDec = Math.sqrt(Math.max(0, 1 - sinDec * sinDec));
      const a = Math.max(-1, Math.min(1, (-Math.cos(OBLIQUITY) * sinDec) / (Math.sin(OBLIQUITY) * cosDec || 1e-6)));
      const day = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 864e5;
      const southward = day > 172 && day < 355;
      const b = Math.sqrt(1 - a * a) * (southward ? 1 : -1);
      const pole = Y.clone()
        .multiplyScalar(Math.cos(OBLIQUITY))
        .addScaledVector(toSun.multiplyScalar(a).addScaledVector(east, b), Math.sin(OBLIQUITY))
        .normalize();
      ecliptic.quaternion.copy(new Quaternion().setFromUnitVectors(Y, pole));
    },
    setOrbit(trail: LatLng[]) {
      if (trail.length < 2) return;
      const a = globe.getCoords(trail[0].lat, trail[0].lng);
      const b = globe.getCoords(trail[trail.length - 1].lat, trail[trail.length - 1].lng);
      const n = new Vector3(a.x, a.y, a.z).cross(new Vector3(b.x, b.y, b.z));
      if (n.lengthSq() < 1e-6) return;
      orbit.quaternion.setFromUnitVectors(Y, n.normalize());
      orbit.visible = true;
    },
    setView(next: View) {
      view = next;
      globe.pointOfView({ altitude: next === 'horizon' ? 0.75 : 2.9 }, 1400);
    },
  };
}

/** tiny monospace degree number, always facing the camera */
function label(text: string): Sprite {
  const scale = 4;
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  const font = `500 ${11 * scale}px "DM Mono", ui-monospace, monospace`;
  x.font = font;
  c.width = Math.ceil(x.measureText(text).width) + 4 * scale;
  c.height = 16 * scale;
  x.font = font;
  x.fillStyle = cssInk('--ink-type', '#f1e6c8');
  x.textBaseline = 'middle';
  x.fillText(text, 2 * scale, c.height / 2);
  const t = new CanvasTexture(c);
  const m = new SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false });
  const s = new Sprite(m);
  const h = 5; // world units; the globe radius is 100
  s.scale.set((h * c.width) / c.height, h, 1);
  return s;
}
