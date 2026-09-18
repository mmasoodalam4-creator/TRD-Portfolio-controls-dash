// ==========================================================================
// PER-PROJECT REGISTER DERIVATION
//
// The demo's registers were authored for RES-01 only, and every register screen
// read that one key regardless of the selected project. Routing the key
// correctly is not enough on its own: seven of the eight projects would then
// render empty tables, which is a worse demo than the wrong one.
//
// So the other seven projects get registers derived from the RES-01 templates,
// scaled to their own headline figures. RES-01's authored data is returned
// untouched — it is the project the pitch runs on, and it must not move.
//
// The derivation is deterministic (no randomness) and, where a screen shows a
// register total beside the project's own figure, exact: cost categories sum to
// the project's budget, committed, actual, earned value and AFC; WBS level 0
// matches the project exactly; risk exposure sums to the project's EMV. That
// agreement is the property the integrity engine exists to demonstrate, so it
// has to hold for every project, not just the one we happen to open.
//
// All derived values remain owner-side costs. Nothing here introduces a
// revenue or margin concept.
// ==========================================================================
import type {
  ChangeRequest, CostCategory, EquipmentItem, Issue, ManpowerTrade, Ncr,
  PaymentClaim, ProcurementPackage, Project, Risk, Variation, WbsNode,
  ClaimState, CorrectiveAction, Mitigation, AttendanceWeek, WorkforceByParty,
  Incident, Observation, HseInspection, TrainingCourse, Permit, QualityInspection,
  MaterialApproval, ResourcePlanRow, MaintenanceJob,
} from '@/domain/types';
// Relative, not '@/domain/calendar': the server imports this module through
// project-state and the serverless bundler does not resolve path aliases.
// Type-only imports are erased, so the line above is safe; this one is not.
import { daysOpenAt, dueFromDataDate } from '../../domain/calendar.js';
import { isOpenNcr } from '../../domain/counts.js';
import { costCategoryStatus } from '../../domain/calc.js';

/**
 * Split `total` across `weights` as integers that sum to exactly `total`.
 *
 * Largest-remainder apportionment. Naive rounding drifts by a few units per
 * row, which would leave a category table that visibly fails to add up to the
 * budget printed above it — the precise failure this whole exercise is about.
 * A zero weight always receives zero, which is what keeps unspent lines (an
 * uncommitted contingency) at zero rather than being handed a rounding crumb.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map(Math.floor);
  let remainder = Math.round(total - floors.reduce((a, v) => a + v, 0));

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v), zero: weights[i] === 0 }))
    .filter((e) => !e.zero)
    .sort((a, b) => b.frac - a.frac);

  const out = [...floors];
  for (let k = 0; remainder > 0 && order.length; k++, remainder--) {
    out[order[k % order.length].i] += 1;
  }
  return out;
}

/**
 * Apportion with a ceiling per row. A row that would receive more than its
 * cap gets the cap, and the excess is re-apportioned across the rows still
 * under theirs. If every row is at its cap the remainder has nowhere to go
 * and stays on the rows in proportion — the total is always preserved, and
 * the caller's own controls will say whether that is a problem.
 */
export function apportionCapped(total: number, weights: number[], caps: number[]): number[] {
  const out = apportion(total, weights);
  const fixed = new Set<number>();
  for (let pass = 0; pass < weights.length; pass++) {
    const over = out.map((_, i) => i).filter((i) => !fixed.has(i) && out[i] > (caps[i] ?? Infinity));
    if (!over.length) break;
    for (const i of over) { out[i] = caps[i] ?? out[i]; fixed.add(i); }
    const free = weights.map((_, i) => i).filter((i) => !fixed.has(i));
    const remaining = total - [...fixed].reduce((t, i) => t + out[i], 0);
    if (!free.length) break;
    const split = apportion(remaining, free.map((i) => weights[i]));
    free.forEach((i, k) => { out[i] = split[k]; });
  }
  return out;
}

/** Scale a value by a project's size relative to the template project. */
const scale = (v: number, ratio: number) => Math.round(v * ratio);

const statusFor = costCategoryStatus;

// ------------------------------------------------------------------ cost

/**
 * Cost categories that add up to the project's own position.
 *
 * The Cost screen prints the project's Approved Budget in its KPI row and the
 * category table's total directly beneath it. Before this, those two disagreed
 * by 350M on COM-01.
 */
