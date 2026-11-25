import Globe from 'globe.gl';
import { Vector3 } from 'three';
import type { SkyEvent } from '../data/skyEvents';
import { darkness, wrapLng, type LatLng } from '../sky/sun';
import { createDayNightMaterial } from './dayNightMaterial';

export interface SkyGlobe {
  setEvents(events: SkyEvent[]): void;
  setIss(iss: SkyEvent, trail: LatLng[]): void;
  /** Move the sun (and so the night line). Events dim the further they are from darkness. */
  setSun(sun: LatLng): void;
  onSelect(cb: (event: SkyEvent) => void): void;
  /** User dragged the night line to a new sun position; null = double-clicked to return to real time. */
  onSunDrag(cb: (sun: LatLng | null) => void): void;
  /** Show fireballs as of this moment (ms): ones that hadn't happened yet are hidden. */
  setFireballTime(t: number): void;
}

const FIREBALL_RGB = '255, 90, 54'; // redder than the sodium-orange city lights on the night texture
const ISS_RGB = '232, 244, 255';
const DAY_OPACITY = 0.15; // how much of an event survives in daylight
const AURORA_RECOMPUTE_MS = 200; // heatmap KDE is async + heavy; redo it once dragging settles

/** Where the night line crosses the equator: grab points for dragging it. */
interface Handle {
  kind: 'handle';
  side: 'dusk' | 'dawn';
  lat: number;
  lng: number;
}
const SIDE_OFFSET = { dusk: 90, dawn: -90 } as const; // degrees east of the subsolar point

