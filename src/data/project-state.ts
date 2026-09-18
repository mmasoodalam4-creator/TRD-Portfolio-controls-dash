// ==========================================================================
// PROJECT STATE — the replay, shared by every backend
//
// Given the seeded projects and the mutation log, this produces the current
// position and the registers that reconcile to it. It is pure: no storage, no
// network, no browser.
//
// That matters more than it looks. The browser repository and the API server
// both compute state, and if they computed it differently the app would show
// one set of figures and the server would enforce another — the exact class of
// disagreement this system exists to detect. There is one implementation, and
// scripts/check-api.mjs proves both callers return identical results.
// ==========================================================================
import type {
  CategoryInput, ClaimState, ContractInput, CostCategory, EquipmentItem, ManpowerTrade,
  Ncr, PackageInput, PaymentClaim, ProcurementPackage, Project, Risk, WbsNode,
} from '@/domain/types';
// A value, not a type, so it comes from the module the server can resolve.
import { UNPACKAGED_COMMITMENTS } from '../domain/types.js';
import type { Database } from './index.js';
import {
  applyAward, applyClaim, applyIpc, applyPayment, applyPeriod, applyProjectUpdate,
  isUntouched, projectFromInput,
  type AwardContractMutation, type CreateProjectMutation, type Mutation,
  type RecordClaimMutation, type SubmitPeriodMutation,
} from './mutations.js';
import {
  apportion, apportionCapped, wbsStatus, deriveCostCategories, deriveWbs, deriveVariations, deriveChanges, deriveProcurement,
  deriveManpower, deriveEquipment, deriveNcrs, deriveRisks, deriveIssues, deriveClaims,
  deriveCorrectiveActions, deriveMitigations, deriveAttendance, deriveWorkforceByParty,
  deriveIncidents, deriveObservations, deriveHseInspections, deriveTraining, derivePermits,
  deriveQualityInspections, deriveMaterialApprovals, deriveResourcePlan, deriveMaintenance,
} from './mock/derive.js';
import * as OPS from './mock/operations.js';
// Relative, not '@/domain/calc': the server imports this module and the
// serverless bundler does not resolve path aliases. check-bundle.mjs
// caught this the moment it was written with the alias.
import { costCategoryStatus, progressOf, retentionOf } from '../domain/calc.js';
import {
  expired, restorable, retainUntilFrom, retentionProblem, windowClosedSentence,
} from '../domain/retention.js';
import { EMPTY_REGISTERS, type ProjectRegisters } from './contracts.js';

/** The template project the register derivation is built from. */
export const BASE_ID = 'RES-01';

/**
 * The shipped projects with every recorded mutation replayed over them.
 *
 * Replaying rather than mutating in place keeps the seed pristine, makes the
 * result a pure function of the log, and means a corrupt log costs nothing
 * more than the changes it held.
 */
export function replayProjects(seed: readonly Project[], log: readonly Mutation[]): Project[] {
  let projects = seed.map((p) => ({ ...p }));

  for (const m of log) {
    if (m.kind === 'project:create') {
      if (!projects.some((p) => p.id === m.project.id)) {
        projects = [...projects, projectFromInput(m.project, m.packages, m.contracts)];
      }
    } else if (m.kind === 'project:update') {
      projects = projects.map((p) => (p.id === m.projectId ? applyProjectUpdate(p, m) : p));
    } else if (m.kind === 'project:archive') {
      // The window travels with the act. An entry filed before retention
      // existed carries no `retainDays`, and an archive with no window is one
      // that never expires — absent is not zero.
      projects = projects.map((p) => (p.id === m.projectId
        ? {
          ...p,
          archived: true,
          archivedAt: m.at,
          ...(m.retainDays === undefined
            ? {}
            : { retainUntil: retainUntilFrom(m.at, m.retainDays) }),
        }
        : p));
    } else if (m.kind === 'project:restore') {
      // Restored is indistinguishable from never deleted, the rule
      // `project:reopen` follows: the keys are DELETED rather than set false
      // or undefined, or they travel through JSON and the parity check sees a
      // development the fixtures do not have.
      projects = projects.map((p) => {
        if (p.id !== m.projectId) return p;
        const back = { ...p };
        delete back.archived;
        delete back.archivedAt;
        delete back.retainUntil;
        return back;
      });
    } else if (m.kind === 'project:close') {
      projects = projects.map((p) => (p.id === m.projectId
        ? { ...p, closedAt: m.at, closeNote: m.note } : p));
    } else if (m.kind === 'project:reopen') {
      // The fields are REMOVED rather than set to undefined: a development
      // that was closed and reopened must be indistinguishable, in its data,
      // from one that never closed — otherwise `closedAt: undefined` would
      // travel through JSON as a key and the parity check would see a
      // development the fixtures do not have. The change log keeps both acts.
      projects = projects.map((p) => {
        if (p.id !== m.projectId) return p;
        const open = { ...p };
        delete open.closedAt;
        delete open.closeNote;
        return open;
      });
    } else if (m.kind === 'project:delete') {
      projects = projects.filter((p) => p.id !== m.projectId);
    } else if (m.kind === 'ipc') {
      projects = projects.map((p) => (p.id === m.projectId ? applyIpc(p, m) : p));
    } else if (m.kind === 'claim:record') {
      projects = projects.map((p) => (p.id === m.projectId ? applyClaim(p, m) : p));
    } else if (m.kind === 'claim:pay') {
      projects = projects.map((p) => (p.id === m.projectId ? applyPayment(p, m) : p));
    } else if (m.kind === 'contract:award') {
      projects = projects.map((p) => (p.id === m.projectId ? applyAward(p, m) : p));
    } else if (m.kind === 'period:submit') {
      projects = projects.map((p) => (p.id === m.projectId ? applyPeriod(p, m) : p));
    }
  }
  return projects;
}

