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

// Motion rates, per second, so the feel is the same at 60Hz and 120Hz. Each k matches the
// old per-frame factor at 60fps: k = -ln(1 - factor) * 60.
const K_SHOWN = 15; // band spring after a jump (was 0.22/frame)
const K_HOVER = 9; // pointer presence (was 0.14/frame)
const K_HX = 17; // pointer follow (was 0.25/frame)
const K_PRESS = 13.4; // held state (was 0.2/frame)
const FRICTION = 4.35; // glide decay (was x0.93/frame)
const GLIDE_STOP = 0.6; // min/s below which the glide ends
const approach = (k: number, dt: number) => 1 - Math.exp(-k * dt);

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

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let still = motion.matches;
  motion.addEventListener('change', (e) => {
    still = e.matches;
    kick();
  });

  let target = 0; // where the user has put it (minutes from now)
  let shown = 0; // where the band is drawn; chases target on a spring
  let vel = 0; // minutes per second, for the glide after release
  let dragX: number | null = null;
  let dragId: number | null = null;
  let lastX = 0;
  let lastMoveT = 0; // event timestamp of the last drag move, ms
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

  // The loop only runs while something is moving; at rest it redraws once a second so the
  // band and the label keep pace with the real clock.
  let raf = 0;
  let idle = 0;
  let lastT = 0;
  const kick = () => {
    if (idle) {
      clearTimeout(idle);
      idle = 0;
    }
    if (!raf) {
      lastT = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  const frame = (t: number) => {
    raf = 0;
    // seconds since the last frame, clamped so a backgrounded tab does not lurch on return
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.064) : 1 / 60;
    lastT = t;

    // glide after release: friction decays velocity exponentially, independent of frame rate
    if (dragX == null && vel !== 0) {
      const next = target + vel * dt;
      target = Math.max(-LIMIT, Math.min(LIMIT, next));
      vel = target !== next || Math.abs(vel) < GLIDE_STOP ? 0 : vel * Math.exp(-FRICTION * dt);
      emit();
    }
    // the hand moves the band 1:1 while dragging or gliding; the spring is for jumps (keys, reset)
    if (still || dragX != null || vel !== 0) shown = target;
    else shown += (target - shown) * approach(K_SHOWN, dt);
    const hoverGoal = hoverX == null ? 0 : 1;
    const pressGoal = dragX == null ? 0 : 1;
    hover += (hoverGoal - hover) * (still ? 1 : approach(K_HOVER, dt));
    if (hoverX != null) hx += (hoverX - hx) * (still ? 1 : approach(K_HX, dt));
    press += (pressGoal - press) * (still ? 1 : approach(K_PRESS, dt));

    const settled =
      dragX == null &&
      vel === 0 &&
      Math.abs(target - shown) < 0.01 &&
      Math.abs(hoverGoal - hover) < 0.002 &&
      Math.abs(pressGoal - press) < 0.002 &&
      (hoverX == null || Math.abs(hoverX - hx) < 0.1);
    if (settled) {
      shown = target;
      hover = hoverGoal;
      press = pressGoal;
      if (hoverX != null) hx = hoverX;
    }

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
    if (settled) idle = window.setTimeout(kick, 1000);
    else raf = requestAnimationFrame(frame);
  };

  const set = (next: number) => {
    target = Math.max(-LIMIT, Math.min(LIMIT, next));
    emit();
    kick();
  };

  root.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    dragX = lastX = e.clientX;
    dragId = e.pointerId;
    lastMoveT = e.timeStamp;
    // catch the band where it is drawn, so grabbing mid-glide or mid-spring holds it in place
    vel = 0;
    set(shown);
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
  });
  root.addEventListener('pointermove', (e) => {
    const x = e.clientX - root.getBoundingClientRect().left;
    if (hoverX == null && hover < 0.01) hx = x; // swell appears under the pointer, not slides in
    hoverX = x;
    kick();
    if (dragX == null || e.pointerId !== dragId) return;
    // drag the band, not the marker: pulling right brings earlier time under the line
    const dMin = -((e.clientX - lastX) / GAP) * STEP_MIN;
    lastX = e.clientX;
    // velocity in minutes/second, smoothed over ~50ms so it does not depend on the event rate
    const dtE = Math.max(e.timeStamp - lastMoveT, 1);
    lastMoveT = e.timeStamp;
    const a = 1 - Math.exp(-dtE / 50);
    vel = vel * (1 - a) + ((dMin * 1000) / dtE) * a;
    set(target + dMin);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== dragId) return;
    // glide only on a real flick: no glide if the hand paused before letting go, if the
    // gesture was cancelled, or if the user prefers reduced motion
    const paused = e.timeStamp - lastMoveT > 80;
    if (still || paused || e.type !== 'pointerup' || Math.abs(vel) < GLIDE_STOP) vel = 0;
    dragX = dragId = null;
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    root.classList.remove('is-dragging');
    kick();
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('lostpointercapture', end);
  root.addEventListener('pointerleave', () => {
    hoverX = null;
    kick();
  });
  root.addEventListener('dblclick', () => {
    vel = 0;
    set(0);
  });
  root.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 60 : 10;
    let next: number;
    if (e.key === 'ArrowRight') next = target + step;
    else if (e.key === 'ArrowLeft') next = target - step;
    else if (e.key === 'Home' || e.key === 'Escape') next = 0;
    else return;
    vel = 0; // a key press stops any glide in progress
    set(next);
  });

  new ResizeObserver(() => {
    resize();
    kick(); // resizing clears the canvas, so draw again
  }).observe(root);
  queueMicrotask(() => {
    resize();
    kick();
  });

  return {
    el: root,
    offsetMinutes: () => Math.round(target),
    reset: () => {
      vel = 0;
      set(0);
    },
  };
}
