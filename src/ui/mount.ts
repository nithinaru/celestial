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

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Takes a card off the board without a snap: lifts it out of flow so the next card can take
 * its place, fades it from wherever it is right now (mid pin-up included), then removes it.
 */
function leave(node: HTMLElement): void {
  const cs = getComputedStyle(node);
  const from = { opacity: cs.opacity, transform: cs.transform === 'none' ? 'none' : cs.transform };
  node.getAnimations().forEach((a) => a.cancel());
  Object.assign(node.style, { position: 'absolute', top: '0', right: '0', pointerEvents: 'none' });
  node.setAttribute('aria-hidden', 'true');
  node.inert = true;
  const to = reduced.matches ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-6px) scale(0.98)' };
  const anim = node.animate([reduced.matches ? { opacity: from.opacity } : from, to], {
    duration: 160,
    easing: EASE_OUT,
    fill: 'forwards',
  });
  anim.onfinish = anim.oncancel = () => node.remove();
}

const MONTHS =['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
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
 *   celestial:daytime (detail: { when: Date, offsetMinutes: number })  when the scrubber moves
 *   celestial:view    (detail: 'armillary' | 'horizon')                when the view switch is used
 */
export function mountUI(parent: HTMLElement = document.body): CelestialUI {
  const root = h('div', 'cel-ui');

  // Print filters. cel-cut roughens edges like hand-cut lettering; cel-ink also knocks tiny
  // holes out of solid fills, the way ink skips on rough stock.
  root.insertAdjacentHTML(
    'afterbegin',
    `<svg class="cel-defs" width="0" height="0" aria-hidden="true"><defs>
      <filter id="cel-cut" x="-5%" y="-10%" width="110%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/>
      </filter>
      <filter id="cel-ink" x="-5%" y="-10%" width="110%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="warp"/>
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="3.4" result="cut"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" result="speck"/>
        <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 5.05" result="holes"/>
        <feComposite in="cut" in2="holes" operator="in"/>
      </filter>
    </defs></svg>`,
  );

  // wordmark
  const mark = h('div', 'cel-wordmark');
  mark.append(h('div', 'cel-wordmark__name cel-poster', 'Celestial'));

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
  views.dataset.view = 'armillary';
  views.append(h('span', 'cel-views__pill'));
  for (const v of ['armillary', 'horizon'] as const) {
    const b = h('button', 'cel-views__btn', v);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(v === 'armillary'));
    b.addEventListener('click', () => {
      views.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      views.dataset.view = v;
      root.dataset.view = v;
      window.dispatchEvent(new CustomEvent('celestial:view', { detail: v }));
    });
    views.append(b);
  }
  top.append(clock, views);

  // live counter
  const counter = h('div', 'cel-counter');
  const big = h('div', 'cel-counter__n cel-dot', '0');
  const words = h('div', 'cel-counter__words cel-poster', 'regions can see the aurora right now');
  counter.append(big, words);

  const cardSlot = h('div', 'cel-card-slot');
  const scrubber = createScrubber((when, offsetMinutes) =>
    window.dispatchEvent(new CustomEvent('celestial:daytime', { detail: { when, offsetMinutes } })),
  );

  root.append(
    h('div', 'cel-sky'), // halftone tone in the corners of the sheet
    mark,
    top,
    counter,
    legend(),
    cardSlot,
    scrubber.el,
    h('div', 'cel-frame'), // the poster's keyline border
  );
  // The paper itself sits outside .cel-ui: blend modes only reach what is in the same stacking
  // context, and these must blend with the globe as well as the chrome.
  parent.append(
    h('div', 'cel-paper cel-mottle'), // uneven ink coverage
    h('div', 'cel-paper cel-grain'), // paper fibre
  );
  parent.append(root);

  let card: EventCard | null = null;
  let shown: { id: string; place?: string } | null = null;
  const select = (event: SkyEvent | null, place?: string) => {
    // the same event again (a second click on its marker) keeps the card as it is
    if (event && shown && shown.id === event.id && shown.place === place) return;
    const old = card;
    old?.destroy();
    card = event ? createEventCard(event, place) : null;
    shown = event ? { id: event.id, place } : null;
    if (old) leave(old.el);
    if (!card) return;
    cardSlot.append(card.el);
    // swapping one card for another: a short settle instead of the full pin-up
    if (old) {
      card.el.style.animation = 'none';
      card.el.animate(
        reduced.matches
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: EASE_OUT },
      );
    }
  };
  window.addEventListener('celestial:select', (e) => select((e as CustomEvent<SkyEvent | null>).detail));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && select(null));

  return {
    select,
    setEvents(events) {
      // The feed is a grid of sky cells, not towns. Count regions honestly: a 30° slice of
      // longitude in either hemisphere counts once if any cell in it has at least a 1 in 5 chance.
      const regions = new Set(
        events
          .filter((e) => e.type === 'aurora' && e.intensity >= 20)
          .map((e) => `${e.lat >= 0 ? 'N' : 'S'}${Math.floor((e.lng + 180) / 30)}`),
      );
      // Demo data names its towns, so it can say "places"; the live grid can only say "regions".
      const places = new Set(
        events.filter((e) => e.type === 'aurora' && e.details.place).map((e) => e.details.place),
      );
      const noun = places.size ? 'place' : 'region';
      const aurora = places.size || regions.size;
      const was = big.textContent;
      big.textContent = String(aurora);
      // a refreshed count ticks in; an unchanged one (or the first fill from 0) stays put
      if (was !== big.textContent && was !== '0') {
        const t = { duration: 240, easing: EASE_OUT };
        big.getAnimations().forEach((a) => a instanceof CSSTransition || a.cancel());
        big.animate({ opacity: [0, 1] }, t);
        // additive, so the hover lift on the number is left alone
        if (!reduced.matches)
          big.animate({ transform: ['translateY(0.25em)', 'none'] }, { ...t, composite: 'add' });
      }
      words.textContent = `${noun}${aurora === 1 ? '' : 's'} can see the aurora right now`;
    },
  };
}
