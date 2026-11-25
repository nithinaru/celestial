import { SPRITES, type SpriteKind } from './spriteData';

// The things that move are drawn in characters; everything that stays still is flat ink.
const INK_VAR: Record<string, string> = {
  g: 'transparent',
  t: 'var(--ink-type)',
  p: 'var(--ink-planet)',
  a: 'var(--ink-aurora)',
  f: 'var(--ink-fire)',
};

function frameToNodes(rows: string[], inks: string[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  rows.forEach((row, y) => {
    let run = '';
    let runInk = '';
    const flush = () => {
      if (!run) return;
      const span = document.createElement('span');
      span.style.color = INK_VAR[runInk] ?? INK_VAR.t;
      span.textContent = run;
      frag.append(span);
      run = '';
    };
    for (let x = 0; x < row.length; x++) {
      const ink = inks[y]?.[x] ?? 't';
      if (ink !== runInk) {
        flush();
        runInk = ink;
      }
      run += row[x];
    }
    flush();
    frag.append('\n');
  });
  return frag;
}

export interface Sprite {
  el: HTMLPreElement;
  stop(): void;
}

/** An animated ASCII sprite. `fps` is deliberately low: these should drift, not flicker. */
export function createSprite(kind: SpriteKind, { fps = 3, sizePx = 10 } = {}): Sprite {
  const { frames, inks } = SPRITES[kind];
  const el = document.createElement('pre');
  el.className = `cel-ascii cel-sprite cel-sprite--${kind}`;
  el.style.fontSize = `${sizePx}px`;
  el.setAttribute('aria-hidden', 'true');

  let i = 0;
  const draw = () => el.replaceChildren(frameToNodes(frames[i], inks[i]));
  draw();

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timer = still
    ? 0
    : window.setInterval(() => {
        i = (i + 1) % frames.length;
        draw();
      }, 1000 / fps);

  return { el, stop: () => window.clearInterval(timer) };
}
