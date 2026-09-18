// ==========================================================================
// THE BRIEF — WHY THE MODEL IS NOT ALLOWED TO DO ARITHMETIC
//
// The assistant answers questions about money the owner has committed and
// spent. A language model asked "what is our budget variance" will produce a
// number that looks exactly like the right one whether or not it is, and a
// wrong figure in a controls system is worse than no answer at all — it is a
// wrong figure carrying the system's authority.
//
// So the split is:
//
//   THIS FILE computes every number, from the same position and the same
//   functions every screen reads. It is deterministic and it is auditable.
//
//   THE MODEL reads the question, decides which of those numbers answer it,
//   and writes an English sentence. It never calculates, and it is instructed
//   that every figure it states must appear in the text below.
//
// That is retrieval, not generation, for anything numeric. The model is doing
// the one job it is genuinely better at — understanding a question asked in a
// hurry — and none of the job it is worst at.
//
// The brief is also the ACCESS BOUNDARY. It is built from the developments
// this person may see, so a project manager's assistant cannot answer about a
// development they were never assigned. The model can only tell somebody what
// is in front of it.
// ==========================================================================
import type { Project } from '../src/domain/types.js';
import type { ProjectRegisters } from '../src/data/contracts.js';
import { spiOf, cpiOf } from '../src/domain/calc.js';
import { registerCounts, sumCounts, isOpenNcr, isOpenIssue } from '../src/domain/counts.js';
import { riskLevel } from '../src/domain/risk.js';

/** A development whose registers this person may not read counts as nothing. */
const EMPTY_COUNT_SOURCE = { risks: [], ncrs: [], issues: [] };

/** The same thousands separators every screen uses, so the answer matches it. */
const sar = (n: number): string => `${Math.round(n).toLocaleString('en-GB')} SAR`;
const idx = (n: number): string => n.toFixed(2);

/**
 * A compact, complete account of the position in scope.
 *
 * Compact matters: this is sent on every question, and the model is billed by
 * the token. Complete matters more: anything left out is a question the
 * assistant has to refuse, and it must refuse rather than invent.
 */
