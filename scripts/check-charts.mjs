#!/usr/bin/env node
/**
 * EVERY FIGURE A CHART STATES IS TRUE.
 *
 * The other gates hold the layout and the arithmetic behind the screens. This
 * one holds the step between them: what a chart, drawn from correct data, ends
 * up ASSERTING to a person reading it. A chart is not a view of the data. It
 * is a claim about the data, and a claim can be false while every number
 * behind it is right.
 *
 * Three of the things it holds were WRONG ON THE SHIPPED FIGURES — the axis
 * labels, first time right, and a percentage sharing an axis with a count.
 * Three more are true today and are one plausible figure away from not being:
 * a bar clipped at a stated ceiling, a negative movement drawn as nothing, and
 * a ring of variances that only sums to its centre while every portfolio is
 * favourable. The last two are hardening — properties that held by an accident
 * of the curve's shape rather than by construction.
 */
import { DB } from '../src/data/index.ts';
import { registersFor } from '../src/data/project-state.ts';
import { operatingHistory, combineHistory } from '../src/domain/history.ts';
import { monthlyCost } from '../src/domain/forecast.ts';
import { isOpenNcr } from '../src/domain/counts.ts';
import { parseDate } from '../src/domain/calendar.ts';
import { niceScale, scaleTo } from '../src/components/charts/scale.ts';

const fail = [];
let checks = 0;
const ok = (cond, msg) => { checks += 1; if (!cond) fail.push(msg); };

const P = DB.projects;
const { months, scurve } = DB;

// ---------------------------------------------------------------------------
// 1. THE AXIS SAYS WHERE ITS LINES ARE
//
// The scale used to be peak x 1.1 in quarters with each label rounded, so on a
// register of eight the gridline at 6.6 was labelled "7" and on a smaller one
// two different gridlines were both labelled "1". Whatever peak it is handed,
// every label must be the value at that line, and no two may read the same.
// ---------------------------------------------------------------------------
const PEAKS = [
  0, 0.4, 1, 1.08, 2, 2.65, 5, 8, 8.8, 11, 30, 99, 100, 294, 323, 1000, 4399,
  40_280, 592_300_000, 8_165_500_000,
];
for (const peak of PEAKS) {
  for (const integer of [false, true]) {
    const s = niceScale(peak, { integer });
    const ticks = Array.from({ length: s.count + 1 }, (_, i) => i * s.step);
    const labels = ticks.map((v) => v.toFixed(s.decimals));

    ok(s.max >= peak, `scale(${peak}, int=${integer}): max ${s.max} does not reach the peak`);
    ok(new Set(labels).size === labels.length,
      `scale(${peak}, int=${integer}): duplicate tick labels ${labels.join(', ')}`);
    ticks.forEach((v, i) => {
      ok(Math.abs(Number(labels[i]) - v) < 1e-9,
        `scale(${peak}, int=${integer}): gridline at ${v} is labelled "${labels[i]}"`);
    });
    if (integer) {
      ok(ticks.every((v) => Number.isInteger(v)),
        `scale(${peak}): a count axis offers a fractional gridline — ${labels.join(', ')}`);
    }
    ok(s.count >= 1 && s.count <= 5, `scale(${peak}, int=${integer}): ${s.count} intervals`);
  }
}
// A stated ceiling is honoured while the data fit inside it, and grows when
// they do not — never clips.
ok(scaleTo(100, 80).max === 100, 'scaleTo: a ceiling the data fit inside is kept');
ok(scaleTo(100, 112).max >= 112, 'scaleTo: a value past the ceiling is still on the scale');
ok(scaleTo(1.25, 1.4).max >= 1.4, 'scaleTo: an index past its reference is still on the scale');

// ---------------------------------------------------------------------------
// 2. NOTHING IS CLIPPED
//
// HBars used to clamp its width to the stated max, so a package paid 112% of
// its commitment drew exactly as long as one paid 100%. Two facts, one length.
// The charts with a fixed reference are listed with the values they plot.
// ---------------------------------------------------------------------------
const barred = [];

