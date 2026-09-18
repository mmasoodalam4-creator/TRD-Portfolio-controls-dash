// Assembles the complete mock dataset: RES-01's authored registers exactly as
// written, plus derived registers for the other seven projects.
//
// RES-01 is returned untouched. It is the project the pitch runs on, and
// scripts/check-data-parity.mjs proves its figures still match the demo.
import type {
  ChangeRequest, CostCategory, EquipmentItem, Issue, ManpowerTrade, Ncr,
  PaymentClaim, ProcurementPackage, Project, Risk, Variation, WbsNode,
} from '@/domain/types';
import { projects } from './projects.js';
import {
  wbs as wbsTemplates, costCategories as costTemplates, variations as variationTemplates,
  changes as changeTemplates, procurement as procurementTemplates, claims as claimTemplates,
  manpower as manpowerTemplates, equipment as equipmentTemplates, ncrs as ncrTemplates,
  risks as riskTemplates, issues as issueTemplates,
} from './registers.js';
import {
  deriveCostCategories, deriveWbs, deriveVariations, deriveChanges, deriveProcurement,
  deriveManpower, deriveEquipment, deriveNcrs, deriveRisks, deriveIssues, deriveClaims,
} from './derive.js';

/** The project the registers were authored against. */
const BASE_ID = 'RES-01';
const base = projects.find((p) => p.id === BASE_ID);
if (!base) throw new Error(`register template project ${BASE_ID} missing`);

/**
 * Build a per-project map from the RES-01 templates.
 *
 * `includeBase` decides whether RES-01 itself is derived or returned as
 * authored. It is false almost everywhere — RES-01's authored rows are the
 * pitch data and must not move.
 *
 * It is true for the three registers a screen prints beside the project's own
 * figures, because RES-01's authored rows do not add up to RES-01. On the Cost
 * screen the KPI row read Earned Value 680M while the category total beneath it
 * read 1,128M — a 448M contradiction on the flagship screen, directly under a
 * button claiming ten reconciliation controls pass. Deriving those three from
 * the project's own position resolves it, and leaves every project-level figure
 * — the ones the dashboard, reports and roll-ups use — untouched.
 */
function forEachProject<T>(
  templates: Record<string, T[]>,
  derive: (template: T[], project: Project, base: Project) => T[],
  includeBase = false,
): Record<string, T[]> {
  const template = templates[BASE_ID] ?? [];
  const out: Record<string, T[]> = {};
  for (const p of projects) {
    out[p.id] = p.id === BASE_ID && !includeBase ? template : derive(template, p, base!);
  }
  return out;
}

/**
 * WBS level 0 is the development itself, so it is always projected from the
 * project record rather than read from the template — including for RES-01,
 * whose authored root row carried an earned value that stopped matching the
 * project when EV was corrected. The integrity engine caught it: control 4
 * reported 833,333,333 against 680,000,000.
 *
 * The work packages beneath are left exactly as authored for RES-01. Only the
 * row that restates the project is projected.
 */
function withProjectRoot(template: WbsNode[], p: Project): WbsNode[] {
  return template.map((n) => (n.level !== 0 ? n : {
    ...n,
    name: p.name,
    budget: p.budget,
    pv: p.pv,
    ev: p.ev,
    ac: p.actual,
    prog: p.budget ? Math.round((p.ev / p.budget) * 100) : 0,
    spi: p.pv ? Number((p.ev / p.pv).toFixed(2)) : 1,
    cpi: p.actual ? Number((p.ev / p.actual).toFixed(2)) : 1,
  }));
}

// RES-01's authored packages are put through the same apportionment as every
// other development's, against RES-01 itself: the authored actuals summed to
// 605M of packages against 720M incurred, so the register disagreed with its
// own total at every level below the root. The tree keeps its authored
// shape, names and proportions; its figures now add up.
export const wbs: Record<string, WbsNode[]> = forEachProject(
  wbsTemplates,
  (template, project, baseProject) => deriveWbs(withProjectRoot(template, project), project, baseProject),
  true,
);
export const costCategories: Record<string, CostCategory[]> =
  forEachProject(costTemplates, (t, p) => deriveCostCategories(t, p), true);
export const variations: Record<string, Variation[]> = forEachProject(variationTemplates, deriveVariations);
export const changes: Record<string, ChangeRequest[]> = forEachProject(changeTemplates, deriveChanges);
export const procurement: Record<string, ProcurementPackage[]> =
  forEachProject(procurementTemplates, (t, p) => deriveProcurement(t, p), true);
// Claims are derived for RES-01 too: the template carries relative weights,
// and even the base development needs them scaled onto its own certified and
// paid position before the two controls over them can hold.
export const claims: Record<string, PaymentClaim[]> =
  forEachProject(claimTemplates, (t, p) => deriveClaims(t, p), true);
export const manpower: Record<string, ManpowerTrade[]> = forEachProject(manpowerTemplates, deriveManpower);
export const equipment: Record<string, EquipmentItem[]> =
  forEachProject(equipmentTemplates, (t, p) => deriveEquipment(t, p));
export const ncrs: Record<string, Ncr[]> = forEachProject(ncrTemplates, (t, p) => deriveNcrs(t, p));
export const risks: Record<string, Risk[]> = forEachProject(riskTemplates, (t, p) => deriveRisks(t, p), true);
// Derived for RES-01 too, because the age of an issue is COUNTED from the
// date it was opened (see `deriveIssues`) and the base development's rows have
// to be counted the same way as everybody else's.
export const issues: Record<string, Issue[]> = forEachProject(issueTemplates, deriveIssues, true);

export { projects };
export { portfolios, months, scurve, activities, reconciliation, reports, notifications, roles } from './reference.js';