export function buildBrief(
  projects: readonly Project[],
  registers: Record<string, ProjectRegisters>,
  scope: { level: string; portfolio?: string; project?: string },
): string {
  if (projects.length === 0) {
    return 'THE PERSON ASKING HAS NO DEVELOPMENTS IN SCOPE. There is nothing to report.';
  }

  const sum = (k: keyof Project): number =>
    projects.reduce((a, p) => a + ((p[k] as number) || 0), 0);

  const budget = sum('budget');
  const afc = sum('afc');
  const ev = sum('ev');
  const pv = sum('pv');
  const ac = sum('actual');
  const variance = budget - afc;

  const lines: string[] = [];

  lines.push(`SCOPE: ${scope.level}${scope.level === 'Corporate' ? ''
    : ` — ${scope.level === 'Portfolio' ? scope.portfolio : scope.project}`}`);
  lines.push(`DEVELOPMENTS IN SCOPE: ${projects.length}`);
  lines.push('');
  lines.push('TOTALS ACROSS SCOPE');
  lines.push(`  Approved Budget: ${sar(budget)}`);
  lines.push(`  Anticipated Final Cost (AFC): ${sar(afc)}`);
  lines.push(`  Budget Variance (Approved Budget less AFC): ${sar(variance)}`
    + ` — ${variance >= 0 ? 'FAVOURABLE' : 'UNFAVOURABLE'}`);
  lines.push(`  Committed Cost: ${sar(sum('committed'))}`);
  lines.push(`  Actual Cost incurred: ${sar(ac)}`);
  lines.push(`  Certified to date: ${sar(sum('ipcSubmitted'))}`);
  lines.push(`  Paid to date: ${sar(sum('paid'))}`);
  lines.push(`  Earned Value: ${sar(ev)}    Planned Value: ${sar(pv)}`);
  lines.push(`  Portfolio SPI (EV/PV): ${idx(pv ? ev / pv : 1)}`);
  lines.push(`  Portfolio CPI (EV/AC): ${idx(ac ? ev / ac : 1)}`);
  lines.push(`  Status: ${projects.filter((p) => p.status === 'On Track').length} on track, `
    + `${projects.filter((p) => p.status === 'At Risk').length} at risk, `
    + `${projects.filter((p) => p.status === 'Delayed').length} delayed`);
  // COUNTED FROM THE REGISTERS, not summed off the project record. The stored
  // counts contradict the rows on every development (domain/counts.ts), and a
  // brief that stated one while the screens listed the other would have the
  // assistant and the Risk module disagreeing in front of the same person.
  const counts = sumCounts(projects.map((p) => registerCounts(registers[p.id] ?? EMPTY_COUNT_SOURCE)));
  lines.push(`  Risk exposure (EMV): ${sar(sum('emv'))} across ${counts.highRisks} high-rated risks`
    + ` of ${counts.risks} on the registers`);
  lines.push(`  Open non-conformances: ${counts.openNcr}    Open issues: ${counts.openIssues}`);
  lines.push('');

  lines.push('EACH DEVELOPMENT');
  for (const p of projects) {
    const v = p.budget - p.afc;
    lines.push(`  ${p.id} — ${p.name} (${p.portfolio}, ${p.route}, managed by ${p.pmc})`);
    lines.push(`    Approved Budget ${sar(p.budget)}; Control Budget ${sar(p.control)}; AFC ${sar(p.afc)};`
      + ` Budget Variance ${sar(v)} ${v >= 0 ? 'favourable' : 'UNFAVOURABLE'}`);
    lines.push(`    Committed ${sar(p.committed)}; Actual Cost ${sar(p.actual)};`
      + ` Certified ${sar(p.ipcSubmitted)}; Paid ${sar(p.paid)}`);
    lines.push(`    SPI ${idx(spiOf(p))}; CPI ${idx(cpiOf(p))}; Progress ${p.progress}%; Status ${p.status}`);
    lines.push(`    Dates: start ${p.start}, finish ${p.finish}, duration ${p.duration}`);

    const r = registers[p.id];
    if (r) {
      const pending = r.variations.filter((x) => x.status === 'Under Review' || x.status === 'Pending');
      const approved = r.variations.filter((x) => x.status === 'Approved');
      if (pending.length) {
        lines.push(`    Variations awaiting approval: ${pending.map((x) =>
          `${x.no} "${x.title}" ${sar(x.amount)}`).join('; ')}`);
      }
      if (approved.length) {
        lines.push(`    Approved variations: ${approved.length}, totalling `
          + `${sar(approved.reduce((a, x) => a + x.amount, 0))}`);
      }
      const top = [...r.risks].sort((a, b) => b.exposure - a.exposure).slice(0, 3);
      if (top.length) {
        lines.push(`    Largest risks: ${top.map((x) =>
          `"${x.desc}" ${sar(x.exposure)} (${riskLevel(x.score)})`).join('; ')}`);
      }
      const openIssues = r.issues.filter(isOpenIssue);
      if (openIssues.length) {
        lines.push(`    Open issues: ${openIssues.slice(0, 3).map((x) => `"${x.desc}"`).join('; ')}`);
      }
      const openNcr = r.ncrs.filter(isOpenNcr);
      if (openNcr.length) {
        lines.push(`    Open non-conformances: ${openNcr.slice(0, 3).map((x) => `${x.no} "${x.desc}"`).join('; ')}`);
      }
      const tendered = r.procurement.filter((x) => x.awarded === null);
      if (tendered.length) {
        lines.push(`    Packages out to tender (committing nothing yet): ${tendered.map((x) =>
          `${x.id} ${sar(x.value)}`).join('; ')}`);
      }
      if (r.claims.length) {
        const held = r.claims.reduce((a, c) => a + Math.max(0, c.retention - (c.released ?? 0)), 0);
        lines.push(`    Payment claims: ${r.claims.length}; retention still held as security ${sar(held)}`);
      }
    }
  }

  lines.push('');
  lines.push('WHAT IS NOT IN THIS BRIEF: manpower and equipment detail, the full work');
  lines.push('breakdown, monthly cost curves, the change log, document references, and');
  lines.push('anything about developments outside the scope above. If the question needs');
  lines.push('one of those, say so and name the screen — do not estimate it.');

  return lines.join('\n');
}
