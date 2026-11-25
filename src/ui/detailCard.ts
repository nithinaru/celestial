import type { SkyEvent } from '../data/skyEvents';

/** Human labels + units for SkyEvent.details keys. Unknown keys fall back to the raw key. */
const FIELDS: Record<string, [label: string, unit: string]> = {
  probability: ['Chance of aurora', '%'],
  observed: ['Observed', ''],
  forecastFor: ['Forecast for', ''],
  impactEnergyKt: ['Impact energy', 'kt TNT'],
  radiatedEnergyJ: ['Light radiated', 'J'],
  altitudeKm: ['Altitude', 'km'],
  velocityKmS: ['Speed', 'km/s'],
  noradId: ['NORAD ID', ''],
  source: ['Source', ''],
};

const TITLES: Record<SkyEvent['type'], string> = {
  aurora: 'Aurora',
  fireball: 'Fireball',
  iss: 'Space station',
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

function fmtValue(v: string | number): string {
  if (typeof v === 'number') return Math.abs(v) >= 1e6 ? v.toExponential(1) : String(v);
  return /^\d{4}-\d\d-\d\dT/.test(v) ? fmtTime(v) : v;
}

/**
 * Bare detail card: shows one SkyEvent, closes on × or Escape.
 * Unstyled on purpose; the Paper design replaces the look, not the wiring.
 * Text only (no innerHTML): every value comes from an outside feed.
 */
export function createDetailCard(parent: HTMLElement, onClose: () => void) {
  const root = document.createElement('aside');
  root.className = 'detail-card';
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');
  parent.append(root);

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden && !closing) onClose();
  });

  // Motion: enter from slightly below, swap content with a quick settle, exit faster than it came.
  // Every call cancels the one before, so rapid selections never stack or snap.
  const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let anim: Animation | null = null;
  let closing = false;
  let shownId: string | null = null;
  const play = (dy: number, from: number, to: number, duration: number) => {
    anim?.cancel();
    const move = !reduced.matches && dy !== 0;
    anim = root.animate(
      [
        { opacity: from, transform: move && from < to ? `translateY(${dy}px)` : 'none' },
        { opacity: to, transform: move && from > to ? `translateY(${dy}px)` : 'none' },
      ],
      { duration, easing: EASE_OUT, fill: to === 0 ? 'forwards' : 'none' },
    );
    return anim;
  };

  return {
    show(event: SkyEvent | null) {
      if (!event) {
        shownId = null;
        if (root.hidden || closing) return;
        closing = true;
        const out = play(-4, 1, 0, 150);
        out.onfinish = () => {
          closing = false;
          root.hidden = true;
          root.replaceChildren();
          out.cancel();
        };
        out.oncancel = () => (closing = false);
        return;
      }
      if (event.id === shownId && !root.hidden && !closing) return; // same event: leave it be
      const wasOpen = !root.hidden && !closing;
      shownId = event.id;
      root.replaceChildren();
      root.hidden = false;
      root.dataset.type = event.type;
      if (wasOpen) play(4, 0, 1, 180);
      else play(8, 0, 1, 220);

      const close = el('button', 'detail-card__close', '×');
      close.setAttribute('aria-label', 'Close');
      close.onclick = onClose;

      const list = el('dl', 'detail-card__details');
      for (const [key, value] of Object.entries(event.details)) {
        if (value == null) continue;
        const [label, unit] = FIELDS[key] ?? [key, ''];
        list.append(el('dt', '', label), el('dd', '', `${fmtValue(value)}${unit ? ` ${unit}` : ''}`));
      }

      root.append(
        close,
        el('p', 'detail-card__type', TITLES[event.type]),
        el('h2', 'detail-card__label', event.label),
        el('p', 'detail-card__meta', `${event.lat.toFixed(1)}°, ${event.lng.toFixed(1)}° · ${fmtTime(event.time)}`),
        list,
      );
    },
  };
}
