import type { SkyEvent } from '../data/skyEvents';
import type { TapestryKind } from '../ui/tapestry';

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
export const ANCHOR: Record<TapestryKind, [number, number]> = {
  fireball: [0.9, 0.74],
  aurora: [0.5, 0.86],
  iss: [0.5, 0.5],
};

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

/** The sprites themselves are printed onto the globe (see skySprites.ts); the html layer only carries labels. */
export function markElement(m: SkyMark): HTMLElement {
  const el = document.createElement('div');
  el.className = `cel-mark cel-mark--${m.sprite}`;
  if (m.label) {
    const tag = document.createElement('div');
    tag.className = 'cel-mark__label cel-poster';
    tag.textContent = m.label;
    el.append(tag);
  }
  return el;
}
