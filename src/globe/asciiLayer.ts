import { Vector3, type Scene } from 'three';
import type { SkyEvent } from '../data/skyEvents';
import type { LatLng } from '../sky/sun';
import { createAuroraCurtain as createAsciiCurtain } from './asciiAurora';
import { entryHeading } from './marks';
import { createSkySprite, type HoverStyle, type SkySprite } from './skySprites';

/**
 * The Paper tapestry sprites, printed into the globe in 3D alongside the engraved marks:
 *   - each fireball trails its ASCII streak along the real entry path, with the solid star at its head
 *   - the ISS rides inside its ASCII station
 *   - an ASCII curtain hangs all the way round the auroral oval, folding and drifting
 *
 * Each answers the same hover as the engraved object it belongs to, in its own way
 * (see HoverStyle in skySprites.ts).
 */

interface GlobeLike {
  scene(): Scene;
  getCoords(lat: number, lng: number, alt?: number): { x: number; y: number; z: number };
  getGlobeRadius(): number;
}

// where in each picture the real point sits: the fireball's burning head, the station's middle
const ANCHOR = { fireball: [0.9, 0.74], iss: [0.5, 0.5] } as const satisfies Record<string, [number, number]>;
const GEOMAGNETIC_POLE = { lat: 80.7, lng: -72.7 }; // the ASCII curtain rings this
const SELECTED_SCALE = 1.4;

// A streak burns: it lifts, swells, heat runs along it and the frames quicken.
const FIREBALL_HOVER: HoverStyle = { rise: 0.02, grow: 0.18, roll: 0, flare: 1, quicken: 3 };
// The station banks: it climbs a little and rocks side to side on its orbit.
const ISS_HOVER: HoverStyle = { rise: 0.03, grow: 0.14, roll: 0.35, flare: 0.5, quicken: 2 };

/** Meteors without a measured entry direction still need a stable one, so it doesn't spin. */
function headingFor(e: SkyEvent) {
  const dir = entryHeading(e);
  if (dir) return (Math.atan2(dir.east, dir.north) * 180) / Math.PI;
  let h = 2166136261;
  for (let i = 0; i < e.id.length; i++) h = Math.imul(h ^ e.id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 360) - 180;
}
/** Initial compass bearing from a to b, degrees clockwise from north. */
function bearing(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x =
    Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return Math.atan2(y, x) / r;
}

export function createAsciiLayer(globe: GlobeLike) {
  const streaks = new Map<string, { sprite: SkySprite; event: SkyEvent }>();
  let alphaOf: (e: SkyEvent) => number = () => 1;
  let intro = 0;
  let selected: string | null = null;
  let hovered: string | null = null;

  const station = createSkySprite(
    globe,
    'iss',
    ANCHOR.iss,
    { widthDeg: 9, alt: 0.06, layers: 3, depth: 0.008 },
    ISS_HOVER,
  );
  let iss: SkyEvent | null = null;

  const pole = globe.getCoords(GEOMAGNETIC_POLE.lat, GEOMAGNETIC_POLE.lng);
  const curtain = createAsciiCurtain(globe, new Vector3(pole.x, pole.y, pole.z).normalize());

  const refreshAlpha = () => {
    for (const s of streaks.values()) s.sprite.setOpacity(alphaOf(s.event) * intro);
    if (iss) station.setOpacity(alphaOf(iss) * intro);
  };

  return {
    /** which fireballs are on the globe, and how visible each one is (darkness) */
    setFireballs(shown: SkyEvent[], alpha: (e: SkyEvent) => number) {
      alphaOf = alpha;
      const keep = new Set(shown.map((e) => e.id));
      for (const [id, s] of streaks)
        if (!keep.has(id)) {
          s.sprite.setPlace(null); // fades, then removes itself
          streaks.delete(id);
        }
      for (const e of shown) {
        if (streaks.has(e.id)) continue;
        // as long as the engraved trail, so the star sits right on the ASCII head
        const len = 6 + Math.log10(1 + e.intensity) * 6;
        const sprite = createSkySprite(
          globe,
          'fireball',
          ANCHOR.fireball,
          { widthDeg: len / 0.9, alt: 0.012, lift: 0.08, layers: 3, depth: 0.01 },
          FIREBALL_HOVER,
          { reveal: true, disposable: true },
        );
        sprite.setPlace({ lat: e.lat, lng: e.lng, heading: headingFor(e) });
        sprite.setScale(e.id === selected ? SELECTED_SCALE : 1);
        sprite.setHover(e.id === hovered);
        streaks.set(e.id, { sprite, event: e });
      }
      refreshAlpha();
    },
    setIss(next: SkyEvent, trail: LatLng[]) {
      iss = next;
      const prev = trail.length > 1 ? trail[trail.length - 2] : null;
      station.setPlace({ lat: next.lat, lng: next.lng, heading: prev ? bearing(prev, next) : 90 });
      refreshAlpha();
    },
    setAurora(aurora: SkyEvent[], sun: LatLng) {
      curtain.setData(aurora, sun);
    },
    /** the engraved marks draw in first; the prints follow */
    setIntro(p: number) {
      if (p === intro) return;
      intro = p;
      refreshAlpha();
    },
    refreshAlpha,
    hoverFireball(id: string | null) {
      if (id === hovered) return;
      if (hovered) streaks.get(hovered)?.sprite.setHover(false);
      if (id) streaks.get(id)?.sprite.setHover(true);
      hovered = id;
    },
    hoverIss(on: boolean) {
      station.setHover(on);
    },
    /** where the pointer is on the globe when it isn't over anything solid: the curtain surges there */
    hoverGround(p: LatLng | null) {
      curtain.setHover(p);
    },
    select(id: string | null) {
      if (id === selected) return;
      if (selected) streaks.get(selected)?.sprite.setScale(1);
      if (id) streaks.get(id)?.sprite.setScale(SELECTED_SCALE);
      selected = id;
    },
  };
}