export function deriveCostCategories(template: CostCategory[], p: Project): CostCategory[] {
  const budget = apportion(p.budget, template.map((c) => c.budget));
  const committed = apportion(p.committed, template.map((c) => c.committed));
  const actual = apportion(p.actual, template.map((c) => c.actual));
  const ev = apportion(p.ev, template.map((c) => c.ev));
  const afc = apportion(p.afc, template.map((c) => c.afc));

  return template.map((c, i) => {
    const varc = budget[i] - afc[i];
    const varpct = budget[i] ? (varc / budget[i]) * 100 : 0;
    return {
      cat: c.cat,
      budget: budget[i],
      committed: committed[i],
      actual: actual[i],
      ev: ev[i],
      afc: afc[i],
      varc,
      varpct: Number(varpct.toFixed(1)),
      status: statusFor(varpct),
    };
  });
}

// ------------------------------------------------------------------ wbs

/**
 * Work packages scaled to the project.
 *
 * Level 0 is the whole project, so it is set to the project's own figures
 * exactly; the packages beneath keep the template's proportions, which is what
 * preserves the parent/child relationships the tree depends on.
 */
export function deriveWbs(template: WbsNode[], p: Project, base: Project): WbsNode[] {
  // Level 0 is the whole development and carries the Approved Development
  // Budget. The packages beneath it break down the CONTROL budget — which is
  // what the authored RES-01 tree does: its level-1 rows sum to exactly its
  // control budget, not its approved budget. Scaling both by one ratio broke
  // that, and the integrity engine's first control caught it.
  //
  // Package budgets are apportioned rather than scaled, because per-row
  // rounding drifts: scaling left the level-1 rows one SAR above the control
  // budget, which is still a failed reconciliation.
  const rootRatio = p.budget / base.budget;
  const packageRatio = p.control / base.control;

  const level1 = template.filter((n) => n.level === 1);
  const level1Budgets = apportion(p.control, level1.map((n) => n.budget));
  const budgetByCode = new Map<string, number>(
    level1.map((n, i) => [n.code, level1Budgets[i]]),
  );

  // Children are apportioned within their own parent, so a parent still equals
  // the sum of its children after rounding.
  for (const parent of level1) {
    const children = template.filter((n) => n.level === 2 && n.code.startsWith(`${parent.code}.`));
    if (!children.length) continue;
    const split = apportion(budgetByCode.get(parent.code) ?? 0, children.map((c) => c.budget));
    children.forEach((c, i) => budgetByCode.set(c.code, split[i]));
  }

  // PV, EV and AC are apportioned the same way, from the root down, so that
  // the level-1 rows sum to the development and each parent to its children.
  // Scaling each row from the template by one ratio left the tree adding up
  // to something other than its own total on every development.
  //
  // Planned and earned value are capped at each package's budget: a package
  // cannot have earned more than it is worth. Without the cap a template row
  // authored as complete was handed more than its budget on a development
  // whose earned value ran ahead of the template's, and showed 114% progress.
  // Actual cost is not capped — a package can, and does, overrun.
  const shares = (pick: (n: WbsNode) => number, total: number, capped: boolean): Map<string, number> => {
    const cap = (n: WbsNode): number => (capped ? budgetByCode.get(n.code) ?? Infinity : Infinity);
    const top = apportionCapped(total, level1.map((n) => Math.max(0, pick(n))), level1.map(cap));
    const out = new Map<string, number>(level1.map((n, i) => [n.code, top[i]]));
    for (const parent of level1) {
      const children = template.filter((n) => n.level === 2 && n.code.startsWith(`${parent.code}.`));
      if (!children.length) continue;
      const split = apportionCapped(out.get(parent.code) ?? 0, children.map((c) => Math.max(0, pick(c))), children.map(cap));
      children.forEach((c, i) => out.set(c.code, split[i]));
    }
    return out;
  };
  const pvByCode = shares((n) => n.pv, p.pv, true);
  const evByCode = shares((n) => n.ev, p.ev, true);
  const acByCode = shares((n) => n.ac, p.actual, false);

  return template.map((n) => {
    const isRoot = n.level === 0;
    const ratio = isRoot ? rootRatio : packageRatio;
    const budget = isRoot ? p.budget : budgetByCode.get(n.code) ?? scale(n.budget, ratio);
    const pv = isRoot ? p.pv : pvByCode.get(n.code) ?? scale(n.pv, ratio);
    const ev = isRoot ? p.ev : evByCode.get(n.code) ?? scale(n.ev, ratio);
    const ac = isRoot ? p.actual : acByCode.get(n.code) ?? scale(n.ac, ratio);

    return {
      code: n.code,
      name: isRoot ? p.name : n.name,
      budget,
      pv,
      ev,
      ac,
      prog: budget ? Math.round((ev / budget) * 100) : 0,
      spi: pv ? Number((ev / pv).toFixed(2)) : 1,
      cpi: ac ? Number((ev / ac).toFixed(2)) : 1,
      // Read off the derived figures, not copied from the template: a row
      // authored "At Risk" for RES-01 is not at risk on a development where
      // its derived SPI is 1.06.
      status: isRoot ? n.status : wbsStatus(budget, pv, ev),
      level: n.level,
    };
  });
}

