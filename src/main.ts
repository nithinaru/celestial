import './style.css';
import type { SkyEvent } from './data/skyEvents';
import { createGlobe } from './globe/createGlobe';
import { subsolarPoint, type LatLng } from './sky/sun';
import { mountUI } from './ui/mount';

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

// One path for every selection change: globe clicks, the card's ×, Escape, clicking empty globe.
// The poster card (ui/eventCard.ts) opens and closes on this event.
const select = (event: SkyEvent | null) => {
  state.selected = event;
  window.dispatchEvent(new CustomEvent('celestial:select', { detail: event }));
};
globe.onSelect(select);

// Dragging the day scrubber moves the sun, so the night line sweeps across the Earth.
window.addEventListener('celestial:daytime', (e) => {
  const { when, offsetMinutes } = (e as CustomEvent<{ when: Date; offsetMinutes: number }>).detail;
  setSun(subsolarPoint(when), offsetMinutes !== 0);
});

// The demo runs on hard-coded events (data/demoEvents.ts). Add ?live to the URL for the real feeds.
const live = new URLSearchParams(location.search).has('live');
const { getSkyEvents, watchIss } = live ? await import('./data/skyEvents') : await import('./data/demoEvents');
state.events = await getSkyEvents();
globe.setEvents(state.events);
ui.setEvents(state.events);
watchIss((iss, trail) => globe.setIss(iss, trail));

const counts = state.events.reduce<Record<string, number>>(
  (acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc),
  {},
);
console.log('[celestial] events', counts);
