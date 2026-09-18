#!/usr/bin/env node
/**
 * Checks the cost-forecasting model against every project.
 *
 * Two things are asserted, and a third is reported rather than asserted.
 *
 * Asserted — the monthly cost curve must agree with the figures printed
 * alongside it: cumulative PV, EV and AC at the data date equal the project's
 * own, and planned value at completion equals the Approved Development Budget.
 * A curve that disagrees with the KPI row above it is the same class of defect
 * as a register that disagrees with its project.
 *
 * Asserted — every forecast method must return a finite, positive AFC.
 *
 * Reported — the divergence between the composite forecast and the AFC
 * management has adopted, plus the TCPI required to reach the adopted position.
 * These are not failures. They are the output the system exists to produce, and
 * on this dataset they say something worth reading: see the summary at the end.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Bundle each entry separately: with several entries esbuild mirrors the
// source tree under --outdir, which makes the output paths awkward to predict.
const dir = join(tmpdir(), `tazayud-forecast-${process.pid}`);
const build = (entry, name) => {
  const out = join(dir, name);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--alias:@=./src',
    '--log-level=error', `--outfile=${out}`], { stdio: 'inherit' });
  return `file://${out}`;
};
const { DB } = await import(build('src/data/index.ts', 'db.mjs'));
const { forecast, monthlyCost, DATA_DATE_INDEX } = await import(build('src/domain/forecast.ts', 'forecast.mjs'));
rmSync(dir, { recursive: true, force: true });

const M = (n) => `${(n / 1e6).toFixed(0)}M`.padStart(7);
const failures = [];
let checks = 0;

for (const p of DB.projects) {
  const rows = monthlyCost(p, DB.months, DB.scurve);
  const dd = rows[DATA_DATE_INDEX];
  const last = rows[rows.length - 1];

  const controls = [
    ['monthly PV at data date -> project PV', dd.plannedCum, p.pv],
    ['monthly EV at data date -> project EV', dd.earnedCum, p.ev],
    ['monthly AC at data date -> project AC', dd.actualCum, p.actual],
    ['planned at completion -> Approved Budget', last.plannedCum, p.budget],
  ];
  for (const [name, actual, expected] of controls) {
    checks++;
    if (Math.abs(actual - expected) > 1) {
      failures.push(`${p.id}  ${name}: ${actual?.toLocaleString('en-US')} vs ${expected.toLocaleString('en-US')}`);
    }
  }

  const f = forecast(p);
  for (const m of f.methods) {
    checks++;
    if (!Number.isFinite(m.afc) || m.afc <= 0) failures.push(`${p.id}  method ${m.key} returned ${m.afc}`);
  }
}

console.log(`\nforecast model  ${DB.projects.length} projects, ${checks} checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  monthly curves agree with their project at both ends; all methods return a finite AFC.\n');

// ---- reported, not asserted ----
console.log('  Forecast position (reported, not a pass/fail):\n');
console.log('  proj     adopted AFC   composite    divergence   CPI    TCPI to adopted');
let totalDivergence = 0;
for (const p of DB.projects) {
  const f = forecast(p);
  totalDivergence += f.divergence;
  const flag = f.tcpiToAdopted > f.cpi * 1.15 ? '  <-- not reachable at current CPI' : '';
  console.log(`  ${p.id}  ${M(f.adopted)}   ${M(f.composite)}   ${M(f.divergence)}   ${f.cpi.toFixed(2)}   ${f.tcpiToAdopted.toFixed(2)}${flag}`);
}
console.log(`\n  portfolio divergence: ${M(totalDivergence)} above the adopted position\n`);
