import type { Project } from './types.js';

// ==========================================================================
// DELETING A DEVELOPMENT IS A RETENTION DECISION
//
// The owner asked to be able to delete a development from the tool — gone
// from every dashboard, every report and every roll-up — and to be able to
// change their mind. Not for ever: for a stated number of days, "and the
// system should ask how many, minimum thirty".
//
// So a deletion is an ARCHIVE THAT EXPIRES. The development leaves every
// live screen the instant it is deleted, exactly as archiving always did,
// and it carries the date its retention runs out. Inside that window the
// same seats put it back in one click. Outside it, restoring is refused and
// the row waits to be purged.
//
// THREE THINGS THIS DELIBERATELY DOES NOT DO:
//
//   * It does not erase anything at the moment of deletion. A development
//     that reported figures is referenced by the change log, by period
//     submissions and by messages; erasing it there and then would leave an
//     audit trail naming something that never existed. The retention window
//     is what makes a real deletion safe later.
//
//   * It does not expire by itself on a timer. There is no long-lived
//     process on a serverless host to run one, and a cron that silently
//     erased the owner's data would be the one act in this system with no
//     entry in the log. Expiry is READ: past the date it can no longer be
//     restored, the Archive screen says so, and an administrator purges it —
//     which appends `project:delete` like any other act.
//
//   * It does not use the reporting data date. Retention is wall-clock: a
//     window that ran on the reported month would not move between periods.
//     `now` is therefore always PASSED IN, never read here, so every function
//     in this file is pure and the gates can drive any date they like.
// ==========================================================================

/** The floor the owner set. A shorter window is refused, in the UI and the API. */
export const MIN_RETENTION_DAYS = 30;

/** What the dialog opens on. The minimum, because that is the owner's default. */
export const DEFAULT_RETENTION_DAYS = 30;

/** Two years. Longer than this is a records-management decision, not a delete. */
export const MAX_RETENTION_DAYS = 730;

const DAY_MS = 86_400_000;

/** Whether a retention period is one the system accepts, and why not if it is not. */
export function retentionProblem(days: unknown): string | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || !Number.isInteger(days)) {
    return 'the retention period must be a whole number of days';
  }
  if (days < MIN_RETENTION_DAYS) {
    return `a deleted development is kept for at least ${MIN_RETENTION_DAYS} days`;
  }
  if (days > MAX_RETENTION_DAYS) {
    return `${MAX_RETENTION_DAYS} days is the longest retention this system will hold`;
  }
  return null;
}

/** The date a retention window closes, as an ISO instant. */
export function retainUntilFrom(at: string, days: number): string {
  const from = Date.parse(at);
  const base = Number.isNaN(from) ? Date.now() : from;
  return new Date(base + days * DAY_MS).toISOString();
}

/**
 * Whole days left before the window closes. Negative once it has passed, so a
 * caller can say "expired 3 days ago" as easily as "9 days left".
 */
export function daysLeft(retainUntil: string | undefined, now: number): number {
  const until = retainUntil ? Date.parse(retainUntil) : NaN;
  if (Number.isNaN(until)) return 0;
  return Math.ceil((until - now) / DAY_MS);
}

/** A deleted development still inside its window, and so still restorable. */
export function restorable(p: Pick<Project, 'archived' | 'retainUntil'>, now: number): boolean {
  if (!p.archived) return false;
  // Archived before retention existed — the act carried no window, so nothing
  // has expired and it stays restorable. Absent is not zero.
  if (!p.retainUntil) return true;
  return daysLeft(p.retainUntil, now) > 0;
}

/** A deleted development whose window has closed: purgeable, not restorable. */
export function expired(p: Pick<Project, 'archived' | 'retainUntil'>, now: number): boolean {
  return Boolean(p.archived) && Boolean(p.retainUntil) && !restorable(p, now);
}

/** The sentence a screen or a route uses when the window has closed. */
export const windowClosedSentence = (id: string, retainUntil: string): string =>
  `${id} was deleted and its retention window closed on ${retainUntil.slice(0, 10)}. `
  + 'It can no longer be restored; an administrator may remove it permanently.';