/**
 * The contracts a development currently holds, replayed from the log.
 *
 * Registration seeds the list; every `contract:award` then either APPENDS a
 * row (a new package number) or REPLACES one (awarding a package that was
 * registered out to tender — the award carries the real value and the real
 * counterparty, which may differ from the tender estimate). The same
 * replace-or-append fold runs everywhere the list is read, so the register,
 * the refusals and the position cannot disagree about what was promised.
 */
export function contractsFromLog(
  projectId: string,
  log: readonly Mutation[],
): ContractInput[] {
  let rows: ContractInput[] = [];
  for (const m of log) {
    if (m.kind === 'project:create' && m.project.id === projectId) {
      rows = [...(m.contracts ?? [])];
    } else if (m.kind === 'contract:award' && m.projectId === projectId) {
      const i = rows.findIndex((c) => c.id === m.contract.id);
      if (i >= 0) rows = rows.map((c, j) => (j === i ? m.contract : c));
      else rows = [...rows, m.contract];
    }
  }
  return rows;
}

/**
 * Why this award must be refused, or null if it is sound.
 *
 * Shared by the server route and the browser repository so the demonstration
 * refuses what the platform refuses. The checks are the ones validation
 * cannot make alone, because they need the development's current position:
 *
 *   - a package number that already names a STORED row (a seeded
 *     development's register) cannot be recorded again — those rows are the
 *     independent source the controls compare against, and this kind may
 *     append beside them, never rewrite them;
 *   - a package already awarded stays awarded — an award is a promise, and
 *     correcting one is an audit-trail story, not a silent overwrite;
 *   - a package already out to tender cannot be re-recorded as out to tender;
 *   - an award may not take committed cost past the approved budget — the
 *     same bound registration applies, said in a sentence rather than
 *     surfacing as a reconciliation failure.
 */
export function awardProblem(
  m: AwardContractMutation,
  db: Database,
  projects: readonly Project[],
  log: readonly Mutation[],
): string | null {
  const p = projects.find((x) => x.id === m.projectId);
  if (!p) return `no such development ${m.projectId}`;
  const id = m.contract.id;
  if ((db.procurement[m.projectId] ?? []).some((r) => r.id === id)) {
    return `package ${id} already exists on this development — a recorded package needs a new package number`;
  }
  const existing = contractsFromLog(m.projectId, log).find((c) => c.id === id);
  if (existing && existing.awarded !== null) {
    return `package ${id} has already been awarded to ${existing.contractor}`;
  }
  if (existing && m.contract.awarded === null) {
    return `package ${id} is already registered as out to tender — award it, or record a new package`;
  }
  if (m.contract.awarded !== null
    && p.committed + Math.round(m.contract.value) > p.budget) {
    return `awarding ${Math.round(m.contract.value)} would take committed cost to `
      + `${p.committed + Math.round(m.contract.value)} against an approved budget of ${p.budget}`;
  }
  return null;
}

/**
 * Why a lifecycle act must be refused, or null if it is sound.
 *
 * The SOUNDNESS half of the refusal — everything that is about the
 * development rather than about who is asking. Capability lives in
 * `mayMutate`, because only the server knows what seat a caller holds; this
 * knows only the position, so it can run in the browser too.
 *
 * That split is the point. The server used to hold both halves inline, and
 * the offline demonstration held none of them: it refused a delete of a
 * development that had reported figures and accepted everything else, so
 * restoring a development eleven months after its retention window closed
 * worked in the demo and came back 403 on the platform. A gesture that works
 * in the demonstration and fails in the product is worse than one that fails
 * in both, because it is learned first.
 *
 * `now` is passed in for the reason `domain/retention.ts` states: retention is
 * wall-clock, and a function that read the clock itself could not be driven to
 * a date by a gate.
 */
