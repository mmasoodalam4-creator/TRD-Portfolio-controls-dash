import type { LineSeries } from './LineChart';

/**
 * THE EARNED-VALUE S-CURVE, NAMED ONCE.
 *
 * Five screens draw planned value, earned value and actual cost as the same
 * three lines in the same three colours — the Dashboard, the Project Overview,
 * Analytics, Cost Summary and Monthly Cost. Each had its own copy, and once
 * the names were actually rendered the copies disagreed in front of a reader:
 * the Dashboard's key said "Planned Value (PV)", Analytics and the Overview
 * said "PV", and Cost Summary said nothing at all because it had no key.
 *
 * The abbreviation is kept beside the full term deliberately. The tiles above
 * these charts are labelled PV, EV and AC, and the glossary defines them under
 * those letters; a key that dropped them would leave a reader matching "Earned
 * Value" to an "EV" tile by inference.
 *
 * PV IS DASHED, and that is not decoration — it is the plan rather than a
 * measurement, and the dash is what says so to a reader who cannot separate
 * the blue from the green. The key draws the dash too.
 */
export function EV_SERIES(
  pv: (number | null)[],
  ev: (number | null)[],
  ac: (number | null)[],
): LineSeries[] {
  return [
    { name: 'Planned Value (PV)', color: '#2F6DD0', dash: '6 4', pts: pv },
    { name: 'Earned Value (EV)', color: '#1E9E5A', pts: ev },
    { name: 'Actual Cost (AC)', color: '#D24141', pts: ac },
  ];
}
