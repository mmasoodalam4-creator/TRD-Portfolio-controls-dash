/**
 * A TICK SCALE WHOSE LABELS ARE TRUE.
 *
 * The axis used to be `peak x 1.1` cut into quarters, with each label rounded
 * for display. On an incident register of eight that produced gridlines at
 * 0, 2.2, 4.4, 6.6 and 8.8 labelled **0, 2, 4, 7, 9** — the line labelled 7 is
 * at 6.6, so a reader taking a value off it is wrong by more than half an
 * incident. On a smaller register it was worse: a peak of 2.65 produced two
 * different gridlines both labelled "1".
 *
 * That is the quietest kind of defect this product can have. Nothing looks
 * broken; the number is simply not the number.
 *
 * So the step is chosen FIRST, from the set a person counts in — 1, 2, 2.5, 5
 * and their powers of ten — and the axis is however many of those it takes to
 * cover the peak, up to five. The label is then the step's own arithmetic and
 * cannot disagree with where the line is drawn.
 *
 * `integer` is passed for a COUNT axis. Half an incident and a quarter of a
 * person do not exist, and an axis that offers them invites a reader to read
 * one off.
 */
const NICE = [1, 2, 2.5, 5] as const;

export interface Scale {
  /** The top gridline. */
  max: number;
  /** The gap between gridlines. */
  step: number;
  /** How many gaps there are — gridlines is this plus one. */
  count: number;
  /** Decimals the label needs to state the step exactly. */
  decimals: number;
}

const decimalsOf = (step: number): number => {
  if (Number.isInteger(step)) return 0;
  const [, frac = ''] = String(step).split('.');
  return frac.length;
};

export function niceScale(
  peak: number,
  { integer = false, maxTicks = 5 }: { integer?: boolean; maxTicks?: number } = {},
): Scale {
  // An empty or all-zero series has no scale. A floor of 1 keeps the axis
  // readable and every coordinate finite; without one the whole SVG is NaN.
  if (!Number.isFinite(peak) || peak <= 0) {
    return integer
      ? { max: 4, step: 1, count: 4, decimals: 0 }
      : { max: 1, step: 0.25, count: 4, decimals: 2 };
  }

  const start = Math.floor(Math.log10(peak)) - 3;
  for (let e = start; e <= start + 8; e++) {
    const mag = 10 ** e;
    for (const c of NICE) {
      const step = c * mag;
      // A count axis never offers a fractional gridline.
      if (integer && (step < 1 || !Number.isInteger(step))) continue;
      const count = Math.ceil(peak / step - 1e-9);
      if (count >= 1 && count <= maxTicks) {
        return { max: step * count, step, count, decimals: decimalsOf(step) };
      }
    }
  }
  // Unreachable for a finite peak; a scale is still returned rather than NaN.
  const step = peak / maxTicks;
  return { max: peak, step, count: maxTicks, decimals: decimalsOf(step) };
}

/**
 * The scale for an axis with a fixed ceiling the caller states — a percentage
 * that runs to 100, an index that runs to 1.25.
 *
 * IT NEVER CLIPS. If the data exceed the stated ceiling the scale grows to
 * hold them, because a bar drawn at the ceiling for two different values is a
 * chart asserting they are equal. A package paid 112% of its commitment is
 * precisely the defect control 18 exists to find, and the chart meant to show
 * it used to draw it at exactly the same length as one paid 100%.
 */
export function scaleTo(ceiling: number, peak: number, opts?: { integer?: boolean }): Scale {
  if (peak <= ceiling) {
    const step = ceiling / 4;
    return { max: ceiling, step, count: 4, decimals: decimalsOf(step) };
  }
  return niceScale(peak, opts);
}