export function lifecycleProblem(
  m: Mutation,
  projects: readonly Project[],
  log: readonly Mutation[],
  now: number,
): string | null {
  if (m.kind === 'project:create' || !('projectId' in m)) return null;
  if (m.kind !== 'project:update' && m.kind !== 'project:archive'
    && m.kind !== 'project:restore' && m.kind !== 'project:close'
    && m.kind !== 'project:reopen' && m.kind !== 'project:delete') {
    return null;
  }

  const target = projects.find((p) => p.id === m.projectId);
  if (!target) return `no such development ${m.projectId}`;

  switch (m.kind) {
    case 'project:update':
      // Said here rather than left to control 1, which would come back as
      // "WBS Budget vs Control Budget" and tell the person nothing about the
      // figure they just typed.
      if (m.budget !== undefined && m.budget < target.control) {
        return `the approved budget cannot be set below the control budget of ${target.control}`
          + ' — that part is already broken into work packages';
      }
      return null;

    case 'project:archive':
      // Deleting a deleted development would silently restart its retention
      // window, which is the one figure the act exists to fix.
      if (target.archived) {
        return `${m.projectId} has already been deleted. Restore it first if the retention `
          + 'period needs to change.';
      }
      // Required HERE and optional on the type: the change log holds archives
      // filed before retention existed and a replay must still read them, but
      // nothing new may be filed without a window.
      if (m.retainDays === undefined) {
        return 'say how many days the deleted development is kept before it can be removed';
      }
      return retentionProblem(m.retainDays);

    case 'project:restore':
      if (!target.archived) return `${m.projectId} is in the portfolio already`;
      // The window is wall-clock, and this is where it is tested on the way
      // IN. Past it, restoring is refused with the date rather than quietly
      // accepted: a retention period is a commitment, not a hint.
      if (!restorable(target, now)) {
        return windowClosedSentence(m.projectId, target.retainUntil ?? '');
      }
      return null;

    case 'project:close':
      // Said plainly rather than recorded as a no-op. A change log carrying a
      // development closed twice is a log nobody trusts to mean anything.
      if (target.closedAt) {
        return `${m.projectId} was already closed out on ${target.closedAt.slice(0, 10)}`;
      }
      return null;

    case 'project:reopen':
      if (!target.closedAt) return `${m.projectId} is not closed`;
      return null;

    case 'project:delete':
      // Two doors, both narrow: a development nothing in the log refers to,
      // which can be erased leaving no dangling reference; and one whose
      // retention window has CLOSED, which is what the window is for. In
      // between, deleting is the act, and it is reversible.
      if (isUntouched(target, log)) return null;
      if (!expired(target, now)) {
        return `${m.projectId} has reported figures. Delete it — it is then kept for the `
          + 'retention period you set, and can be removed permanently once that has passed.';
      }
      return null;

    default:
      return null;
  }
}

/** The most recent period entered for a project, or undefined. */
export function latestPeriod(
  projectId: string,
  log: readonly Mutation[],
): SubmitPeriodMutation | undefined {
  let found: SubmitPeriodMutation | undefined;
  for (const m of log) {
    if (m.kind === 'period:submit' && m.projectId === projectId) found = m;
  }
  return found;
}

/** How deep a WBS code sits: "3" is level 1, "3.1" level 2. */
const depthOf = (code: string): number => Math.max(1, code.split('.').filter(Boolean).length);

/**
 * The template's section 4, as the WBS register the screens already render.
 *
 * The entered rows are the LEAVES of the tree — the packages a person plans
 * and measures. Their depth is read from the code ("3.1" sits under "3"),
 * and every parent that the codes imply is rolled up from its children, so
 * the tree the screen shows after a period is filed has the same shape as
 * the one it showed before. Filing used to flatten everything to level 1,
 * making 1.1.1 a sibling of 1.1.
 */
