#!/usr/bin/env node
/**
 * Headless verification of the built demo. Reports what it actually observed —
 * every number below is measured, never assumed.
 *
 *   node scripts/verify.mjs [path-to-html]     (default: dist/index.html)
 *
 * Gate: 23 nav modules, all screens render, both hero flows complete,
 * zero console errors, zero failed network requests.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { gotoApp, navigate, clickButton, openIntegrity, NAV_LABELS } from './lib/drive.mjs';

const target = resolve(process.argv[2] ?? 'dist/index.html');
const url = pathToFileURL(target).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const consoleErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.url().slice(0, 80)} :: ${r.failure()?.errorText}`));

const results = [];
const check = (label, actual, pass) => { results.push({ label, actual, pass }); return pass; };

await gotoApp(page, url);

const navCount = await page.$$eval('.nav-item', (e) => e.length);
// 23. Messages is routed but deliberately NOT in the sidebar — it is
// reached from the top bar, where its unread badge lives. Authorisations IS
// in it: a queue only one half of a two-person control can find is a queue
// the other half has to be told about by email. The count is asserted rather
// than derived so that a module disappearing is a failure, not a silently
// smaller sidebar.
check('nav modules', navCount, navCount === 23);

const navNames = await page.$$eval('.nav-item', (els) => els.map((e) => e.textContent.trim()));
check('nav labels', navNames.join(', '), NAV_LABELS.every((l) => navNames.includes(l)));

const title = await page.$eval('.page-title h1', (e) => e.innerText);
check('landing title', title, title === 'Executive Dashboard');

// every module renders content
let rendered = 0;
for (const label of navNames) {
  await navigate(page, label);
  const hasContent = await page.$eval('.content', (e) => e.innerText.trim().length > 40).catch(() => false);
  if (hasContent) rendered++;
}
check('screens rendering', `${rendered}/${navNames.length}`, rendered === navNames.length);

// hero 1 — AI document extraction: upload -> processing -> review -> create -> done
await navigate(page, 'Dashboard');
await clickButton(page, 'AI Extract');
await page.waitForSelector('.modal-b div[style*="dashed"]', { timeout: 5000 });
await page.click('.modal-b div[style*="dashed"]');
await page.waitForFunction(
  () => document.querySelectorAll('.modal-b input').length > 0,
  null, { timeout: 15_000 },
);
const extracted = await page.$$eval('.modal-b input', (i) => i.length);
await clickButton(page, 'Create IPC Entry');
await page.waitForTimeout(400);
const createdText = await page.$eval('.modal-b', (e) => e.innerText);
check('AI Extract flow', `${extracted} fields -> ${createdText.split('\n')[1] ?? ''}`,
  extracted === 9 && createdText.includes('IPC Entry Created'));
await page.waitForTimeout(1900);

// hero 2 — data integrity engine
await openIntegrity(page);
const integrity = await page.$eval('.big-status', (e) => e.innerText.split('\n')[0].trim());
const controlRows = await page.$$eval('.recon-row', (r) => r.length);
check('Integrity engine', `${integrity} (${controlRows} rows)`,
  integrity.startsWith('20 / 20') && controlRows === 20);

// The tab icon, and specifically that it is INLINE.
//
// vite-plugin-singlefile does not inline a <link rel="icon">, so one written
// into index.html would be emitted as a sibling .svg and referenced by path —
// which 404s the moment somebody double-clicks the file, silently. It is set
// from the bundle instead, and this is what stops that regressing: a `data:`
// href is the whole point, and `failedRequests` below catches the other half.
const favicon = await page.$eval('link[rel="icon"]', (l) => l.getAttribute('href') ?? '')
  .catch(() => '');
check('tab icon', favicon ? `${favicon.slice(0, 24)}… (${favicon.length} chars)` : 'MISSING',
  favicon.startsWith('data:image/svg+xml'));

check('console errors', consoleErrors.length ? consoleErrors.join(' | ') : 'none', consoleErrors.length === 0);
check('failed requests', failedRequests.length ? failedRequests.join(' | ') : 'none', failedRequests.length === 0);

await browser.close();

console.log(`\nverify: ${target}\n`);
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label.padEnd(18)} ${r.actual}`);
}
const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} check(s) failed.\n` : '\nAll checks passed.\n');
process.exit(failed.length ? 1 : 0);
