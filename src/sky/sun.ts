import { gstime } from 'satellite.js';

export interface LatLng {
  lat: number;
  lng: number;
}

const RAD = Math.PI / 180;

/**
 * Subsolar point: where the sun is directly overhead right now.
 * Low-precision solar position (Astronomical Almanac), good to ~0.1°.
 */
export function subsolarPoint(date: Date): LatLng {
  const n = date.getTime() / 864e5 + 2440587.5 - 2451545.0; // days since J2000
  const meanLng = 280.46 + 0.9856474 * n;
  const meanAnomaly = (357.528 + 0.9856003 * n) * RAD;
  const eclipticLng =
    (meanLng + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLng));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLng),
    Math.cos(eclipticLng),
  );
  const lng = (rightAscension - gstime(date)) / RAD;
  return { lat: declination / RAD, lng: wrapLng(lng) };
}

export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * 0 = daylight, 1 = properly dark. Ramps across civil twilight
 * (sun from 0° to 6° below the horizon), when the sky actually goes dark.
 */
export function darkness(p: LatLng, sun: LatLng): number {
  const sunAltitude = 90 - angularDistance(p, sun);
  return Math.max(0, Math.min(1, -sunAltitude / 6));
}

/** Great-circle distance in degrees. */
export function angularDistance(a: LatLng, b: LatLng): number {
  const cos =
    Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lng - b.lng) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
}
