#!/usr/bin/env node
/**
 * Drives the built app across every project and asserts the screen does not
 * contradict itself.
 *
 * This is the check the two scope defects needed. Both were invisible to the
 * existing gates: the module sweep only ever looked at the default scope, and
 * the data checks look at the fixtures rather than at what is rendered. So this
 * one reads the pixels' worth of text — the KPI row and the table TOTAL row,
 * the project band and the selector — and compares them to each other, the way
 * someone in the room would.
 *
 * Two things are verified per project:
 *
 *   1. the project band and the scope selector name the same development
 *   2. the Cost screen's KPI row and its category TOTAL row agree, figure for
 *      figure — the pairing that read 680M against 1,128M before
 *
 * Plus the portfolio/project interlock: choosing a portfolio must move the
 * selected project into it, rather than leaving the selector and the screen
 * describing different developments.
 *
 * And the performance indices, checked by value rather than by pixels. SPI and
 * CPI are defined as EV/PV and EV/AC; a wrong one changes two glyphs, which is
 * roughly 0.02% of the viewport and sails under any sensible pixel-diff
 * threshold. Correctness of a number is not a visual property.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const target = resolve(process.argv[2] ?? 'dist/index.html');
const base = pathToFileURL(target).href;

const dbFile = join(tmpdir(), `tazayud-scope-${process.pid}.mjs`);
execFileSync('npx', ['esbuild', 'src/data/index.ts', '--bundle', '--format=esm',
  '--alias:@=./src', '--log-level=error', `--outfile=${dbFile}`], { stdio: 'inherit' });
const { DB } = await import(`file://${dbFile}`);
rmSync(dbFile, { force: true });

const PROJECTS = [
  ['RES-01', 'Residential'], ['RES-02', 'Residential'],
  ['COM-01', 'Commercial'], ['COM-02', 'Commercial'],
  ['MXU-01', 'Mixed Use'], ['MXU-02', 'Mixed Use'],
  ['LND-01', 'Land Development'], ['LND-02', 'Land Development'],
];

const num = (s) => Number(String(s).replace(/[^0-9.-]/g, '')) || 0;

/** "1.25B" / "830M" -> a number, matching how KPI tiles are formatted. */
const magnitude = (s) => {
  const v = num(s);
  if (/B\b/.test(s)) return v * 1e9;
  if (/M\b/.test(s)) return v * 1e6;
  return v;
};

const browser = await chromium.launch();
const failures = [];
let checks = 0;

for (const [id, portfolio] of PROJECTS) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const q = `level=Project&portfolio=${encodeURIComponent(portfolio)}&project=${id}`;
  await page.goto(`${base}#/cost?${q}`);
  await page.waitForSelector('.proj-band', { timeout: 15_000 });
  await page.waitForTimeout(250);

  const seen = await page.evaluate(() => {
    const kpi = {};
    for (const el of document.querySelectorAll('.kpi')) {
      const label = el.querySelector('.kpi-l')?.textContent?.trim();
      const value = el.querySelector('.kpi-v')?.textContent?.trim();
      if (label) kpi[label] = value;
    }
    const totalRow = [...document.querySelectorAll('tr.tbl-total td')].map((td) => td.textContent.trim());
    return {
      bandId: document.querySelector('.pid')?.textContent?.trim(),
      selector: document.querySelector('.scope-field:nth-child(3) select')?.value,
      kpi,
      totalRow,
    };
  });

  const check = (name, ok, detail) => {
    checks++;
    if (!ok) failures.push(`${id}  ${name}${detail ? `: ${detail}` : ''}`);
  };

  check('band matches selection', seen.bandId === id, `band ${seen.bandId}`);
  check('selector matches selection', seen.selector === id, `selector ${seen.selector}`);

  // A COMPARISON OF NOTHING PASSES. num(undefined) is 0, so an empty KPI row
  // and a missing TOTAL row made every money check below 0 === 0 — the gate
  // went green while looking at nothing, which is how the Overview survived
  // the first scope fix. The rows must exist before they may agree.
  check('the KPI row rendered', Object.keys(seen.kpi).length >= 4,
    `${Object.keys(seen.kpi).length} tiles`);
  check('the category TOTAL row rendered', seen.totalRow.length >= 7,
    `${seen.totalRow.length} cells`);

  // total row columns: [_, TOTAL, budget, committed, actual, ev, afc, ...]
  const [, , tBudget, tCommitted, tActual, tEv, tAfc] = seen.totalRow;
  const pairs = [
    ['Committed Cost (SAR)', tCommitted],
    ['Actual Cost (AC) (SAR)', tActual],
    ['Earned Value (EV) (SAR)', tEv],
    ['AFC (SAR)', tAfc],
  ];

  // Budget is not in the KPI row; compare the table total to the band instead.
  const bandBudget = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.pm-item')];
    const el = items.find((i) => i.querySelector('.pm-l')?.textContent?.includes('Approved Budget'));
    return el?.querySelector('.pm-v')?.textContent?.trim();
  });
  check('budget: band vs table total', num(bandBudget) === num(tBudget),
    `band ${bandBudget} vs table ${tBudget}`);

  for (const [label, tableValue] of pairs) {
    const kpiValue = seen.kpi[label];
    check(`${label} tile exists`, kpiValue !== undefined && tableValue !== undefined,
      `KPI ${kpiValue} table ${tableValue}`);
    // KPI tiles round to 2sf ("1.08B"), so compare within that resolution.
    const a = magnitude(kpiValue ?? '');
    const b = num(tableValue);
    const tolerance = Math.max(a, b) * 0.01;
    check(`${label}: KPI vs table total`, a > 0 && b > 0 && Math.abs(a - b) <= tolerance,
      `KPI ${kpiValue} vs table ${tableValue}`);
  }

  await page.close();
}

