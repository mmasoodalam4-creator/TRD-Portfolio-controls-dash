// Scope filtering and portfolio roll-up.
//
// Both are pure functions over a project list — they never reach for a data
// module themselves, which is what lets the same logic run against fixtures
// today and an API later.
import type { Aggregate, PackageInput, Project, ProjectStatus, Scope } from './types.js';

/**
 * Schedule and cost performance, derived rather than read.
 *
 * SPI and CPI are defined as EV/PV and EV/AC. Project records also carry `spi`
 * and `cpi` fields, but on 7 of the 8 developments at least one of them
 * disagrees with the earned value, planned value and actual cost recorded on
 * the same record — RES-01 stores SPI 0.94 where EV/PV is 0.80. A stored index
 * that contradicts its own inputs is simply wrong, so nothing reads those
 * fields; they survive only so the pre-migration parity check still passes.
 */
export const spiOf = (p: Project): number => (p.pv ? p.ev / p.pv : 1);
export const cpiOf = (p: Project): number => (p.actual ? p.ev / p.actual : 1);

/**
 * Progress, derived — EV over the approved budget — the SPI and CPI rule
 * again. The record carries a stored `progress` that agrees today only
 * because earned value was corrected to match it; an amendment that moves the
 * budget moves this and not the stored field, so nothing reads the stored one.
 */
export const progressOf = (p: Pick<Project, 'ev' | 'budget'>): number =>
  (p.budget ? Math.min(100, Math.round((p.ev / p.budget) * 100)) : 0);

/**
 * The status a cost category's own variance implies. ONE rule: it was written
 * three times (fixture derivation, the roll-up fold, and the entered-period
 * path — which had no Favourable band at all), so the same 28% variance read
 * "Favorable" on an untouched development and "On Track" on one that filed a
 * period last month.
 */
export const costCategoryStatus = (varpct: number): string =>
  (varpct >= 15 ? 'Favorable' : varpct >= 0 ? 'On Track' : 'At Risk');

/**
 * The status a REPORTED position implies — the one spelling of the rule.
 *
 * Written by `applyPeriod` when a period is applied, because that is the only
 * moment the system learns how a development is actually performing; the eight
 * seeded developments keep their authored status because that field is the
 * owner's narrative, not a measurement. The rule reads only what the period
 * itself establishes:
 *
 *   Delayed   the schedule index has genuinely broken down (SPI below 0.90),
 *             OR the period reports a month past the development's stated
 *             planned finish with the work not complete. The second clause
 *             matters because SPI compresses towards 1.0 near completion —
 *             a job one month late at 96% earned reads SPI 0.96, which no
 *             threshold can honestly call "delayed" while a calendar can.
 *   At Risk   either index has slipped below 0.95 — worth watching, not yet
 *             a finding.
 *   On Track  otherwise.
 */
export function reportedStatus(spi: number, cpi: number, pastFinish: boolean): ProjectStatus {
  if (pastFinish || spi < 0.90 || cpi < 0.90) return 'Delayed';
  if (spi < 0.95 || cpi < 0.95) return 'At Risk';
  return 'On Track';
}

/**
 * Retention withheld from a payment claim, from that claim's own rate.
 *
 * Never a typed amount. A form that accepts both a rate and an amount lets the
 * two disagree, and the disagreement would be invisible.
 */
export const retentionOf = (approved: number, rate: number): number =>
  Math.round((approved * rate) / 100);

/** The projects in scope. Corporate is everything. */
export function scoped(projects: Project[], scope: Scope): Project[] {
  if (scope.level === 'Corporate') return projects;
  if (scope.level === 'Portfolio') return projects.filter((p) => p.portfolio === scope.portfolio);
  return projects.filter((p) => p.id === scope.project);
}

/**
 * The developments the portfolio is still CONTROLLING.
 *
 * A closed development is finished: its cost is settled, it cannot move again,
 * and rolling it into the portfolio's budget, forecast and on-track count
 * answers no question anybody has. A PMO steers what is still in flight.
 *
 * Its figures are not lost — they are read on the development itself and on
 * the Completed tab, which totals them deliberately and says what it is
 * totalling. Archived developments were already outside every roll-up.
 */
export const active = (list: readonly Project[]): Project[] =>
  list.filter((p) => !p.closedAt && !p.archived);

/**
 * Roll a project set up to a single position.
 *
 * Budget Variance is Approved Budget less Anticipated Final Cost — a cost
 * variance, favourable when positive. It is not margin and not headroom.
 *
 * CLOSED DEVELOPMENTS ARE DROPPED HERE, not at each call site, and that is
 * deliberate: every existing caller means "the portfolio I am steering", and a
 * roll-up that quietly included a finished development would be wrong in a way
 * nobody would spot — the totals would simply be a little large. A caller that
 * genuinely wants everything it was handed, such as the Completed tab totting
 * up what has been delivered, asks for it by name.
 */
export function agg(list: Project[], include: 'active' | 'as-given' = 'active'): Aggregate {
  const rows = include === 'active' ? active(list) : list;
  const s = (k: keyof Project): number =>
    rows.reduce((a, p) => a + (p[k] as number), 0);

  const budget = s('budget');
  const afc = s('afc');
  const ev = s('ev');
  const pv = s('pv');
  const ac = s('actual');

  return {
    budget,
    control: s('control'),
    afc,
    variance: budget - afc,
    paid: s('paid'),
    certified: s('ipcSubmitted'),
    committed: s('committed'),
    ev,
    pv,
    ac,
    spi: pv ? ev / pv : 1,
    cpi: ac ? ev / ac : 1,
    count: rows.length,
    onTrack: rows.filter((p) => p.status === 'On Track').length,
    atRisk: rows.filter((p) => p.status === 'At Risk').length,
    delayed: rows.filter((p) => p.status === 'Delayed').length,
    // `emv` rolls up because control 10 holds it to the risk register's own
    // exposure. The three counts that used to sit beside it do not roll up
    // from the project record at all — they are counted from the registers by
    // `registerCounts`, because the stored fields contradict them.
    emv: s('emv'),
  };
}

/**
 * The earned-value position implied by a period's work packages.
 *
 * PV, EV and AC are sums over the packages, exactly as PT_TEMPLATE computes
 * them: PV = budget x planned%, EV = budget x actual%. Nothing here is entered
 * directly and nothing is apportioned — the packages are the source, so the
 * project totals agree with them by construction rather than by rounding.
 *
 * This is what stops earned value being a number somebody types.
 */
export function positionFromPackages(packages: readonly PackageInput[]) {
  const sar = (n: number): number => Math.round(n);
  return {
    pv: sar(packages.reduce((t, p) => t + p.budget * p.plannedPct, 0)),
    ev: sar(packages.reduce((t, p) => t + p.budget * p.actualPct, 0)),
    actual: sar(packages.reduce((t, p) => t + p.cost, 0)),
    committed: sar(packages.reduce((t, p) => t + p.committed, 0)),
  };
}