function wbsFromPackages(packages: readonly PackageInput[], p: Project): WbsNode[] {
  const node = (code: string, name: string, budget: number, pv: number, ev: number, ac: number, level: number): WbsNode => ({
    code, name, budget, pv, ev, ac,
    prog: budget ? Math.round((ev / budget) * 100) : 0,
    spi: pv ? Number((ev / pv).toFixed(2)) : 1,
    cpi: ac ? Number((ev / ac).toFixed(2)) : 1,
    status: wbsStatus(budget, pv, ev),
    level,
  });

  const leaves = packages.map((k) => node(
    k.code, k.name, k.budget,
    Math.round(k.budget * k.plannedPct), Math.round(k.budget * k.actualPct), k.cost,
    depthOf(k.code),
  ));

  // Every ancestor the codes imply, rolled up from the leaves beneath it.
  const byCode = new Map<string, WbsNode>(leaves.map((n) => [n.code, n]));
  const maxDepth = Math.max(1, ...leaves.map((n) => n.level));
  for (let depth = maxDepth - 1; depth >= 1; depth--) {
    for (const leaf of leaves) {
      if (leaf.level <= depth) continue;
      const parentCode = leaf.code.split('.').slice(0, depth).join('.');
      if (byCode.has(parentCode)) continue;
      const kids = [...byCode.values()].filter((n) => n.level === depth + 1 && n.code.startsWith(`${parentCode}.`));
      if (!kids.length) continue;
      const s = (pick: (n: WbsNode) => number): number => kids.reduce((t, n) => t + pick(n), 0);
      byCode.set(parentCode, node(parentCode, `Package ${parentCode}`, s((n) => n.budget), s((n) => n.pv), s((n) => n.ev), s((n) => n.ac), depth));
    }
  }

  const rows = [...byCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }));

  return [rootRow(p), ...rows];
}

/**
 * Level 0 restates the development, so it is projected from the project
 * record rather than entered — the same rule the derived registers follow,
 * and for the same reason: an authored root row stops matching the moment
 * the project moves.
 */
function rootRow(p: Project): WbsNode {
  return {
    code: '0',
    name: p.name,
    budget: p.budget,
    pv: p.pv,
    ev: p.ev,
    ac: p.actual,
    prog: p.budget ? Math.round((p.ev / p.budget) * 100) : 0,
    spi: p.pv ? Number((p.ev / p.pv).toFixed(2)) : 1,
    cpi: p.actual ? Number((p.ev / p.actual).toFixed(2)) : 1,
    status: p.ev > 0 ? 'In Progress' : 'Not Started',
    level: 0,
  };
}

/** The single package of a development that has not been planned yet. */
function unallocatedPackage(p: Project): WbsNode {
  return {
    code: '1', name: 'Unallocated (control budget)', budget: p.control, pv: 0, ev: 0, ac: 0,
    prog: 0, spi: 1, cpi: 1, status: 'Not Started', level: 1,
  };
}

/** The single cost line of a development that has not been planned yet. */
function unallocatedCategory(p: Project): CostCategory {
  const varc = p.budget - p.afc;
  return {
    cat: 'Unallocated', budget: p.budget, committed: 0, actual: 0, ev: 0, afc: p.afc, varc,
    varpct: p.budget ? Number(((varc / p.budget) * 100).toFixed(1)) : 0, status: 'On Track',
  };
}

/** The template's section 5, as the cost-category register. */
function categoriesFrom(categories: readonly CategoryInput[], p: Project): CostCategory[] {
  // Earned value apportioned across categories by budget share, so the
  // category column sums to the project's earned value EXACTLY. Rounding
  // each share on its own left the column one riyal short on more than half
  // of all periods; apportion() hands the remainder to the largest share.
  const evs = apportion(p.ev, categories.map((c) => c.budget));
  return categories.map((c, i) => {
    const ev = evs[i] ?? 0;
    const varc = c.budget - c.afc;
    return {
      cat: c.cat,
      budget: c.budget,
      committed: c.committed,
      actual: c.actual,
      ev,
      afc: c.afc,
      varc,
      varpct: c.budget ? Number(((varc / c.budget) * 100).toFixed(1)) : 0,
      status: costCategoryStatus(c.budget ? (varc / c.budget) * 100 : 0),
    };
  });
}

/**
 * The contracts a development was registered with, as its procurement
 * register, reconciled to its position.
 *
 * The rows are the contracts EXACTLY AS REGISTERED — name, counterparty,
 * value, the awarded date — because they are recorded facts, not a template.
 * Where the reported position carries more committed cost than the contracts
 * account for, the difference is ONE explicit row, "not yet packaged",
 * rather than being spread invisibly across contracts whose values are known:
 * misstating every contract to make a total land is the class of defect this
 * system exists to catch. Where the position carries LESS, nothing here can
 * honestly absorb it — a commitment cannot be unmade — so the rows stand and
 * control 7 reports the disagreement instead of this function hiding it.
 *
 * Payments are apportioned across the committed rows, capped at each row's
 * own commitment, because control 18 is per package: money cannot be shown
 * against a promise that was never that large.
 */
