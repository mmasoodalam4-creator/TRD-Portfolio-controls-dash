// ==========================================================================
// RISK SCORING
//
// One definition of what a risk score means, confirmed by the owner:
//
//   1–3    Low
//   4–6    Low-Medium
//   8–12   Medium
//   15–25  High
//
// The bands are a 5x5 matrix — probability 1 to 5 by impact 1 to 5 — which is
// why 7, 13 and 14 are missing from them: no pair of whole numbers in that
// range multiplies to those, so a score that lands there did not come from the
// matrix. It is banded upward rather than refused, and `RISK_BANDS` is the one
// place any of this is written down.
//
// THE LEVEL IS DERIVED FROM THE SCORE, NEVER READ FROM THE ROW — the same rule
// SPI and CPI follow, and for the same reason. The register carries a stored
// `level` authored beside the score, and on several rows the two disagree:
// RISK-013 on RES-01 is stored as Medium against a score of 16, which these
// bands call High. A screen that read the stored field would show a risk as
// Medium while the number beside it says otherwise, and the person reading it
// has no way to know which is wrong.
//
// So the stored field stays — the fixtures and the database are untouched, and
// the parity check still compares them field for field — and nothing reads it.
// ==========================================================================

export type RiskLevel = 'Low' | 'Low-Medium' | 'Medium' | 'High';

/** Lower bound of each band, highest first. */
export const RISK_BANDS: { from: number; level: RiskLevel; colour: string }[] = [
  { from: 15, level: 'High', colour: '#D24141' },
  { from: 8, level: 'Medium', colour: '#E0902B' },
  { from: 4, level: 'Low-Medium', colour: '#E8C547' },
  { from: 1, level: 'Low', colour: '#1E9E5A' },
];

/** The band a score falls in. Zero and anything below it is Low. */
export function riskLevel(score: number): RiskLevel {
  for (const b of RISK_BANDS) if (score >= b.from) return b.level;
  return 'Low';
}

/** The colour that band paints, for the matrix and the score column. */
export function riskColour(score: number): string {
  for (const b of RISK_BANDS) if (score >= b.from) return b.colour;
  return RISK_BANDS[RISK_BANDS.length - 1].colour;
}

/**
 * How the bands read as one line, for a legend or the glossary. Written from
 * `RISK_BANDS` so it cannot describe a policy the code does not apply.
 */
export const RISK_BAND_TEXT = (() => {
  const parts: string[] = [];
  for (let i = RISK_BANDS.length - 1; i >= 0; i -= 1) {
    const b = RISK_BANDS[i];
    const above = RISK_BANDS[i - 1];
    parts.push(above ? `${b.from}–${above.from - 1} ${b.level.toLowerCase()}` : `${b.from}–25 ${b.level.toLowerCase()}`);
  }
  return parts.join(', ');
})();