/** A package's status from its own figures, the same rule an entered period uses. */
export const wbsStatus = (budget: number, pv: number, ev: number): string =>
  (budget && ev >= budget ? 'Completed' : ev <= 0 ? 'Not Started' : pv && ev / pv < 0.9 ? 'At Risk' : 'On Track');

// ------------------------------------------------------------------ registers

export function deriveVariations(template: Variation[], p: Project, base: Project): Variation[] {
  const ratio = p.budget / base.budget;
  return template.map((v) => ({ ...v, amount: scale(v.amount, ratio) }));
}

export function deriveChanges(template: ChangeRequest[], p: Project, base: Project): ChangeRequest[] {
  const ratio = p.budget / base.budget;
  return template.map((c) => ({ ...c, amount: scale(c.amount, ratio) }));
}

/**
 * Procurement packages scaled so committed and paid sum to the project's own
 * committed cost and payments made to date — the two figures the screen's
 * project band prints from the register itself.
 */
export function deriveProcurement(template: ProcurementPackage[], p: Project): ProcurementPackage[] {
  const value = apportion(p.committed, template.map((x) => x.value));
  const committed = apportion(p.committed, template.map((x) => x.committed));
  const paid = apportion(p.paid, template.map((x) => x.paid));

  return template.map((x, i) => ({
    ...x,
    // The PMC is named on the project record, and this register names it
    // again. Reading it from the project is what stops the two disagreeing —
    // a development managed by XYZ PMC with an ABC PMC contract row would be
    // a defect nobody would notice until somebody was paid.
    contractor: x.role === 'PMC' ? p.pmc : x.contractor,
    value: value[i],
    committed: committed[i],
    paid: paid[i],
    prog: committed[i] ? Math.round((paid[i] / committed[i]) * 100) : 0,
  }));
}

/**
 * Workforce scaled by project size. Headcount, manhours and a productivity
 * index only — there is no rate or cost field on this model to derive.
 */
export function deriveManpower(template: ManpowerTrade[], p: Project, base: Project): ManpowerTrade[] {
  const ratio = p.budget / base.budget;
  return template.map((m) => {
    const direct = m.direct ? Math.max(1, scale(m.direct, ratio)) : 0;
    const indirect = m.indirect ? Math.max(1, scale(m.indirect, ratio)) : 0;
    const labor = m.labor ? Math.max(1, scale(m.labor, ratio)) : 0;
    return {
      ...m,
      direct,
      indirect,
      labor,
      total: direct + indirect + labor,
      hours: Math.max(1, scale(m.hours, ratio)),
    };
  });
}

/**
 * Plant utilisation varied per project. Availability only — no hire rate, no
 * equipment cost.
 */
export function deriveEquipment(template: EquipmentItem[], p: Project): EquipmentItem[] {
  // A deterministic per-project offset so fleets are not identical across
  // projects, bounded so an operating machine stays plausibly utilised.
  // Summed over the whole id: reading two fixed positions returned NaN for
  // an id shorter than six characters, and NaN% utilisation for the fleet.
  const offset = [...p.id].reduce((t, ch) => t + ch.charCodeAt(0), 0) % 13;
  return template.map((e, i) => ({
    ...e,
    util: e.util === 0 ? 0 : Math.min(95, Math.max(35, e.util - 6 + ((offset + i * 3) % 13))),
  }));
}

export function deriveNcrs(template: Ncr[], p: Project): Ncr[] {
  // Fewer open non-conformances on the smaller developments, never none.
  const keep = Math.max(3, Math.round(template.length * Math.min(1, p.budget / 1.25e9)));
  return template.slice(0, keep);
}

