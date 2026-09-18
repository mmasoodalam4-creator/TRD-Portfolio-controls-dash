import type { Project } from '@/domain/types';
import type { Submission } from '@/state/DataProvider';
import { parseDate } from '@/domain/calendar';
import { MONTHS } from './tabs';

/**
 * WHAT THE SYSTEM HOLDS FOR EACH MONTH OF A YEAR, FOR ONE DEVELOPMENT.
 *
 * The month strip is not a decoration and it is not a second copy of the
 * position: it is the reporting calendar, and every state on it is read from
 * something the system actually has.
 *
 *   approved   a period covering that month was filed, validated and approved
 *   awaiting   filed, and sitting with the reviewer or the approver
 *   returned   sent back for correction
 *   open       the month has started or finished and nothing is filed yet
 *   none       outside the development's programme, or long past and never
 *              reported — the system holds nothing, and says so
 *   future     the month has not started
 *
 * IT NEVER INVENTS A HISTORY. Eight developments carry one current position
 * and, in most cases, no filed periods behind it; painting January to August
 * green because the money is spent would be a strip that reports its own
 * assumptions. A month with nothing filed reads "not reported", which is the
 * truth and is also the prompt.
 *
 * A period is placed on the month its DATA DATE falls in — the month it
 * reports, not the month somebody typed it. That field is entered by hand and
 * may be anything, so it is parsed leniently and the filing timestamp is the
 * fallback; an unparseable data date puts the period one month late at worst,
 * which is visible, rather than dropping it off the strip, which is not.
 */
export type MonthState =
  | 'approved' | 'awaiting' | 'returned' | 'open' | 'none' | 'future';

export interface MonthCell {
  /** 0-11. */
  index: number;
  label: string;
  state: MonthState;
  /** The submission this month is showing, where there is one. */
  submission?: Submission;
}

export const MONTH_LABEL: Record<MonthState, string> = {
  approved: 'Approved',
  awaiting: 'Awaiting approval',
  returned: 'Returned',
  open: 'Nothing filed',
  none: 'Not reported',
  future: 'Future',
};

/**
 * Year and month of a hand-entered date, or null if it says nothing usable.
 *
 * Through `parseDate` — the one parser, which reads both shapes the system
 * holds as UTC midnight. Bare `Date.parse` treated "2026-04-25" as UTC and
 * "25 Apr 2026" as local time, so west of Greenwich the same date could land
 * a month early on the strip. Read back in UTC for the same reason.
 */
function monthOf(text: string | null): { y: number; m: number } | null {
  if (!text) return null;
  const t = parseDate(text);
  if (t === null) return null;
  const d = new Date(t);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}

/**
 * The years worth offering for a development: from the year it started to the
 * year after the one it finishes, and always including the current year and
 * whatever periods have actually been filed. A year picker that stops before
 * the development does is a picker that hides data.
 */
export function yearsFor(p: Project, subs: Submission[], today = new Date()): number[] {
  const years = new Set<number>([today.getUTCFullYear()]);
  const start = monthOf(p.start);
  const finish = monthOf(p.finish);
  if (start) years.add(start.y);
  if (finish) years.add(finish.y);
  for (const s of subs) {
    const at = monthOf(s.dataDate) ?? monthOf(s.submittedAt);
    if (at) years.add(at.y);
  }
  const lo = Math.min(...years);
  const hi = Math.max(...years) + 1;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** The twelve cells of one year for one development. */
export function monthsFor(
  p: Project,
  subs: Submission[],
  year: number,
  today = new Date(),
): MonthCell[] {
  const start = monthOf(p.start);
  const nowY = today.getUTCFullYear();
  const nowM = today.getUTCMonth();
  const mine = subs.filter((s) => s.projectId === p.id);

  return MONTHS.map((label, index) => {
    // The latest submission whose data date lands in this month. Latest, not
    // first: a returned period that was refiled is represented by the refiling.
    const here = mine
      .filter((s) => {
        const at = monthOf(s.dataDate) ?? monthOf(s.submittedAt);
        return at !== null && at.y === year && at.m === index;
      })
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const found = here.length ? here[here.length - 1] : undefined;

    if (found) {
      const state: MonthState = found.state === 'approved' ? 'approved'
        : found.state === 'returned' ? 'returned' : 'awaiting';
      return { index, label, state, submission: found };
    }

    if (year > nowY || (year === nowY && index > nowM)) {
      return { index, label, state: 'future' };
    }
    if (start && (year < start.y || (year === start.y && index < start.m))) {
      return { index, label, state: 'none' };
    }
    return { index, label, state: year === nowY && index === nowM ? 'open' : 'none' };
  });
}

/**
 * The reporting period number a month would be, counting monthly from the
 * development's start. A guess, and an editable one — the period number is the
 * project manager's to state, and the workbook is where it comes from. It is
 * offered because typing it from memory every month is how a period ends up
 * filed as number 9 twice.
 */
export function periodNumberFor(p: Project, year: number, month: number): number {
  const start = monthOf(p.start);
  if (!start) return 1;
  return Math.max(1, (year - start.y) * 12 + (month - start.m) + 1);
}

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/**
 * "31 October 2026" — the data date a month implies, for the entry form.
 * Written from a constant table, not toLocaleDateString: an image of the
 * same build on a machine with different locale data printed different text.
 */
export function dataDateFor(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${last} ${MONTH_FULL[month]} ${year}`;
}
