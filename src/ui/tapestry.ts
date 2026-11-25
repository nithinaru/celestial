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
const load = () =>
  (data ??= fetch('/sprites/tapestry.json')
    .then((r) => r.json())
    .then((j: { sprites: Record<TapestryKind, SpriteDef> }) => j.sprites));

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
  let timer = 0;

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

  void load().then((sprites) => {
    def = sprites[kind];
    draw();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      timer = window.setInterval(() => {
        i = (i + 1) % def!.frames.length;
        draw();
      }, 1000 / fps);
  });

  return {
    el: canvas,
    setCell(px) {
      size = px;
      draw();
    },
    stop: () => window.clearInterval(timer),
  };
}
