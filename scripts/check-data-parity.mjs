#!/usr/bin/env node
/**
 * Proves the demo's project-level and corporate figures are value-identical to
 * the pre-migration data module.
 *
 * These are the numbers every roll-up, report and dashboard is built from, and
 * no amount of restructuring is allowed to perturb one of them.
 *
 * The comparison used to run against legacy/src/data.js directly. That
 * directory is gone, so the figures it held are snapshotted at
 * tests/baseline/legacy-figures.json — the guarantee survives without keeping
 * a second implementation of the app alive to provide it.
 *
 * The snapshot was re-taken once, deliberately, when the owner authorised
 * correcting earned value. EV had been authored independently of the rest of
 * each project's position, so the performance indices and every forecast built
 * on them were incoherent. EV is now AC x BAC / AFC — the value at which the
 * realistic forecast lands on the adopted AFC — with progress, SPI and CPI
 * following from it. Approved budgets, AFCs, commitments and payments were not
 * touched, so the reported budget variance is unchanged.
 *
 * Re-taken a second time, for one field on seven projects: certified to date
 * (ipcSubmitted) was authored above actual cost on six developments, and equal
 * to it on RES-01. A certificate cannot exceed the cost incurred, and the
 * integrity engine's control 15 now says so — which meant the shipped figures
 * failed their own control, and on RES-01 the sample certificate the
 * extraction demo files (IPC-08, 48.5M, "cumulative 720M") could not be filed
 * at all. Certified is now 671.5M on RES-01, so filing IPC-08 lands on exactly
 * the 720M the certificate states, and capped at actual cost elsewhere.
 * Budgets, AFCs, commitments and payments are unchanged. From here the check's
 * job is what it always was: catch drift nobody asked for.
 *
 * Registers are excluded on purpose, and they are the interesting part. They
 * are no longer copies of the pre-migration fixtures: every project has its
 * own, derived from the RES-01 templates and reconciled to that project's
 * position. scripts/check-reconciliation.mjs is what guards them. Comparing
 * them here would only assert that a defect was preserved.
 */
import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const expected = JSON.parse(readFileSync('tests/baseline/legacy-figures.json', 'utf8'));

const bundle = join(tmpdir(), `tazayud-db-${process.pid}.mjs`);
execFileSync('npx', ['esbuild', 'src/data/index.ts', '--bundle', '--format=esm',
  '--alias:@=./src', '--log-level=error', `--outfile=${bundle}`], { stdio: 'inherit' });
const { DB } = await import(`file://${bundle}`);
rmSync(bundle, { force: true });

const collections = Object.keys(expected);
const mismatches = [];
let rows = 0;

for (const key of collections) {
  if (JSON.stringify(expected[key]) !== JSON.stringify(DB[key])) mismatches.push(key);
  const v = expected[key];
  rows += Array.isArray(v) ? v.length : 1;
}

const missing = collections.filter((k) => !(k in DB));

console.log('\ndata parity  approved baseline  vs  src/data/\n');
console.log(`  collections compared : ${collections.length} (registers excluded — derived per project)`);
console.log(`  rows compared        : ${rows}`);
console.log(`  missing in port      : ${missing.length ? missing.join(', ') : 'none'}`);
console.log(`  value mismatches     : ${mismatches.length ? mismatches.join(', ') : 'none'}\n`);

if (mismatches.length || missing.length) process.exit(1);
console.log('  every project-level and corporate figure is unchanged.\n');