// Performance indices, by value.
for (const [id, portfolio] of PROJECTS) {
  const project = DB.projects.find((x) => x.id === id);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${base}#/overview?level=Project&portfolio=${encodeURIComponent(portfolio)}&project=${id}`);
  await page.waitForSelector('.proj-band', { timeout: 15_000 });
  await page.waitForTimeout(200);

  const shown = await page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('.kpi')) {
      const label = el.querySelector('.kpi-l')?.textContent?.trim();
      if (label === 'SPI' || label === 'CPI') out[label] = el.querySelector('.kpi-v')?.textContent?.trim();
    }
    return out;
  });

  const expected = {
    SPI: (project.ev / project.pv).toFixed(2),
    CPI: (project.ev / project.actual).toFixed(2),
  };
  for (const key of ['SPI', 'CPI']) {
    checks++;
    if (shown[key] !== expected[key]) {
      failures.push(`${id}  ${key} shown ${shown[key]}, but EV/${key === 'SPI' ? 'PV' : 'AC'} is ${expected[key]}`);
    }
  }
  await page.close();
}

// The portfolio/project interlock.
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${base}#/cost?level=Project&portfolio=Residential&project=RES-01`);
  await page.waitForSelector('.proj-band', { timeout: 15_000 });
  await page.selectOption('.scope-field:nth-child(2) select', 'Commercial');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    selector: document.querySelector('.scope-field:nth-child(3) select')?.value,
    band: document.querySelector('.pid')?.textContent?.trim(),
  }));
  checks++;
  if (after.selector !== after.band) {
    failures.push(`portfolio switch: selector shows ${after.selector} but screen shows ${after.band}`);
  }
  checks++;
  if (!after.band?.startsWith('COM')) {
    failures.push(`portfolio switch: expected a Commercial project, screen shows ${after.band}`);
  }
  await page.close();
}

