import './style.css';
import { getSkyEvents, watchIss, type SkyEvent } from './data/skyEvents';
import { createGlobe } from './globe/createGlobe';

// App state lives here; the Paper design will render UI from it.
export const state: { events: SkyEvent[]; selected: SkyEvent | null } = {
  events: [],
  selected: null,
};

const globe = createGlobe(document.querySelector<HTMLDivElement>('#globe')!);

// Detail cards (step 4) listen for this; for now it only updates state.
globe.onSelect((event) => {
  state.selected = event;
  window.dispatchEvent(new CustomEvent('celestial:select', { detail: event }));
  console.log('[celestial] selected', event);
});

state.events = await getSkyEvents();
globe.setEvents(state.events);
watchIss((iss, trail) => globe.setIss(iss, trail));

const counts = state.events.reduce<Record<string, number>>(
  (acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc),
  {},
);
console.log('[celestial] events', counts);
