import type {
  AttendanceWeek, CostCategory, ManpowerTrade, Permit, ResourcePlanRow,
  TrainingCourse, WbsNode, WorkforceByParty,
} from './types.js';
import { costCategoryStatus } from './calc.js';
import type { ProjectRegisters } from '../data/contracts.js';

// ==========================================================================
// THE ROLL-UP OF SEVERAL DEVELOPMENTS' REGISTERS INTO ONE
//
// Every register module read `useRegisters(scope.project)` — ONE development,
// whatever the scope selector said. So at Corporate level the Variations
// module showed eight variations belonging to RES-02 under a heading that
// said Corporate, with a band describing RES-02's budget; the owner found it
// and was right to. The sidebar modules are the ROLL-UP (the workspace is
// where one development is worked on), and a roll-up has to be built.
//
// TWO KINDS OF REGISTER, and telling them apart is the whole of this file:
//
//   THINGS THAT HAPPENED — a variation, a claim, a non-conformance, an
//   incident, a machine. Two developments' rows are two sets of rows, so they
//   are CONCATENATED, and each row is tagged with the development it came
//   from so the table can say whose it is. Merging them would destroy the one
//   fact that makes a portfolio list useful.
//
//   THINGS THAT DESCRIBE A POSITION — a cost category, a trade, a week of
//   attendance. "Civil Works" is the same line of a portfolio as it is of a
//   development, so those are FOLDED by their own key and the money and the
//   counts are summed. Concatenating them would print the same category eight
//   times and make every total on the screen read eight rows deep.
//
// The work breakdown is neither, and is treated on its own terms: a portfolio
// is not made of work packages, it is made of DEVELOPMENTS. So at roll-up the
// WBS is one row per development — its own level-0 position — under a single
// root that sums them. Folding eight developments' packages by code would
// assert that RES-01's "1.2" and LND-02's "1.2" are the same scope, which is
// true only because the fixtures derive from one template and would be false
// the day they are real.
//
// NOTHING IS INVENTED HERE. Every figure is a sum of figures that already
// reconcile, so a rolled-up total agrees with the developments beneath it by
// construction — which is what makes the band above the table and the table
// itself unable to disagree.
// ==========================================================================

/** A register row, with the development it belongs to where that is one thing. */
export type Scoped<T> = T & { project?: string };

/** Registers for a scope: the same shape, with rows that know where they came from. */
export type ScopedRegisters = {
  [K in keyof ProjectRegisters]: Scoped<ProjectRegisters[K][number]>[];
};

/** One development's registers, with its id and name for labelling. */
export interface RegisterSource {
  id: string;
  name: string;
  registers: ProjectRegisters;
}

const sum = <T,>(rows: readonly T[], pick: (r: T) => number): number =>
  rows.reduce((a, r) => a + pick(r), 0);

/** Concatenate one register across developments, tagging every row. */
function tagged<K extends keyof ProjectRegisters>(
  sources: readonly RegisterSource[], key: K,
): Scoped<ProjectRegisters[K][number]>[] {
  return sources.flatMap((s) => (s.registers[key] as ProjectRegisters[K][number][])
    .map((row) => ({ ...row, project: s.id })));
}

/**
 * Fold rows from several developments onto one key.
 *
 * The rows for a key are handed to `merge` together, so each register decides
 * for itself what summing means — money adds, an index is weighted, a status
 * takes the worst. Order follows the first development that carries the key,
 * so a portfolio's category list reads in the same order as a development's.
 */
function folded<T>(
  sources: readonly RegisterSource[],
  pick: (r: ProjectRegisters) => readonly T[],
  keyOf: (row: T) => string,
  merge: (rows: T[]) => T,
): T[] {
  const groups = new Map<string, T[]>();
  for (const s of sources) {
    for (const row of pick(s.registers)) {
      const k = keyOf(row);
      const at = groups.get(k);
      if (at) at.push(row);
      else groups.set(k, [row]);
    }
  }
  return [...groups.values()].map((rows) => (rows.length === 1 ? rows[0] : merge(rows)));
}

/** The variance rule the cost derivation uses, so a folded row reads the same. */
const costStatus = costCategoryStatus;