/**
 * A CORRECTIVE ACTION FOR EVERY NON-CONFORMANCE THAT IS STILL OPEN.
 *
 * Derived from the NCR register rather than authored beside it, so an action
 * can never name a non-conformance that does not exist and the two counts can
 * never disagree. What was directed is written from the NCR's own discipline
 * and root cause — the register knows the defect, so it knows the shape of the
 * remedy.
 *
 * A closed NCR carries a closed action WITH a verification. An open one
 * carries an open action with none, because nobody has checked it yet, and
 * that is exactly the state the sub-tab exists to make visible.
 */
export function deriveCorrectiveActions(ncrs: readonly Ncr[]): CorrectiveAction[] {
  const REMEDY: Record<string, string> = {
    Workmanship: 'Rework the affected element to the approved detail and re-inspect',
    Material: 'Remove and replace the non-compliant material against an approved submittal',
    Installation: 'Reinstall to the specified spacing and fixing, then re-inspect',
    Testing: 'Retest to the specified standard and submit the result',
    Documentation: 'Submit the missing record and close the file',
  };
  return ncrs.map((n, i) => {
    const closed = !isOpenNcr(n);
    return {
      id: `CA-${String(i + 1).padStart(3, '0')}`,
      ncr: n.no,
      action: REMEDY[n.type] ?? `Correct the non-conformance raised on ${n.loc}`,
      owner: n.resp,
      due: n.due,
      status: closed ? 'Closed' : n.status,
      verification: closed ? 'Verified effective on re-inspection' : null,
    };
  });
}

/**
 * A MITIGATION FOR EVERY RISK THE OWNER WOULD ACT ON — medium and above.
 *
 * Keyed to the risk register by id, so the plan and the risk cannot drift
 * apart. The residual is the band below the current one, which is what a
 * response is FOR; it is a target and the register's score does not follow it.
 *
 * A low risk gets no plan on purpose. Writing a mitigation for every risk on
 * the register is how a risk process becomes a paperwork exercise nobody reads.
 */
export function deriveMitigations(risks: readonly Risk[]): Mitigation[] {
  const RESPONSE: Record<string, string> = {
    'Supply Chain': 'Dual-source the long-lead packages and place advance orders with delivery terms',
    Design: 'Design freeze at each package award; changes through the change board only',
    External: 'Re-sequence the exposed works and agree hot-weather hours with the contractor',
    Manpower: 'Prequalify a second labour supplier and increase accommodation capacity',
    Financial: 'Fix price on the remaining packages before the next quarter',
    Equipment: 'Move the critical plant onto a maintenance contract with a response time',
    Regulatory: 'Weekly follow-up with the authority; escalate through the PMC at 30 days',
    Quality: 'Hold points at each pour and an independent inspection before cover-up',
  };
  return risks
    .filter((r) => r.score >= 8)
    .map((r) => ({
      risk: r.id,
      response: RESPONSE[r.cat] ?? `Reduce the exposure carried by ${r.desc.toLowerCase()}`,
      owner: r.owner,
      // A response with no date on it is not a plan. The register carries no
      // due date of its own, so it is set by the BAND: a high risk is answered
      // within a month of the data date and a medium one within two. That is a
      // policy, written once, rather than a date typed onto each row — and it
      // is stated here so nobody reads it as something the owner entered.
      due: dueFromDataDate(r.score >= 15 ? 30 : 60),
      status: r.status === 'Monitoring' ? 'Under Review' : 'In Progress',
      score: r.score,
      // One band down: 15-25 to 12, 8-12 to 6, and nothing below 4.
      residual: r.score >= 15 ? 12 : r.score >= 8 ? 6 : 4,
    }));
}

/**
 * THE MONTH'S MANHOURS, SPLIT ACROSS ITS WEEKS.
 *
 * `worked` sums to the manpower register's own total exactly, because this is
 * that figure apportioned rather than a second count of it — so the weekly view
 * and the monthly figure cannot disagree, and no control is needed to say so.
 *
 * The shape is real rather than flat: a month does not deliver equal weeks.
 * The plan is what the workforce could have delivered at full attendance, so
 * absence is the gap between them.
 */
