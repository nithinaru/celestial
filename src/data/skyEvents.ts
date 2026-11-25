import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  type OMMJsonObject,
  type SatRec,
} from 'satellite.js';

export type SkyEventType = 'aurora' | 'fireball' | 'iss';

export interface SkyEvent {
  id: string;
  type: SkyEventType;
  lat: number;
  lng: number;
  /** ISO 8601, UTC */
  time: string;
  /** aurora: probability 0–100 · fireball: impact energy (kt) · iss: altitude (km) */
  intensity: number;
  label: string;
  details: Record<string, string | number | null>;
}

const FEEDS = {
  aurora: {
    live: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
    fallback: '/fallback/aurora.json',
  },
  // JPL sends no CORS header, so the browser goes through our proxy (vite.config.ts in dev, api/fireball.ts on Vercel).
  fireball: { live: '/api/fireball?limit=200', fallback: '/fallback/fireball.json' },
  // CelesTrak rate-limits per address, so go through our cached proxy (api/iss.ts).
  iss: { live: '/api/iss', fallback: '/fallback/iss.json' },
} as const;

const AURORA_MIN_PROBABILITY = 10;
const AURORA_CELL_DEG = 2; // 1° grid -> 2° cells, keep the strongest point per cell
const ISS_NORAD_ID = 25544;

/** Live feed first; on any failure (network, CORS, bad JSON, timeout) use the snapshot in /public/fallback. */
async function fetchFeed<T>(name: keyof typeof FEEDS): Promise<T> {
  const { live, fallback } = FEEDS[name];
  try {
    const res = await fetch(live, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[celestial] ${name} live feed failed, using fallback`, err);
    const res = await fetch(fallback);
    return (await res.json()) as T;
  }
}

// ---------- aurora ----------

interface OvationFeed {
  'Observation Time': string;
  'Forecast Time': string;
  coordinates: [number, number, number][]; // [lng 0..359, lat, probability]
}

export function parseAurora(feed: OvationFeed): SkyEvent[] {
  const cells = new Map<string, [number, number, number]>();
  for (const [rawLng, lat, p] of feed.coordinates) {
    if (p < AURORA_MIN_PROBABILITY) continue;
    const lng = rawLng > 180 ? rawLng - 360 : rawLng;
    const key = `${Math.floor(lng / AURORA_CELL_DEG)},${Math.floor(lat / AURORA_CELL_DEG)}`;
    const prev = cells.get(key);
    if (!prev || p > prev[2]) cells.set(key, [lng, lat, p]);
  }
  return [...cells.values()].map(([lng, lat, p]) => ({
    id: `aurora-${lng}-${lat}`,
    type: 'aurora',
    lat,
    lng,
    time: feed['Forecast Time'],
    intensity: p,
    label: `Aurora · ${p}% chance`,
    details: {
      probability: p,
      observed: feed['Observation Time'],
      forecastFor: feed['Forecast Time'],
      source: 'NOAA SWPC OVATION',
    },
  }));
}

// ---------- fireballs ----------

interface FireballFeed {
  fields: string[];
  data: (string | null)[][];
}

export function parseFireballs(feed: FireballFeed): SkyEvent[] {
  const col = (name: string) => feed.fields.indexOf(name);
  const [iDate, iEnergy, iImpact, iLat, iLatDir, iLon, iLonDir, iAlt, iVel] = [
    'date', 'energy', 'impact-e', 'lat', 'lat-dir', 'lon', 'lon-dir', 'alt', 'vel',
  ].map(col);
  const num = (v: string | null) => (v == null ? null : Number(v));

  const events: SkyEvent[] = [];
  for (const row of feed.data) {
    const lat = num(row[iLat]);
    const lon = num(row[iLon]);
    if (lat == null || lon == null) continue; // a few records have no location
    const signedLat = row[iLatDir] === 'S' ? -lat : lat;
    const signedLng = row[iLonDir] === 'W' ? -lon : lon;
    const time = `${row[iDate]!.replace(' ', 'T')}Z`; // JPL dates are UTC
    const impactKt = num(row[iImpact]) ?? 0;
    events.push({
      id: `fireball-${time}`,
      type: 'fireball',
      lat: signedLat,
      lng: signedLng,
      time,
      intensity: impactKt,
      label: `Fireball · ${impactKt} kt`,
      details: {
        impactEnergyKt: impactKt,
        radiatedEnergyJ: row[iEnergy] == null ? null : Number(row[iEnergy]) * 1e10,
        altitudeKm: num(row[iAlt]),
        velocityKmS: num(row[iVel]),
        source: 'NASA JPL CNEOS',
      },
    });
  }
  return events;
}

// ---------- ISS ----------

let issSatrec: SatRec | null = null;

export function issEventAt(satrec: SatRec, date: Date): SkyEvent | null {
  const pv = propagate(satrec, date);
  if (!pv) return null;
  const geo = eciToGeodetic(pv.position, gstime(date));
  const altKm = Math.round(geo.height);
  return {
    id: 'iss',
    type: 'iss',
    lat: degreesLat(geo.latitude),
    lng: degreesLong(geo.longitude),
    time: date.toISOString(),
    intensity: altKm,
    label: 'International Space Station',
    details: { altitudeKm: altKm, noradId: ISS_NORAD_ID, source: 'CelesTrak' },
  };
}

async function loadIss(): Promise<SatRec> {
  const stations = await fetchFeed<OMMJsonObject[]>('iss');
  const iss = stations.find((s) => Number((s as { NORAD_CAT_ID?: number }).NORAD_CAT_ID) === ISS_NORAD_ID);
  if (!iss) throw new Error('ISS not in CelesTrak response');
  return json2satrec(iss);
}

/**
 * Calls onTick every second with the live ISS position and its recent trail
 * (oldest first). Call getSkyEvents() first. Returns a stop function.
 */
export function watchIss(
  onTick: (iss: SkyEvent, trail: { lat: number; lng: number }[]) => void,
  trailMinutes = 10,
): () => void {
  if (!issSatrec) throw new Error('call getSkyEvents() before watchIss()');
  const satrec = issSatrec;
  const windowMs = trailMinutes * 60_000;
  const trail: { lat: number; lng: number; t: number }[] = [];
  const now = Date.now();
  for (let t = now - windowMs; t < now; t += 10_000) {
    const e = issEventAt(satrec, new Date(t));
    if (e) trail.push({ lat: e.lat, lng: e.lng, t });
  }
  const tick = () => {
    const t = Date.now();
    const e = issEventAt(satrec, new Date(t));
    if (!e) return;
    trail.push({ lat: e.lat, lng: e.lng, t });
    while (trail[0].t < t - windowMs) trail.shift();
    onTick(e, trail.map(({ lat, lng }) => ({ lat, lng })));
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

// ---------- all ----------

export async function getSkyEvents(): Promise<SkyEvent[]> {
  const [aurora, fireballs, satrec] = await Promise.all([
    fetchFeed<OvationFeed>('aurora').then(parseAurora),
    fetchFeed<FireballFeed>('fireball').then(parseFireballs),
    loadIss(),
  ]);
  issSatrec = satrec;
  const iss = issEventAt(satrec, new Date());
  return [...aurora, ...fireballs, ...(iss ? [iss] : [])];
}
