import Globe from 'globe.gl';
import { Vector3 } from 'three';
import type { SkyEvent } from '../data/skyEvents';
import { angularDistance, darkness, wrapLng, type LatLng } from '../sky/sun';
import { createArmillary } from './armillary';
import { createClouds } from './clouds';
import { createDayNightMaterial } from './dayNightMaterial';
import { createAuroraCurtain, createFireballMarks } from './marks';

export interface SkyGlobe {
  setEvents(events: SkyEvent[]): void;
  setIss(iss: SkyEvent, trail: LatLng[]): void;
  /** Move the sun (and so the night line). Events dim the further they are from darkness. */
  setSun(sun: LatLng, date?: Date): void;
  /** An event was clicked; null = clicked empty globe. */
  onSelect(cb: (event: SkyEvent | null) => void): void;
  /** User dragged the night line to a new sun position; null = double-clicked to return to real time. */
  onSunDrag(cb: (sun: LatLng | null) => void): void;
  /** Show fireballs as of this moment (ms): ones that hadn't happened yet are hidden. */
  setFireballTime(t: number): void;
}

const ISS_RGB = '241, 230, 200'; // --ink-type
const DAY_OPACITY = 0.15; // how much of an event survives in daylight
const AURORA_PICK_DEG = 3; // aurora cells are 2° apart; a click within 3° counts as on the curtain
const AUTO_ROTATE_SPEED = 0.12; // OrbitControls units: about 1.4°/s, one slow turn every ~4 minutes

/**
 * Draw-in on load, in the order an engraver would work: rings trace, coastlines trace,
 * fills arrive, and only then the events. Times in ms from when the land map is ready.
 */
const INTRO = {
  rings: [0, 1100],
  coast: [700, 1900],
  fill: [1700, 2500],
  events: [2400, 3300],
} as const;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const phase = (ms: number, [a, b]: readonly [number, number]) => ease((ms - a) / (b - a));

/** Where the night line crosses the equator: grab points for dragging it. */
interface Handle {
  kind: 'handle';
  side: 'dusk' | 'dawn';
  lat: number;
  lng: number;
}
const SIDE_OFFSET = { dusk: 90, dawn: -90 } as const; // degrees east of the subsolar point

