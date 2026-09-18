// ==========================================================================
// DATA INTEGRITY AND RECONCILIATION
//
// The demo's strongest claim is that the system proves its own numbers before
// they are reported. Until now it did not: the ten controls were a fixed array
// of pairs that were equal because they had been written that way. Control 8
// asserted 38,450 workforce hours against 38,450 HSE exposure hours while the
// manpower register totalled 40,280, and controls 9 and 10 quoted 245 and 28
// against registers holding eight rows each.
//
// Every control below now reads two independent places in the live data and
// compares them. They pass because the data model makes them true — registers
// are derived from and reconciled to the project they belong to — not because
// the answer was typed in.
// ==========================================================================
import type { Project } from './types.js';
import type { ProjectRegisters } from '@/data/contracts';
import { monthlyCost, DATA_DATE_INDEX } from './forecast.js';
import { isOpenNcr } from './counts.js';

export interface Control {
  no: number;
  name: string;
  /** What the two sides are, so a reader can see what is being compared. */
  sourceA: string;
  sourceB: string;
  a: number;
  b: number;
  result: 'OK' | 'MISMATCH';
  /** Whole numbers where the control counts things, SAR where it sums money. */
  unit: 'SAR' | 'count' | 'hours';
}

const control = (
  no: number, name: string, unit: Control['unit'],
  sourceA: string, a: number, sourceB: string, b: number,
): Control => ({
  no, name, unit, sourceA, sourceB,
  a: Math.round(a),
  b: Math.round(b),
  // Money is compared to the nearest SAR; the derivation apportions exactly, so
  // there is no tolerance to hide behind.
  result: Math.round(a) === Math.round(b) ? 'OK' : 'MISMATCH',
});

/**
 * Run every cross-module control for one development.
 *
 * Each takes its two sides from different modules on purpose: a control that
 * reads the same array twice proves nothing.
 */
