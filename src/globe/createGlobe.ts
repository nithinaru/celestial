import Globe from 'globe.gl';
import { Vector3 } from 'three';
import type { SkyEvent } from '../data/skyEvents';
import { angularDistance, darkness, wrapLng, type LatLng } from '../sky/sun';
import { createArmillary } from './armillary';
import { createDayNightMaterial } from './dayNightMaterial';
import { ANCHOR, markElement, setAuroraMark, setSelectedMark, skyMarks, type SkyMark } from './skyMarks';
import { createSkySprite, type SkySprite } from './skySprites';

export interface SkyGlobe {
  setEvents(events: SkyEvent[]): void;
  setIss(iss: SkyEvent, trail: LatLng[]): void;
  /** Move the sun (and so the night line). Events dim the further they are from darkness. */
  setSun(sun: LatLng): void;
  /** An event was clicked; null = clicked empty globe. */
  onSelect(cb: (event: SkyEvent | null) => void): void;
  /** User dragged the night line to a new sun position; null = double-clicked to return to real time. */
  onSunDrag(cb: (sun: LatLng | null) => void): void;
  /** Show fireballs as of this moment (ms): ones that hadn't happened yet are hidden. */
  setFireballTime(t: number): void;
}

const ISS_RGB = '241, 230, 200'; // --ink-type
const DAY_OPACITY = 0.15; // how much of an event survives in daylight
const AURORA_RECOMPUTE_MS = 200; // heatmap KDE is async + heavy; redo it once dragging settles
const AURORA_PICK_DEG = 3; // aurora cells are 2° apart; a click within 3° counts as on the glow

/** Where the night line crosses the equator: grab points for dragging it. */
interface Handle {
  kind: 'handle';
  side: 'dusk' | 'dawn';
  lat: number;
  lng: number;
}
const SIDE_OFFSET = { dusk: 90, dawn: -90 } as const; // degrees east of the subsolar point
const SELECTED_SCALE = 1.9; // a selected fireball's streak grows to meet the card
const GEOMAGNETIC_POLE = { lat: 80.7, lng: -72.7 }; // the aurora curtain bends round this

/** Meteors come in from every direction; give each a stable one so it doesn't spin between refreshes. */
function headingFor(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 360) - 180;
}
/** Initial compass bearing from a to b, degrees clockwise from north. */
function bearing(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x =
    Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return Math.atan2(y, x) / r;
}