/** A registered contract as the procurement row it is. */
function contractRow(c: ContractInput): ProcurementPackage {
  return {
    id: c.id,
    name: c.name,
    cat: 'Awarded',
    type: 'Works',
    contractor: c.contractor,
    role: c.role,
    wbs: c.wbs,
    value: Math.round(c.value),
    // Only an awarded package commits the owner.
    committed: c.awarded ? Math.round(c.value) : 0,
    paid: 0,
    retention: c.retention,
    awarded: c.awarded,
    prog: 0,
    status: c.awarded ? 'In Progress' : 'Tender Issued',
  };
}

function procurementFromContracts(
  contracts: readonly ContractInput[],
  p: Project,
  asOf: string | null,
): ProcurementPackage[] {
  const rows: ProcurementPackage[] = contracts.map(contractRow);

  const committedRows = rows.reduce((a, r) => a + r.committed, 0);
  const residual = p.committed - committedRows;
  if (residual > 0) {
    rows.push({
      id: 'PKG-UNALLOCATED',
      name: 'Commitments not yet packaged',
      cat: 'Unallocated',
      type: 'Works',
      contractor: UNPACKAGED_COMMITMENTS,
      role: 'Trade Contractor',
      wbs: '0',
      value: residual,
      committed: residual,
      paid: 0,
      retention: 0,
      // The date the position that carries this commitment was reported.
      awarded: asOf,
      prog: 0,
      status: 'In Progress',
    });
  }

  const paid = apportionCapped(p.paid, rows.map((r) => r.committed), rows.map((r) => r.committed));
  return rows.map((r, i) => ({
    ...r,
    paid: paid[i] ?? 0,
    prog: r.committed ? Math.round(((paid[i] ?? 0) / r.committed) * 100) : 0,
  }));
}

/**
 * The claims register of a development the fixtures never described, built
 * from the recorded cash events themselves.
 *
 * Every certificate (`ipc`) and every recorded claim (`claim:record`) IS a
 * register row — a real event, with its own reference, so nothing here is
 * modelled. Approvals therefore sum to certified by construction (those
 * mutations are what moved it), which is control 19; and the transfers are
 * decided from the development's own paid figure by the same waterfall
 * `deriveClaims` uses — oldest first, capped at each claim's net plus what
 * was released to it — which is control 20. A confirmed payment
 * (`claim:pay`) moves the position, and the waterfall then re-reads it, so
 * the register follows without a per-claim paid figure ever being stored.
 */
function claimsFromLog(
  projectId: string,
  procurement: readonly ProcurementPackage[],
  log: readonly Mutation[],
  p: Project,
): PaymentClaim[] {
  const rows: PaymentClaim[] = [];
  for (const m of log) {
    if (m.kind === 'ipc' && m.projectId === projectId) {
      rows.push({
        id: m.reference,
        packageId: '',
        // A certificate does not name a counterparty; saying so is honest,
        // and the evaluation scorecard keys on package contractors, so this
        // name can never be scored.
        contractor: 'Not stated on certificate',
        milestone: 'Interim certificate',
        raised: m.at.slice(0, 10),
        claimed: m.certified,
        verifiedBy: null,
        verifiedOn: null,
        verifiedRef: null,
        verified: null,
        approved: m.certified,
        retentionRate: m.certified
          ? Number(((m.retention / m.certified) * 100).toFixed(2)) : 0,
        retention: m.retention,
        released: 0,
        paid: 0,
        paidOn: m.at.slice(0, 10),
        state: 'Approved',
      });
    } else if (m.kind === 'claim:record' && m.projectId === projectId) {
      rows.push({
        id: m.reference,
        packageId: m.packageId,
        contractor: procurement.find((x) => x.id === m.packageId)?.contractor
          ?? 'Unnamed counterparty',
        milestone: m.milestone,
        raised: m.at.slice(0, 10),
        claimed: m.claimed,
        verifiedBy: m.verifiedBy,
        verifiedOn: m.verifiedOn,
        verifiedRef: m.verifiedRef,
        verified: m.verified,
        approved: m.approved,
        retentionRate: m.retentionRate,
        retention: retentionOf(m.approved, m.retentionRate),
        released: 0,
        paid: 0,
        paidOn: m.at.slice(0, 10),
        state: 'Approved',
      });
    }
  }

  // The same waterfall deriveClaims runs: above the net total retention has
  // been released, oldest claims first; below it the money has left against
  // the older claims and the claim at the boundary is part paid.
  const netTotal = rows.reduce(
    (a, c) => a + Math.max(0, (c.approved ?? 0) - c.retention), 0);
  let toRelease = Math.max(0, p.paid - netTotal);
  let toPay = p.paid;

  return rows.map((c) => {
    const released = Math.min(c.retention, toRelease);
    toRelease -= released;
    const due = Math.max(0, (c.approved ?? 0) - c.retention + released);
    const paid = Math.min(due, Math.max(0, toPay));
    toPay -= paid;
    const state: ClaimState = paid === 0 ? 'Approved' : paid < due ? 'Part paid' : 'Paid';
    return { ...c, released, paid, state, paidOn: paid > 0 ? c.paidOn : null };
  });
}

