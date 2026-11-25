import type { SkyEvent } from './skyEvents';

/**
 * DEMO DATA. Nothing here is fetched: every event is written by hand so the demo is the same
 * every time and works with no network. Times are relative to when the page opens, so
 * "38 min ago" stays true. Open the app with ?live to use the real feeds instead.
 *
 * Same two functions as skyEvents.ts, so the rest of the app cannot tell the difference.
 */

const RAD = Math.PI / 180;
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

// ---------- aurora: a faint oval, with three places where it is bright ----------

const GEOMAGNETIC_POLE = { lat: 80.7, lng: -72.7 };

const AURORA_PLACES = [
  { place: 'Tromsø, Norway', lat: 69.65, lng: 18.96, peak: 86 },
  { place: 'Reykjavík, Iceland', lat: 64.15, lng: -21.94, peak: 71 },
  { place: 'Yellowknife, Canada', lat: 62.45, lng: -114.37, peak: 78 },
];

/** A point `dist` degrees from `from`, heading `bearing` degrees clockwise from north. */
function offset(from: { lat: number; lng: number }, dist: number, bearing: number) {
  const p = from.lat * RAD;
  const d = dist * RAD;
  const b = bearing * RAD;
  const lat = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b));
  const lng = from.lng * RAD + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(lat));
  return { lat: lat / RAD, lng: ((lng / RAD + 540) % 360) - 180 };
}

function aurora(): SkyEvent[] {
  const out: SkyEvent[] = [];
  const cell = (lat: number, lng: number, p: number, place?: string) =>
    out.push({
      id: `aurora-${out.length}`,
      type: 'aurora',
      lat,
      lng,
      time: ago(0),
      intensity: Math.round(p),
      label: place ?? `Aurora · ${Math.round(p)}% chance`,
      details: { probability: Math.round(p), place: place ?? null, source: 'demo' },
    });

  // the whole oval, faint: 22° around the geomagnetic pole, a few degrees thick
  for (let bearing = 0; bearing < 360; bearing += 4)
    for (const dist of [19, 21, 23, 25]) {
      const { lat, lng } = offset(GEOMAGNETIC_POLE, dist, bearing);
      const wobble = Math.sin(bearing * 0.21) * 3 + Math.cos(bearing * 0.07 + dist) * 2; // fixed, not random
      cell(lat, lng, 13 + wobble - Math.abs(dist - 22));
    }

  // three bright patches, strongest at the town and fading over about 5°
  for (const { place, lat, lng, peak } of AURORA_PLACES)
    for (let ring = 0; ring <= 2; ring++)
      for (let k = 0; k < (ring === 0 ? 1 : 6); k++) {
        const p = ring === 0 ? { lat, lng } : offset({ lat, lng }, ring * 2.2, k * 60 + ring * 30);
        cell(p.lat, p.lng, peak - ring * 17, place);
      }
  return out;
}

// ---------- fireballs: ten, the newest over the Azores ----------

const FIREBALLS: [place: string, lat: number, lng: number, minutesAgo: number, kt: number, altKm: number, kmS: number][] = [
  ['Ponta Delgada, Azores', 37.74, -25.68, 38, 2.1, 80, 18.3],
  ['Coral Sea, off Queensland', -17.2, 152.4, 3 * 60 + 10, 0.4, 61, 14.9],
  ['Atacama Desert, Chile', -23.6, -69.1, 9 * 60 + 25, 0.9, 43, 21.6],
  ['Sea of Okhotsk', 54.1, 148.9, 14 * 60, 6.2, 37, 17.1],
  ['Sahara, southern Algeria', 24.3, 4.7, 21 * 60 + 40, 0.3, 52, 12.8],
  ['Hudson Bay, Canada', 59.8, -86.2, 26 * 60, 1.4, 34, 19.4],
  ['South Atlantic', -34.5, -18.3, 31 * 60 + 5, 0.2, 58, 15.2],
  ['Kalahari, Botswana', -22.9, 22.4, 40 * 60, 0.7, 39, 23.7],
  ['Bay of Bengal', 13.6, 88.2, 47 * 60 + 30, 0.5, 46, 16.0],
  ['Great Plains, Kansas', 38.6, -99.3, 52 * 60, 0.15, 71, 13.5],
];

const fireballs = (): SkyEvent[] =>
  FIREBALLS.map(([place, lat, lng, minutesAgo, kt, altKm, kmS], i) => ({
    id: `fireball-${i}`,
    type: 'fireball',
    lat,
    lng,
    time: ago(minutesAgo),
    intensity: kt,
    label: place,
    details: { impactEnergyKt: kt, radiatedEnergyJ: null, altitudeKm: altKm, velocityKmS: kmS, place, source: 'demo' },
  }));

// ---------- ISS: a real-shaped orbit, timed to pass over Lisbon 6 minutes after the page opens ----------

const INCLINATION = 51.64 * RAD;
const PERIOD_MIN = 92.9;
const EARTH_DEG_PER_MIN = 360 / 1436; // the ground turns under the orbit
const LISBON_AT = Date.now() + 6 * 60_000;
// where along the orbit, and where the orbit crosses the equator, for the station to be over Lisbon
const U_LISBON = Math.asin(Math.sin(38.72 * RAD) / Math.sin(INCLINATION));
const NODE_LISBON = -9.14 - Math.atan2(Math.cos(INCLINATION) * Math.sin(U_LISBON), Math.cos(U_LISBON)) / RAD;

function issAt(ms: number): SkyEvent {
  const dtMin = (ms - LISBON_AT) / 60_000;
  const u = U_LISBON + (2 * Math.PI * dtMin) / PERIOD_MIN;
  const lat = Math.asin(Math.sin(INCLINATION) * Math.sin(u)) / RAD;
  const lngRaw = Math.atan2(Math.cos(INCLINATION) * Math.sin(u), Math.cos(u)) / RAD + NODE_LISBON - EARTH_DEG_PER_MIN * dtMin;
  return {
    id: 'iss',
    type: 'iss',
    lat,
    lng: ((lngRaw + 540) % 360) - 180,
    time: new Date(ms).toISOString(),
    intensity: 420,
    label: 'International Space Station',
    details: { altitudeKm: 420, noradId: 25544, source: 'demo' },
  };
}

// ---------- the same API as skyEvents.ts ----------

export async function getSkyEvents(): Promise<SkyEvent[]> {
  console.info('[celestial] demo data: hard-coded events, no network. Add ?live to the URL for real feeds.');
  return [...aurora(), ...fireballs(), issAt(Date.now())];
}

export function watchIss(
  onTick: (iss: SkyEvent, trail: { lat: number; lng: number }[]) => void,
  trailMinutes = 10,
): () => void {
  const tick = () => {
    const now = Date.now();
    const trail: { lat: number; lng: number }[] = [];
    for (let t = now - trailMinutes * 60_000; t <= now; t += 20_000) {
      const p = issAt(t);
      trail.push({ lat: p.lat, lng: p.lng });
    }
    onTick(issAt(now), trail);
  };
  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}
