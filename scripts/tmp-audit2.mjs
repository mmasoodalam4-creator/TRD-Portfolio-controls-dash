import { DB } from '../src/data/index.ts';
import { registersFor } from '../src/data/project-state.ts';
import { operatingHistory, combineHistory } from '../src/domain/history.ts';
import { monthlyCost } from '../src/domain/forecast.ts';
import { spiOf, cpiOf } from '../src/domain/calc.ts';

const P = DB.projects, months = DB.months, scurve = DB.scurve;
const out = {};
const note = (k, m) => { (out[k] ??= []).push(m); };

const hs = [];
for (const p of P) {
  const r = registersFor(p.id, DB, P, []);
  const h = operatingHistory(p, r, months, scurve); hs.push(h);
  h.forEach((m) => {
    if (m.lostTime > m.recordable) note('NESTING', `${p.id} ${m.month}: lostTime ${m.lostTime} > recordable ${m.recordable}`);
    if (m.recordable > m.incidents) note('NESTING', `${p.id} ${m.month}: recordable ${m.recordable} > incidents ${m.incidents}`);
  });
  const sum = (k) => h.reduce((a, m) => a + m[k], 0);
  const closedTotal = r.ncrs.filter((n) => n.status === 'Closed' || n.status === 'Completed').length;
  if (sum('ncrsClosed') !== closedTotal) note('TOTALS', `${p.id}: ncrsClosed plots ${sum('ncrsClosed')}, register has ${closedTotal}`);

  // monthly cost: negative in-month movement suppressed by the bar chart
  const rows = monthlyCost(p, months, scurve);
  rows.forEach((x) => {
    if ((x.actualMonth ?? 0) < 0) note('NEGATIVE', `${p.id} ${x.month}: actualMonth ${Math.round(x.actualMonth)}`);
    if ((x.earnedMonth ?? 0) < 0) note('NEGATIVE', `${p.id} ${x.month}: earnedMonth ${Math.round(x.earnedMonth)}`);
  });

  // HBars fixed scales
  if (spiOf(p) > 1.25) note('CLIP', `${p.id}: SPI ${spiOf(p).toFixed(2)} > Dashboard HBars max 1.25`);
  if (cpiOf(p) > 1.2) note('CLIP', `${p.id}: CPI ${cpiOf(p).toFixed(2)} > Analytics HBars max 1.2`);
  r.wbs.forEach((n) => {
    if (n.budget && (n.ev / n.budget) * 100 > 100) note('CLIP', `${p.id} WBS ${n.name}: EV ${(n.ev/n.budget*100).toFixed(0)}% of budget > max 100`);
  });
  r.procurement.filter((x) => x.awarded).forEach((x) => {
    if (x.committed && (x.paid / x.committed) * 100 > 100) note('CLIP', `${p.id} pkg ${x.name}: paid ${(x.paid/x.committed*100).toFixed(0)}% of commitment > max 100`);
  });
}
combineHistory(hs).forEach((m) => {
  if (m.recordable > m.incidents) note('NESTING', `ROLLUP ${m.month}: recordable ${m.recordable} > incidents ${m.incidents}`);
  if (m.lostTime > m.recordable) note('NESTING', `ROLLUP ${m.month}: lostTime > recordable`);
});

// Dashboard donut: |variance| arcs vs signed centre
const byPf = {};
for (const p of P) { byPf[p.portfolio] = (byPf[p.portfolio] ?? 0) + (p.budget - p.afc); }
const signs = new Set(Object.values(byPf).map((v) => Math.sign(v)));
if (signs.size > 1) note('DONUT', `portfolio variances are mixed sign: ${JSON.stringify(Object.fromEntries(Object.entries(byPf).map(([k,v])=>[k,Math.round(v/1e6)+'M'])))}`);

// axis tick labels vs positions (the LineChart / BarChart formatters)
const tick = (max) => [0,.25,.5,.75,1].map((f) => ({ at: max*f, label: (max*f).toFixed(max <= 2 ? 2 : 0) }));
for (const max of [8.8, 2.65, 9.9, 323, 1.1]) {
  const t = tick(max);
  const dupes = new Set(t.map((x) => x.label)).size !== t.length;
  const lies = t.filter((x) => Math.abs(Number(x.label) - x.at) > 0.005);
  if (dupes) note('AXIS', `max ${max}: duplicate tick labels ${t.map((x)=>x.label).join(',')}`);
  lies.forEach((x) => note('AXIS', `max ${max}: gridline at ${x.at.toFixed(2)} is labelled "${x.label}"`));
}

for (const [k, v] of Object.entries(out)) {
  console.log(`\n### ${k}  (${v.length})`);
  console.log(v.slice(0, 8).map((x) => '  ' + x).join('\n'));
  if (v.length > 8) console.log(`  ... ${v.length - 8} more`);
}
if (!Object.keys(out).length) console.log('clean');