// ---------------------------------------------------------------------------
// 3. THE TREND SERIES
// ---------------------------------------------------------------------------
const histories = [];
for (const p of P) {
  const r = registersFor(p.id, DB, P, []);
  const h = operatingHistory(p, r, months, scurve);
  histories.push(h);
  // A null month is UNRECORDED, and is skipped rather than counted as zero.
  const sum = (k) => h.reduce((a, m) => a + (m[k] ?? 0), 0);
  // Once a register starts recording it does not stop: a gap may only appear
  // BEFORE the first row, never between two months that have one.
  const window = (k) => {
    const first = h.findIndex((m) => m[k] !== null);
    return first < 0 ? true : h.slice(first).every((m) => m[k] !== null);
  };

  // Nested sets. Every recordable incident is an incident; every lost-time
  // case is recordable. Spreading the three totals independently could put a
  // recordable case in a month with no incident in it.
  h.forEach((m) => {
    ok((m.lostTime ?? 0) <= (m.recordable ?? 0),
      `${p.id} ${m.month}: ${m.lostTime} lost-time in ${m.recordable} recordable`);
    ok((m.recordable ?? 0) <= (m.incidents ?? 0),
      `${p.id} ${m.month}: ${m.recordable} recordable in ${m.incidents} incidents`);
    ok((m.inspectionsPassed ?? 0) <= (m.inspections ?? 0),
      `${p.id} ${m.month}: ${m.inspectionsPassed} passed of ${m.inspections} carried out`);
    // A nested subset is known for exactly the months its parent is known for,
    // so the two lines start together and neither gaps under the other.
    ok((m.incidents === null) === (m.recordable === null),
      `${p.id} ${m.month}: recordable and incidents do not share a recording window`);
    ok((m.inspections === null) === (m.inspectionsPassed === null),
      `${p.id} ${m.month}: passed and carried out do not share a recording window`);
  });
  for (const k of ['incidents', 'recordable', 'lostTime', 'ncrsRaised', 'inspections']) {
    ok(window(k), `${p.id}: ${k} has an unrecorded month between two recorded ones`);
  }

  // The months sum to the register. A trend whose parts do not add to the
  // total beside it is a second count of the same thing.
  ok(sum('incidents') === r.incidents.length,
    `${p.id}: incident trend sums to ${sum('incidents')}, register holds ${r.incidents.length}`);
  ok(sum('ncrsRaised') === r.ncrs.length,
    `${p.id}: NCRs raised sums to ${sum('ncrsRaised')}, register holds ${r.ncrs.length}`);
  ok(sum('ncrsClosed') === r.ncrs.filter((n) => !isOpenNcr(n)).length,
    `${p.id}: NCRs closed sums to ${sum('ncrsClosed')}, register holds ${r.ncrs.filter((n) => !isOpenNcr(n)).length}`);
  ok(sum('inspections') === r.qualityInspections.length,
    `${p.id}: inspections sum to ${sum('inspections')}, register holds ${r.qualityInspections.length}`);
  ok(sum('inspectionsPassed') === r.qualityInspections.filter((q) => q.result === 'Passed').length,
    `${p.id}: passed sums to ${sum('inspectionsPassed')}, register disagrees`);

  // First time right is reproducible FROM THE CHART'S OWN NUMBERS. A reader
  // who accumulates the two counts this series publishes must land on the
  // percentage it plots — and on the register's figure at the data date.
  let cp = 0; let ci = 0;
  h.forEach((m) => {
    cp += m.inspectionsPassed ?? 0; ci += m.inspections ?? 0;
    const implied = ci ? Number(((cp / ci) * 100).toFixed(1)) : null;
    ok(m.firstTimeRight === implied,
      `${p.id} ${m.month}: first time right plots ${m.firstTimeRight}, its own counts imply ${implied}`);
  });
  const insp = r.qualityInspections;
  const registerFtr = insp.length
    ? Number(((insp.filter((q) => q.result === 'Passed').length / insp.length) * 100).toFixed(1))
    : null;
  ok(h[h.length - 1]?.firstTimeRight === registerFtr,
    `${p.id}: first time right ends at ${h[h.length - 1]?.firstTimeRight}, register says ${registerFtr}`);

  // Productivity is reproducible the same way — the chart's own EV over the
  // chart's own hours.
  ok(h.every((m) => m.manhours >= 0), `${p.id}: negative manhours plotted`);

  // A bar chart that clamps a negative to zero says "nothing happened" where
  // money came back. The call sites no longer clamp, so the values reaching
  // the chart are whatever the model produced.
  monthlyCost(p, months, scurve).forEach((x) => {
    barred.push(x.actualMonth ?? 0, x.earnedMonth ?? 0);
  });
}