export function deriveAttendance(hours: number): AttendanceWeek[] {
  // No workforce, no attendance. Four rows of zeros would read as a month
  // in which nobody came to work, which is data; an empty register says
  // nothing has been recorded, which is the truth.
  if (hours <= 0) return [];
  const WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  // Attendance falls through the month, which is what a real one does.
  const worked = apportion(hours, [27, 26, 24, 23]);
  const planned = apportion(Math.round(hours / 0.96), [26, 25, 25, 24]);
  return WEEKS.map((week, i) => ({
    week,
    planned: planned[i],
    worked: worked[i],
    // Productive hours exclude the standing time every site carries.
    productive: Math.round(worked[i] * 0.93),
    overtime: Math.round(worked[i] * 0.035),
  }));
}

/**
 * THE WORKFORCE EACH COUNTERPARTY IS SUPPLYING.
 *
 * Trades are attributed to the package that bought them, so headcount and
 * hours tie to the manpower register exactly — every trade lands somewhere,
 * and a trade with no matching package is attributed to the delivery partner
 * rather than dropped, because a person on site belongs to somebody.
 */
export function deriveWorkforceByParty(
  manpower: readonly ManpowerTrade[],
  packages: readonly ProcurementPackage[],
  pmc: string,
): WorkforceByParty[] {
  const byParty = new Map<string, { scope: Set<string>; headcount: number; hours: number; risk: boolean }>();
  for (const t of manpower) {
    // The awarded package whose category best matches the trade, by name.
    const match = packages.find((x) => x.awarded !== null
      && (x.cat.toLowerCase().includes(t.trade.toLowerCase().split(' ')[0])
        || t.trade.toLowerCase().includes(x.cat.toLowerCase().split(' ')[0])));
    const name = match?.contractor ?? pmc;
    const row = byParty.get(name) ?? { scope: new Set<string>(), headcount: 0, hours: 0, risk: false };
    row.scope.add(t.trade);
    row.headcount += t.total;
    row.hours += t.hours;
    if (t.status !== 'On Track') row.risk = true;
    byParty.set(name, row);
  }
  return [...byParty]
    .map(([contractor, r]) => ({
      contractor,
      scope: [...r.scope].join(', '),
      headcount: r.headcount,
      hours: r.hours,
      status: r.risk ? 'At Risk' : 'On Track',
    }))
    .sort((a, b) => b.headcount - a.headcount);
}

/**
 * HSE events scale with EXPOSURE, not with budget.
 *
 * A development's chance of an incident follows the hours worked on it, so the
 * registers are cut to the manhours the manpower register carries rather than
 * to the money. `keep` never falls below one: a development with a workforce
 * has a safety record, and an empty register would read as a perfect one.
 */
const byExposure = <T>(template: readonly T[], hours: number, baseHours: number): T[] => {
  if (hours <= 0) return [];
  const share = baseHours > 0 ? hours / baseHours : 1;
  return template.slice(0, Math.max(1, Math.round(template.length * Math.min(1, share))));
};

export function deriveIncidents(template: readonly Incident[], hours: number, baseHours: number): Incident[] {
  return byExposure(template, hours, baseHours);
}

export function deriveObservations(template: readonly Observation[], hours: number, baseHours: number): Observation[] {
  return byExposure(template, hours, baseHours);
}

export function deriveHseInspections(
  template: readonly HseInspection[], hours: number, baseHours: number,
): HseInspection[] {
  return byExposure(template, hours, baseHours);
}

/** Material approvals follow the packages: more scope bought, more submitted. */
export function deriveMaterialApprovals(
  template: readonly MaterialApproval[], packages: number, basePackages: number,
): MaterialApproval[] {
  if (packages <= 0) return [];
  const share = basePackages > 0 ? packages / basePackages : 1;
  return template.slice(0, Math.max(1, Math.round(template.length * Math.min(1, share))));
};

/**
 * TRAINING FOLLOWS THE TRADES ACTUALLY ON SITE.
 *
 * A course is required only where somebody on this development needs it, so a
 * job with no steel erectors is not measured against a working-at-height
 * requirement it does not have — which is what a fixed training matrix does,
 * and it makes the compliance figure meaningless.
 *
 * Completion is deterministic and DELIBERATELY NOT 100%: an induction everyone
 * has and a specialist course some are still waiting for is what a real matrix
 * looks like. The rate falls with how specialised the course is.
 */
