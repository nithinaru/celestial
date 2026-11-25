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
| `src/main.ts` | wires data → globe, holds `state` |
| `api/fireball.ts` | Vercel function proxying JPL (no CORS); `vite.config.ts` mirrors it in dev |
| `public/fallback/*.json` | snapshots used when a live feed fails, so the demo never breaks |

## Hooking up UI

Clicking an event sets `state.selected` and fires a window event:

```ts
window.addEventListener('celestial:select', (e) => {
  const event = (e as CustomEvent<SkyEvent>).detail;
  // { id, type: 'aurora' | 'fireball' | 'iss', lat, lng, time, intensity, label, details }
});
```

`intensity` means: aurora = probability (0–100), fireball = impact energy (kt), ISS = altitude (km).

## Data sources

- Aurora: NOAA SWPC OVATION (points with probability ≥ 10, strongest per 2° cell)
- Fireballs: NASA JPL CNEOS fireball API, latest 200
- ISS: CelesTrak orbital elements, propagated in the browser with satellite.js
