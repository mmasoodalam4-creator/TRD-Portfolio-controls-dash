import type { Aggregate, Project, ScopeLevel } from './types.js';

// ==========================================================================
// THE POSITION IN SCOPE — one development, a portfolio, or the company
//
// Every module took a `Project`, and there was only ever one to give it: the
// scope selector's project, which exists at Corporate level too as the
// development a drill-in would open. So the Cost, Variations and Packages
// modules printed RES-02's name, portfolio, delivery partner and budget across
// the top of a screen whose selector said Corporate — and the tables beneath
// them showed RES-02's rows. The owner found it; it was on all thirteen.
//
// This is what a module reads instead. The money fields are the same figures a
// development carries, and at a roll-up they are those figures SUMMED by
// `agg` — the one place in the system a roll-up is computed, so a module
// cannot arrive at a different total from the Dashboard's.
//
// IT IS NOT A `Project`, deliberately. A roll-up has no delivery route and no
// PMC, and inventing one would put a false statement into a type the mutation
// layer also uses; the day somebody passed it to `commit` it would name a
// development that does not exist. `project` is present at Project level and
// ABSENT above it, so anything that genuinely needs a development — an audit
// trail, a write, a closeout note — has to say so and gets nothing when there
// is no single answer.
// ==========================================================================

export interface ScopePosition {
  level: ScopeLevel;
  /** The development id, the portfolio name, or "Corporate". */
  id: string;
  /** The development name, or what the scope contains. */
  name: string;
  /** How many developments are in it. One, at Project level. */
  count: number;
  budget: number;
  control: number;
  afc: number;
  committed: number;
  actual: number;
  ev: number;
  pv: number;
  paid: number;
  /** Certified to date — `ipcSubmitted` on a development. */
  certified: number;
  emv: number;
  /** The development itself, at Project level ONLY. */
  project?: Project;
}

/** One development, as a position. */
export function positionOfProject(p: Project): ScopePosition {
  return {
    level: 'Project',
    id: p.id,
    name: p.name,
    count: 1,
    budget: p.budget,
    control: p.control,
    afc: p.afc,
    committed: p.committed,
    actual: p.actual,
    ev: p.ev,
    pv: p.pv,
    paid: p.paid,
    certified: p.ipcSubmitted,
    emv: p.emv,
    project: p,
  };
}

/** A portfolio or the whole company, as a position. */
export function positionOfScope(
  level: Exclude<ScopeLevel, 'Project'>,
  list: readonly Project[],
  totals: Aggregate,
  portfolio: string,
): ScopePosition {
  return {
    level,
    id: level === 'Portfolio' ? portfolio : 'Corporate',
    name: level === 'Portfolio'
      ? `${list.length} development${list.length === 1 ? '' : 's'}`
      : 'All portfolios',
    count: list.length,
    budget: totals.budget,
    control: totals.control,
    afc: totals.afc,
    committed: totals.committed,
    actual: totals.ac,
    ev: totals.ev,
    pv: totals.pv,
    paid: totals.paid,
    certified: totals.certified,
    emv: totals.emv,
  };
}

/** True where the position is several developments rather than one. */
export const isRollUp = (pos: ScopePosition): boolean => pos.project === undefined;