export function deriveTraining(manpower: readonly ManpowerTrade[]): TrainingCourse[] {
  const total = manpower.reduce((a, m) => a + m.total, 0);
  if (total === 0) return [];
  const has = (...words: string[]): number => manpower
    .filter((m) => words.some((w) => m.trade.toLowerCase().includes(w)))
    .reduce((a, m) => a + m.total, 0);

  const rows: { course: string; whoNeedsIt: string; required: number; rate: number }[] = [
    { course: 'Site induction', whoNeedsIt: 'Everyone on site', required: total, rate: 1 },
    { course: 'Work at height', whoNeedsIt: 'Steel, facade and scaffolding',
      required: has('steel', 'facade', 'finish'), rate: 0.91 },
    { course: 'Lifting & rigging', whoNeedsIt: 'Crane crews and riggers',
      required: Math.round(has('steel', 'civil') * 0.25), rate: 0.94 },
    { course: 'Confined space', whoNeedsIt: 'MEP and civil',
      required: Math.round(has('mep', 'mechanical', 'civil') * 0.2), rate: 0.82 },
    { course: 'First aid', whoNeedsIt: 'Supervisors and HSE',
      required: Math.max(1, Math.round(total * 0.08)), rate: 0.85 },
    { course: 'Fire warden', whoNeedsIt: 'Supervisors',
      required: Math.max(1, Math.round(total * 0.06)), rate: 0.78 },
  ];

  return rows
    .filter((r) => r.required > 0)
    .map((r) => ({
      course: r.course,
      whoNeedsIt: r.whoNeedsIt,
      required: r.required,
      completed: Math.round(r.required * r.rate),
    }));
}

/**
 * Permits scale with the work actually being done, by trade.
 *
 * A REJECTED PERMIT IS A GOOD OUTCOME, not a failure: the control worked
 * before the work started, which is the only time it can.
 */
export function derivePermits(manpower: readonly ManpowerTrade[]): Permit[] {
  const total = manpower.reduce((a, m) => a + m.total, 0);
  if (total === 0) return [];
  const n = (share: number): number => Math.max(1, Math.round(total * share));
  const split = (issued: number): Omit<Permit, 'type' | 'where'> => {
    const rejected = Math.max(0, Math.round(issued * 0.05));
    const closed = Math.round((issued - rejected) * 0.24);
    return { issued, active: issued - rejected - closed, closed, rejected };
  };
  return [
    { type: 'Hot work', where: 'Welding and cutting', ...split(n(0.1)) },
    { type: 'Work at height', where: 'Facade and steel erection', ...split(n(0.085)) },
    { type: 'Lifting operations', where: 'Tower crane and mobile cranes', ...split(n(0.06)) },
    { type: 'Excavation', where: 'External works', ...split(n(0.04)) },
    { type: 'Confined space', where: 'Basement tanks and risers', ...split(n(0.035)) },
  ];
}

/**
 * QUALITY INSPECTIONS, WHOSE FAILURES ARE THE NON-CONFORMANCES THAT EXIST.
 *
 * One failed inspection per NCR, carrying that NCR's own number, date,
 * discipline and location — so first-time-right is traceable to a defect
 * rather than quoted from a figure nobody can follow back. The passes are the
 * rest of the programme, scaled to the work: an inspection register with only
 * failures in it would report a site that never gets anything right.
 */
export function deriveQualityInspections(ncrs: readonly Ncr[], packages: number): QualityInspection[] {
  const ACTIVITY: Record<string, string> = {
    Structural: 'Rebar and concrete pour',
    Civil: 'Waterproofing and backfill',
    Architectural: 'Finishes setting-out',
    MEP: 'MEP first fix',
  };
  const failures: QualityInspection[] = ncrs.map((n, i) => ({
    id: `QI-${String(300 - i)}`,
    date: n.raised,
    activity: ACTIVITY[n.discipline] ?? 'Works inspection',
    discipline: n.discipline,
    location: n.loc,
    result: 'Failed',
    inspector: n.resp,
    ncr: n.no,
  }));

  // Roughly four inspections for every one that failed, which is a
  // first-time-right in the seventies rising with the passes below.
  const passes = Math.max(0, packages * 3 - failures.length);
  const rest: QualityInspection[] = Array.from({ length: Math.min(passes, 12) }, (_, i) => ({
    id: `QI-${String(280 - i)}`,
    date: ncrs[i % Math.max(1, ncrs.length)]?.raised ?? '',
    activity: ['Rebar fixing', 'Concrete pour', 'Blockwork', 'MEP first fix',
      'Waterproofing', 'Setting-out'][i % 6],
    discipline: ['Structural', 'Structural', 'Architectural', 'MEP', 'Civil', 'Architectural'][i % 6],
    location: ncrs[i % Math.max(1, ncrs.length)]?.loc ?? 'Site-wide',
    result: i % 4 === 3 ? 'Passed with comments' : 'Passed',
    inspector: ncrs[i % Math.max(1, ncrs.length)]?.resp ?? 'PMC Quality',
    ncr: null,
  }));

  return [...failures, ...rest];
}

