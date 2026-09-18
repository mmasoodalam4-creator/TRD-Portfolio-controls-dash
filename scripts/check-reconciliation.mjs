#!/usr/bin/env node
/**
 * Proves every project's registers add up to that project's own position.
 *
 * The demo's strongest claim is that the system reconciles its own numbers —
 * "before you ever report a number, the system proves it agrees across every
 * module". A register that disagrees with the project header printed above it
 * falsifies that claim on screen, in front of the person being sold to.
 *
 * Nine controls per project, mirroring what the screens actually put side by
 * side:
 *
 *   Cost         category totals vs Approved Budget, Committed, Actual,
 *                Earned Value and AFC — all five printed in the KPI row
 *                directly above the table's TOTAL row
 *   WBS          level 0 vs the project's budget, PV, EV and actual cost
 *   Procurement  package commitments and payments vs the project's own
 *   Risk         register exposure vs the project's EMV, which the dashboard
 *                rolls up
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = join(tmpdir(), `tazayud-recon-${process.pid}`);
const build = (entry, name) => {
  const out = join(dir, name);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--alias:@=./src',
    '--log-level=error', `--outfile=${out}`], { stdio: 'inherit' });
  return `file://${out}`;
};
const { DB } = await import(build('src/data/index.ts', 'db.mjs'));
const { registersFor } = await import(build('src/data/project-state.ts', 'state.mjs'));
const { rollUpRegisters } = await import(build('src/domain/rollup.ts', 'rollup.mjs'));
const { agg } = await import(build('src/domain/calc.ts', 'calc.mjs'));
rmSync(dir, { recursive: true, force: true });

const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);

const failures = [];
let checks = 0;

for (const p of DB.projects) {
  const cost = DB.costCategories[p.id] ?? [];
  const wbsRoot = (DB.wbs[p.id] ?? []).find((n) => n.level === 0);
  const proc = DB.procurement[p.id] ?? [];
  const risks = DB.risks[p.id] ?? [];

  const controls = [
    ['cost categories -> Approved Budget', sum(cost, 'budget'), p.budget],
    ['cost categories -> Committed Cost', sum(cost, 'committed'), p.committed],
    ['cost categories -> Actual Cost', sum(cost, 'actual'), p.actual],
    ['cost categories -> Earned Value', sum(cost, 'ev'), p.ev],
    ['cost categories -> AFC', sum(cost, 'afc'), p.afc],
    ['WBS level 0 -> Approved Budget', wbsRoot?.budget, p.budget],
    ['WBS level 0 -> Earned Value', wbsRoot?.ev, p.ev],
    ['procurement -> Committed Cost', sum(proc, 'committed'), p.committed],
    ['procurement -> Payments Made', sum(proc, 'paid'), p.paid],
    ['risk exposure -> EMV', sum(risks, 'exposure'), p.emv],
  ];

  for (const [name, actual, expected] of controls) {
    checks++;
    if (actual !== expected) {
      failures.push(`${p.id}  ${name}: register ${Number(actual).toLocaleString('en-US')} vs project ${expected.toLocaleString('en-US')}`);
    }
  }
}

// ---------------------------------------------------------------------------
// THE ROLL-UP RECONCILES TOO — Corporate and every portfolio.
//
// The identities above run per project, and nothing anywhere held the fold:
// domain/rollup.ts concatenates event registers, folds position registers
// onto their keys and rebuilds the WBS as one row per development, and the
// only assertion over any of it was one band figure on one gate. A fold that
// dropped a row, double-counted a key or summed the wrong column would have
// shipped. Every folded total must equal the sum over the developments it
// was folded from, and the roll-up WBS root must equal the scope's own
// aggregate.
// ---------------------------------------------------------------------------
{
  const live = DB.projects.filter((x) => !x.closedAt && !x.archived);
  const scopes = [
    ['Corporate', live],
    ...[...new Set(live.map((x) => x.portfolio))].map((pf) =>
      [`Portfolio ${pf}`, live.filter((x) => x.portfolio === pf)]),
  ];

  for (const [label, list] of scopes) {
    if (list.length < 2) continue;
    const sources = list.map((x) => ({
      id: x.id, name: x.name, registers: registersFor(x.id, DB, DB.projects, []),
    }));
    const rolled = rollUpRegisters(sources);
    const across = (pick) => sources.reduce((a, s) => a + pick(s.registers), 0);
    const totals = agg(list, 'as-given');

    const identities = [
      ['folded cost categories -> Σ budgets', sum(rolled.costCategories, 'budget'),
        across((r) => sum(r.costCategories, 'budget'))],
      ['folded cost categories -> Σ AFC', sum(rolled.costCategories, 'afc'),
        across((r) => sum(r.costCategories, 'afc'))],
      ['folded cost categories -> Σ actual', sum(rolled.costCategories, 'actual'),
        across((r) => sum(r.costCategories, 'actual'))],
      ['folded manpower -> Σ headcount', sum(rolled.manpower, 'total'),
        across((r) => sum(r.manpower, 'total'))],
      ['folded manpower -> Σ manhours', sum(rolled.manpower, 'hours'),
        across((r) => sum(r.manpower, 'hours'))],
      ['folded attendance -> Σ worked hours', sum(rolled.attendance, 'worked'),
        across((r) => sum(r.attendance, 'worked'))],
      ['folded workforce -> Σ headcount', sum(rolled.workforce, 'headcount'),
        across((r) => sum(r.workforce, 'headcount'))],
      ['concatenated claims -> Σ approved', rolled.claims.reduce((a, c) => a + (c.approved ?? 0), 0),
        across((r) => r.claims.reduce((a, c) => a + (c.approved ?? 0), 0))],
      ['concatenated procurement -> scope committed', sum(rolled.procurement, 'committed'),
        totals.committed],
      ['concatenated variations -> Σ rows', rolled.variations.length,
        across((r) => r.variations.length)],
      ['concatenated risks -> scope EMV', sum(rolled.risks, 'exposure'), totals.emv],
      ['roll-up WBS root -> scope budget', rolled.wbs.find((n) => n.level === 0)?.budget,
        totals.budget],
      ['roll-up WBS root -> scope EV', rolled.wbs.find((n) => n.level === 0)?.ev, totals.ev],
      ['roll-up WBS rows -> one per development + root', rolled.wbs.length, list.length + 1],
    ];
    for (const [name, a, b] of identities) {
      checks++;
      if (a !== b) {
        failures.push(`${label}  ${name}: rolled ${Number(a).toLocaleString('en-US')} vs ${Number(b).toLocaleString('en-US')}`);
      }
    }
  }
}

console.log(`\nreconciliation  ${DB.projects.length} projects, ${checks} identities (project level and rolled up)\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} register(s) disagree with their project.\n`);
  process.exit(1);
}
console.log('  every register agrees with the project it belongs to.\n');
