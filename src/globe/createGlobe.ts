import Globe from 'globe.gl';
import { Vector3 } from 'three';
import type { SkyEvent } from '../data/skyEvents';
import { angularDistance, darkness, wrapLng, type LatLng } from '../sky/sun';
import { createArmillary } from './armillary';
import { createClouds } from './clouds';
import { createDayNightMaterial } from './dayNightMaterial';
import { createLabels, fireballStar, issDiamond, nightHandle, type Touchable } from './interactive';
import { createAsciiLayer } from './asciiLayer';
import { createFireballMarks } from './marks';

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
  let shownFireballs: SkyEvent[] = [];
  const showFireballs = () => {
    shownFireballs = fireballs.filter((e) => Date.parse(e.time) <= fireballTime);
    fireballMarks.setShown(shownFireballs, lit);
    ascii.setFireballs(shownFireballs, lit);
    refreshObjects();
  };

  // Everything you can touch is a solid object in globe.gl's objects layer: the layer places it,
  // raycasts it for hover and click, and hides it behind the planet. See interactive.ts.
  const touchables = new Map<object, Touchable>();
  const touchableFor = (d: object): Touchable => {
    let t = touchables.get(d);
    if (!t) {
      const ev = d as SkyEvent;
      t =
        (d as Handle).kind === 'handle'
          ? nightHandle()
          : ev.type === 'iss'
            ? issDiamond(ev.label)
            : fireballStar(5 + Math.log10(1 + ev.intensity) * 6, ev.label, (ev.lng + ev.lat) * 0.7); // world units; globe radius 100
      touchables.set(d, t);
    }
    return t;
  };
  const alphaFor = (d: object) => {
    if ((d as Handle).kind === 'handle') return 1;
    return lit(d as SkyEvent) * eventsIntro;
  };
  const refreshObjects = () => {
    const data: object[] = [...shownFireballs, ...(issEl ? [issEl] : []), ...handles];
    const keep = new Set(data);
    for (const d of touchables.keys()) if (!keep.has(d)) touchables.delete(d);
    for (const d of data) touchableFor(d).setAlpha(alphaFor(d));
    globe.objectsData(data);
  };

  const { material, loaded } = createDayNightMaterial();
  const handles: Handle[] = [
    { kind: 'handle', side: 'dusk', lat: 0, lng: 0 },
    { kind: 'handle', side: 'dawn', lat: 0, lng: 0 },
  ];
  let issEl: SkyEvent | null = null;

  const globe = new Globe(el, { animateIn: false })
    .globeMaterial(material)
    // the sky is the page's ground ink (see ui/tokens.css), not a photo
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(false)
    // fireball stars, the ISS and the night handles: solid objects, each facing out from the ground
    .objectLat('lat')
    .objectLng('lng')
    .objectAltitude((d) => ((d as Handle).kind === 'handle' ? 0.01 : (d as SkyEvent).type === 'iss' ? 0.06 : 0.012))
    .objectFacesSurface(true)
    .objectThreeObject((d) => touchableFor(d).root)
    .objectLabel(() => '') // labels are printed in the scene instead (createLabels)
    .onObjectHover((d) => setHovered(d ? touchables.get(d) ?? null : null, d))
    .onObjectClick((d) => {
      if ((d as Handle).kind !== 'handle') selectCb(d);
    })
    .onGlobeClick((p) => {
      const hit = pickAurora(p);
      if (hit) selectCb(hit);
      else {
        flyTo(null);
        onSelect(null);
      }
    })
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
  const ascii = createAsciiLayer(globe); // the Paper tapestry sprites, printed into the scene
  const clouds = createClouds(globe);

  const issOpacity = () => {
    if (issEl) touchableFor(issEl).setAlpha(alphaFor(issEl));
  };

  // ---- hover: one thing at a time; it gets its own move, and a label rises out of it
  const labels = createLabels(globe.scene());
  let hovered: Touchable | null = null;
  let hoveredDatum: object | null = null;
  let dragging: { t: Touchable; h: Handle } | null = null;
  function setHovered(t: Touchable | null, d: object | null) {
    if (dragging) return; // a handle being dragged keeps the pointer's attention
    if (t === hovered) return;
    if (hovered) {
      hovered.setHover(false);
      labels.hide(hovered.root);
    }
    hovered = t;
    hoveredDatum = t ? d : null;
    if (t) {
      t.setHover(true);
      labels.show(t.root, t.label);
    }
    fireballMarks.setHovered(t?.kind === 'fireball' ? (d as SkyEvent).id : null);
    ascii.hoverFireball(t?.kind === 'fireball' ? (d as SkyEvent).id : null);
    ascii.hoverIss(t?.kind === 'iss');
    el.style.cursor = !t ? '' : t.kind === 'handle' ? 'grab' : 'pointer';
  }

  // dragging a night handle: grab it before OrbitControls sees the press
  el.addEventListener(
    'pointerdown',
    (down) => {
      if (hovered?.kind !== 'handle' || !hoveredDatum) return;
      down.preventDefault();
      down.stopPropagation();
      dragging = { t: hovered, h: hoveredDatum as Handle };
      dragging.t.setActive(true);
      el.style.cursor = 'grabbing';
      const rect = el.getBoundingClientRect();
      const move = (e: PointerEvent) => {
        const p = globe.toGlobeCoords(e.clientX - rect.left, e.clientY - rect.top);
        if (p && dragging) onSunDrag({ lat: sun.lat, lng: wrapLng(p.lng - SIDE_OFFSET[dragging.h.side]) });
      };
      const up = () => {
        dragging?.t.setActive(false);
        dragging = null;
        el.style.cursor = hovered?.kind === 'handle' ? 'grab' : '';
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    { capture: true },
  );
  // over bare globe, the ASCII aurora answers: it surges under the pointer
  let groundRaf = 0;
  let groundAt: { x: number; y: number } | null = null;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    groundAt = { x: e.clientX - r.left, y: e.clientY - r.top };
    groundRaf ||= requestAnimationFrame(() => {
      groundRaf = 0;
      ascii.hoverGround(!hovered && groundAt ? globe.toGlobeCoords(groundAt.x, groundAt.y) : null);
    });
  });
  el.addEventListener('pointerleave', () => ascii.hoverGround(null));
  el.addEventListener('dblclick', () => {
    if (hovered?.kind === 'handle') onSunDrag(null);
  });

  const armillary = createArmillary(globe);
  globe.pointOfView({ lat: 24, lng: -30, altitude: 2.9 }); // tilted so the rings open into ellipses
  window.addEventListener('celestial:view', (e) => {
    view = (e as CustomEvent<'armillary' | 'horizon'>).detail;
    armillary.setView(view);
  });

  // the selected fireball stays raised while its card is open
  let selectedStar: Touchable | null = null;
  window.addEventListener('celestial:select', (e) => {
    const ev = (e as CustomEvent<SkyEvent | null>).detail;
    selectedStar?.setActive(false);
    selectedStar = null;
    ascii.select(ev?.type === 'fireball' ? ev.id : null);
    if (ev?.type === 'fireball')
      for (const [d, t] of touchables) if ((d as SkyEvent).id === ev.id) (selectedStar = t).setActive(true);
  });

  // slow turn until someone takes hold of the globe
  const controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.addEventListener('start', () => (controls.autoRotate = false));

  // one clock for the draw-in and the aurora shimmer
  let introStart = Infinity;
  loaded.then(() => (introStart = performance.now()));
  let lastFrame = 0;
  const frame = (now: number) => {
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 1 / 60;
    lastFrame = now;
    for (const t of touchables.values()) t.tick(dt, now / 1000);
    labels.tick(dt);
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
      ascii.setIntro(ev);
      for (const [d, t] of touchables) t.setAlpha(alphaFor(d));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);


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
      ascii.setAurora(aurora, sun);
    },
    setIss(iss, trail) {
      // keep one object so globe.gl reuses the ISS object instead of rebuilding it each second
      issEl = Object.assign(issEl ?? {}, iss);
      refreshObjects();
      globe.pathsData([trail]);
      armillary.setOrbit(trail);
      ascii.setIss(issEl, trail);
      issOpacity();
    },
    setSun(next, date = new Date()) {
      sun = next;
      const c = globe.getCoords(sun.lat, sun.lng);
      const dir = new Vector3(c.x, c.y, c.z).normalize();
      material.uniforms.sunDirection.value.copy(dir);
      armillary.setSun(dir, date);
      clouds.setSun(dir);

      for (const h of handles) h.lng = wrapLng(sun.lng + SIDE_OFFSET[h.side]);

      // every event picks up the new darkness
      fireballMarks.setShown(shownFireballs, lit);
      ascii.setFireballs(shownFireballs, lit);
      ascii.setAurora(aurora, sun);
      refreshObjects();
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