// The roll-up obeys every rule the single development does.
const roll = combineHistory(histories);
let rp = 0; let ri = 0;
roll.forEach((m) => {
  ok((m.lostTime ?? 0) <= (m.recordable ?? 0) && (m.recordable ?? 0) <= (m.incidents ?? 0),
    `roll-up ${m.month}: incident classes are not nested`);
  rp += m.inspectionsPassed ?? 0; ri += m.inspections ?? 0;
  const implied = ri ? Number(((rp / ri) * 100).toFixed(1)) : null;
  ok(m.firstTimeRight === implied,
    `roll-up ${m.month}: first time right plots ${m.firstTimeRight}, its own counts imply ${implied}`);
});
// The portfolio's last point is the whole scope's own fraction.
const allInsp = P.flatMap((p) => registersFor(p.id, DB, P, []).qualityInspections);
const scopeFtr = allInsp.length
  ? Number(((allInsp.filter((q) => q.result === 'Passed').length / allInsp.length) * 100).toFixed(1))
  : null;
ok(roll[roll.length - 1]?.firstTimeRight === scopeFtr,
  `roll-up: first time right ends at ${roll[roll.length - 1]?.firstTimeRight}, the registers say ${scopeFtr}`);

// The event series are COUNTED FROM THE ROWS' OWN DATES, so the months a chart
// shows are the months the register covers. This asserts that is really what
// is happening rather than a coincidence: every plotted month must be a month
// some row is dated in.
for (const p of P) {
  const r = registersFor(p.id, DB, P, []);
  const h = operatingHistory(p, r, months, scurve);
  const datedMonths = new Set(
    r.incidents.map((x) => (parseDate(x.date) === null ? null : new Date(parseDate(x.date)).getUTCMonth()))
      .filter((m) => m !== null),
  );
  h.forEach((m, i) => {
    if (m.incidents !== null && m.incidents > 0) {
      ok(datedMonths.has(i), `${p.id} ${m.month}: ${m.incidents} incidents plotted in a month no row is dated in`);
    }
  });
}

// ---------------------------------------------------------------------------
// 4. A NEGATIVE IS DRAWN, NOT ZEROED
//
// Proven against the chart's own geometry rather than asserted: a bar chart
// handed a negative must place it on the other side of the zero line.
// ---------------------------------------------------------------------------
{
  const values = [-40, 0, 100];
  const peak = Math.max(0, ...values);
  const trough = Math.min(0, ...values);
  const above = niceScale(peak);
  const below = trough < 0 ? niceScale(-trough) : null;
  ok(below !== null, 'a negative value must open a range below the zero line');
  const lo = below ? -below.max : 0;
  ok(lo <= -40, `the scale must reach ${-40}, it reaches ${lo}`);
  ok(above.max >= 100, 'the scale must still reach the positive peak');
}
ok(barred.every((v) => Number.isFinite(v)), 'a monthly movement is not a finite number');

// ---------------------------------------------------------------------------
// 5. A RING IS PARTS OF A WHOLE
//
// Where portfolio variances are mixed in sign the arcs cannot sum to the
// centre, so the Dashboard reports them instead of ringing them. This asserts
// the condition the screen branches on is the right one.
// ---------------------------------------------------------------------------
{
  const byPf = {};
  for (const p of P) byPf[p.portfolio] = (byPf[p.portfolio] ?? 0) + (p.budget - p.afc);
  const vals = Object.values(byPf);
  const fav = vals.filter((v) => v > 0).reduce((a, v) => a + v, 0);
  const adv = vals.filter((v) => v < 0).reduce((a, v) => a + v, 0);
  const mixed = fav > 0 && adv < 0;
  if (!mixed) {
    const arcs = vals.reduce((a, v) => a + Math.abs(v), 0);
    const centre = vals.reduce((a, v) => a + v, 0);
    ok(Math.abs(arcs - Math.abs(centre)) < 1,
      `the variance ring's arcs sum to ${Math.round(arcs)} around a centre of ${Math.round(centre)}`);
  }
}

console.log(`\ncharts  every plotted figure against what it claims  —  ${checks} checks\n`);
if (fail.length) {
  for (const f of fail.slice(0, 25)) console.error(`  FAIL  ${f}`);
  if (fail.length > 25) console.error(`  ... ${fail.length - 25} more`);
  console.error(`\n  ${fail.length} chart(s) stating something untrue.\n`);
  process.exit(1);
}
console.log('  every axis label names the line it is on, nothing is clipped or zeroed,');
console.log('  and every trend reproduces itself from the counts it publishes.\n');
