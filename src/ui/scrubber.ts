// The day scrubber: nothing but lines. One line is 10 minutes; its height is how high the
// Sun is at that moment, so the band itself shows day and night without a single label.
// The only text is the time under the fixed centre line.
//
// It should feel like running a finger through reeds: lines swell toward the pointer,
// the band keeps gliding after you let go, and everything settles on springs.

const STEP_MIN = 10;
const GAP = 7; // px between lines
const H = 84; // band height in CSS px
const RISE = 6 * 60 + 40;
const SET = 17 * 60 + 20;
const LIMIT = 720; // minutes either side of now

export type Phase = 'night' | 'dawn' | 'day' | 'dusk';

const localMinutes = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
};

/** Which set of inks the app wears. Dawn and dusk are the 80 minutes around sunrise and sunset. */
export function phaseAt(d: Date): Phase {
  const m = localMinutes(d.getTime());
  if (Math.abs(m - RISE) <= 40) return 'dawn';
  if (Math.abs(m - SET) <= 40) return 'dusk';
  return m > RISE && m < SET ? 'day' : 'night';
}

/** 0..1: the Sun's height at local time t, with a soft shoulder at sunrise and sunset. */
function sun(t: number): number {
  const m = localMinutes(t);
  if (m <= RISE - 30 || m >= SET + 30) return 0;
  const x = Math.sin((Math.PI * (m - RISE + 30)) / (SET - RISE + 60));
  return Math.max(0, x);
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

  const canvas = document.createElement('canvas');
  canvas.className = 'cel-scrubber__band';
  const time = document.createElement('div');
  time.className = 'cel-scrubber__time cel-dot';
  root.append(canvas, time);
  const ctx = canvas.getContext('2d')!;

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let target = 0; // where the user has put it (minutes from now)
  let shown = 0; // where the band is drawn; chases target on a spring
  let vel = 0; // minutes per frame, for the glide after release
  let dragX: number | null = null;
  let lastX = 0;
  let hoverX: number | null = null; // pointer x in CSS px, or null
  let hover = 0; // 0..1, eased presence of the pointer
  let hx = 0; // eased pointer x
  let press = 0; // 0..1, eased "held" state
  let lastEmit = NaN;
  let lastPhase = '';
  let w = 0;

  const resize = () => {
    w = root.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const emit = () => {
    const rounded = Math.round(target);
    if (rounded === lastEmit) return;
    lastEmit = rounded;
    onChange(new Date(Date.now() + target * 60_000), rounded);
  };

  const frame = () => {
    // glide after release, then spring the drawn band toward the target
    if (dragX == null && Math.abs(vel) > 0.01) {
      target = Math.max(-LIMIT, Math.min(LIMIT, target + vel));
      vel *= 0.93;
      emit();
    }
    shown += (target - shown) * (still ? 1 : 0.22);
    hover += ((hoverX == null ? 0 : 1) - hover) * 0.14;
    if (hoverX != null) hx += (hoverX - hx) * 0.25;
    press += ((dragX == null ? 0 : 1) - press) * 0.2;

    const css = getComputedStyle(root);
    const type = css.getPropertyValue('--ink-type').trim();
    const planet = css.getPropertyValue('--ink-planet').trim();
    const fire = css.getPropertyValue('--ink-fire').trim();

    const now = Date.now();
    const centre = (now + shown * 60_000) / 60_000; // minutes since epoch under the marker
    const cx = w / 2;
    const base = H - 6;
    ctx.clearRect(0, 0, w, H);

    const first = Math.ceil((centre - (cx / GAP) * STEP_MIN) / STEP_MIN) * STEP_MIN;
    for (let m = first; ; m += STEP_MIN) {
      const x = cx + ((m - centre) / STEP_MIN) * GAP;
      if (x > w) break;
      const s = sun(m * 60_000);
      const edge = 1 - Math.pow(Math.abs(x - cx) / cx, 2.2) * 0.75; // lines relax toward the ends
      let h = (5 + s * 46) * edge;
      // lines lean up toward the pointer, like grass under a hand
      if (hover > 0.01) {
        const d = (x - hx) / 46;
        h += Math.exp(-d * d) * 16 * hover;
      }
      // and part slightly around the centre line while it is held
      const dc = (x - cx) / 30;
      h *= 1 - Math.exp(-dc * dc) * 0.35 * press;
      ctx.fillStyle = s > 0 ? type : planet;
      ctx.fillRect(Math.round(x) - 1, base - h, 2, h);
    }

    // the chosen moment: one fire-ink line that grows when held
    const ch = 62 + press * 14;
    ctx.fillStyle = fire;
    ctx.fillRect(cx - 1.5 - press, base - ch, 3 + press * 2, ch + 6);

    const when = new Date(now + target * 60_000);
    const label = `${two(when.getHours())}:${two(when.getMinutes())}`;
    if (time.textContent !== label) time.textContent = label;
    const phase = phaseAt(when);
    if (phase !== lastPhase) {
      lastPhase = phase;
      document.documentElement.dataset.phase = phase;
      root.setAttribute('aria-valuetext', `${label}, ${phase}`);
    }
    requestAnimationFrame(frame);
  };

  const set = (next: number) => {
    target = Math.max(-LIMIT, Math.min(LIMIT, next));
    emit();
  };

  root.addEventListener('pointerdown', (e) => {
    dragX = lastX = e.clientX;
    vel = 0;
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
  });
  root.addEventListener('pointermove', (e) => {
    hoverX = e.clientX - root.getBoundingClientRect().left;
    if (dragX == null) return;
    // drag the band, not the marker: pulling right brings earlier time under the line
    const dMin = -((e.clientX - lastX) / GAP) * STEP_MIN;
    lastX = e.clientX;
    vel = vel * 0.6 + dMin * 0.4;
    set(target + dMin);
  });
  const end = () => {
    dragX = null;
    root.classList.remove('is-dragging');
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('pointerleave', () => (hoverX = null));
  root.addEventListener('dblclick', () => {
    vel = 0;
    set(0);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') set(target + (e.shiftKey ? 60 : 10));
    else if (e.key === 'ArrowLeft') set(target - (e.shiftKey ? 60 : 10));
    else if (e.key === 'Home' || e.key === 'Escape') set(0);
  });

  new ResizeObserver(resize).observe(root);
  queueMicrotask(() => {
    resize();
    requestAnimationFrame(frame);
  });

  return { el: root, offsetMinutes: () => Math.round(target), reset: () => set(0) };
}
