#!/usr/bin/env node
/**
 * PROVES THE DUMMY DATA IS CONNECTED — the counts and the calendar.
 *
 * The money is already locked down: twenty reconciliation controls run before
 * every write, and check:recon proves each register adds up to its own
 * development. Nothing did the same for the two things a reader notices first.
 *
 * COUNTS. The project record carries `risks`, `highRisks`, `openNcr` and
 * `openIssues`, and they were authored beside the registers rather than
 * counted from them: RES-01 stored 28 risks against a register of 8 and 18
 * open non-conformances against 8. The Dashboard read the stored figure while
 * the Risk module listed the rows, so one screen said "6 high-rated risks
 * across 28 registered" above a table of eight. `domain/counts.ts` now counts
 * every one of them from the rows and nothing reads the stored fields; this
 * gate asserts that what each screen shows IS the length of the list beneath
 * it, on every development.
 *
 * THE CALENDAR. Non-conformances raised in April 2025 were still showing Open
 * at an August 2026 data date; incidents, observations and inspections were
 * dated into October 2026, after the position they belong to and in one case
 * after today; equipment was Operating three months past its next service.
 * `domain/calendar.ts` states the data date once, and this gate holds every
 * authored event to it.
 *
 * Nothing here is about money, and that is the point: a portfolio whose
 * figures reconcile perfectly while its dates contradict each other teaches a
 * person to stop believing the dates, and from there the figures.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = join(tmpdir(), `tazayud-coherence-${process.pid}`);
const build = (entry, name) => {
  const out = join(dir, name);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--alias:@=./src',
    '--log-level=error', `--outfile=${out}`], { stdio: 'inherit' });
  return `file://${out}`;
};
const { DB } = await import(build('src/data/index.ts', 'db.mjs'));
const { registersFor } = await import(build('src/data/project-state.ts', 'state.mjs'));
const { registerCounts } = await import(build('src/domain/counts.ts', 'counts.mjs'));
const cal = await import(build('src/domain/calendar.ts', 'calendar.mjs'));
const { DATA_DATE_INDEX } = await import(build('src/domain/forecast.ts', 'forecast.mjs'));
rmSync(dir, { recursive: true, force: true });

const { DATA_DATE, DATA_DATE_MS, MONTH_NAMES, parseDate, daysOpenAt } = cal;

const failures = [];
let checks = 0;

const check = (where, what, ok) => {
  checks++;
  if (!ok) failures.push(`${where}  ${what}`);
};

// -- the data date is one date, and it names the month the curve reports -----
check('calendar', `DATA_DATE ${DATA_DATE} is not in the reported month `
  + `(${MONTH_NAMES[DATA_DATE_INDEX]})`, DATA_DATE.includes(MONTH_NAMES[DATA_DATE_INDEX]));
check('calendar', 'DATA_DATE does not parse', parseDate(DATA_DATE) === DATA_DATE_MS);

// Twice per development: once as stored, once TOUCHED — a certificate in the
// log flips registersFor onto the re-derived branch, which no coherence check
// ever ran over. The touched registers must hold together exactly as the
// stored ones do.
const touchLog = (id) => [{
  kind: 'ipc', at: '2026-08-31T00:00:00.000Z', projectId: id,
  certified: 1_000_000, retention: 0, reference: 'COH-01',
}];
const cases = DB.projects.flatMap((p) => [
  [p, [], ''],
  [p, touchLog(p.id), ' (touched)'],
]);

for (const [p, log, tag] of cases) {
  // The touched case carries the certificate's own movement in the position,
  // exactly as the replay would produce it.
  const projects = log.length
    ? DB.projects.map((x) => (x.id === p.id
      ? { ...x, ipcSubmitted: x.ipcSubmitted + 1_000_000, paid: x.paid + 1_000_000 } : x))
    : DB.projects;
  const r = registersFor(p.id, DB, projects, log);
  void tag;
  const counted = registerCounts(r);

  // -- every count a screen shows is the length of the list beneath it ------
  //
  // These are asserted against the REGISTERS, never against the stored
  // project fields, which are the thing that was wrong. What is being proved
  // is that one derivation answers every screen: the roll-up, the tile, the
  // table and the assistant all read the same rows.
  check(p.id, `risks counted ${counted.risks} vs register ${r.risks.length}`,
    counted.risks === r.risks.length);
  check(p.id, 'a risk is rated high without being in the high band',
    r.risks.filter((x) => x.score >= 15).length === counted.highRisks);
  check(p.id, `open NCRs ${counted.openNcr} vs rows not closed `
    + `${r.ncrs.filter((n) => n.status !== 'Closed' && n.status !== 'Completed').length}`,
    counted.openNcr === r.ncrs.filter((n) => n.status !== 'Closed' && n.status !== 'Completed').length);
  check(p.id, 'a development has non-conformances but no corrective actions',
    counted.openNcr === 0 || r.correctiveActions.length > 0);

  // -- a corrective action answers an NCR that exists ------------------------
  const numbers = new Set(r.ncrs.map((n) => n.no));
  for (const a of r.correctiveActions) {
    check(p.id, `corrective action names ${a.ncr}, which is not on the register`,
      numbers.has(a.ncr));
  }

  // -- a mitigation answers a risk that exists ------------------------------
  const riskIds = new Set(r.risks.map((x) => x.id));
  for (const m of r.mitigations) {
    check(p.id, `mitigation names risk ${m.risk}, which is not on the register`,
      riskIds.has(m.risk));
    check(p.id, `the mitigation for ${m.risk} carries no date to be done by`,
      parseDate(m.due) !== null);
  }

  // -- an NCR raised against a package that exists --------------------------
  const packages = new Set(r.procurement.map((x) => x.id));
  for (const n of r.ncrs) {
    check(p.id, `${n.no} is raised against package ${n.packageId}, which is not `
      + 'on the procurement register', packages.size === 0 || packages.has(n.packageId));
  }

  // -- nothing is dated after the position it belongs to ---------------------
  const dated = [
    ...r.ncrs.map((n) => [`${n.no} raised`, n.raised]),
    ...r.issues.map((i) => [`${i.id} opened`, i.opened]),
    ...r.incidents.map((i) => [`${i.id}`, i.date]),
    ...r.observations.map((o) => [`${o.id}`, o.date]),
    ...r.hseInspections.map((h) => [`${h.id}`, h.date]),
    ...r.materialApprovals.flatMap((m) => [
      [`${m.id} submitted`, m.submitted], [`${m.id} decided`, m.decided]]),
    ...r.equipment.map((e) => [`${e.id} last service`, e.lastService]),
  ];
  for (const [what, when] of dated) {
    const t = parseDate(when);
    check(p.id, `${what} is dated ${when}, after the data date ${DATA_DATE}`,
      t === null || t <= DATA_DATE_MS);
  }

  // -- an overdue non-conformance is past its due date, an open one is not ---
  for (const n of r.ncrs) {
    const due = parseDate(n.due);
    if (due === null) continue;
    if (n.status === 'Overdue') {
      check(p.id, `${n.no} is Overdue but is not due until ${n.due}`, due < DATA_DATE_MS);
    } else if (n.status === 'Open') {
      check(p.id, `${n.no} is Open but was due ${n.due}, before the data date`,
        due >= DATA_DATE_MS);
    }
  }

  // -- an issue's age is the distance from the date on its own row ----------
  for (const i of r.issues) {
    check(p.id, `${i.id} says ${i.days} days open, and ${i.opened} implies `
      + `${daysOpenAt(i.opened)}`, i.days === daysOpenAt(i.opened));
  }

  // -- a machine past its service date is not simply Operating -------------
  for (const e of r.equipment) {
    const next = parseDate(e.nextService);
    check(p.id, `${e.id} is ${e.status} with a service due ${e.nextService}`,
      next === null || e.status !== 'Operating' || next > DATA_DATE_MS);
  }

  // -- a material decision is not made before it was submitted -------------
  for (const m of r.materialApprovals) {
    const sub = parseDate(m.submitted);
    const dec = parseDate(m.decided);
    check(p.id, `${m.id} was decided ${m.decided}, before it was submitted ${m.submitted}`,
      sub === null || dec === null || dec >= sub);
  }
}

console.log(`\ncoherence  ${DB.projects.length} developments, ${checks} cross-register checks`);
console.log(`           data date ${DATA_DATE}\n`);
if (failures.length) {
  for (const f of failures.slice(0, 40)) console.error(`  FAIL  ${f}`);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  console.error(`\n  ${failures.length} incoherence(s). The dummy data has to hold together:`);
  console.error('  a count is the length of its register, and no event is dated after');
  console.error('  the position it belongs to.\n');
  process.exit(1);
}
console.log('  every count ties to its register and every date sits behind the data date.\n');
