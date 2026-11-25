import './style.css';
import { getSkyEvents, watchIss, type SkyEvent } from './data/skyEvents';
import { createGlobe } from './globe/createGlobe';
import { subsolarPoint, type LatLng } from './sky/sun';
import { createDetailCard } from './ui/detailCard';
import { createTimeSlider } from './ui/timeSlider';

// App state lives here; the Paper design will render UI from it.
export const state: {
  events: SkyEvent[];
  selected: SkyEvent | null;
  sun: LatLng;
  /** true while the user has dragged the night line away from the real sun */
  sunOverridden: boolean;
  /** time slider position (ms): fireballs after this are hidden */
  fireballTime: number;
} = {
  events: [],
  selected: null,
  sun: subsolarPoint(new Date()),
  sunOverridden: false,
  fireballTime: Date.now(),
};

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

// One path for every selection change: globe clicks, the card's ×, Escape, clicking empty globe.
const select = (event: SkyEvent | null) => {
  state.selected = event;
  card.show(event);
  window.dispatchEvent(new CustomEvent('celestial:select', { detail: event }));
};
const card = createDetailCard(document.body, () => select(null));
globe.onSelect(select);

state.events = await getSkyEvents();
globe.setEvents(state.events);
watchIss((iss, trail) => globe.setIss(iss, trail));

const fireballTimes = state.events.filter((e) => e.type === 'fireball').map((e) => Date.parse(e.time));
if (fireballTimes.length) {
  createTimeSlider(document.body, Math.min(...fireballTimes), (t) => {
    state.fireballTime = t;
    globe.setFireballTime(t);
    window.dispatchEvent(new CustomEvent('celestial:time', { detail: t }));
  });
}

const counts = state.events.reduce<Record<string, number>>(
  (acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc),
  {},
);
console.log('[celestial] events', counts);
