import './tokens.css';
import './ui.css';
import type { SkyEvent } from '../data/skyEvents';
import { createEventCard, type EventCard } from './eventCard';
import { createScrubber } from './scrubber';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const two = (n: number) => String(n).padStart(2, '0');

function legend(): HTMLElement {
  const rows: [string, string, string][] = [
    ['aurora', 'Aurora oval', 'where the sky is glowing'],
    ['fireball', 'Fireball', 'a meteor bright enough to report'],
    ['iss', 'ISS', 'the station and its next orbit'],
    ['night', 'Night line', 'where day ends, drag it to move time'],
  ];
  const el = h('aside', 'cel-legend');
  for (const [key, name, desc] of rows) {
    const row = h('div', 'cel-legend__row');
    const text = h('div', 'cel-legend__text');
    text.append(h('div', 'cel-poster', name), h('div', 'cel-legend__desc', desc));
    row.append(h('span', `cel-legend__mark cel-legend__mark--${key}`), text);
    el.append(row);
  }
  return el;
}

export interface CelestialUI {
  setEvents(events: SkyEvent[]): void;
  /** show the detail card for an event, or pass null to close it */
  select(event: SkyEvent | null, place?: string): void;
}

/**
 * Mounts all of the poster chrome over the globe. The globe keeps pointer events
 * everywhere except on the controls themselves.
 *
 * Listens for the app's own events:
 *   celestial:select  (detail: SkyEvent | null)  -> opens / closes the card
 * Emits:
 *   celestial:time    (detail: { when: Date, offsetMinutes: number })  when the scrubber moves
 *   celestial:view    (detail: 'armillary' | 'horizon')                when the view switch is used
 */
export function mountUI(parent: HTMLElement = document.body): CelestialUI {
  const root = h('div', 'cel-ui');

  // wordmark
  const mark = h('div', 'cel-wordmark');
  mark.append(h('div', 'cel-wordmark__name cel-poster', 'Celestial'), h('div', 'cel-wordmark__sub cel-poster', 'Rare sky, live'));

  // clock + view switch
  const top = h('div', 'cel-top');
  const clock = h('div', 'cel-clock cel-dot');
  const tick = () => {
    const d = new Date();
    clock.textContent = `${two(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
  };
  tick();
  window.setInterval(tick, 10_000);
  const views = h('div', 'cel-views cel-poster');
  for (const v of ['armillary', 'horizon'] as const) {
    const b = h('button', 'cel-views__btn', v);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(v === 'armillary'));
    b.addEventListener('click', () => {
      views.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      window.dispatchEvent(new CustomEvent('celestial:view', { detail: v }));
    });
    views.append(b);
  }
  top.append(clock, views);

  // live counter
  const counter = h('div', 'cel-counter');
  const big = h('div', 'cel-counter__n cel-dot', '0');
  const words = h('div', 'cel-counter__words cel-poster', 'regions can see the aurora right now');
  const also = h('div', 'cel-counter__also cel-poster');
  counter.append(big, words, also);

  const cardSlot = h('div', 'cel-card-slot');
  const scrubber = createScrubber((when, offsetMinutes) =>
    window.dispatchEvent(new CustomEvent('celestial:time', { detail: { when, offsetMinutes } })),
  );

  root.append(mark, top, counter, legend(), cardSlot, scrubber.el, h('div', 'cel-grain'));
  parent.append(root);

  let card: EventCard | null = null;
  const select = (event: SkyEvent | null, place?: string) => {
    card?.destroy();
    card = event ? createEventCard(event, place) : null;
    cardSlot.replaceChildren(...(card ? [card.el] : []));
  };
  window.addEventListener('celestial:select', (e) => select((e as CustomEvent<SkyEvent | null>).detail));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && select(null));

  return {
    select,
    setEvents(events) {
      const n = (t: SkyEvent['type']) => events.filter((e) => e.type === t).length;
      // The feed is a grid of sky cells, not towns. Count regions honestly: a 30° slice of
      // longitude in either hemisphere counts once if any cell in it has at least a 1 in 5 chance.
      const regions = new Set(
        events
          .filter((e) => e.type === 'aurora' && e.intensity >= 20)
          .map((e) => `${e.lat >= 0 ? 'N' : 'S'}${Math.floor((e.lng + 180) / 30)}`),
      );
      const aurora = regions.size;
      big.textContent = String(aurora);
      words.textContent = `${aurora === 1 ? 'region can' : 'regions can'} see the aurora right now`;
      const fb = n('fireball');
      also.textContent = `${fb} ${fb === 1 ? 'fireball' : 'fireballs'} on record · ISS overhead somewhere`;
    },
  };
}
