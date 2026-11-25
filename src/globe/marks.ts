import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
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
 * Fireballs: the short streak along the real entry direction (JPL's pre-entry velocity), drawn
 * from where it came in toward where it burst. The star itself is a solid object (interactive.ts).
 */
export function createFireballMarks(globe: GlobeLike) {
  const fire = () => cssInk('--ink-fire', '#e8743b');

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
  let hovered: string | null = null;

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
      // the hovered fireball's trail burns at full strength
      const alpha = Math.min(1, alphaOf(e) * intro * (e.id === hovered ? 1.8 : 1));
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
    /** which fireballs are on the globe, and how visible each one is (darkness) */
    setShown(events: SkyEvent[], alpha: (e: SkyEvent) => number) {
      shown = events;
      alphaOf = alpha;
      rebuildStreaks();
    },
    setIntro(p: number) {
      if (p === intro) return;
      intro = p;
      rebuildStreaks();
    },
    setHovered(id: string | null) {
      if (id === hovered) return;
      hovered = id;
      rebuildStreaks();
    },
  };
}

/** Unit heading of the fireball's path over the ground, from JPL's Earth-fixed velocity. */
export function entryHeading(e: SkyEvent): { north: number; east: number } | null {
  const { vx, vy, vz } = e.details;
  if (typeof vx !== 'number' || typeof vy !== 'number' || typeof vz !== 'number') return null;
  const [la, lo] = [e.lat * RAD, e.lng * RAD];
  const east = -Math.sin(lo) * vx + Math.cos(lo) * vy;
  const north = -Math.sin(la) * Math.cos(lo) * vx - Math.sin(la) * Math.sin(lo) * vy + Math.cos(la) * vz;
  const len = Math.hypot(east, north);
  return len < 1e-6 ? null : { east: east / len, north: north / len };
}
