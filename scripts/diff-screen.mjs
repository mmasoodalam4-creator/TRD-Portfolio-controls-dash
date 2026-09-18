#!/usr/bin/env node
/**
 * Pixel-diff a single screen against the frozen baseline.
 *
 *   node scripts/diff-screen.mjs "Cost & Financials"
 *
 * The full visual-diff run covers all 17 modules; this one exists for
 * porting a screen at a time, so a regression is caught against the screen
 * that caused it rather than at the end of a long batch.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { gotoApp, navigate, stillFrame } from './lib/drive.mjs';

const screen = process.argv[2];
if (!screen) { console.error('usage: diff-screen.mjs "<nav label>"'); process.exit(1); }

async function shot(file) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await gotoApp(page, pathToFileURL(resolve(file)).href);
  await stillFrame(page);
  await navigate(page, screen);
  await page.waitForTimeout(300);
  const png = await page.screenshot();
  await browser.close();
  return png;
}

const a = PNG.sync.read(await shot(process.argv[4] ?? 'tests/baseline/current.html'));
const b = PNG.sync.read(await shot(process.argv[3] ?? 'dist/index.html'));
const diff = new PNG({ width: a.width, height: a.height });
const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
const pct = (n / (a.width * a.height)) * 100;

mkdirSync('tests/output', { recursive: true });
writeFileSync(join('tests/output', `screen-${screen.replace(/\W+/g, '-').toLowerCase()}.png`), PNG.sync.write(diff));
console.log(`${screen}: ${pct.toFixed(3)}% differing  (${n} px)`);
process.exit(pct > 0.1 ? 1 : 0);
