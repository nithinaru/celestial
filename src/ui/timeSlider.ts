const DAY_MS = 864e5;

/**
 * Bare time scrubber: a native range input from `min` to now, one step per day.
 * Unstyled on purpose; the Paper design replaces the look, not the wiring.
 */
export function createTimeSlider(
  parent: HTMLElement,
  min: number,
  onChange: (t: number) => void,
): HTMLElement {
  const max = Date.now();
  const root = document.createElement('div');
  root.className = 'time-slider';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(Math.floor(min / DAY_MS));
  input.max = String(Math.ceil(max / DAY_MS));
  input.step = '1';
  input.value = input.max;
  input.setAttribute('aria-label', 'Fireballs as of date');

  const label = document.createElement('output');

  const update = () => {
    const atNow = input.value === input.max;
    const t = atNow ? max : Number(input.value) * DAY_MS;
    label.textContent = atNow
      ? 'Now'
      : new Date(t).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC', // fireball times are UTC; keep the label on the same day boundaries
        });
    onChange(t);
  };
  input.addEventListener('input', update);

  root.append(input, label);
  parent.append(root);
  update();
  return root;
}
