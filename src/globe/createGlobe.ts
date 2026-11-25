import Globe from 'globe.gl';
import type { SkyEvent } from '../data/skyEvents';

export interface SkyGlobe {
  setEvents(events: SkyEvent[]): void;
  setIss(iss: SkyEvent, trail: { lat: number; lng: number }[]): void;
  onSelect(cb: (event: SkyEvent) => void): void;
}

const FIREBALL_COLOR = '#ff5a36'; // redder than the sodium-orange city lights on the night texture
const ISS_COLOR = '#e8f4ff';

/** Plain globe: textures, aurora heat layer, fireball points, moving ISS. No UI chrome. */
export function createGlobe(el: HTMLElement): SkyGlobe {
  let onSelect: (event: SkyEvent) => void = () => {};
  // globe.gl stashes its three.js objects on our data (__threeObj*); hand out a clean copy
  const selectCb = (d: object) =>
    onSelect(Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('__'))) as SkyEvent);

  const globe = new Globe(el)
    .globeImageUrl('/textures/earth-night.jpg')
    .backgroundImageUrl('/textures/night-sky.png')
    .atmosphereColor('#3a6df0')
    .atmosphereAltitude(0.18)
    // fireballs: radius by impact energy (log, since it spans 0.07 kt to 400+ kt)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(0.01)
    .pointRadius((d) => 0.35 + Math.log10(1 + (d as SkyEvent).intensity) * 0.6)
    .pointColor(() => FIREBALL_COLOR)
    .pointLabel((d) => (d as SkyEvent).label)
    .onPointClick((d) => selectCb(d))
    // the aurora heatmap is a full-sphere shell above the points; let clicks pass through it
    .pointerEventsFilter((obj) => (obj as { __globeObjType?: string }).__globeObjType !== 'heatmap')
    // aurora: one heatmap made of every probability point
    .heatmapPointLat('lat')
    .heatmapPointLng('lng')
    .heatmapPointWeight((d) => (d as SkyEvent).intensity / 100)
    .heatmapBandwidth(1.6)
    .heatmapColorSaturation(2)
    .heatmapTopAltitude(0.02)
    .heatmapColorFn(() => (t: number) => `rgba(80, 255, 170, ${Math.min(1, t) * 0.75})`)
    .heatmapsTransitionDuration(0)
    // ISS: html dot + path trail
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.06)
    .htmlTransitionDuration(0)
    .htmlElement((d) => {
      const dot = document.createElement('div');
      dot.className = 'iss-dot';
      dot.title = (d as SkyEvent).label;
      dot.onclick = () => selectCb(d);
      return dot;
    })
    .heatmapPoints((d) => d as SkyEvent[])
    .pathPoints((d) => d as { lat: number; lng: number }[])
    .pathPointLat('lat')
    .pathPointLng('lng')
    .pathPointAlt(0.06)
    .pathColor(() => ['rgba(232,244,255,0)', ISS_COLOR])
    .pathStroke(1.2)
    .pathTransitionDuration(0);

  let issEl: SkyEvent | null = null;

  const fit = () => globe.width(el.clientWidth).height(el.clientHeight);
  window.addEventListener('resize', fit);
  fit();

  return {
    setEvents(events) {
      globe.pointsData(events.filter((e) => e.type === 'fireball'));
      globe.heatmapsData([events.filter((e) => e.type === 'aurora')]);
    },
    setIss(iss, trail) {
      // keep one object so globe.gl reuses the html element instead of rebuilding it each second
      issEl = Object.assign(issEl ?? {}, iss);
      globe.htmlElementsData([issEl]);
      globe.pathsData([trail]);
    },
    onSelect(cb) {
      onSelect = cb;
    },
  };
}
