#!/usr/bin/env node
/**
 * Runs the reconciliation engine's controls against live data for every
 * development, and asserts the engine as rendered agrees with the model.
 *
 * The engine is the demo's strongest claim — "before you ever report a number,
 * the system proves it agrees across every module". It previously rendered a
 * fixed array of pairs that were equal because they had been typed that way:
 * control 8 asserted 38,450 workforce hours against 38,450 exposure hours while
 * the manpower register totalled 40,280. A check that only read that array
 * would have confirmed the fiction, so this one runs the controls and then
 * reads what the modal actually displays.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = join(tmpdir(), `tazayud-integrity-${process.pid}`);
const build = (entry, name) => {
  const out = join(dir, name);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--alias:@=./src',
    '--log-level=error', `--outfile=${out}`], { stdio: 'inherit' });
  return `file://${out}`;
};
const { DB } = await import(build('src/data/index.ts', 'db.mjs'));
const { runControls } = await import(build('src/domain/integrity.ts', 'integrity.mjs'));
rmSync(dir, { recursive: true, force: true });

const registersFor = (id) => ({
  wbs: DB.wbs[id], costCategories: DB.costCategories[id], variations: DB.variations[id],
  changes: DB.changes[id], procurement: DB.procurement[id], claims: DB.claims[id],
  manpower: DB.manpower[id],
  equipment: DB.equipment[id], ncrs: DB.ncrs[id], risks: DB.risks[id], issues: DB.issues[id],
});

const failures = [];
let checks = 0;

for (const p of DB.projects) {
  for (const c of runControls(p, registersFor(p.id), DB.months, DB.scurve)) {
    checks++;
    if (c.result !== 'OK') {
      failures.push(`${p.id}  control ${c.no} ${c.name}: ${c.a.toLocaleString('en-US')} vs ${c.b.toLocaleString('en-US')}`);
    }
  }
}

// What the engine actually renders, at Corporate scope.
const target = resolve(process.argv[2] ?? 'dist/index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(pathToFileURL(target).href);
await page.waitForSelector('.topbar-right', { timeout: 15_000 });

const badge = await page.evaluate(() => [...document.querySelectorAll('.topbar-right button')]
  .map((b) => b.textContent.trim()).find((t) => /^\d+\/\d+$/.test(t)));
await page.evaluate(() => [...document.querySelectorAll('.topbar-right button')]
  .find((b) => /^\d+\/\d+$/.test(b.textContent.trim())).click());
await page.waitForSelector('.big-status', { timeout: 5000 });
const shown = await page.evaluate(() => ({
  headline: document.querySelector('.big-status').innerText.split('\n')[0].trim(),
  rows: document.querySelectorAll('.recon-row').length,
  mismatches: [...document.querySelectorAll('.recon-row')]
    .filter((r) => r.textContent.includes('MISMATCH')).length,
}));
await browser.close();

const expectedControls = runControls(DB.projects[0], registersFor(DB.projects[0].id), DB.months, DB.scurve).length;
checks += 4;
if (badge !== `${expectedControls}/${expectedControls}`) failures.push(`topbar badge reads ${badge}, expected ${expectedControls}/${expectedControls}`);
if (!shown.headline.startsWith(`${expectedControls} / ${expectedControls}`)) failures.push(`engine headline reads "${shown.headline}"`);
if (shown.rows !== expectedControls) failures.push(`engine rendered ${shown.rows} control rows, expected ${expectedControls}`);
if (shown.mismatches !== 0) failures.push(`engine shows ${shown.mismatches} mismatch row(s)`);

console.log(`\nintegrity engine  ${DB.projects.length} projects x ${expectedControls} controls, ${checks} checks\n`);
console.log(`  badge: ${badge}   headline: ${shown.headline}   rows: ${shown.rows}\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  every control reconciles on live data, and the engine renders what the model computed.\n');
