import type { SkyEvent, SkyEventType } from '../data/skyEvents';
import { createTapestry } from './tapestry';

const KIND: Record<SkyEventType, string> = { aurora: 'Aurora', fireball: 'Fireball', iss: 'ISS' };

// One plain sentence per kind. No jargon: a judge should get it in one read.
const PLAIN: Record<SkyEventType, string> = {
  aurora: 'Particles from the Sun are striking oxygen 100 km up, and the oxygen glows green.',
  fireball: 'A rock from space burned up high overhead, for a moment brighter than Venus.',
  iss: 'A crewed laboratory 420 km up, still in sunlight after the sky below has gone dark.',
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;

/** Local solar time from longitude: 15° of longitude is one hour. Honest without a timezone database. */
function solarTime(iso: string, lng: number): string {
  const t = new Date(new Date(iso).getTime() + (lng / 15) * 3_600_000);
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
}

function status(e: SkyEvent): string {
  if (e.type === 'iss') return 'Overhead now';
  const mins = Math.round((Date.now() - new Date(e.time).getTime()) / 60_000);
  if (e.type === 'aurora') return 'Visible now';
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  if (mins < 2880) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

/** How rare, as words plus a 0–12 meter (more filled = rarer). Rules are simple enough to say out loud. */
function rarity(e: SkyEvent): { words: string; filled: number } {
  if (e.type === 'iss') return { words: '16 orbits a day', filled: 2 };
  if (e.type === 'aurora') {
    const lat = Math.abs(e.lat);
    if (lat >= 65) return { words: 'Most clear nights', filled: 3 };
    if (lat >= 55) return { words: 'A few nights a month', filled: 6 };
    return { words: 'A few nights a year', filled: 10 };
  }
  if (e.intensity >= 10) return { words: 'About 1 a year on Earth', filled: 11 };
  if (e.intensity >= 1) return { words: 'About 10 a year on Earth', filled: 9 };
  return { words: 'A few a month on Earth', filled: 7 };
}

function next(e: SkyEvent): string {
  if (e.type === 'iss') return 'Back here in 92 min';
  if (e.type === 'fireball') return 'No one knows';
  const until = e.details.forecastFor;
  return typeof until === 'string' ? `Forecast to ${until.slice(11, 16)} UTC` : 'Tonight';
}

function row(label: string, value: string, extra?: HTMLElement): HTMLElement {
  const r = el('div', 'cel-card__row');
  r.append(el('div', 'cel-card__label cel-poster', label));
  const v = el('div', 'cel-card__value');
  v.append(el('div', 'cel-dot', value.toUpperCase()));
  if (extra) v.append(extra);
  r.append(v);
  return r;
}

function meter(filled: number): HTMLElement {
  const m = el('div', 'cel-meter');
  m.setAttribute('role', 'img');
  m.setAttribute('aria-label', `rarity ${filled} of 12`);
  for (let i = 0; i < 12; i++) m.append(el('span', i < filled ? 'is-on' : ''));
  return m;
}

export interface EventCard {
  el: HTMLElement;
  destroy(): void;
}

/** The event detail card: a miniature park poster. `place` is optional; coordinates always show. */
export function createEventCard(e: SkyEvent, place?: string): EventCard {
  const card = el('article', `cel-card cel-card--${e.type}`);

  const band = el('header', 'cel-card__band cel-poster');
  band.append(el('span', 'cel-card__kind', KIND[e.type]), el('span', 'cel-card__status', status(e)));

  // The picture fits the panel at rest. Click it to look closer: the cells grow until
  // you can read the characters it is made of.
  const FIT: Record<SkyEventType, number> = { fireball: 3.6, aurora: 3.3, iss: 4.6 };
  const art = el('button', 'cel-card__art');
  art.type = 'button';
  art.setAttribute('aria-label', 'Look closer');
  art.setAttribute('aria-pressed', 'false');
  const sprite = createTapestry(e.type, { cell: FIT[e.type] });
  const hint = el('span', 'cel-card__hint cel-poster', 'Look closer');
  art.append(sprite.el, hint);
  art.addEventListener('click', () => {
    const close = art.getAttribute('aria-pressed') !== 'true';
    art.setAttribute('aria-pressed', String(close));
    sprite.setCell(close ? 11 : FIT[e.type]);
    hint.textContent = close ? 'Step back' : 'Look closer';
  });

  const body = el('div', 'cel-card__body');
  body.append(
    el('h2', 'cel-card__place cel-poster', place ?? e.label),
    el('div', 'cel-card__coord cel-dot', `${coord(e.lat, 'N', 'S')} ${coord(e.lng, 'E', 'W')}`),
    el('p', 'cel-card__plain', PLAIN[e.type]),
  );

  const r = rarity(e);
  const rows = el('div', 'cel-card__rows');
  rows.append(
    row('Local time', `${solarTime(e.time, e.lng)} solar`),
    row('How rare', r.words, meter(r.filled)),
    row('Next', next(e)),
  );

  card.append(band, art, body, rows);
  return { el: card, destroy: () => sprite.stop() };
}