/**
 * The registers for one development, at its current position.
 *
 * Three cases, in order of authority:
 *   entered   a submitted reporting period supplies the WBS and cost
 *             categories directly — the real data, from PT_TEMPLATE
 *   touched   a mutation has moved the project, so the registers are
 *             re-derived from its new position and cannot disagree with it
 *   untouched the authored fixture rows, exactly as shipped
 *
 * A development the fixtures never described — registered through the app —
 * is its own case, whatever has happened to it since: its registers are only
 * ever what was actually recorded against it. See the branch below.
 */
export function registersFor(
  projectId: string,
  db: Database,
  projects: readonly Project[],
  log: readonly Mutation[],
): ProjectRegisters {
  const project = projects.find((p) => p.id === projectId);
  if (!project) return EMPTY_REGISTERS;

  // An entered period replaces the derived registers for the two sections the
  // template actually collects. The rest still derive from the project's
  // position until their own entry screens exist, so a project can be part
  // real and part derived without any screen knowing the difference.
  const entered = latestPeriod(projectId, log);

  const known = db.wbs[projectId] !== undefined;
  // Every kind that MOVES A FIGURE THE REGISTERS RECONCILE AGAINST belongs on
  // this list, `claim:pay` included. Leaving it off is not a small omission:
  // the register comes back exactly as stored, still summing to the old paid
  // figure, while the position has moved — so control 20 fails by exactly the
  // amount transferred, and the server refuses the write with a mismatch that
  // names the control rather than the cause. The QA gate found it on the first
  // confirmed payment.
  const touched = entered !== undefined || log.some(
    (m) => (m.kind === 'ipc' && m.projectId === projectId)
      || (m.kind === 'claim:record' && m.projectId === projectId)
      || (m.kind === 'claim:pay' && m.projectId === projectId)
      // An award moves committed cost, which control 7 sums this register
      // against — a stored register left standing would fail by exactly the
      // value awarded. A package recorded out to tender moves nothing, but
      // the row still has to appear, and appearing is what touching does.
      || (m.kind === 'contract:award' && m.projectId === projectId)
      || (m.kind === 'variation:approve' && m.projectId === projectId)
      // An amendment that moved the budget moved figures the registers
      // restate — the WBS root, the category budgets, the AFC while it still
      // tracks the budget. Left untouched, the stored rows went on printing
      // the OLD budget under a band showing the new one: the exact
      // disagreement this system exists to catch, on the screen recording
      // the amendment. A name-only amendment re-derives nothing, so the
      // pristine fixture rows stay pristine.
      || (m.kind === 'project:update' && m.projectId === projectId && m.budget !== undefined),
  );

  if (known && !touched) {
    // Returned exactly as stored, never re-derived from the project: the
    // register is the second, independent source every control compares the
    // project against. Re-deriving it here made a figure edited directly in
    // the database invisible — the register followed it — and check-api's
    // perturbation proof went blind. The stored rows are normalised once, at
    // load (see data/mock/index.ts), which is why they reconcile.
    return {
      wbs: db.wbs[projectId] ?? [],
      costCategories: db.costCategories[projectId] ?? [],
      variations: db.variations[projectId] ?? [],
      changes: db.changes[projectId] ?? [],
      procurement: db.procurement[projectId] ?? [],
      claims: db.claims[projectId] ?? [],
      manpower: db.manpower[projectId] ?? [],
      equipment: db.equipment[projectId] ?? [],
      ncrs: db.ncrs[projectId] ?? [],
      risks: db.risks[projectId] ?? [],
      issues: db.issues[projectId] ?? [],
      // Built from the stored rows above, not stored themselves. See
      // `subRegisters` — they answer the register they are derived from, so
      // they follow it exactly rather than being a second copy of it.
      ...subRegisters(
        db.ncrs[projectId] ?? [],
        db.risks[projectId] ?? [],
        db.manpower[projectId] ?? [],
        db.procurement[projectId] ?? [],
        db.equipment[projectId] ?? [],
        project,
        db,
      ),
    };
  }

  // A DEVELOPMENT THE FIXTURES NEVER DESCRIBED — one registered through the
  // app, or a real one after migration — has only the register content that
  // was actually recorded against it, WHATEVER HAS HAPPENED TO IT SINCE.
  //
  // It used to be handed RES-01's registers at creation (eight risks, ten
  // packages with real contractor names, a fleet), which was fixed — and then
  // handed them again the moment its first period was filed, because the
  // touched branch below fell back to the RES-01 templates for any id the
  // fixtures did not know. The one real awarded contract the person
  // registered vanished, replaced by thirteen scaled template packages under
  // other organisations' names, with open non-conformances dated before the
  // development existed. So the rule is absolute: an app-registered
  // development NEVER borrows a template. Its WBS and cost categories come
  // from the period that was filed (or the workbook it was registered from),
  // its procurement register is the contracts that were registered, its
  // claims are the certificates and claims actually recorded, and everything
  // else is empty because nothing has been recorded — which every screen has
  // to be able to say.
  //
  // Where nothing has been planned at all, the WBS and cost register each
  // carry one explicit "Unallocated" row holding the whole control budget and
  // the whole AFC: the true position of a development nobody has planned yet,
  // and it reconciles. Empty registers summed to zero against a real control
  // budget and failed controls 1 and 6 the moment a development was
  // registered.
  if (!known) {
    const created = log.find((m): m is CreateProjectMutation =>
      m.kind === 'project:create' && m.project.id === projectId);

    const wbs = entered
      ? wbsFromPackages(entered.packages, project)
      : created?.packages?.length
        ? wbsFromPackages(created.packages, project)
        : [rootRow(project), unallocatedPackage(project)];
    const costCategories = entered
      ? categoriesFrom(entered.categories, project)
      : [unallocatedCategory(project)];

    // The contracts as they stand NOW — registration plus every recorded
    // package and award since — not as they stood on day one.
    const procurement = procurementFromContracts(
      contractsFromLog(projectId, log), project, entered?.at.slice(0, 10) ?? null);
    const claims = claimsFromLog(projectId, procurement, log, project);

    return {
      ...EMPTY_REGISTERS,
      wbs,
      costCategories,
      procurement,
      claims,
      // The sub-registers derive from registers this development does not
      // have, so EMPTY_REGISTERS is the honest answer for all of them: an
      // empty register reads as empty, never as zero that looks like data.
    };
  }

  // A touched development is re-derived from ITS OWN authored rows, scaled
  // to its new position — not from RES-01's. A certificate on COM-01 used to
  // replace COM-01's registers with a scaled copy of another development's.
  const own = projectId;
  const base = db.projects.find((p) => p.id === own) ?? project;

  const t = {
    wbs: db.wbs[own] ?? [],
    costCategories: db.costCategories[own] ?? [],
    variations: db.variations[own] ?? [],
    changes: db.changes[own] ?? [],
    procurement: db.procurement[own] ?? [],
    claims: db.claims[own] ?? [],
    manpower: db.manpower[own] ?? [],
    equipment: db.equipment[own] ?? [],
    ncrs: db.ncrs[own] ?? [],
    risks: db.risks[own] ?? [],
    issues: db.issues[own] ?? [],
  };

  // Claims recorded through the app, newest last, as register rows.
  const recorded: PaymentClaim[] = log
    .filter((m): m is RecordClaimMutation => m.kind === 'claim:record' && m.projectId === projectId)
    .map((m) => {
      const retention = retentionOf(m.approved, m.retentionRate);
      return {
        id: m.reference,
        packageId: m.packageId,
        contractor: (db.procurement[projectId] ?? []).find((x) => x.id === m.packageId)?.contractor
          ?? 'Unnamed counterparty',
        milestone: m.milestone,
        raised: m.at.slice(0, 10),
        claimed: m.claimed,
        verifiedBy: m.verifiedBy,
        verifiedOn: m.verifiedOn,
        verifiedRef: m.verifiedRef,
        verified: m.verified,
        approved: m.approved,
        retentionRate: m.retentionRate,
        retention,
        released: 0,
        paid: Math.max(0, m.approved - retention),
        paidOn: m.at.slice(0, 10),
        state: 'Paid' as const,
      };
    });

  // The seeded claims are apportioned to the position MINUS what the recorded
  // ones already account for. Without this the two would each be scaled to the
  // whole of certified and paid, and controls 19 and 20 would both read double.
  const recordedApproved = recorded.reduce((a, c) => a + (c.approved ?? 0), 0);
  const recordedPaid = recorded.reduce((a, c) => a + c.paid, 0);
  const residual: Project = {
    ...project,
    ipcSubmitted: Math.max(0, project.ipcSubmitted - recordedApproved),
    paid: Math.max(0, project.paid - recordedPaid),
  };

  const approved = new Set(
    log
      .filter((m): m is Extract<Mutation, { kind: 'variation:approve' }> =>
        m.kind === 'variation:approve' && m.projectId === projectId)
      .map((m) => m.no),
  );

  // Packages recorded through the app, appended beside the stored register —
  // the recorded-claims rule, applied to procurement. The stored rows are
  // apportioned to the position MINUS what the recorded awards committed;
  // without the residual, both sets would scale to the whole of committed
  // cost and control 7 would read the awards twice. For a known development
  // this list holds only `contract:award` rows: `awardProblem` refuses a
  // package number that collides with a stored row, so appending is safe.
  const recordedAwards = contractsFromLog(projectId, log).map(contractRow);
  const awardCommitted = recordedAwards.reduce((a, r) => a + r.committed, 0);
  const lessAwards: Project = {
    ...project,
    committed: Math.max(0, project.committed - awardCommitted),
  };

  return {
    wbs: entered ? wbsFromPackages(entered.packages, project) : deriveWbs(t.wbs, project, base),
    costCategories: entered
      ? categoriesFrom(entered.categories, project)
      : deriveCostCategories(t.costCategories, project),
    variations: deriveVariations(t.variations, project, base)
      .map((v) => (approved.has(v.no) ? { ...v, status: 'Approved' } : v)),
    changes: deriveChanges(t.changes, project, base),
    procurement: [...deriveProcurement(t.procurement, lessAwards), ...recordedAwards],
    claims: [...deriveClaims(t.claims, residual), ...recorded],
    manpower: deriveManpower(t.manpower, project, base),
    equipment: deriveEquipment(t.equipment, project),
    ncrs: deriveNcrs(t.ncrs, project),
    risks: deriveRisks(t.risks, project),
    issues: deriveIssues(t.issues, project, base),
    ...subRegisters(
      deriveNcrs(t.ncrs, project),
      deriveRisks(t.risks, project),
      deriveManpower(t.manpower, project, base),
      deriveProcurement(t.procurement, project),
      deriveEquipment(t.equipment, project),
      project,
      db,
    ),
  };
}

