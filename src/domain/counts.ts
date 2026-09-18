import type { Issue, Ncr, Risk } from './types.js';
import { riskLevel } from './risk.js';

// ==========================================================================
// THE COUNTS ARE DERIVED FROM THE REGISTERS, NEVER READ FROM THE PROJECT
//
// `Project` carries `risks`, `highRisks`, `openNcr` and `openIssues`, and the
// database carries the same four columns. They were authored beside the
// registers rather than counted from them, and on every one of the eight
// developments they disagree with the rows underneath: RES-01 stores 28 risks
// against a register of 8, 18 open non-conformances against 8, and 6 rated
// high against 4. The Dashboard read the stored figure and the Risk module
// listed the rows, so the same screen could say "6 high-rated risks across 28
// registered" above a table of eight.
//
// This is the SPI and CPI rule, and the risk-level rule, applied to counts:
// THE STORED FIELD STAYS AND NOTHING READS IT. The fixtures, the database and
// the parity check are untouched — no re-seed, no migration — and every count
// a screen shows is counted from the register it describes, so the two cannot
// drift apart again. A count is not an independent fact; it is the length of
// a list, and the list is the source.
//
// It also has to be derived rather than corrected once, because the registers
// MOVE: a development that has been touched by a mutation has its rows
// re-derived at its new position, so a figure typed into the project record
// would go stale the first time somebody filed a period.
//
// The three predicates live here for the same reason. "Open" was written out
// three times — the integrity engine, the evaluation scorecard and the
// assistant's brief each had their own — and they did not agree, so the same
// register produced a different number of open non-conformances depending on
// which screen asked. One definition, one answer.
// ==========================================================================

/**
 * A non-conformance is open until it is closed out.
 *
 * `Completed` counts as closed: the register uses it for a finding that was
 * answered and signed off, and a screen that called it open would be
 * reporting work that is finished as work outstanding.
 */
export const isOpenNcr = (n: Ncr): boolean => n.status !== 'Closed' && n.status !== 'Completed';

/** An issue is open until it is closed or resolved. */
export const isOpenIssue = (i: Issue): boolean => i.status !== 'Closed' && i.status !== 'Resolved';

/** High is a property of the score, on the owner's bands — never of the row. */
export const isHighRisk = (r: Risk): boolean => riskLevel(r.score) === 'High';

/** The four counts every screen reports, and the exposure they sit beside. */
export interface RegisterCounts {
  risks: number;
  highRisks: number;
  openNcr: number;
  openIssues: number;
  exposure: number;
}

export const NO_COUNTS: RegisterCounts = {
  risks: 0, highRisks: 0, openNcr: 0, openIssues: 0, exposure: 0,
};

/** Counted from the rows, for one development or for a whole scope. */
export function registerCounts(reg: {
  risks: readonly Risk[];
  ncrs: readonly Ncr[];
  issues: readonly Issue[];
}): RegisterCounts {
  return {
    risks: reg.risks.length,
    highRisks: reg.risks.filter(isHighRisk).length,
    openNcr: reg.ncrs.filter(isOpenNcr).length,
    openIssues: reg.issues.filter(isOpenIssue).length,
    exposure: reg.risks.reduce((a, r) => a + r.exposure, 0),
  };
}

/** The same counts across several developments. */
export function sumCounts(all: readonly RegisterCounts[]): RegisterCounts {
  return all.reduce<RegisterCounts>((a, c) => ({
    risks: a.risks + c.risks,
    highRisks: a.highRisks + c.highRisks,
    openNcr: a.openNcr + c.openNcr,
    openIssues: a.openIssues + c.openIssues,
    exposure: a.exposure + c.exposure,
  }), NO_COUNTS);
}
