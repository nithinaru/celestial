// Run: node src/sky/sun.check.ts
import assert from 'node:assert/strict';
import { darkness, subsolarPoint } from './sun.ts';

const near = (a: number, b: number, tol: number, what: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: got ${a.toFixed(2)}, want ${b} ±${tol}`);

// March 2024 equinox, 12:00 UTC: sun over the equator, ~1.8°E (equation of time ≈ -7.4 min)
const equinox = subsolarPoint(new Date('2024-03-20T12:00:00Z'));
near(equinox.lat, 0, 0.3, 'equinox lat');
near(equinox.lng, 1.8, 0.5, 'equinox lng');

// June 2024 solstice: declination +23.44°
near(subsolarPoint(new Date('2024-06-20T20:51:00Z')).lat, 23.44, 0.05, 'solstice lat');

// darkness: under the sun = 0, antipode = 1, horizon = 0
const sun = { lat: 0, lng: 0 };
assert.equal(darkness({ lat: 0, lng: 0 }, sun), 0);
assert.equal(darkness({ lat: 0, lng: 180 }, sun), 1);
assert.equal(darkness({ lat: 0, lng: 90 }, sun), 0);
near(darkness({ lat: 0, lng: 93 }, sun), 0.5, 0.01, 'mid civil twilight');

console.log('sun.check ok');