/** Globe rendering only: real-sun terminator, aurora heat layer, fireball points, moving ISS. No UI chrome. */
export function createGlobe(el: HTMLElement): SkyGlobe {
  let onSelect: (event: SkyEvent | null) => void = () => {};
  let onSunDrag: (sun: LatLng | null) => void = () => {};
  // globe.gl stashes its three.js objects on our data (__threeObj*); hand out a clean copy
  const selectCb = (d: object) =>
    onSelect(Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('__'))) as SkyEvent);

  let sun: LatLng = { lat: 0, lng: 0 };
  const lit = (p: LatLng) => DAY_OPACITY + (1 - DAY_OPACITY) * darkness(p, sun);

  let fireballs: SkyEvent[] = [];
  let aurora: SkyEvent[] = [];

  // The heatmap has no per-point hit testing, so a globe click picks the nearest visible aurora cell.
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
  // Each fireball is drawn as the poster's streak, printed onto the globe; the points underneath
  // stay as invisible hit targets so clicking still works.
  const streaks = new Map<string, { sprite: SkySprite; event: SkyEvent }>();
  let selectedId: string | null = null;
  const showFireballs = () => {
    const shown = fireballs.filter((e) => Date.parse(e.time) <= fireballTime);
    globe.pointsData(shown);
    const keep = new Set(shown.map((e) => e.id));
    for (const [id, s] of streaks)
      if (!keep.has(id)) {
        s.sprite.setPlace(null); // fades, then removes itself
        streaks.delete(id);
      }
    for (const e of shown) {
      let s = streaks.get(e.id);
      if (!s) {
        const sprite = createSkySprite(
          globe,
          'fireball',
          ANCHOR.fireball,
          // bigger impacts, bigger streaks (log, since energy spans 0.07 kt to 400+ kt)
          { type: 'shell', widthDeg: 5 + Math.log10(1 + e.intensity) * 3.5, alt: 0.012, lift: 0.05 },
          { reveal: true, disposable: true },
        );
        s = { sprite, event: e };
        streaks.set(e.id, s);
        sprite.setPlace({ lat: e.lat, lng: e.lng, heading: headingFor(e.id) });
        sprite.setScale(e.id === selectedId ? SELECTED_SCALE : 1);
      }
      s.sprite.setOpacity(lit(e));
    }
  };

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
    // the sky is the page's ground ink (see ui/tokens.css), not a photo
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(false)
    // fireballs: radius by impact energy (log, since it spans 0.07 kt to 400+ kt)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(0.01)
    .pointRadius((d) => 0.75 + Math.log10(1 + (d as SkyEvent).intensity) * 0.75)
    .pointColor(() => 'rgba(0, 0, 0, 0)') // hit targets only: the streak sprites carry the picture
    .pointLabel((d) => (d as SkyEvent).label)
    .onPointClick((d) => selectCb(d))
    .onGlobeClick((p) => {
      const hit = pickAurora(p);
      if (hit) selectCb(hit);
      else onSelect(null);
    })
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
    .heatmapColorFn(() => (t: number) =>
      // two printed layers of poster green instead of a soft glow
      t > 0.42 ? 'rgba(155, 210, 74, 1)' : t > 0.16 ? 'rgba(155, 210, 74, 0.55)' : 'rgba(155, 210, 74, 0)',
    )
    // blend each recompute in (and fade the first one up) instead of popping; a recompute that
    // lands mid-blend starts from the current values, so it retargets rather than jumps
    .heatmapsTransitionDuration(300)
    // ISS dot + night-line handles share the html layer
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude((d) => ((d as Handle).kind === 'handle' ? 0.01 : (d as SkyMark).kind === 'mark' ? 0.025 : 0.06))
    .htmlTransitionDuration(0)
    .htmlElement((d) =>
      (d as Handle).kind === 'handle'
        ? handleEl(d as Handle)
        : (d as SkyMark).kind === 'mark'
          ? markElement(d as SkyMark)
          : issElement(d),
    )
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
    // the station itself is printed onto the globe (issSprite); this is just its click target
    issDot.style.width = issDot.style.height = '26px';
    issDot.title = (d as SkyEvent).label;
    issDot.onclick = () => selectCb(d);
    // the globe counts a click from pointerdown on its container; don't let it also see an empty-globe click
    issDot.onpointerdown = (e) => e.stopPropagation();
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

  const armillary = createArmillary(globe);

  const poleAt = globe.getCoords(GEOMAGNETIC_POLE.lat, GEOMAGNETIC_POLE.lng);
  const auroraCurtain = createSkySprite(globe, 'aurora', ANCHOR.aurora, {
    type: 'curtain',
    pole: new Vector3(poleAt.x, poleAt.y, poleAt.z).normalize(),
    spanDeg: 46,
    height: 0.2,
    tiltDeg: 28,
    alt: 0.012,
  });
  const issSprite = createSkySprite(globe, 'iss', ANCHOR.iss, { type: 'shell', widthDeg: 9, alt: 0.06 });
  const syncMarks = () => {
    const a = skyMarks().find((m) => m.sprite === 'aurora');
    auroraCurtain.setPlace(a ? { lat: a.lat, lng: a.lng } : null);
  };
  globe.pointOfView({ lat: 24, lng: -30, altitude: 2.9 }); // tilted so the rings open into ellipses
  window.addEventListener('celestial:view', (e) =>
    armillary.setView((e as CustomEvent<'armillary' | 'horizon'>).detail),
  );

  const refreshHtml = () =>
    globe.htmlElementsData([...(issEl ? [issEl] : []), ...handles, ...skyMarks().filter((m) => m.label)]);
  // a selected fireball's streak grows and gets its label; the rest settle back
  window.addEventListener('celestial:select', (e) => {
    const ev = (e as CustomEvent<SkyEvent | null>).detail;
    const next = ev?.type === 'fireball' ? ev.id : null;
    if (next !== selectedId) {
      streaks.get(selectedId ?? '')?.sprite.setScale(1);
      streaks.get(next ?? '')?.sprite.setScale(SELECTED_SCALE);
      selectedId = next;
    }
    if (setSelectedMark(ev)) refreshHtml();
  });

  const fit = () => globe.width(el.clientWidth).height(el.clientHeight);
  window.addEventListener('resize', fit);
  fit();

  return {
    setEvents(events) {
      fireballs = events.filter((e) => e.type === 'fireball');
      showFireballs();
      aurora = events.filter((e) => e.type === 'aurora');
      globe.heatmapsData([aurora]);
      setAuroraMark(aurora);
      syncMarks();
      refreshHtml();
    },
    setIss(iss, trail) {
      // keep one object so globe.gl reuses the html element instead of rebuilding it each second
      issEl = Object.assign(issEl ?? {}, iss);
      refreshHtml();
      // the station glides between its once-a-second fixes, nose along the orbit
      const prev = trail.length > 1 ? trail[trail.length - 2] : null;
      issSprite.setPlace({ lat: iss.lat, lng: iss.lng, heading: prev ? bearing(prev, iss) : 90 });
      issSprite.setOpacity(lit(issEl));
      globe.pathsData([trail]);
      armillary.setOrbit(trail);
      if (issDot) issDot.style.opacity = String(lit(issEl));
    },
    setSun(next) {
      sun = next;
      const c = globe.getCoords(sun.lat, sun.lng);
      armillary.setSun(new Vector3(c.x, c.y, c.z).normalize());

      for (const h of handles) h.lng = wrapLng(sun.lng + SIDE_OFFSET[h.side]);
      refreshHtml();

      // every event picks up the new darkness
      for (const s of streaks.values()) s.sprite.setOpacity(lit(s.event));
      if (issEl) issSprite.setOpacity(lit(issEl));
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
