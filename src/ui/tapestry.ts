// Tapestry sprites: a grid of small square cells, each a flat ink fill with a glyph inside.
// From across the room it is a picture; up close it is made of characters, and the characters
// carry real data (coordinates along the fireball's spine, 557.7NM down the aurora's brightest fold).

export type TapestryKind = 'fireball' | 'aurora' | 'iss';

interface Frame {
  glyph: string[];
  fg: string[];
  bg: string[];
}
interface SpriteDef {
  cols: number;
  rows: number;
  frames: Frame[];
}

const INK: Record<string, string> = {
  g: '--ink-ground',
  t: '--ink-type',
  p: '--ink-planet',
  s: '--ink-planet-shade',
  a: '--ink-aurora',
  f: '--ink-fire',
};

let data: Promise<Record<TapestryKind, SpriteDef>> | null = null;
let ready = false;
const load = () =>
  (data ??= fetch('/sprites/tapestry.json')
    .then((r) => r.json())
    .then((j: { sprites: Record<TapestryKind, SpriteDef> }) => ((ready = true), j.sprites)));

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

export interface Tapestry {
  el: HTMLCanvasElement;
  /** size of one cell in CSS px; glyphs become legible from about 6 */
  setCell(px: number): void;
  stop(): void;
}

export function createTapestry(kind: TapestryKind, { cell = 4, fps = 4 } = {}): Tapestry {
  const canvas = document.createElement('canvas');
  canvas.className = `cel-tapestry cel-tapestry--${kind}`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${kind}, drawn in characters`);
  const ctx = canvas.getContext('2d')!;

  let def: SpriteDef | null = null;
  let i = 0;
  let size = cell;
  let raf = 0;
  let zoom: Animation | null = null;

  const draw = () => {
    if (!def) return;
    const dpr = window.devicePixelRatio || 1;
    const c = size * dpr;
    const w = Math.round(def.cols * c);
    const h = Math.round(def.rows * c);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${def.cols * size}px`;
      canvas.style.height = `${def.rows * size}px`;
    }
    // read the inks every frame so the sprite is reprinted when the phase changes
    const css = getComputedStyle(document.documentElement);
    const ink: Record<string, string> = {};
    for (const k in INK) ink[k] = css.getPropertyValue(INK[k]).trim();

    const f = def.frames[i];
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < def.rows; y++) {
      const bg = f.bg[y];
      for (let x = 0; x < def.cols; x++) {
        const k = bg[x];
        if (k === '.' || k === undefined) continue;
        ctx.fillStyle = ink[k];
        ctx.fillRect(Math.floor(x * c), Math.floor(y * c), Math.ceil(c), Math.ceil(c));
      }
    }
    if (size >= 5) {
      // below 5px a glyph is smaller than a pixel grid can hold; the fills alone carry the picture
      ctx.font = `500 ${c}px "DM Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < def.rows; y++) {
        const g = f.glyph[y];
        const fg = f.fg[y];
        for (let x = 0; x < def.cols; x++) {
          const ch = g[x];
          if (!ch || ch === ' ' || fg[x] === '.') continue;
          ctx.fillStyle = ink[fg[x]];
          ctx.fillText(ch, (x + 0.5) * c, (y + 0.55) * c);
        }
      }
    }
  };

  // Frame stepping on rAF with an accumulator: holds the beat without drifting, and sleeps
  // while the tab is hidden instead of piling up ticks.
  const step = 1000 / fps;
  let last = 0;
  let acc = 0;
  let stopped = false;
  const loop = (now: number) => {
    raf = 0;
    if (stopped || !def) return;
    if (document.hidden) return; // resumed by the visibilitychange listener
    if (last) acc += Math.min(now - last, step * 2); // a long stall advances one frame, not ten
    last = now;
    if (acc >= step) {
      acc %= step;
      i = (i + 1) % def.frames.length;
      draw();
    }
    raf = requestAnimationFrame(loop);
  };
  const wake = () => {
    if (stopped || raf || document.hidden || reduced.matches || !def) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', wake);

  const coldStart = !ready;
  void load().then((sprites) => {
    if (stopped) return;
    def = sprites[kind];
    draw();
    // first visit only: the picture arrives after the card, so let it ink in rather than pop
    if (coldStart) canvas.animate({ opacity: [0, 1] }, { duration: 200, easing: EASE_OUT });
    wake();
  });

  return {
    el: canvas,
    setCell(px) {
      if (px === size) return;
      // How big the picture looks right now, mid-zoom included.
      const m = getComputedStyle(canvas).transform.match(/^matrix\(([^,]+)/);
      const shown = size * (m ? parseFloat(m[1]) : 1);
      zoom?.cancel();
      size = px;
      draw();
      if (!def) return;
      // Redrawn crisp at the new size; ease from the old apparent size so the zoom reads as one move.
      // Additive, so it rides on the CSS centring translate and the hover scale.
      zoom = reduced.matches
        ? canvas.animate({ opacity: [0.6, 1] }, { duration: 150, easing: EASE_OUT })
        : canvas.animate(
            { transform: [`scale(${shown / px})`, 'scale(1)'] },
            { duration: 300, easing: EASE_OUT, composite: 'add' },
          );
    },
    stop: () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('visibilitychange', wake);
    },
  };
}
