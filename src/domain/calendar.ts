import { DATA_DATE_INDEX } from './forecast.js';

// ==========================================================================
// ONE DATA DATE, AND EVERY DATE IN THE SYSTEM CUT AGAINST IT
//
// The reporting position is "as at" a date. Nothing said which one. The month
// strip ran on an index (`DATA_DATE_INDEX`, 7 — August) with no year attached,
// the report header printed the bare word "Aug", and the authored registers
// were written at whatever date each was written at. The result was a calendar
// that contradicted itself in front of a reader:
//
//   - non-conformances raised in APRIL 2025 and still showing Open, which is
//     sixteen months outstanding on a development reporting August 2026;
//   - incidents, observations, HSE inspections and material approvals dated
//     September and October 2026 — after the position they belong to, some of
//     them after today;
//   - equipment carrying a next service date of May 2026 and a status of
//     Operating, three months past due;
//   - issues carrying a "days open" that was counted to 22 August while the
//     period ran to the 31st.
//
// None of that is a rounding difference. Each one is a reader working out that
// the dates are decoration, and from there that the figures might be too.
//
// So the data date is stated once, here, and everything else is measured from
// it. `DATA_DATE_INDEX` stays the authority on WHICH MONTH — the curve, the
// forecast and the month strip all run on it — and this module attaches the
// year and the day, so the two can never name different months (the coherence
// gate asserts exactly that).
//
// DETERMINISTIC ON PURPOSE: it is a constant, never `new Date()`. A "days
// open" that moved with the wall clock would make the pixel gates fail on a
// schedule, and a demo opened next month would quietly report a different
// position from the one it was checked against.
// ==========================================================================

/** The year the reporting calendar runs in. */
export const REPORTING_YEAR = 2026;

/** The month names the strip and the curve use, in order. */
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * The x-axis title every monthly chart carries.
 *
 * The tick labels read "Jan Feb Mar …" and never said WHICH YEAR — on a
 * portfolio whose developments run over several, that is the first question a
 * reader has. It is built from `REPORTING_YEAR` rather than typed on each
 * chart, so fourteen charts cannot come to disagree about the year the
 * position is reported in.
 */
export const MONTH_AXIS = `Month · ${REPORTING_YEAR}`;

/** Days in each month of `REPORTING_YEAR`. 2026 is not a leap year. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * The last day of the reported month — the position is "as at" this date.
 *
 * Built from `DATA_DATE_INDEX` rather than typed beside it, so moving the
 * reporting month moves the data date with it.
 */
export const DATA_DATE = `${DAYS_IN_MONTH[DATA_DATE_INDEX]} ${MONTH_NAMES[DATA_DATE_INDEX]} ${REPORTING_YEAR}`;

/** The same date as a timestamp, for comparisons. */
export const DATA_DATE_MS = Date.UTC(
  REPORTING_YEAR, DATA_DATE_INDEX, DAYS_IN_MONTH[DATA_DATE_INDEX],
);

/**
 * A date the fixtures or a person wrote, as a timestamp, or null.
 *
 * Both shapes the system holds are accepted — "25 Apr 2026" from the registers
 * and "2026-04-25" from the contract fields — because a parser that understood
 * one of them would silently drop half the dates it was asked about.
 */
export function parseDate(text: string | null | undefined): number | null {
  if (!text) return null;

  // Both are read as UTC midnight rather than through `Date.parse`, which
  // treats "2026-04-25" as UTC and "25 Apr 2026" as local time. West of
  // Greenwich that is a day's difference between two dates that read the
  // same, and a comparison against the data date would flip on the boundary
  // depending on where the machine running the build happens to be.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const written = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(text.trim());
  if (written) {
    const month = MONTH_NAMES.findIndex(
      (m) => m.toLowerCase() === written[2].toLowerCase());
    if (month >= 0) return Date.UTC(Number(written[3]), month, Number(written[1]));
  }

  const t = Date.parse(text);
  return Number.isNaN(t) ? null : t;
}

/** Whether an event is dated after the position it belongs to. */
export function isAfterDataDate(text: string | null | undefined): boolean {
  const t = parseDate(text);
  return t !== null && t > DATA_DATE_MS;
}

/**
 * How long something has been open at the data date, in whole days.
 *
 * Counted, never stored. The issue register carried both an `opened` date and
 * a `days` figure, and they had been written against different days — so the
 * register stated one age while its own date implied another.
 */
export function daysOpenAt(opened: string | null | undefined): number {
  const t = parseDate(opened);
  if (t === null) return 0;
  return Math.max(0, Math.round((DATA_DATE_MS - t) / 86_400_000));
}

/**
 * A date `days` after the data date, written the way the registers write one.
 *
 * For the target dates a derived register needs — when a risk response is to
 * be closed out, when a plan says a thing will be done. Deterministic, like
 * everything else here: it moves when the data date moves and never when the
 * clock does.
 */
export function dueFromDataDate(days: number): string {
  const d = new Date(DATA_DATE_MS + days * 86_400_000);
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
