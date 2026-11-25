# Celestial

A 3D globe of rare sky events happening on Earth right now: aurora, fireballs and the ISS.

```bash
npm install
npm run dev
```

## Layout

| Path | Role |
|---|---|
| `src/data/skyEvents.ts` | `getSkyEvents()` returns normalized `SkyEvent[]`; `watchIss()` ticks the live ISS position every second |
| `src/globe/createGlobe.ts` | globe.gl rendering only, no UI chrome |
| `src/globe/dayNightMaterial.ts` | globe shader: city lights at night, dimmed day map, glowing night line |
| `src/sky/sun.ts` | subsolar point from the date, and how dark any spot is |
| `src/ui/timeSlider.ts` | bare fireball time scrubber |
| `src/ui/detailCard.ts` | bare event detail card |
| `src/main.ts` | wires data → globe, holds `state` |
| `api/fireball.ts` | Vercel function proxying JPL (no CORS); `vite.config.ts` mirrors it in dev |
| `public/fallback/*.json` | snapshots used when a live feed fails, so the demo never breaks |

## Hooking up UI

Clicking an event sets `state.selected`, opens the bare card in `src/ui/detailCard.ts`, and fires a window event. Clicking empty globe, the card's ×, or Escape sends `null`:

```ts
window.addEventListener('celestial:select', (e) => {
  const event = (e as CustomEvent<SkyEvent | null>).detail;
  // { id, type: 'aurora' | 'fireball' | 'iss', lat, lng, time, intensity, label, details } or null
});
```

The aurora heatmap can't be hit-tested per point, so a click picks the nearest aurora cell within 3° that is currently dark. The card renders with `textContent` only, since every value comes from an outside feed. Restyle it via `.detail-card`, `[data-type]` and the `detail-card__*` classes, or hide it and render your own from the event.

`intensity` means: aurora = probability (0–100), fireball = impact energy (kt), ISS = altitude (km).

The night line follows the real sun. Drag the ring where it crosses the equator to move it; double-click the ring to return to real time. Events fade the further they sit from darkness (civil twilight, sun 6° below the horizon). Each move fires:

```ts
window.addEventListener('celestial:sun', (e) => {
  const { sun, overridden } = (e as CustomEvent).detail; // sun = subsolar { lat, lng }
});
```

Sun math check: `node src/sky/sun.check.ts`

The time slider (`src/ui/timeSlider.ts`, a plain `<input type="range">`) scrubs from the oldest fireball to now, one day per step. Fireballs that hadn't happened yet disappear. Each move sets `state.fireballTime` and fires `celestial:time` with the time in ms.

## Data sources

- Aurora: NOAA SWPC OVATION (points with probability ≥ 10, strongest per 2° cell)
- Fireballs: NASA JPL CNEOS fireball API, latest 200
- ISS: CelesTrak orbital elements, propagated in the browser with satellite.js