// ---------------------------------------------------------------------------
// THE BAND NAMES THE SCOPE, ON EVERY MODULE
//
// This is the defect the owner reported: the selector said Corporate and the
// band across the top of Cost, Variations and Packages described RES-02 — the
// development a drill-in would have opened — with its portfolio, its delivery
// partner and its budget. Every register module read one development at every
// level, so the tables underneath said the same thing.
//
// Checked on the module rather than in the data, because that is where it was
// wrong and where a reader sees it: the band's identity must be the scope's,
// and its Approved Budget must be the sum of the developments in scope.
// ---------------------------------------------------------------------------
{
  // EVERY ROUTE, DISCOVERED FROM THE ROUTER, not a list of screens the defect
  // was found on. The first pass of this check listed thirteen modules while
  // its own comment claimed every route, and the Project Overview drill-in —
  // routed but not in the sidebar — went on rendering RES-01 under a
  // Corporate selector. A gate written from a list of known defects only
  // ever catches the defects on the list; this one reads App.tsx so a new
  // route is audited the day it is added, and fails if discovery finds
  // nothing.
  const appSource = readFileSync('src/app/App.tsx', 'utf8');
  const ROUTES = [...appSource.matchAll(/<Route path="\/([a-z]+)"/g)].map((m) => m[1]);
  if (ROUTES.length < 20) {
    failures.push(`route discovery found only ${ROUTES.length} routes in App.tsx — the gate is blind`);
  }
  /** Routed screens that are ONE development by definition, and must ask. */
  const ASKS = ['overview', 'workspace', 'period'];
  const DEVELOPMENT_ID = /^(RES|COM|MXU|LND)-\d\d$/;
  const sar = (list) => list.reduce((a, x) => a + x.budget, 0);
  const live = DB.projects.filter((x) => !x.closedAt && !x.archived);

  const SCOPES = [
    ['Corporate', 'level=Corporate', 'Corporate', sar(live)],
    ['Portfolio Residential', 'level=Portfolio&portfolio=Residential', 'Residential',
      sar(live.filter((x) => x.portfolio === 'Residential'))],
  ];

  for (const [label, query, expectedId, expectedBudget] of SCOPES) {
    for (const route of ROUTES) {
      if (ASKS.includes(route)) continue;
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(`${base}#/${route}?${query}`);
      await page.waitForSelector('.content', { timeout: 15_000 });
      await page.waitForTimeout(200);
      const band = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.pm-item')];
        const budget = items.find((i) => i.querySelector('.pm-l')?.textContent?.includes('Approved Budget'));
        return {
          id: document.querySelector('.pid')?.textContent?.trim() ?? null,
          budget: budget?.querySelector('.pm-v')?.textContent?.trim(),
        };
      });
      // ONE RULE FOR EVERY SCREEN: whatever else a route shows at a roll-up,
      // a band identity naming a single development is the defect. Screens
      // with no band (Dashboard, Reports, Analytics, …) pass by having none.
      checks++;
      if (band.id !== null && DEVELOPMENT_ID.test(band.id)) {
        failures.push(`${route} at ${label}: the band names development "${band.id}" at a roll-up`);
      }
      // A screen that carries the band must name the scope and sum its budget.
      if (band.id !== null) {
        checks++;
        if (band.id !== expectedId) {
          failures.push(`${route} at ${label}: the band says "${band.id}", not "${expectedId}"`);
        }
        checks++;
        if (num(band.budget) !== expectedBudget) {
          failures.push(`${route} at ${label}: band budget ${band.budget} is not the `
            + `${expectedBudget.toLocaleString('en-US')} of the developments in scope`);
        }
      }
      await page.close();
    }
  }

  // A one-development screen at a roll-up shows no band at all: it asks which
  // development, in one click, because scope travels with every navigation and
  // helping itself to one would filter twenty other screens for the session.
  // Period Entry is the third of them — reached standalone it used to render
  // the drill-in development's own budget and packages under a Corporate
  // selector, with a submit button at the bottom.
  for (const [label, query] of SCOPES.map((x) => [x[0], x[1]])) {
    for (const route of ASKS) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(`${base}#/${route}?${query}`);
      await page.waitForTimeout(400);
      const seen = await page.evaluate(() => ({
        band: document.querySelector('.pid')?.textContent?.trim() ?? null,
        asks: document.body.textContent?.includes('Choose a development') ?? false,
      }));
      checks++;
      if (seen.band && DEVELOPMENT_ID.test(seen.band)) {
        failures.push(`${route} at ${label}: names development "${seen.band}" instead of asking`);
      }
      checks++;
      if (!seen.asks) {
        failures.push(`${route} at ${label}: does not offer to open a development`);
      }
      await page.close();
    }
  }

  // TWO SCREENS, ONE FIGURE: the Composite Forecast on Analytics and on the
  // Cost module's Forecast tab must be the same number at the same scope.
  // They were 44M apart at Corporate — one summed per-development forecasts,
  // the other forecast the summed position, and BAC ÷ CPI is not linear.
  {
    const read = async (path, extract) => {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(`${base}#/${path}`);
      await page.waitForSelector('.content', { timeout: 15_000 });
      await page.waitForTimeout(300);
      const v = await page.evaluate(extract);
      await page.close();
      return v;
    };
    // The Cost module's Forecast tab prints the composite as a card whose
    // label reads "Composite Forecast"; Analytics prints it in the methods
    // table on the "Weighted composite" row. Same figure, to the riyal.
    const onCost = await read('cost?level=Corporate&tab=forecast', () => {
      const labels = [...document.querySelectorAll('.card-b .muted')];
      const el = labels.find((x) => x.textContent?.trim() === 'Composite Forecast');
      return el?.nextElementSibling?.textContent?.trim() ?? null;
    });
    const onAnalytics = await read('analytics?level=Corporate', () => {
      const row = [...document.querySelectorAll('tr')]
        .find((r) => r.textContent?.includes('Weighted composite'));
      return row?.querySelectorAll('td')[2]?.textContent?.trim() ?? null;
    });
    checks++;
    if (!onAnalytics || !onCost) {
      failures.push(`Composite Forecast not found: Analytics ${onAnalytics}, Cost ${onCost} — the check is blind`);
    } else {
      // Cost prints "7.60B"-style magnitudes, Analytics full riyals: compare
      // at the coarser resolution.
      checks++;
      const coarse = magnitude(onCost);
      const fine = num(onAnalytics);
      if (Math.abs(coarse - fine) > Math.max(coarse, fine) * 0.005) {
        failures.push(`Composite Forecast differs at Corporate: Analytics ${onAnalytics}, Cost ${onCost}`);
      }
    }
  }
}

await browser.close();

console.log(`\nscope integrity  ${PROJECTS.length} projects, ${checks} on-screen checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} contradiction(s) visible on screen.\n`);
  process.exit(1);
}
console.log('  every screen agrees with itself and with the scope selector.\n');
