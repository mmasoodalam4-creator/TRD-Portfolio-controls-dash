#!/usr/bin/env node
/**
 * Layout quality across every module AND EVERY TAB, at the widths this is
 * actually shown at.
 *
 * A controls system is read in meetings on whatever screen is in the room, and
 * a table that pushes the page sideways, a label sliding under its own bar or a
 * legend printed across a chart reads as unfinished however correct the numbers
 * are. The pixel diff cannot catch any of this: it compares a build against
 * itself, so a defect present in both is invisible to it.
 *
 * THE TABS ARE WHY THIS WAS EXTENDED. This gate used to check the default view
 * of each module and stop. Six of the cost module's seven views, the four
 * portfolio filters and the glossary's tabs were never looked at by anything —
 * and that is exactly where the owner found a donut drawn through its own
 * legend and a bar chart clipping every label longer than eight characters.
 * Now every tab of every module is driven, at three widths.
 *
 * Asserted for each module, each tab, each width:
 *   - the page does not scroll horizontally (wide tables scroll inside their
 *     own wrapper, which is what .tbl-wrap is for)
 *   - no element extends past the right edge of the viewport
 *   - no text spills out of the box it was given — a label wider than its
 *     own column, whatever the overflow rule paints
 *   - no two siblings are drawn on top of each other
 *   - every chart drawing more than one series names them — a key on the page,
 *     not names that exist only in the source
 *   - every heading and KPI tile is present and non-empty
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { gotoApp, navigate } from './lib/drive.mjs';

const target = resolve(process.argv[2] ?? 'dist/index.html');

/** Laptop, the common meeting-room projector, and a large desk monitor. */
const WIDTHS = [
  { name: 'laptop', width: 1366, height: 900 },
  { name: 'projector', width: 1600, height: 1000 },
  { name: 'desktop', width: 1920, height: 1080 },
];

const failures = [];
let checks = 0;

/**
 * The audit, run inside the page.
 *
 * Every rule here is written to describe a defect a person would point at, and
 * to stay quiet about the things that look like one and are not: a table
 * scrolling inside its wrapper, a drawer positioned over the page, a figure
 * deliberately cut with an ellipsis.
 */
