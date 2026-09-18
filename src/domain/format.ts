// Display formatting. All monetary values are SAR and all are owner-side
// costs — see domain/types.ts.

/** A number that can be shown. NaN and the infinities become a dash. */
const finite = (n: number): boolean => Number.isFinite(n);

/** 1234567 -> "1,234,567". A value that is not a number is "–", never "NaN". */
export const fmt = (n: number): string => (finite(n) ? n.toLocaleString('en-US') : '–');

/** 1234567 -> "SAR 1,234,567" */
export const money = (n: number): string => (finite(n) ? `SAR ${fmt(n)}` : '–');

/**
 * Compact magnitude for KPI tiles: 1.25B / 720M / 4.9K / 850.
 *
 * Symmetric in sign — an overrun of 50M reads "−50M" beside a "1.08B", not
 * "-50,000,000" — and rounded so that 999,999,999 is "1.00B" rather than
 * "1000M". Non-finite input is a dash, because "NaN%" on a KPI tile is the
 * one thing a controls dashboard must never show.
 */
export const mn = (n: number): string => {
  if (!finite(n)) return '–';
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 999_500_000) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 999_500) return `${sign}${(a / 1e6).toFixed(a < 10_000_000 ? 1 : 0)}M`;
  if (a >= 9_950) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${fmt(a)}`;
};

/**
 * A percentage of something, guarding the empty denominator.
 *
 * Eight screens divided by a count or a total that can be zero — an empty
 * scope, a development with no commitments — and printed "NaN%". Zero of
 * nothing is nothing done, so it reads as 0%.
 */
export const pct = (part: number, whole: number, decimals = 0): string =>
  (whole && finite(part / whole) ? `${((part / whole) * 100).toFixed(decimals)}%` : `0${decimals ? '.' + '0'.repeat(decimals) : ''}%`);

/** An index (SPI, CPI) to two places, or a dash. */
export const idx = (n: number): string => (finite(n) ? n.toFixed(2) : '–');

/**
 * The tone a variance deserves. Twelve screens hard-coded green for a figure
 * that is favourable only while budget exceeds forecast — true of every
 * fixture, and of no project that has ever overrun.
 */
export const varianceTone = (v: number): 'green' | 'red' | 'grey' =>
  (!finite(v) || v === 0 ? 'grey' : v > 0 ? 'green' : 'red');

/** "Favourable" / "Unfavourable" / "On budget", by sign. */
export const varianceWord = (v: number): string =>
  (!finite(v) || v === 0 ? 'On budget' : v > 0 ? 'Favourable' : 'Unfavourable');
