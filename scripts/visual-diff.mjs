#!/usr/bin/env node
/**
 * Per-screen pixel diff: frozen legacy demo vs. the current build.
 *
 *   node scripts/visual-diff.mjs [candidate] [baseline]
 *
 * This is the Phase 1 merge gate. The migration to Vite/React/TypeScript is a
 * restructure, not a redesign, so every one of the 17 modules must render the
 * same pixels as the demo it replaces. Diff images for any screen over
 * threshold are written to tests/output/ so a regression can be looked at
 * rather than argued about.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { gotoApp, navigate, stillFrame } from './lib/drive.mjs';

const candidate = resolve(process.argv[2] ?? 'dist/index.html');
const baseline = resolve(process.argv[3] ?? 'tests/baseline/current.html');
const OUT = resolve('tests/output');
const THRESHOLD = 0.1; // % of pixels; sub-pixel text AA drifts between runs

for (const f of [candidate, baseline]) {
  if (!existsSync(f)) { console.error('missing file: ' + f); process.exit(1); }
}
mkdirSync(OUT, { recursive: true });

async function capture(file) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await gotoApp(page, pathToFileURL(file).href);
  await stillFrame(page);
  const labels = await page.$$eval('.nav-item', (els) => els.map((e) => e.textContent.trim()));
  const shots = {};
  for (const label of labels) {
    await navigate(page, label);
    await page.waitForTimeout(260);
    shots[label] = await page.screenshot({ fullPage: false });
  }
  await browser.close();
  return shots;
}

const [base, cand] = [await capture(baseline), await capture(candidate)];

const rows = [];
for (const label of Object.keys(base)) {
  if (!cand[label]) { rows.push({ label, pct: null, note: 'MISSING in candidate' }); continue; }
  const a = PNG.sync.read(base[label]);
  const b = PNG.sync.read(cand[label]);
  if (a.width !== b.width || a.height !== b.height) {
    rows.push({ label, pct: null, note: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` });
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const differing = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const pct = (differing / (a.width * a.height)) * 100;
  if (pct > THRESHOLD) {
    writeFileSync(join(OUT, `diff-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), PNG.sync.write(diff));
  }
  rows.push({ label, pct, note: '' });
}

console.log(`\nvisual diff  candidate: ${candidate}\n             baseline : ${baseline}\n`);
let worst = 0, failures = 0;
for (const r of rows) {
  const val = r.pct === null ? r.note : `${r.pct.toFixed(3)}%`;
  const bad = r.pct === null || r.pct > THRESHOLD;
  if (bad) failures++;
  if (r.pct !== null) worst = Math.max(worst, r.pct);
  console.log(`  ${bad ? 'FAIL' : 'ok  '}  ${r.label.padEnd(20)} ${val}`);
}
console.log(`\n  screens: ${rows.length}   worst: ${worst.toFixed(3)}%   threshold: ${THRESHOLD}%`);
console.log(failures ? `  ${failures} screen(s) over threshold — diffs in tests/output/\n` : '  all screens within threshold\n');
process.exit(failures ? 1 : 0);