const AUDIT = () => {
  const vw = document.documentElement.clientWidth;
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
  const named = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string'
    ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;

  // Inside an <svg> there are no boxes — a donut's segments are one circle
  // drawn many times, and its <text> has no clientWidth. The <svg> element
  // itself is a box in the page and stays in; everything under it is measured
  // by the chart's own geometry, not by CSS, so it is not this gate's business.
  //
  // `closest('svg')`, not `ownerSVGElement`: that property is UNDEFINED on an
  // HTML element, so `!== null` was true for every div on the page and this
  // filter quietly excluded the entire application. The gate went green
  // because it was looking at nothing — the worst way for a check to pass.
  const inChart = (el) => el.tagName.toLowerCase() !== 'svg' && el.closest('svg') !== null;

  const nodes = [...document.querySelectorAll('.content *')].filter((el) => !inChart(el));
  const overflowing = [];
  const spilling = [];
  const overlapping = [];

  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;

    // --- past the right edge of the window -------------------------------
    //
    // An element inside a scroll container is allowed to be wider than the
    // viewport — that is the container doing its job. The .content pane
    // scrolls too, so it is excluded BEFORE its overflow is read: reading it
    // first made every element "inside a scroll container" and the assertion
    // vacuous, while five registers were overflowing at 1366px.
    let scrollable = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (a.classList.contains('content')) break;
      const ov = getComputedStyle(a).overflowX;
      if (ov === 'auto' || ov === 'scroll') { scrollable = true; break; }
    }
    if (!scrollable && r.right > vw + 1) {
      overflowing.push(`${named(el)} right=${Math.round(r.right)}`);
    }

    // --- text wider than the box it was given ----------------------------
    //
    // THE TEXT IS MEASURED, NOT THE ELEMENT. `scrollWidth` was the obvious
    // reading and it is the wrong one: with overflow left at its default
    // `visible` there is no scrollable area, so Chrome reports scrollWidth
    // equal to clientWidth and the check passes while the words are painted
    // straight across the next column. That is exactly the defect this is for
    // — a 52px label box holding "Architectural" — so it would have been a
    // gate that agreed with the bug.
    //
    // A Range over the element's own text lays the text out and returns where
    // it actually reaches. An ellipsis is a decision somebody made and is left
    // alone; a scroll container is doing its job.
    const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const ellipsis = cs.textOverflow === 'ellipsis';
    const text = (el.textContent ?? '').trim();
    if (text && !scrolls && !ellipsis && el.children.length === 0 && r.width > 0) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      const pad = parseFloat(cs.paddingRight) || 0;
      if (t.width > r.width - pad + 1) {
        spilling.push(`${named(el)} "${text.slice(0, 24)}" needs ${Math.ceil(t.width)}px in ${Math.round(r.width)}px`);
      }
    }
  }

  // --- two siblings drawn on top of each other ---------------------------
  //
  // Rect against rect, between children of the same parent only, so a legend
  // pulled back across its own chart is caught and a badge inside a row is
  // not. Positioned elements are excluded: a drawer, a tooltip and a modal
  // are MEANT to cover the page.
  for (const parent of [document.querySelector('.content'), ...nodes]) {
    if (!parent) continue;
    const kids = [...parent.children].filter((el) => {
      if (inChart(el)) return false;
      const cs = getComputedStyle(el);
      if (cs.position !== 'static' && cs.position !== 'relative') return false;
      if (cs.visibility === 'hidden' || cs.opacity === '0') return false;
      if (cs.pointerEvents === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width >= 10 && r.height >= 10;
    });
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w <= 1 || h <= 1) continue;
        const share = (w * h) / Math.min(area(a), area(b));
        if (share > 0.25) {
          overlapping.push(`${named(kids[i])} over ${named(kids[j])} (${Math.round(share * 100)}%)`);
        }
      }
    }
  }

  // --- a chart drawing more than one series with no key ------------------
  //
  // The owner opened Quality and found a red line and a blue line with
  // nothing on the page saying which was which — and the same on the incident
  // trend, the workforce trend, the cost trend and the cost s-curve. Five of
  // them. `LineSeries` had carried a `name` since the first chart was written
  // and no chart ever rendered it, so the names existed only in the source.
  //
  // THE NUMBER OF SERIES IS COUNTED FROM THE PAINT, not from a prop, because
  // a prop is what the developer believed and the paint is what the reader
  // sees. A line series is a stroked <path>, a bar is a <rect> filled from
  // its own gradient, a donut slice is a stroked <circle>; the count is how
  // many DISTINCT ones there are, which is how many things a reader has to
  // tell apart. The ring's grey track, the white marker rings and the sheen
  // overlay are chrome rather than data and are excluded by name — without
  // that, a one-slice donut reads as three series and demands a key it has no
  // use for.
  //
  // The key is looked for in the chart's own wrapper first and then anywhere
  // in the card. The fallback is deliberate and it is the limit of this
  // detector: two charts in one card, one of them keyed, would pass. No card
  // holds two today, and the primitives draw the key themselves — this is
  // here for the day somebody adds a sixth chart type that does not.
  const CHROME = new Set(['#eef1f6', '#fff', '#ffffff', 'none']);
  const paintOf = (el, attr) => {
    const v = el.getAttribute(attr);
    if (!v || CHROME.has(v.toLowerCase()) || v.startsWith('url(')) return null;
    return `${attr}:${v}`;
  };
  const keyless = [];
  for (const card of document.querySelectorAll('.content .card')) {
    for (const svg of card.querySelectorAll('svg')) {
      const r = svg.getBoundingClientRect();
      // Icons and the legend's own 16x10 swatches are svgs too.
      if (r.width < 120 || r.height < 60) continue;
      const paints = new Set();
      for (const el of svg.querySelectorAll('path[stroke], circle[stroke]')) {
        const p = paintOf(el, 'stroke');
        if (p) paints.add(p);
      }
      for (const el of svg.querySelectorAll('rect[fill^="url("]')) {
        paints.add(`fill:${el.getAttribute('fill')}`);
      }
      if (paints.size < 2) continue;
      const wrap = svg.parentElement;
      const key = wrap?.querySelector('.chart-legend, .donut-legend')
        ?? card.querySelector('.chart-legend, .donut-legend');
      if (!key || !key.textContent.trim()) {
        const title = card.querySelector('h3')?.textContent?.trim() ?? named(card);
        keyless.push(`"${title}" draws ${paints.size} series and names none`);
      }
    }
  }

  const emptyHeadings = [...document.querySelectorAll('.content h3, .page-title h1')]
    .filter((h) => !h.textContent.trim()).length;
  const emptyKpis = [...document.querySelectorAll('.kpi')]
    .filter((k) => !k.querySelector('.kpi-v')?.textContent?.trim()).length;

  return {
    pageScrollsSideways: document.documentElement.scrollWidth > vw + 1,
    overflowing: overflowing.slice(0, 3),
    overflowCount: overflowing.length,
    spilling: spilling.slice(0, 3),
    spillCount: spilling.length,
    overlapping: [...new Set(overlapping)].slice(0, 3),
    overlapCount: new Set(overlapping).size,
    keyless: [...new Set(keyless)].slice(0, 3),
    keylessCount: new Set(keyless).size,
    emptyHeadings,
    emptyKpis,
  };
};