/** Globe rendering only: real-sun terminator, aurora heat layer, fireball points, moving ISS. No UI chrome. */
export function createGlobe(el: HTMLElement): SkyGlobe {
  let onSelect: (event: SkyEvent) => void = () => {};
  let onSunDrag: (sun: LatLng | null) => void = () => {};
  // globe.gl stashes its three.js objects on our data (__threeObj*); hand out a clean copy
  const selectCb = (d: object) =>
    onSelect(Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('__'))) as SkyEvent);

  let sun: LatLng = { lat: 0, lng: 0 };
  const lit = (p: LatLng) => DAY_OPACITY + (1 - DAY_OPACITY) * darkness(p, sun);

  let fireballs: SkyEvent[] = [];
  let fireballTime = Date.now();
  const showFireballs = () =>
    globe.pointsData(fireballs.filter((e) => Date.parse(e.time) <= fireballTime));

  const material = createDayNightMaterial();
  const handles: Handle[] = [
    { kind: 'handle', side: 'dusk', lat: 0, lng: 0 },
    { kind: 'handle', side: 'dawn', lat: 0, lng: 0 },
  ];
  let issEl: SkyEvent | null = null;
  let issDot: HTMLElement | null = null;
  let auroraTimer: ReturnType<typeof setTimeout> | undefined;

  const globe = new Globe(el)
    .globeMaterial(material)
    .backgroundImageUrl('/textures/night-sky.png')
    .atmosphereColor('#3a6df0')
    .atmosphereAltitude(0.18)
    // fireballs: radius by impact energy (log, since it spans 0.07 kt to 400+ kt)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(0.01)
    .pointRadius((d) => 0.35 + Math.log10(1 + (d as SkyEvent).intensity) * 0.6)
    .pointColor((d) => `rgba(${FIREBALL_RGB}, ${lit(d as SkyEvent)})`)
    .pointLabel((d) => (d as SkyEvent).label)
    .onPointClick((d) => selectCb(d))
    .pointsTransitionDuration(0)
    // the aurora heatmap is a full-sphere shell above the points; let clicks pass through it
    .pointerEventsFilter((obj) => (obj as { __globeObjType?: string }).__globeObjType !== 'heatmap')
    // aurora: one heatmap made of every probability point, faded where the sky isn't dark
    .heatmapPoints((d) => d as SkyEvent[])
    .heatmapPointLat('lat')
    .heatmapPointLng('lng')
    .heatmapPointWeight((d) => ((d as SkyEvent).intensity / 100) * darkness(d as SkyEvent, sun))
    .heatmapBandwidth(1.6)
    .heatmapColorSaturation(2)
    .heatmapTopAltitude(0.02)
    .heatmapColorFn(() => (t: number) => `rgba(80, 255, 170, ${Math.min(1, t) * 0.75})`)
    .heatmapsTransitionDuration(0)
    // ISS dot + night-line handles share the html layer
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude((d) => ((d as Handle).kind === 'handle' ? 0.01 : 0.06))
    .htmlTransitionDuration(0)
    .htmlElement((d) => ((d as Handle).kind === 'handle' ? handleEl(d as Handle) : issElement(d)))
    // ISS trail
    .pathPoints((d) => d as LatLng[])
    .pathPointLat('lat')
    .pathPointLng('lng')
    .pathPointAlt(0.06)
    .pathColor(() => {
      const a = issEl ? lit(issEl) : 1;
      return [`rgba(${ISS_RGB}, 0)`, `rgba(${ISS_RGB}, ${a})`];
    })
    .pathStroke(1.2)
    .pathTransitionDuration(0);

  function issElement(d: object) {
    issDot = document.createElement('div');
    issDot.className = 'iss-dot';
    issDot.title = (d as SkyEvent).label;
    issDot.onclick = () => selectCb(d);
    return issDot;
  }

  function handleEl(h: Handle) {
    const node = document.createElement('div');
    node.className = 'night-handle';
    node.title = 'Drag to move the night · double-click for real time';
    node.onpointerdown = (down) => {
      down.preventDefault();
      down.stopPropagation();
      globe.controls().enabled = false;
      const rect = el.getBoundingClientRect();
      const move = (e: PointerEvent) => {
        const p = globe.toGlobeCoords(e.clientX - rect.left, e.clientY - rect.top);
        if (p) onSunDrag({ lat: sun.lat, lng: wrapLng(p.lng - SIDE_OFFSET[h.side]) });
      };
      const up = () => {
        globe.controls().enabled = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    node.ondblclick = () => onSunDrag(null);
    return node;
  }

  const refreshHtml = () => globe.htmlElementsData(issEl ? [issEl, ...handles] : handles);

  const fit = () => globe.width(el.clientWidth).height(el.clientHeight);
  window.addEventListener('resize', fit);
  fit();

  return {
    setEvents(events) {
      fireballs = events.filter((e) => e.type === 'fireball');
      showFireballs();
      globe.heatmapsData([events.filter((e) => e.type === 'aurora')]);
    },
    setIss(iss, trail) {
      // keep one object so globe.gl reuses the html element instead of rebuilding it each second
      issEl = Object.assign(issEl ?? {}, iss);
      refreshHtml();
      globe.pathsData([trail]);
      if (issDot) issDot.style.opacity = String(lit(issEl));
    },
    setSun(next) {
      sun = next;
      const c = globe.getCoords(sun.lat, sun.lng);
      material.uniforms.sunDirection.value = new Vector3(c.x, c.y, c.z).normalize();

      for (const h of handles) h.lng = wrapLng(sun.lng + SIDE_OFFSET[h.side]);
      refreshHtml();

      // re-run the accessors so every event picks up the new darkness
      globe.pointColor(globe.pointColor());
      if (issEl && issDot) issDot.style.opacity = String(lit(issEl));
      clearTimeout(auroraTimer);
      auroraTimer = setTimeout(
        () => globe.heatmapPointWeight(globe.heatmapPointWeight()),
        AURORA_RECOMPUTE_MS,
      );
    },
    onSelect(cb) {
      onSelect = cb;
    },
    onSunDrag(cb) {
      onSunDrag = cb;
    },
    setFireballTime(t) {
      fireballTime = t;
      showFireballs();
    },
  };
}