/**
 * The forward resource plan.
 *
 * The ACTUAL column is the manpower register, exactly. The plan and the three
 * months ahead follow the development's own progress: a job at 40% is still
 * ramping up, one at 90% is demobilising. That makes the plan a property of
 * where the development is rather than a number somebody typed once and left.
 */
export function deriveResourcePlan(
  manpower: readonly ManpowerTrade[],
  progress: number,
): ResourcePlanRow[] {
  // Past the peak the workforce comes off; before it, it goes on.
  const past = Math.min(1, Math.max(0, progress / 100));
  return manpower.map((m, i) => {
    // Trades finish at different times: structure leaves first, finishes last.
    const early = i < manpower.length / 2;
    const trend = early ? -0.12 - past * 0.16 : 0.14 - past * 0.2;
    const step = (k: number): number => Math.max(0, Math.round(m.total * (1 + trend * k)));
    const forecast = [step(1), step(2), step(3)];
    const planned = Math.max(m.total, Math.round(m.total * 1.04));
    return {
      trade: m.trade,
      planned,
      actual: m.total,
      forecast,
      direction: forecast[2] > m.total ? 'Ramping up'
        : forecast[2] < m.total ? 'Demobilising' : 'Steady',
    };
  });
}

/**
 * Maintenance, from the equipment register's own service dates.
 *
 * NO COST SITS ON A MAINTENANCE RECORD. The system holds no equipment rates,
 * on the owner's instruction, so this register answers availability — what is
 * down, for how long and who has it — and nothing about money.
 */
export function deriveMaintenance(equipment: readonly EquipmentItem[]): MaintenanceJob[] {
  const WORK: Record<string, string> = {
    Lifting: 'Statutory inspection',
    Power: 'Corrective — alternator',
    Concrete: 'Preventive — 500 hr',
    Earthmoving: 'Preventive — 250 hr',
    Compaction: 'Preventive — 250 hr',
    Utilities: 'Preventive — seals and impeller',
    'Material Handling': 'Corrective — gearbox',
  };
  const PROVIDER: Record<string, string> = {
    Lifting: 'Third-party inspector',
    Power: 'Cummins Service',
    Concrete: 'Zoomlion',
    Earthmoving: 'CAT Service',
    Compaction: 'BOMAG Service',
    Utilities: 'Kirloskar Service',
    'Material Handling': 'Toyota Material Handling',
  };
  return equipment
    .filter((e) => e.status !== 'Operating' || e.util < 70)
    .map((e) => ({
      equipmentId: e.id,
      equipment: e.name,
      work: WORK[e.cat] ?? 'Scheduled service',
      lastService: e.lastService ?? 'Not recorded',
      nextDue: e.nextService ?? 'Not scheduled',
      status: e.status === 'Out of Service' ? 'Out of Service'
        : e.status === 'Under Maintenance' ? 'Overdue' : 'Under Review',
      provider: PROVIDER[e.cat] ?? 'Site workshop',
    }));
}

/**
 * Risks whose exposure sums to the project's EMV, so the Risk screen's total
 * exposure agrees with the figure the dashboard rolls up.
 */
export function deriveRisks(template: Risk[], p: Project): Risk[] {
  const exposure = apportion(p.emv, template.map((r) => r.exposure));
  return template.map((r, i) => ({ ...r, exposure: exposure[i] }));
}

/**
 * Issues at this development's cost exposure, with their age COUNTED.
 *
 * `days` was authored beside `opened` and the two had been written on
 * different days — every row said 22 August while the period it belongs to
 * runs to the 31st. An age is not an independent fact; it is the distance from
 * the date on the row to the data date, so it is measured rather than stored,
 * and the register cannot state an age its own date contradicts.
 */
export function deriveIssues(template: Issue[], p: Project, base: Project): Issue[] {
  const ratio = p.budget / base.budget;
  return template.map((i) => ({
    ...i,
    cost: i.cost ? scale(i.cost, ratio) : 0,
    days: daysOpenAt(i.opened),
  }));
}