/** The tabs on the screen as it stands, by their visible text. */
const tabsOn = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.content .tabs button')].map((b) => b.textContent.trim()));

const clickTab = (page, text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('.content .tabs button')]
    .find((x) => x.textContent.trim() === t);
  if (!b) throw new Error(`no tab: ${t}`);
  b.click();
}, text);

// ---- the Project Workspace ------------------------------------------------
//
// The workspace is one screen that hosts fifteen modules, each with its own
// tabs. Driving only its default view would look at one of a hundred and
// something, which is exactly the hole this gate was extended to close for the
// cost module. So its own tab row is enumerated too, and every hosted module's
// tabs underneath it.
//
// It opens on a chooser, because a workspace is one development and it does
// not help itself to one — see Workspace.tsx. Clicking through is what any
// person does on arrival, and the gate does the same.
const openWorkspace = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('.content button')]
    .find((x) => /^Open [A-Z]{3}-\d{2}/.test(x.textContent.trim()));
  b?.click();
});

const wsTabsOn = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.ws-tab')].map((b) => b.textContent.trim()));

const clickWsTab = (page, text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('.ws-tab')].find((x) => x.textContent.trim() === t);
  if (!b) throw new Error(`no workspace tab: ${t}`);
  b.click();
}, text);

const browser = await chromium.launch();
let views = 0;

for (const vp of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await gotoApp(page, pathToFileURL(target).href);

  // Read the sidebar rather than a hard-coded list, so a module added to NAV
  // is audited the day it appears instead of the day somebody remembers to
  // add it here.
  const modules = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-item')].map((n) => n.textContent.trim()).filter(Boolean));

  for (const label of modules) {
    await navigate(page, label);
    await page.waitForTimeout(180);

    // A no-op on every module but the workspace.
    await openWorkspace(page);
    await page.waitForTimeout(200);

    const outer = await wsTabsOn(page);
    for (const wt of outer.length ? outer : [null]) {
      if (wt) {
        await clickWsTab(page, wt);
        await page.waitForTimeout(200);
      }
      const tabs = await tabsOn(page);
      // A module with no tabs is one view; a module with tabs is audited on
      // every one of them.
      for (const tab of tabs.length ? tabs : [null]) {
        if (tab) {
          await clickTab(page, tab);
          await page.waitForTimeout(200);
        }
        const where = `${vp.name} · ${label}${wt ? ` › ${wt}` : ''}${tab ? ` › ${tab}` : ''}`;
        const report = await page.evaluate(AUDIT);
        views++;
        checks += 7;

        if (report.pageScrollsSideways) failures.push(`${where}: page scrolls horizontally`);
        if (report.overflowCount) {
          failures.push(`${where}: ${report.overflowCount} element(s) past the viewport — ${report.overflowing.join(', ')}`);
        }
        if (report.spillCount) {
          failures.push(`${where}: ${report.spillCount} text spill(s) — ${report.spilling.join('; ')}`);
        }
        if (report.overlapCount) {
          failures.push(`${where}: ${report.overlapCount} overlap(s) — ${report.overlapping.join('; ')}`);
        }
        if (report.keylessCount) {
          failures.push(`${where}: ${report.keylessCount} chart(s) with no key — ${report.keyless.join('; ')}`);
        }
        if (report.emptyHeadings) failures.push(`${where}: ${report.emptyHeadings} empty heading(s)`);
        if (report.emptyKpis) failures.push(`${where}: ${report.emptyKpis} KPI tile(s) with no value`);
      }
    }
  }
  await page.close();
}

await browser.close();

console.log(`\nlayout  ${views} views (every module, every tab) x ${WIDTHS.length} widths, ${checks} checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} layout problem(s).\n`);
  process.exit(1);
}
console.log(`  every view fits at ${WIDTHS.map((w) => w.width).join(', ')}px — nothing clipped, nothing
  overlapping, and every multi-series chart names its series.\n`);
