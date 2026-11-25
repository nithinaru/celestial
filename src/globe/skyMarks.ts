import type { SkyEvent } from '../data/skyEvents';
import { createTapestry, type TapestryKind } from '../ui/tapestry';

/**
 * The things that move, drawn in characters and pinned to the globe:
 *   - an aurora curtain standing over the brightest part of the oval,
 *   - a fireball streak arriving at whichever fireball is selected, with its place label.
 * They ride in the globe's html layer, so they stay glued to their spot as it turns.
 */
export interface SkyMark {
  kind: 'mark';
  sprite: TapestryKind;
  lat: number;
  lng: number;
  label?: string;
}

// Where in the picture the "real" point is, as a fraction of its width and height:
// the fireball's burning head, and the foot of the aurora's brightest curtain.
const ANCHOR: Record<TapestryKind, [number, number]> = {
  fireball: [0.9, 0.74],
  aurora: [0.5, 0.86],
  iss: [0.5, 0.5],
};
const CELL: Record<TapestryKind, number> = { fireball: 1.9, aurora: 1.5, iss: 0.8 };
const SIZE: Record<TapestryKind, [number, number]> = { fireball: [110, 44], aurora: [120, 60], iss: [80, 40] };

const marks: { aurora: SkyMark | null; fireball: SkyMark | null } = { aurora: null, fireball: null };

export const skyMarks = () => [marks.aurora, marks.fireball].filter((m): m is SkyMark => m !== null);

/** Stand the curtain over the single most likely place to see the aurora right now. */
export function setAuroraMark(aurora: SkyEvent[]): void {
  const best = aurora.reduce<SkyEvent | null>((a, e) => (!a || e.intensity > a.intensity ? e : a), null);
  if (!best) return void (marks.aurora = null);
  // keep one object so globe.gl reuses the element instead of rebuilding it on every refresh
  marks.aurora = Object.assign(marks.aurora ?? { kind: 'mark', sprite: 'aurora' }, {
    lat: best.lat,
    lng: best.lng,
  }) as SkyMark;
}

/** A selected fireball gets its streak and a label; anything else clears it. Returns true if it changed. */
export function setSelectedMark(event: SkyEvent | null): boolean {
  const next: SkyMark | null =
    event?.type === 'fireball'
      ? { kind: 'mark', sprite: 'fireball', lat: event.lat, lng: event.lng, label: 'Fireball' }
      : null;
  const changed = (next?.lat ?? null) !== (marks.fireball?.lat ?? null) || (next?.lng ?? null) !== (marks.fireball?.lng ?? null);
  if (changed) marks.fireball = next;
  return changed;
}

export function markElement(m: SkyMark): HTMLElement {
  const [cols, rows] = SIZE[m.sprite];
  const [ax, ay] = ANCHOR[m.sprite];
  const w = cols * CELL[m.sprite];
  const h = rows * CELL[m.sprite];

  const el = document.createElement('div');
  el.className = `cel-mark cel-mark--${m.sprite}`;
  // the tapestry centres itself on its parent; shift it so its anchor lands on the point
  const art = document.createElement('div');
  art.className = 'cel-mark__art';
  art.style.left = `${(0.5 - ax) * w}px`;
  art.style.top = `${(0.5 - ay) * h}px`;
  art.append(createTapestry(m.sprite, { cell: CELL[m.sprite] }).el);
  el.append(art);

  if (m.label) {
    const tag = document.createElement('div');
    tag.className = 'cel-mark__label cel-poster';
    tag.textContent = m.label;
    el.append(tag);
  }
  return el;
}