/**
 * Payment claims scaled to a development's own certified and paid position.
 *
 * Two totals have to land exactly, because two reconciliation controls compare
 * them: approvals must sum to what the development has certified, and
 * transfers must sum to what it has paid. Rounding to the nearest riyal is the
 * whole tolerance.
 *
 * Approvals are apportioned, which is exact by construction. Transfers are
 * not apportioned, because a transfer is not an independent figure — it is the
 * approved amount less the retention withheld from it, and inventing a
 * separate paid figure per claim would let a claim be paid an amount its own
 * arithmetic does not produce.
 *
 * So the transfers are decided instead: the money has left against the older
 * claims and not yet against the newest, and exactly one claim at the boundary
 * is PART PAID. That is what a real cash position looks like — payment runs do
 * not align to certificate boundaries — and it is what makes the total land on
 * the riyal without falsifying any claim's own sum.
 *
 * Claims still with the consultant or the approver carry no approved amount at
 * all, so they touch neither total. They are in the register because a
 * pipeline with nothing in it is not a pipeline.
 */
export function deriveClaims(template: PaymentClaim[], p: Project): PaymentClaim[] {
  const isApproved = (c: PaymentClaim): boolean => c.approved !== null;
  const approvedRows = template.filter(isApproved);

  // Approvals sum to certified, exactly.
  const approvals = apportion(p.ipcSubmitted, approvedRows.map((c) => c.approved ?? 0));
  const approvedById = new Map<string, number>();
  approvedRows.forEach((c, i) => approvedById.set(c.id, approvals[i]));

  // Retention comes from each claim's own stated rate. Nothing is invented.
  const retentionById = new Map<string, number>();
  for (const c of approvedRows) {
    const approved = approvedById.get(c.id) ?? 0;
    retentionById.set(c.id, Math.round((approved * c.retentionRate) / 100));
  }

  // What would have left the account if every approved claim had been paid its
  // net, and nothing released.
  const netTotal = approvedRows.reduce(
    (a, c) => a + Math.max(0, (approvedById.get(c.id) ?? 0) - (retentionById.get(c.id) ?? 0)),
    0,
  );

  // The development's own paid figure decides which way the difference goes,
  // and it is a real distinction rather than a rounding device.
  //
  //   paid > net total  — retention has been RELEASED. The oldest claims get
  //                       theirs back first, each capped at what was withheld
  //                       from it, because you cannot return more than you held.
  //   paid < net total  — approvals are AWAITING PAYMENT. The money has left
  //                       against the older claims and not yet the newest, and
  //                       the claim at the boundary is part paid, which is what
  //                       a cash position actually looks like: payment runs do
  //                       not align to certificate boundaries.
  let toRelease = Math.max(0, p.paid - netTotal);
  let toPay = p.paid;

  return template.map((c) => {
    if (!isApproved(c)) {
      // A claim still with the consultant or the approver has no approved
      // amount to scale against, so it is scaled by the development's
      // certified position instead. It touches neither control.
      const ratio = p.ipcSubmitted / Math.max(1, template.reduce((a, x) => a + (x.approved ?? 0), 0));
      return {
        ...c,
        claimed: scale(c.claimed, ratio),
        verified: c.verified === null ? null : scale(c.verified, ratio),
        approved: null,
        retention: 0,
        released: 0,
        paid: 0,
        paidOn: null,
      };
    }
    const approved = approvedById.get(c.id) ?? 0;
    const retention = retentionById.get(c.id) ?? 0;
    const released = Math.min(retention, toRelease);
    toRelease -= released;

    const due = Math.max(0, approved - retention + released);
    const paid = Math.min(due, Math.max(0, toPay));
    toPay -= paid;

    const state: ClaimState = paid === 0 ? 'Approved' : paid < due ? 'Part paid' : 'Paid';
    return {
      ...c,
      // The PMC is named on the project record; reading it here stops the two
      // disagreeing about who is being paid.
      contractor: c.packageId === 'PR-011' ? p.pmc : c.contractor,
      claimed: scale(c.claimed, approved / Math.max(1, c.approved ?? 1)),
      verified: c.verified === null ? null : approved,
      approved,
      retention,
      released,
      paid,
      paidOn: paid > 0 ? c.paidOn : null,
      state,
    };
  });
}