/** A status column across developments is only as good as its worst row. */
const worst = <T extends { status: string }>(rows: readonly T[]): T['status'] => {
  const ORDER = ['Delayed', 'Behind', 'At Risk', 'Escalated', 'Under Review', 'Monitoring'];
  for (const s of ORDER) {
    const hit = rows.find((r) => r.status === s);
    if (hit) return hit.status;
  }
  return rows[0].status;
};

/** An hours-weighted mean, for an index that must not be averaged flat. */
function weighted<T extends { hours: number }>(rows: readonly T[], pick: (r: T) => number): number {
  const hours = sum(rows, (r) => r.hours);
  if (!hours) return 0;
  return rows.reduce((a, r) => a + pick(r) * r.hours, 0) / hours;
}

/** "+8.6%" parsed, weighted and written back the way the register writes it. */
function weightedPercent(rows: readonly ManpowerTrade[]): string {
  const value = weighted(rows, (r) => Number.parseFloat(r.varpct) || 0);
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function mergeCostCategories(rows: CostCategory[]): CostCategory {
  const budget = sum(rows, (c) => c.budget);
  const afc = sum(rows, (c) => c.afc);
  const varc = budget - afc;
  const varpct = budget ? Number((((varc) / budget) * 100).toFixed(1)) : 0;
  return {
    cat: rows[0].cat,
    budget,
    committed: sum(rows, (c) => c.committed),
    actual: sum(rows, (c) => c.actual),
    ev: sum(rows, (c) => c.ev),
    afc,
    varc,
    varpct,
    status: costStatus(varpct),
  };
}

function mergeManpower(rows: ManpowerTrade[]): ManpowerTrade {
  const direct = sum(rows, (m) => m.direct);
  const indirect = sum(rows, (m) => m.indirect);
  const labor = sum(rows, (m) => m.labor);
  return {
    trade: rows[0].trade,
    type: rows[0].type,
    direct,
    indirect,
    labor,
    total: direct + indirect + labor,
    hours: sum(rows, (m) => m.hours),
    // Weighted by the hours behind it: a trade of six on one development does
    // not move the portfolio's index as far as a trade of sixty on another.
    prod: Number(weighted(rows, (m) => m.prod).toFixed(2)),
    varpct: weightedPercent(rows),
    status: worst(rows),
  };
}

function mergeAttendance(rows: AttendanceWeek[]): AttendanceWeek {
  return {
    week: rows[0].week,
    planned: sum(rows, (w) => w.planned),
    worked: sum(rows, (w) => w.worked),
    productive: sum(rows, (w) => w.productive),
    overtime: sum(rows, (w) => w.overtime),
  };
}

function mergeWorkforce(rows: WorkforceByParty[]): WorkforceByParty {
  return {
    contractor: rows[0].contractor,
    // A counterparty working on three developments holds three scopes; the
    // list of them is the truthful answer, not the first one found.
    scope: [...new Set(rows.map((w) => w.scope))].join(', '),
    headcount: sum(rows, (w) => w.headcount),
    hours: sum(rows, (w) => w.hours),
    status: worst(rows),
  };
}

function mergeTraining(rows: TrainingCourse[]): TrainingCourse {
  return {
    course: rows[0].course,
    whoNeedsIt: [...new Set(rows.map((t) => t.whoNeedsIt))].join(', '),
    required: sum(rows, (t) => t.required),
    completed: sum(rows, (t) => t.completed),
  };
}

function mergePermits(rows: Permit[]): Permit {
  return {
    type: rows[0].type,
    where: [...new Set(rows.map((p) => p.where))].join(', '),
    issued: sum(rows, (p) => p.issued),
    active: sum(rows, (p) => p.active),
    closed: sum(rows, (p) => p.closed),
    rejected: sum(rows, (p) => p.rejected),
  };
}

function mergeResourcePlan(rows: ResourcePlanRow[]): ResourcePlanRow {
  const planned = sum(rows, (r) => r.planned);
  const actual = sum(rows, (r) => r.actual);
  const months = Math.max(...rows.map((r) => r.forecast.length));
  return {
    trade: rows[0].trade,
    planned,
    actual,
    forecast: Array.from({ length: months }, (_, i) =>
      sum(rows, (r) => r.forecast[i] ?? 0)),
    direction: actual > planned ? 'Reducing' : actual < planned ? 'Increasing' : 'Holding',
  };
}

/**
 * The work breakdown of a SCOPE: one row per development, under one root.
 *
 * Each development contributes its own level-0 row — the position its whole
 * register already reconciles to — so the portfolio total is the sum of eight
 * figures that each add up, and clicking through to a development shows the
 * packages beneath the row you were looking at.
 */
function rollUpWbs(sources: readonly RegisterSource[]): Scoped<WbsNode>[] {
  const rows: Scoped<WbsNode>[] = sources.map((s) => {
    const root = s.registers.wbs.find((n) => n.level === 0);
    return {
      code: s.id,
      name: s.name,
      budget: root?.budget ?? 0,
      pv: root?.pv ?? 0,
      ev: root?.ev ?? 0,
      ac: root?.ac ?? 0,
      prog: root?.prog ?? 0,
      spi: root?.spi ?? 1,
      cpi: root?.cpi ?? 1,
      status: root?.status ?? 'Not Started',
      level: 1,
      project: s.id,
    };
  });

  const budget = sum(rows, (n) => n.budget);
  const pv = sum(rows, (n) => n.pv);
  const ev = sum(rows, (n) => n.ev);
  const ac = sum(rows, (n) => n.ac);

  return [{
    code: '0',
    name: sources.length === 1 ? sources[0].name : `${sources.length} developments`,
    budget,
    pv,
    ev,
    ac,
    prog: budget ? Math.round((ev / budget) * 100) : 0,
    spi: pv ? Number((ev / pv).toFixed(2)) : 1,
    cpi: ac ? Number((ev / ac).toFixed(2)) : 1,
    status: ev > 0 ? 'In Progress' : 'Not Started',
    level: 0,
  }, ...rows];
}

/**
 * Every register for the developments in scope.
 *
 * ONE development in scope returns that development's own rows, tagged and
 * otherwise untouched — the Project level and the Project Workspace read
 * exactly what they always did, which is what keeps the pixel gates honest
 * and the reconciliation controls meaningful.
 */
export function rollUpRegisters(sources: readonly RegisterSource[]): ScopedRegisters {
  const one = sources.length === 1 ? sources[0] : null;

  return {
    // Things that happened: concatenated, and each row knows whose it is.
    variations: tagged(sources, 'variations'),
    changes: tagged(sources, 'changes'),
    procurement: tagged(sources, 'procurement'),
    claims: tagged(sources, 'claims'),
    equipment: tagged(sources, 'equipment'),
    ncrs: tagged(sources, 'ncrs'),
    risks: tagged(sources, 'risks'),
    issues: tagged(sources, 'issues'),
    correctiveActions: tagged(sources, 'correctiveActions'),
    mitigations: tagged(sources, 'mitigations'),
    incidents: tagged(sources, 'incidents'),
    observations: tagged(sources, 'observations'),
    hseInspections: tagged(sources, 'hseInspections'),
    qualityInspections: tagged(sources, 'qualityInspections'),
    materialApprovals: tagged(sources, 'materialApprovals'),
    maintenance: tagged(sources, 'maintenance'),

    // Things that describe a position: folded onto their own key and summed.
    costCategories: one
      ? one.registers.costCategories
      : folded(sources, (r) => r.costCategories, (c) => c.cat, mergeCostCategories),
    manpower: one
      ? one.registers.manpower
      : folded(sources, (r) => r.manpower, (m) => m.trade, mergeManpower),
    attendance: one
      ? one.registers.attendance
      : folded(sources, (r) => r.attendance, (w) => w.week, mergeAttendance),
    workforce: one
      ? one.registers.workforce
      : folded(sources, (r) => r.workforce, (w) => w.contractor, mergeWorkforce),
    training: one
      ? one.registers.training
      : folded(sources, (r) => r.training, (t) => t.course, mergeTraining),
    permits: one
      ? one.registers.permits
      : folded(sources, (r) => r.permits, (p) => p.type, mergePermits),
    resourcePlan: one
      ? one.registers.resourcePlan
      : folded(sources, (r) => r.resourcePlan, (r) => r.trade, mergeResourcePlan),

    // The work breakdown of a scope is its developments.
    wbs: one ? one.registers.wbs : rollUpWbs(sources),
  };
}
