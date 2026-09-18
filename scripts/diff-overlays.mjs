#!/usr/bin/env node
/**
 * Pixel-diff the states the nav-label sweep cannot reach: the Overview
 * sub-page, both hero flows at each stage, the register drawers and the modals.
 *
 *   node scripts/diff-overlays.mjs [candidate] [baseline]
 *
 * The 17-module diff would pass with a broken AI Extract dialog, because that
 * dialog is not a nav destination. These are the states a live demo actually
 * spends its time in, so they get the same treatment.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { gotoApp, navigate, clickButton, openIntegrity, stillFrame } from './lib/drive.mjs';

const candidate = resolve(process.argv[2] ?? 'dist/index.html');
const baseline = resolve(process.argv[3] ?? 'tests/baseline/current.html');
const OUT = resolve('tests/output');
const THRESHOLD = 0.1;

/**
 * A top-bar button, BY NAME.
 *
 * It used to be addressed by position from the end, and that broke the day
 * the user manual icon was removed and sign-out added: "second from the end"
 * silently became a different button, and the state this script was supposed
 * to capture never opened. An aria-label is what the button IS; its index is
 * only where it happens to sit today.
 */
const topbarIcon = (page, label) =>
  page.click(`.topbar-right .icon-btn[aria-label^="${label}"]`);

/**
 * Each state names how to reach it from a freshly loaded app. Both builds are
 * driven identically, so any difference is the port's, not the script's.
 */
const STATES = {
  // Drilling from the portfolio into a development. It used to land on the
  // standalone Overview screen and now lands on the PROJECT WORKSPACE, which
  // is where a development lives — Overview is its first tab. The state is
  // named for what it captures rather than for the screen it used to reach,
  // because a gate whose name has stopped describing its subject is a gate
  // nobody reads the output of.
  'project-drill-in': async (p) => {
    await navigate(p, 'Projects');
    await p.click('tbody tr:first-child');
    await p.waitForTimeout(420);
  },
  'ai-extract-upload': async (p) => {
    await clickButton(p, 'AI Extract');
    await p.waitForTimeout(320);
  },
  'ai-extract-review': async (p) => {
    await clickButton(p, 'AI Extract');
    await p.waitForSelector('.modal-b div[style*="dashed"]');
    await p.click('.modal-b div[style*="dashed"]');
    await p.waitForFunction(() => document.querySelectorAll('.modal-b input').length > 0, null, { timeout: 15_000 });
    await p.waitForTimeout(400);
  },
  'ai-extract-done': async (p) => {
    await clickButton(p, 'AI Extract');
    await p.waitForSelector('.modal-b div[style*="dashed"]');
    await p.click('.modal-b div[style*="dashed"]');
    await p.waitForFunction(() => document.querySelectorAll('.modal-b input').length > 0, null, { timeout: 15_000 });
    await clickButton(p, 'Create IPC Entry');
    await p.waitForTimeout(400);
  },
  'integrity': async (p) => {
    await openIntegrity(p);
    await p.waitForTimeout(320);
  },
  'integrity-expanded': async (p) => {
    await openIntegrity(p);
    await p.waitForSelector('.recon-row');
    await p.click('.recon-row:first-child');
    await p.waitForTimeout(320);
  },
  'assistant': async (p) => {
    await topbarIcon(p, 'PMO assistant');
    await p.waitForTimeout(320);
  },
  'assistant-answered': async (p) => {
    await topbarIcon(p, 'PMO assistant');
    await p.waitForSelector('.doc-link');
    // .doc-link is not its parent's first child — the "SUGGESTED QUESTIONS"
    // heading precedes it — so address it by order among matches.
    await p.evaluate(() => document.querySelectorAll('.doc-link')[0].click());
    await p.waitForTimeout(320);
  },
  'notifications': async (p) => {
    await topbarIcon(p, 'Notifications');
    await p.waitForTimeout(320);
  },
  'add-project': async (p) => {
    await clickButton(p, 'Add Project');
    await p.waitForTimeout(320);
  },
  'report-preview': async (p) => {
    await navigate(p, 'Reports');
    await p.click('.grid .card:first-child');
    await p.waitForTimeout(400);
  },
  'variation-drawer': async (p) => {
    await navigate(p, 'Variations');
    await p.click('tbody tr:first-child');
    await p.waitForTimeout(400);
  },
  'ncr-drawer': async (p) => {
    await navigate(p, 'Quality');
    await p.click('tbody tr:first-child');
    await p.waitForTimeout(400);
  },
  // The Cost module's six tabs. They carry most of the depth in the system, and
  // the nav sweep only ever sees the first one.
  ...Object.fromEntries(['summary', 'category', 'monthly', 'forecast', 'cashflow', 'commitments']
    .map((tab) => [`cost-${tab}`, async (p) => {
      await navigate(p, 'Cost & Financials');
      await p.evaluate((t) => {
        const labels = { summary: 'Cost Summary', category: 'Cost by Category', monthly: 'Monthly Cost',
          forecast: 'Forecast (AFC)', cashflow: 'Cash Flow', commitments: 'Commitments' };
        [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim() === labels[t]).click();
      }, tab);
      await p.waitForTimeout(360);
    }])),
  'cost-category-drawer': async (p) => {
    await navigate(p, 'Cost & Financials');
    await p.evaluate(() => [...document.querySelectorAll('.tab')]
      .find((b) => b.textContent.trim() === 'Cost by Category').click());
    await p.waitForSelector('tbody tr');
    await p.click('tbody tr:first-child');
    await p.waitForTimeout(360);
  },
  'sidebar-collapsed': async (p) => {
    await p.click('.topbar .icon-btn');
    await p.waitForTimeout(320);
  },
};

async function capture(file) {
  const browser = await chromium.launch();
  const shots = {};
  for (const [name, drive] of Object.entries(STATES)) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await gotoApp(page, pathToFileURL(file).href);
    await stillFrame(page);
    try {
      await drive(page);
      shots[name] = await page.screenshot();
    } catch (err) {
      shots[name] = { error: String(err).split('\n')[0] };
    }
    await page.close();
  }
  await browser.close();
  return shots;
}

const [base, cand] = [await capture(baseline), await capture(candidate)];

mkdirSync(OUT, { recursive: true });
console.log(`\noverlay diff  candidate: ${candidate}\n              baseline : ${baseline}\n`);

let failures = 0;
let worst = 0;
for (const name of Object.keys(STATES)) {
  const a = base[name];
  const b = cand[name];
  if (a?.error || b?.error) {
    console.log(`  FAIL  ${name.padEnd(22)} drive error: ${a?.error ?? b?.error}`);
    failures++;
    continue;
  }
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const diff = new PNG({ width: pa.width, height: pa.height });
  const n = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0.1 });
  const pct = (n / (pa.width * pa.height)) * 100;
  worst = Math.max(worst, pct);
  const bad = pct > THRESHOLD;
  if (bad) {
    failures++;
    writeFileSync(join(OUT, `overlay-${name}.png`), PNG.sync.write(diff));
  }
  console.log(`  ${bad ? 'FAIL' : 'ok  '}  ${name.padEnd(22)} ${pct.toFixed(3)}%`);
}

console.log(`\n  states: ${Object.keys(STATES).length}   worst: ${worst.toFixed(3)}%   threshold: ${THRESHOLD}%`);
console.log(failures ? `  ${failures} state(s) over threshold — diffs in tests/output/\n` : '  all states within threshold\n');
process.exit(failures ? 1 : 0);
