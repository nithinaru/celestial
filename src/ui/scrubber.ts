// The day scrubber: a band of sun rays you drag. One line = 10 minutes.
// A line's height is how high the Sun is at that moment in your own sky, so noon is tall
// and night is a row of stubs. The chosen moment is always the line under the fixed marker.

const NS = 'http://www.w3.org/2000/svg';
const STEP_MIN = 10;
const PX_PER_STEP = 8;
const H = 96; // band height
const BASE = 78; // baseline y
const RISE = 6 * 60 + 40;
const SET = 17 * 60 + 20;

export type Phase = 'night' | 'dawn' | 'day' | 'dusk';

const localMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Which set of inks the app wears. Dawn and dusk are the 80 minutes around sunrise and sunset. */
export function phaseAt(d: Date): Phase {
  const m = localMinutes(d);
  if (Math.abs(m - RISE) <= 40) return 'dawn';
  if (Math.abs(m - SET) <= 40) return 'dusk';
  return m > RISE && m < SET ? 'day' : 'night';
}

function sunHeight(d: Date, max: number): { h: number; up: boolean } {
  const m = localMinutes(d);
  if (m >= RISE && m <= SET) return { h: 14 + (max - 14) * Math.sin((Math.PI * (m - RISE)) / (SET - RISE)), up: true };
  return { h: Math.abs(m - RISE) <= 40 || Math.abs(m - SET) <= 40 ? 13 : 9, up: false };
}

const two = (n: number) => String(n).padStart(2, '0');

export interface Scrubber {
  el: HTMLElement;
  /** minutes away from the real present; 0 = now */
  offsetMinutes(): number;
  reset(): void;
}

export function createScrubber(onChange: (when: Date, offsetMin: number) => void): Scrubber {
  const root = document.createElement('div');
  root.className = 'cel-scrubber';
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-label', 'Time of day');
  root.tabIndex = 0;

  const readout = document.createElement('div');
  readout.className = 'cel-scrubber__readout';
  const phaseEl = document.createElement('div');
  phaseEl.className = 'cel-scrubber__phase cel-poster';
  const timeEl = document.createElement('div');
  timeEl.className = 'cel-scrubber__time cel-dot';
  const deltaEl = document.createElement('div');
  deltaEl.className = 'cel-scrubber__delta cel-dot';
  readout.append(phaseEl, timeEl, deltaEl);

  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('cel-scrubber__band');
  svg.setAttribute('height', String(H + 22));
  root.append(readout, svg);

  let offset = 0; // minutes from now

  const draw = () => {
    const w = root.clientWidth || window.innerWidth;
    svg.setAttribute('width', String(w));
    svg.setAttribute('viewBox', `0 0 ${w} ${H + 22}`);
    const cx = w / 2;
    const when = new Date(Date.now() + offset * 60_000);
    const half = w / 2;
    const parts: string[] = [`<rect x="0" y="${BASE}" width="${w}" height="2" fill="var(--ink-type)"/>`];

    // snap the lattice to real 10-minute marks so lines slide under the marker as you drag
    const centreMin = when.getTime() / 60_000;
    const first = Math.ceil((centreMin - (half / PX_PER_STEP) * STEP_MIN) / STEP_MIN) * STEP_MIN;
    for (let m = first; ; m += STEP_MIN) {
      const x = cx + ((m - centreMin) / STEP_MIN) * PX_PER_STEP;
      if (x > w) break;
      const t = new Date(m * 60_000);
      const dist = Math.abs(x - cx) / half;
      const onHour = t.getMinutes() === 0;
      // focus by spacing, not opacity: far from the centre only every 2nd, then 3rd, line survives
      const keepEvery = dist > 0.8 ? 3 : dist > 0.55 ? 2 : 1;
      if (!onHour && (t.getMinutes() / STEP_MIN) % keepEvery !== 0) continue;
      const { h, up } = sunHeight(t, 70);
      const hh = h * (1 - 0.38 * dist);
      const lw = onHour ? 4 : 2;
      parts.push(
        `<rect x="${(x - lw / 2).toFixed(1)}" y="${(BASE - hh).toFixed(1)}" width="${lw}" height="${hh.toFixed(1)}" fill="var(${up ? '--ink-type' : '--ink-planet'})"/>`,
      );
      if (onHour)
        parts.push(
          `<text x="${x.toFixed(1)}" y="${BASE + 20}" text-anchor="middle" class="cel-dot" font-size="14" fill="var(--ink-type)">${two(t.getHours())}</text>`,
        );
    }
    // the fixed marker: fire ink, with a solid triangle on top
    parts.push(
      `<rect x="${cx - 3}" y="0" width="6" height="${BASE + 8}" fill="var(--ink-fire)"/>`,
      `<polygon points="${cx - 9},0 ${cx + 9},0 ${cx},12" fill="var(--ink-fire)"/>`,
    );
    svg.innerHTML = parts.join('');

    const phase = phaseAt(when);
    phaseEl.textContent = phase;
    timeEl.textContent = `${two(when.getHours())}:${two(when.getMinutes())}`;
    const a = Math.abs(Math.round(offset));
    deltaEl.textContent = a < 1 ? 'NOW' : `${offset > 0 ? '+' : '−'}${Math.floor(a / 60)} H ${two(a % 60)} M`;
    root.setAttribute('aria-valuetext', `${timeEl.textContent}, ${phase}`);
    document.documentElement.dataset.phase = phase;
  };

  const set = (next: number) => {
    offset = Math.max(-720, Math.min(720, next));
    draw();
    onChange(new Date(Date.now() + offset * 60_000), offset);
  };

  let dragX: number | null = null;
  let dragStart = 0;
  root.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    dragStart = offset;
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
  });
  root.addEventListener('pointermove', (e) => {
    if (dragX == null) return;
    // drag the band, not the marker: pulling right brings earlier time under the marker
    set(dragStart - ((e.clientX - dragX) / PX_PER_STEP) * STEP_MIN);
  });
  const end = () => {
    dragX = null;
    root.classList.remove('is-dragging');
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('dblclick', () => set(0));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') set(offset + (e.shiftKey ? 60 : 10));
    else if (e.key === 'ArrowLeft') set(offset - (e.shiftKey ? 60 : 10));
    else if (e.key === 'Home' || e.key === 'Escape') set(0);
  });

  new ResizeObserver(draw).observe(root);
  window.setInterval(draw, 60_000);
  queueMicrotask(draw);

  return { el: root, offsetMinutes: () => offset, reset: () => set(0) };
}