export function runControls(
  p: Project,
  reg: ProjectRegisters,
  months: string[],
  scurve: Parameters<typeof monthlyCost>[2],
): Control[] {
  const wbsRoot = reg.wbs.find((n) => n.level === 0);
  const wbsPackages = reg.wbs.filter((n) => n.level === 1);
  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + pick(r), 0);

  const curve = monthlyCost(p, months, scurve);
  const atDataDate = curve[Math.min(DATA_DATE_INDEX, curve.length - 1)];

  const openNcrs = reg.ncrs.filter((n) => n.status === 'Open' || n.status === 'Overdue');

  return [
    control(1, 'WBS Budget vs Control Budget', 'SAR',
      'Sum of WBS level-1 packages', sum(wbsPackages, (n) => n.budget),
      'Project control budget', p.control),

    control(2, 'WBS Actual Cost vs Cost Register', 'SAR',
      'WBS level 0 actual cost', wbsRoot?.ac ?? 0,
      'Cost categories actual', sum(reg.costCategories, (c) => c.actual)),

    control(3, 'Monthly PV vs WBS PV', 'SAR',
      'Monthly curve at data date', atDataDate?.plannedCum ?? 0,
      'WBS level 0 planned value', wbsRoot?.pv ?? 0),

    control(4, 'Monthly EV vs WBS EV', 'SAR',
      'Monthly curve at data date', atDataDate?.earnedCum ?? 0,
      'WBS level 0 earned value', wbsRoot?.ev ?? 0),

    control(5, 'Monthly Cost vs Cost Register', 'SAR',
      'Monthly curve at data date', atDataDate?.actualCum ?? 0,
      'Cost categories actual', sum(reg.costCategories, (c) => c.actual)),

    // An earlier draft of this control compared approved variations against
    // approved change-log entries. That identity does not exist — a change
    // request does not map one-to-one onto a variation order — and asserting it
    // would have been the same mistake as the hardcoded pairs it replaced.
    control(6, 'Cost Register AFC vs Project AFC', 'SAR',
      'Sum of cost category AFC', sum(reg.costCategories, (c) => c.afc),
      'Project anticipated final cost', p.afc),

    control(7, 'Procurement vs Committed Cost', 'SAR',
      'Package commitments', sum(reg.procurement, (x) => x.committed),
      'Project committed cost', p.committed),

    // The register's Total column against its own components. A total that has
    // drifted from the headcount it is meant to sum is exactly the kind of
    // error a reconciliation engine exists to catch, and the HSE module now
    // reads its exposure hours from this register rather than carrying a
    // separate figure that could disagree with it.
    control(8, 'Workforce Totals vs Component Headcount', 'count',
      'Manpower register total column', sum(reg.manpower, (m) => m.total),
      'Direct + indirect + labour', sum(reg.manpower, (m) => m.direct + m.indirect + m.labor)),

    // Side B is `isOpenNcr` — the one definition of open — so this control
    // compares the register's status vocabulary against it: a status outside
    // the vocabulary breaks the count. Side B used to be `!== 'Closed'`,
    // which was a FOURTH definition of open, and it disagreed with the
    // canonical one over a Completed non-conformance: the control would have
    // reported MISMATCH on a perfectly reconciled register.
    control(9, 'Quality Register Reconciliation', 'count',
      'Open and overdue NCRs', openNcrs.length,
      'NCR register rows not closed',
      reg.ncrs.filter(isOpenNcr).length),

    control(10, 'Risk Exposure vs Portfolio EMV', 'SAR',
      'Risk register exposure', sum(reg.risks, (r) => r.exposure),
      'Project expected monetary value', p.emv),

    // ---- position invariants ------------------------------------------
    //
    // The ten above compare two modules. For a development that has been
    // moved by a mutation, most of those two sides are re-derived from the
    // same project record and agree by construction. These seven do not
    // depend on any derivation: they are the inequalities a position must
    // satisfy whatever produced it, and a certificate for a negative amount
    // or an earned value above the budget fails them however the registers
    // were built. They are what gives the engine teeth on a touched
    // development.
    bound(11, 'Earned Value within Budget', 'Earned value', p.ev, 'Approved budget', p.budget),
    bound(12, 'Planned Value within Budget', 'Planned value', p.pv, 'Approved budget', p.budget),
    bound(13, 'Control Budget within Approved', 'Control budget', p.control, 'Approved budget', p.budget),
    bound(14, 'Payments within Certified', 'Paid to date', p.paid, 'Certified to date', p.ipcSubmitted),
    bound(15, 'Certified within Actual Cost', 'Certified to date', p.ipcSubmitted, 'Actual cost', p.actual),
    bound(16, 'Actual Cost within Committed', 'Actual cost', p.actual, 'Committed cost', p.committed),
    bound(17, 'Committed within Forecast', 'Committed cost', p.committed, 'Anticipated final cost', p.afc),

    // Per package, not per development. The seven bounds above hold at the
    // level of the whole position, and a development can satisfy every one of
    // them while a single package has been paid more than anybody committed to
    // it — which is a real defect, because the money left the account against
    // a promise that was never that large. This control found exactly that in
    // the consultancy packages the moment it was written.
    control(18, 'Package Payments within Commitments', 'count',
      'Packages paid beyond their commitment',
      reg.procurement.filter((x) => x.paid > x.committed).length,
      'Permitted', 0),

    // The claim register against the position it produced. Certified is the
    // sum of what was approved on claims, and paid is the sum of what actually
    // left against them — so if either side moves without the other, the
    // register and the dashboard are telling two different stories about the
    // same money.
    control(19, 'Approved Claims vs Certified', 'SAR',
      'Sum of approved payment claims', sum(reg.claims, (c) => c.approved ?? 0),
      'Certified to date', p.ipcSubmitted),

    control(20, 'Claim Payments vs Paid', 'SAR',
      'Sum of transfers against claims', sum(reg.claims, (c) => c.paid),
      'Paid to date', p.paid),
  ];
}

/** `a` must not exceed `b`. Shown with both figures, like every other control. */
const bound = (
  no: number, name: string, sourceA: string, a: number, sourceB: string, b: number,
): Control => ({
  no, name, unit: 'SAR', sourceA, sourceB,
  a: Math.round(a),
  b: Math.round(b),
  result: Math.round(a) <= Math.round(b) ? 'OK' : 'MISMATCH',
});

export interface AggregatedControl extends Control {
  /** How many in-scope developments this control was run against. */
  projects: number;
  /** How many of them it passed on. */
  passing: number;
}

export interface IntegrityReport {
  controls: AggregatedControl[];
  passed: number;
  total: number;
  projects: number;
}

/**
 * Run every control against every development in scope.
 *
 * A control passes only if it passes on all of them, and the a/b figures shown
 * are the scope-level sums — so at Corporate the engine is reconciling the
 * whole portfolio, not one project standing in for it.
 */
export function integrityReport(
  projects: Project[],
  registersFor: (projectId: string) => ProjectRegisters,
  months: string[],
  scurve: Parameters<typeof monthlyCost>[2],
): IntegrityReport {
  const perProject = projects.map((p) => runControls(p, registersFor(p.id), months, scurve));
  const template = perProject[0] ?? [];

  const controls: AggregatedControl[] = template.map((c, i) => {
    const column = perProject.map((rows) => rows[i]);
    const passing = column.filter((r) => r.result === 'OK').length;
    return {
      ...c,
      a: column.reduce((t, r) => t + r.a, 0),
      b: column.reduce((t, r) => t + r.b, 0),
      result: passing === column.length ? 'OK' : 'MISMATCH',
      projects: column.length,
      passing,
    };
  });

  return {
    controls,
    passed: controls.filter((c) => c.result === 'OK').length,
    total: controls.length,
    projects: projects.length,
  };
}
