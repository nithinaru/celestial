import './style.css';
import { getSkyEvents, watchIss, type SkyEvent } from './data/skyEvents';
import { createGlobe } from './globe/createGlobe';
import { subsolarPoint, type LatLng } from './sky/sun';
import { mountUI } from './ui/mount';
import { createTimeSlider } from './ui/timeSlider';

// App state lives here; the Paper design renders UI from it.
export const state: {
  events: SkyEvent[];
  selected: SkyEvent | null;
  sun: LatLng;
  /** true while the night line shows a time other than now (dragged, or scrubbed) */
  sunOverridden: boolean;
  /** fireball slider position (ms): fireballs after this are hidden */
  fireballTime: number;
} = {
  events: [],
  selected: null,
  sun: subsolarPoint(new Date()),
  sunOverridden: false,
  fireballTime: Date.now(),
};

const ui = mountUI();
const globe = createGlobe(document.querySelector<HTMLDivElement>('#globe')!);

const setSun = (sun: LatLng, overridden: boolean) => {
  state.sun = sun;
  state.sunOverridden = overridden;
  globe.setSun(sun);
  window.dispatchEvent(new CustomEvent('celestial:sun', { detail: { sun, overridden } }));
};
setSun(state.sun, false);

// The real sun moves 0.25°/min; follow it unless the user is holding the night line somewhere else.
setInterval(() => {
  if (!state.sunOverridden) setSun(subsolarPoint(new Date()), false);
}, 60_000);
globe.onSunDrag((sun) => (sun ? setSun(sun, true) : setSun(subsolarPoint(new Date()), false)));

// The design's day scrubber moves time; the night line follows the sun at that moment.
window.addEventListener('celestial:time', (e) => {
  const { when, offsetMinutes } = (e as CustomEvent<{ when: Date; offsetMinutes: number }>).detail;
  setSun(subsolarPoint(when), offsetMinutes !== 0);
});

// One path for every selection change. The design's card (ui/mount.ts) listens for celestial:select.
const select = (event: SkyEvent | null) => {
  state.selected = event;
  window.dispatchEvent(new CustomEvent('celestial:select', { detail: event }));
};
globe.onSelect(select);
window.addEventListener('keydown', (e) => e.key === 'Escape' && (state.selected = null));

state.events = await getSkyEvents();
globe.setEvents(state.events);
ui.setEvents(state.events);
watchIss((iss, trail) => globe.setIss(iss, trail));

// Fireball history slider. Its own event name: celestial:time belongs to the day scrubber.
const fireballTimes = state.events.filter((e) => e.type === 'fireball').map((e) => Date.parse(e.time));
if (fireballTimes.length) {
  createTimeSlider(document.body, Math.min(...fireballTimes), (t) => {
    state.fireballTime = t;
    globe.setFireballTime(t);
    window.dispatchEvent(new CustomEvent('celestial:fireball-time', { detail: t }));
  });
}

const counts = state.events.reduce<Record<string, number>>(
  (acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc),
  {},
);
console.log('[celestial] events', counts);