/**
 * The sub-registers, built from the registers above them.
 *
 * One function, called from both branches of `registersFor`, so a development
 * whose rows are returned exactly as stored and one that is re-derived get
 * these the same way — from whatever rows that development actually has. They
 * are never stored and never authored: a corrective action is the answer to a
 * non-conformance that exists, and if the NCR register changes these change
 * with it, which is the only way the two can be guaranteed to agree.
 */
type SubRegisters = Pick<ProjectRegisters,
  'correctiveActions' | 'mitigations' | 'attendance' | 'workforce' | 'incidents'
  | 'observations' | 'hseInspections' | 'training' | 'permits' | 'qualityInspections'
  | 'materialApprovals' | 'resourcePlan' | 'maintenance'>;

function subRegisters(
  ncrs: Ncr[],
  risks: Risk[],
  manpower: ManpowerTrade[],
  procurement: ProcurementPackage[],
  equipment: EquipmentItem[],
  p: Project,
  db: Database,
): SubRegisters {
  const hours = manpower.reduce((a, m) => a + m.hours, 0);
  // RES-01's own exposure is the yardstick the authored HSE fixtures are cut
  // against, the same way the other registers are scaled from its position.
  const baseHours = (db.manpower[BASE_ID] ?? []).reduce((a, m) => a + m.hours, 0);
  const basePackages = (db.procurement[BASE_ID] ?? []).length;

  return {
    correctiveActions: deriveCorrectiveActions(ncrs),
    mitigations: deriveMitigations(risks),
    attendance: deriveAttendance(hours),
    workforce: deriveWorkforceByParty(manpower, procurement, p.pmc),
    incidents: deriveIncidents(OPS.incidents, hours, baseHours),
    observations: deriveObservations(OPS.observations, hours, baseHours),
    hseInspections: deriveHseInspections(OPS.hseInspections, hours, baseHours),
    training: deriveTraining(manpower),
    permits: derivePermits(manpower),
    qualityInspections: deriveQualityInspections(ncrs, procurement.length),
    materialApprovals: deriveMaterialApprovals(OPS.materialApprovals, procurement.length, basePackages),
    // Progress is derived, never the stored field — an amendment moves the
    // budget and the stored figure stands still.
    resourcePlan: deriveResourcePlan(manpower, progressOf(p)),
    maintenance: deriveMaintenance(equipment),
  };
}
