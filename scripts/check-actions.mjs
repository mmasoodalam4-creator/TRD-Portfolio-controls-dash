#!/usr/bin/env node
/**
 * Drives the real actions end to end in the built app and asserts the system
 * stays internally consistent afterwards.
 *
 * This is the check that matters most for the persistence work. An action that
 * raises a project's Actual Cost without moving the cost register would leave
 * the two disagreeing, and the integrity engine would report it on the next
 * open — the engine working correctly, and a defect in the mutation. So every
 * action here is followed by re-reading the engine.
 *
 * Covered: creating an IPC from the extraction flow, approving a variation,
 * registering a new development, persistence across a reload, and the reset
 * that returns a presenter to the shipped data.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { openIntegrity } from './lib/drive.mjs';

const target = resolve(process.argv[2] ?? 'dist/index.html');
const base = pathToFileURL(target).href;

const failures = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

// An exact label first, then a label that contains the text — the sidebar's
// "Review & Approve" is a button too, and an includes-match on "Approve"
// navigated away from the variation drawer instead of approving.
const clickButton = (text) => page.evaluate((t) => {
  const all = [...document.querySelectorAll('button')];
  const b = all.find((x) => x.textContent.trim() === t) ?? all.find((x) => x.textContent.trim().includes(t));
  if (!b) throw new Error(`no button: ${t}`);
  b.click();
}, text);

/** The engine's headline, read fresh. */
async function integrityHeadline() {
  await openIntegrity(page);
  const text = await page.evaluate(() => document.querySelector('.big-status').innerText.split('\n')[0].trim());
  await clickButton('Close');
  await page.waitForTimeout(200);
  return text;
}

const projectFigures = async (id, portfolio) => {
  await page.goto(`${base}#/cost?level=Project&portfolio=${encodeURIComponent(portfolio)}&project=${id}`);
  await page.waitForSelector('.proj-band', { timeout: 15_000 });
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const kpi = {};
    for (const el of document.querySelectorAll('.kpi')) {
      const l = el.querySelector('.kpi-l')?.textContent?.trim();
      if (l) kpi[l] = el.querySelector('.kpi-v')?.textContent?.trim();
    }
    return kpi;
  });
};

// ---- baseline ----
await page.goto(base);
await page.waitForSelector('.topbar-right', { timeout: 15_000 });
check('starts on shipped data', (await integrityHeadline()).startsWith('20 / 20'));

const before = await projectFigures('RES-01', 'Residential');

// ---- create an IPC ----
await clickButton('AI Extract');
await page.waitForSelector('.modal-b div[style*="dashed"]', { timeout: 5000 });
await page.click('.modal-b div[style*="dashed"]');
await page.waitForFunction(() => document.querySelectorAll('.modal-b input').length > 0, null, { timeout: 15_000 });
await clickButton('Create IPC Entry');
await page.waitForFunction(
  () => document.querySelector('.modal-b')?.innerText.includes('IPC Entry Created'),
  null, { timeout: 8000 },
);
await page.waitForTimeout(2600);

const after = await projectFigures('RES-01', 'Residential');
// A certificate moves what has been certified and paid. It is not a measure
// of work done, so actual cost and earned value stay where the last period
// put them — control 15 (certified within actual cost) is what bounds it.
check('IPC left Actual Cost alone', before['Actual Cost (AC) (SAR)'] === after['Actual Cost (AC) (SAR)'],
  `${before['Actual Cost (AC) (SAR)']} -> ${after['Actual Cost (AC) (SAR)']}`);
check('IPC raised Payments Made', before['Payments Made (SAR)'] !== after['Payments Made (SAR)'],
  `${before['Payments Made (SAR)']} -> ${after['Payments Made (SAR)']}`);
check('integrity holds after the IPC', (await integrityHeadline()).startsWith('20 / 20'));

// ---- approve a variation ----
await page.goto(`${base}#/variations?level=Project&portfolio=Residential&project=RES-01`);
await page.waitForSelector('tbody tr', { timeout: 15_000 });
const approvedBefore = await page.evaluate(() =>
  [...document.querySelectorAll('tbody tr')].filter((r) => r.textContent.includes('Approved')).length);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Under Review'));
  row.click();
});
await page.waitForSelector('.drawer', { timeout: 5000 });
await clickButton('Approve');
await page.waitForTimeout(700);
const approvedAfter = await page.evaluate(() =>
  [...document.querySelectorAll('tbody tr')].filter((r) => r.textContent.includes('Approved')).length);
check('variation approval persisted', approvedAfter === approvedBefore + 1,
  `${approvedBefore} -> ${approvedAfter} approved rows`);
check('integrity holds after the approval', (await integrityHeadline()).startsWith('20 / 20'));

// ---- register a development ----
await clickButton('Add Project');
// By id rather than by position. The dialog now also carries a hidden file
// input for the workbook import, and "the first input in the modal" silently
// became that one — the kind of positional selector that fails as soon as the
// screen gains a control, which is exactly what happened.
await page.waitForSelector('#ap-id', { timeout: 5000 });
await page.evaluate(() => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('ap-id', 'RES-03');
  set('ap-name', 'Verification Gardens');
  set('ap-budget', '750000000');
});
await clickButton('Create Project');
await page.waitForTimeout(800);

await page.goto(`${base}#/projects`);
await page.waitForSelector('tbody tr', { timeout: 15_000 });
const listed = await page.evaluate(() =>
  [...document.querySelectorAll('tbody tr')].some((r) => r.textContent.includes('RES-03')));
check('new development appears in the register', listed);
check('integrity holds after the new development', (await integrityHeadline()).startsWith('20 / 20'));

// ---- persistence across a reload ----
await page.reload();
await page.waitForSelector('tbody tr', { timeout: 15_000 });
const survived = await page.evaluate(() =>
  [...document.querySelectorAll('tbody tr')].some((r) => r.textContent.includes('RES-03')));
check('changes survive a reload', survived);

// ---- reset ----
await page.goto(`${base}#/admin`);
await page.waitForSelector('.tabs', { timeout: 15_000 });
await page.evaluate(() => [...document.querySelectorAll('.tab')]
  .find((b) => b.textContent.trim() === 'System Settings').click());
await page.waitForTimeout(300);
await clickButton('Reset to shipped data');
await page.waitForTimeout(600);

await page.goto(`${base}#/projects`);
await page.waitForSelector('tbody tr', { timeout: 15_000 });
const cleared = await page.evaluate(() =>
  [...document.querySelectorAll('tbody tr')].some((r) => r.textContent.includes('RES-03')));
check('reset returns to the shipped data', !cleared);
check('integrity holds after reset', (await integrityHeadline()).startsWith('20 / 20'));

check('no console errors throughout', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();

console.log(`\nreal actions  ${checks} checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  every action changes the data, persists, and leaves the system reconciling.\n');