/** Globe rendering only: engraved Earth, armillary rings, aurora curtain, fireball stars, ISS. No UI chrome. */
export function createGlobe(el: HTMLElement): SkyGlobe {
  let onSelect: (event: SkyEvent | null) => void = () => {};
  let onSunDrag: (sun: LatLng | null) => void = () => {};
  // globe.gl stashes its three.js objects on our data (__threeObj*); hand out a clean copy
  const selectCb = (d: object) => {
    const e = Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('__'))) as SkyEvent;
    flyTo(e);
    onSelect(e);
  };
  // clicking an event flies the camera down to it; clicking empty globe pulls back out
  let view: 'armillary' | 'horizon' = 'armillary';
  const flyTo = (e: SkyEvent | null) => {
    if (view !== 'armillary') return;
    globe.controls().autoRotate = false;
    globe.pointOfView(e ? { lat: e.lat, lng: e.lng, altitude: 1.45 } : { altitude: 2.9 }, 1300);
  };

  let sun: LatLng = { lat: 0, lng: 0 };
  const lit = (p: LatLng) => DAY_OPACITY + (1 - DAY_OPACITY) * darkness(p, sun);

  let fireballs: SkyEvent[] = [];
  let aurora: SkyEvent[] = [];
  let eventsIntro = 0;

  // The curtain has no per-stroke hit testing, so a globe click picks the nearest dark aurora cell.
  const pickAurora = (p: LatLng) => {
    let best: SkyEvent | null = null;
    let bestDist = AURORA_PICK_DEG;
    for (const a of aurora) {
      const dist = angularDistance(p, a);
      if (dist < bestDist && darkness(a, sun) > 0) [best, bestDist] = [a, dist];
    }
    return best;
  };
  let fireballTime = Date.now();
  const showFireballs = () => {
    const shown = fireballs.filter((e) => Date.parse(e.time) <= fireballTime);
    fireballMarks.setShown(shown, lit);
    globe.objectsData(shown);
  };

  const { material, loaded } = createDayNightMaterial();
  const handles: Handle[] = [
    { kind: 'handle', side: 'dusk', lat: 0, lng: 0 },
    { kind: 'handle', side: 'dawn', lat: 0, lng: 0 },
  ];
  let issEl: SkyEvent | null = null;
  let issDot: HTMLElement | null = null;

  const globe = new Globe(el, { animateIn: false })
    .globeMaterial(material)
    // the sky is the page's ground ink (see ui/tokens.css), not a photo
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(false)
    // fireball stars live in the objects layer so hover labels and clicks keep working
    .objectLat('lat')
    .objectLng('lng')
    .objectAltitude(0.012)
    .objectFacesSurface(false)
    .objectThreeObject((d) => fireballMarks.sprite(d as SkyEvent))
    .objectLabel((d) => (d as SkyEvent).label)
    .onObjectClick((d) => selectCb(d))
    .onObjectHover((d) => {
      fireballMarks.hover(d ? (d as SkyEvent).id : null);
      el.style.cursor = d ? 'pointer' : '';
    })
    .onGlobeClick((p) => {
      const hit = pickAurora(p);
      if (hit) selectCb(hit);
      else {
        flyTo(null);
        onSelect(null);
      }
    })
    // ISS diamond + night-line handles share the html layer
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
      const a = (issEl ? lit(issEl) : 1) * eventsIntro;
      return [`rgba(${ISS_RGB}, 0)`, `rgba(${ISS_RGB}, ${a})`];
    })
    .pathStroke(1)
    .pathTransitionDuration(0);

  const fireballMarks = createFireballMarks(globe);
  const curtain = createAuroraCurtain(globe);
  const clouds = createClouds(globe);

  function issElement(d: object) {
    issDot = document.createElement('div');
    issDot.className = 'iss-dot';
    issDot.title = (d as SkyEvent).label;
    issDot.onclick = () => selectCb(d);
    // the globe counts a click from pointerdown on its container; don't let it also see an empty-globe click
    issDot.onpointerdown = (e) => e.stopPropagation();
    return issDot;
  }
  const issOpacity = () => {
    if (issEl && issDot) issDot.style.opacity = String(lit(issEl) * eventsIntro);
  };

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

  const armillary = createArmillary(globe);
  globe.pointOfView({ lat: 24, lng: -30, altitude: 2.9 }); // tilted so the rings open into ellipses
  window.addEventListener('celestial:view', (e) => {
    view = (e as CustomEvent<'armillary' | 'horizon'>).detail;
    armillary.setView(view);
  });

  // slow turn until someone takes hold of the globe
  const controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.addEventListener('start', () => (controls.autoRotate = false));

  // one clock for the draw-in and the aurora shimmer
  let introStart = Infinity;
  loaded.then(() => (introStart = performance.now()));
  const frame = (now: number) => {
    const ms = now - introStart;
    armillary.setIntro(phase(ms, INTRO.rings));
    material.uniforms.coastTrace.value = phase(ms, INTRO.coast) * 1.001;
    material.uniforms.fill.value = phase(ms, INTRO.fill);
    clouds.frame(now / 1000, phase(ms, INTRO.fill));
    const ev = phase(ms, INTRO.events);
    if (ev !== eventsIntro) {
      eventsIntro = ev;
      armillary.setEventsIntro(ev);
      fireballMarks.setIntro(ev);
      issOpacity();
    }
    curtain.frame(now / 1000, eventsIntro, el.clientHeight * (window.devicePixelRatio || 1));
    fireballMarks.frame(now / 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const refreshHtml = () => globe.htmlElementsData(issEl ? [issEl, ...handles] : handles);

  // centre the star-chart backdrop (style.css #globe::before) on the Earth as actually drawn
  const centreBackdrop = () => {
    const c = globe.getScreenCoords(0, 0, -1); // altitude -1 = radius 0 = the Earth's centre
    el.style.setProperty('--cx', `${c.x}px`);
    el.style.setProperty('--cy', `${c.y}px`);
  };
  const fit = () => {
    globe.width(el.clientWidth).height(el.clientHeight);
    requestAnimationFrame(centreBackdrop); // after the armillary view offset has been applied
  };
  window.addEventListener('resize', fit);
  window.addEventListener('celestial:view', () => setTimeout(centreBackdrop, 1500));
  fit();

  return {
    setEvents(events) {
      fireballs = events.filter((e) => e.type === 'fireball');
      showFireballs();
      aurora = events.filter((e) => e.type === 'aurora');
      curtain.setEvents(aurora);
    },
    setIss(iss, trail) {
      // keep one object so globe.gl reuses the html element instead of rebuilding it each second
      issEl = Object.assign(issEl ?? {}, iss);
      refreshHtml();
      globe.pathsData([trail]);
      armillary.setOrbit(trail);
      issOpacity();
    },
    setSun(next, date = new Date()) {
      sun = next;
      const c = globe.getCoords(sun.lat, sun.lng);
      const dir = new Vector3(c.x, c.y, c.z).normalize();
      material.uniforms.sunDirection.value.copy(dir);
      armillary.setSun(dir, date);
      curtain.setSun(dir);
      clouds.setSun(dir);

      for (const h of handles) h.lng = wrapLng(sun.lng + SIDE_OFFSET[h.side]);
      refreshHtml();

      // every event picks up the new darkness
      fireballMarks.setShown(fireballs.filter((e) => Date.parse(e.time) <= fireballTime), lit);
      issOpacity();
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
