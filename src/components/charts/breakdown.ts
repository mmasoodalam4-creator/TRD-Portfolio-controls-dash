import type { DonutSlice } from './Donut';

/**
 * THE ONE PALETTE EVERY BREAKDOWN USES.
 *
 * Categorical, not semantic. Green, amber and red belong to STATUS — on track,
 * at risk, overdue — and a category that happens to land third in a list has
 * not earned red. Reusing the RAG colours for "MEP" and "Architectural" is how
 * a chart comes to look like a warning about nothing.
 *
 * Ordered so the first four are distinguishable from one another at a glance
 * and under the common colour-vision deficiencies: blue and orange carry the
 * largest separation, then violet and teal.
 */
export const CATEGORY_COLOURS = [
  '#2F6DD0', '#eb6834', '#6D4AC4', '#1B9E9E',
  '#C9A227', '#0B2545', '#8aa04a', '#9aa7bd',
];

/**
 * Count rows by one field and return them as donut slices, largest first.
 *
 * Every breakdown on every screen goes through here, so a category cannot be
 * counted one way on Quality and another on HSE — and no screen carries a
 * hand-written array of counts that stops agreeing with the register beneath
 * it, which is exactly what a review of this system found and removed once.
 */
export function countBy<T>(rows: readonly T[], pick: (r: T) => string): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r) || 'Unspecified';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([name, v], i) => ({ name, v, c: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }));
}

/** The same, summing a number rather than counting rows. */
export function sumBy<T>(
  rows: readonly T[],
  pick: (r: T) => string,
  value: (r: T) => number,
): DonutSlice[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r) || 'Unspecified';
    totals.set(k, (totals.get(k) ?? 0) + value(r));
  }
  return [...totals]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, v], i) => ({ name, v, c: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }));
}
