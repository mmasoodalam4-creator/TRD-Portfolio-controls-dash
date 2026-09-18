#!/usr/bin/env node
/**
 * A NEW DEVELOPMENT, END TO END, AT THE MODEL LEVEL.
 *
 * The owner's day-one act is registering a development, and the defect this
 * gate was written from survived every other gate: a development registered
 * through the app was honest while untouched, and the moment its FIRST PERIOD
 * was filed the register derivation fell back to the RES-01 templates — the
 * one real awarded contract vanished, replaced by thirteen scaled packages
 * under other organisations' names, with open non-conformances dated before
 * the development existed, eight risks, a fleet and thirteen zero-value
 * payment claims. `check:actions` created a development and checked one table
 * row; `check:qa` registered one and never filed a period on it. A gate
 * written from the create-time defect only ever caught the create-time defect.
 *
 * So this one drives the WHOLE LIFECYCLE — register, first period, interim
 * certificate, recorded claim, confirmed payment, amendment — and after every
 * step asserts two things:
 *
 *   1. HONESTY. Every register row is something actually recorded against
 *      this development: its own contracts (plus the one explicit "not yet
 *      packaged" row), its own certificates and claims by reference. No
 *      template contractor, no borrowed non-conformance, no invented fleet.
 *      Empty reads as empty.
 *   2. RECONCILIATION. All twenty controls pass at every step, because the
 *      server refuses any write that fails one — a lifecycle this gate cannot
 *      carry green is a lifecycle the platform refuses in front of the owner.
 *
 * It also holds the amendment rule for a SEEDED development: a budget
 * amendment re-derives the registers, so the WBS root and the category table
 * follow the amended budget rather than restating the old one.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = join(tmpdir(), `tazayud-newdev-${process.pid}`);
const build = (entry, name) => {
  const out = join(dir, name);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--alias:@=./src',
    '--log-level=error', `--outfile=${out}`], { stdio: 'inherit' });
  return `file://${out}`;
};
const { DB } = await import(build('src/data/index.ts', 'db.mjs'));
const { replayProjects, registersFor, awardProblem } = await import(build('src/data/project-state.ts', 'state.mjs'));
const { REPORTING_KINDS } = await import(build('src/data/mutations.ts', 'mutations.mjs'));
const { runControls } = await import(build('src/domain/integrity.ts', 'integrity.mjs'));
const { assessCounterparties } = await import(build('src/domain/evaluation.ts', 'evaluation.mjs'));
const { isOpenNcr } = await import(build('src/domain/counts.ts', 'counts.mjs'));
rmSync(dir, { recursive: true, force: true });

const failures = [];
let checks = 0;
const check = (where, what, ok) => {
  checks++;
  if (!ok) failures.push(`${where}  ${what}`);
};

const ID = 'RES-90';
const at = '2026-08-31T12:00:00.000Z';

/** The registered facts. One awarded contract, one out to tender. */
const create = {
  kind: 'project:create',
  at,
  project: { id: ID, name: 'Gate Development', portfolio: 'Residential', route: 'PMC-Delivered', budget: 500_000_000 },
  packages: [
    { code: '1', name: 'Enabling', phase: 'P1', budget: 50_000_000, plannedPct: 0, actualPct: 0, cost: 0, committed: 0 },
    { code: '2', name: 'Structure', phase: 'P2', budget: 300_000_000, plannedPct: 0, actualPct: 0, cost: 0, committed: 0 },
  ],
  contracts: [
    { id: 'CT-01', name: 'Enabling Works', wbs: '1', contractor: 'Own Contractor LLC', role: 'Main Contractor', value: 48_000_000, retention: 5, awarded: '2026-08-01' },
    { id: 'CT-02', name: 'Structure', wbs: '2', contractor: 'Second Org', role: 'Trade Contractor', value: 120_000_000, retention: 5, awarded: null },
  ],
};

const period = {
  kind: 'period:submit',
  at,
  projectId: ID,
  period: 1,
  dataDate: '31 Aug 2026',
  budget: 500_000_000,
  control: 350_000_000,
  afc: 500_000_000,
  packages: [
    { code: '1', name: 'Enabling', phase: 'P1', budget: 50_000_000, plannedPct: 0.2, actualPct: 0.16, cost: 6_000_000, committed: 48_000_000 },
    { code: '2', name: 'Structure', phase: 'P2', budget: 300_000_000, plannedPct: 0, actualPct: 0, cost: 0, committed: 12_000_000 },
  ],
  categories: [
    { cat: 'Construction', budget: 350_000_000, committed: 60_000_000, actual: 6_000_000, afc: 350_000_000 },
    { cat: 'Contingency', budget: 150_000_000, committed: 0, actual: 0, afc: 150_000_000 },
  ],
};

const ipc = { kind: 'ipc', at, projectId: ID, certified: 4_000_000, retention: 200_000, reference: 'IPC-01' };
const claim = {
  kind: 'claim:record', at, projectId: ID, packageId: 'CT-01', milestone: 'Substructure complete',
  claimed: 2_100_000, verifiedBy: 'QS Partner', verifiedOn: '2026-08-20', verifiedRef: 'VR-9',
  verified: 2_000_000, approved: 2_000_000, retentionRate: 5, reference: 'PC-90-01',
};
const pay = { kind: 'claim:pay', at, projectId: ID, claimId: 'IPC-01', amount: 150_000, valueDate: '2026-08-30', reference: 'TRF-1' };

const OWN = new Set(['Own Contractor LLC', 'Second Org', 'Not yet packaged']);
const RECORDED_CLAIMS = new Set(['IPC-01', 'PC-90-01']);

const stage = (name, log) => {
  const projects = replayProjects(DB.projects, log);
  const p = projects.find((x) => x.id === ID);
  const r = registersFor(ID, DB, projects, log);

  // -- honesty: every row is something recorded against THIS development ----
  for (const x of r.procurement) {
    check(name, `procurement row ${x.id} names "${x.contractor}", which was never `
      + 'registered against this development — a template has leaked in', OWN.has(x.contractor));
  }
  for (const c of r.claims) {
    check(name, `claim ${c.id} was never recorded against this development`,
      RECORDED_CLAIMS.has(c.id));
  }
  for (const [reg, rows] of [['ncrs', r.ncrs], ['risks', r.risks], ['issues', r.issues],
    ['variations', r.variations], ['changes', r.changes], ['equipment', r.equipment],
    ['manpower', r.manpower], ['incidents', r.incidents], ['attendance', r.attendance],
    ['qualityInspections', r.qualityInspections], ['materialApprovals', r.materialApprovals]]) {
    check(name, `${reg} carries ${rows.length} rows nobody recorded — an empty register `
      + 'must read as empty', rows.length === 0);
  }

  // -- reconciliation: the server refuses any write that fails a control ----
  const controls = runControls(p, r, DB.months, DB.scurve);
  for (const c of controls.filter((c) => c.result !== 'OK')) {
    check(name, `control ${c.no} (${c.name}) fails: ${c.a} vs ${c.b}`, false);
  }
  return { p, r };
};

// -- registered, untouched -------------------------------------------------
{
  const { p, r } = stage('registered', [create]);
  check('registered', 'control budget is the packages', p.control === 350_000_000);
  check('registered', 'only the awarded contract commits', p.committed === 48_000_000);
  check('registered', 'the awarded contract is on the register',
    r.procurement.some((x) => x.id === 'CT-01' && x.contractor === 'Own Contractor LLC' && x.committed === 48_000_000));
  check('registered', 'the tendered contract commits nothing',
    r.procurement.some((x) => x.id === 'CT-02' && x.committed === 0 && x.awarded === null));
}

// -- first period filed ----------------------------------------------------
{
  const { p, r } = stage('first period', [create, period]);
  check('first period', 'position follows the packages',
    p.actual === 6_000_000 && p.committed === 60_000_000 && p.ev === 8_000_000);
  check('first period', 'the WBS is the entered packages',
    r.wbs.some((n) => n.code === '1' && n.budget === 50_000_000));
  // 60M committed against 48M of awarded contracts: the difference is ONE
  // explicit row, not spread invisibly across contracts whose values are known.
  const unallocated = r.procurement.find((x) => x.id === 'PKG-UNALLOCATED');
  check('first period', 'committed cost beyond the contracts is one explicit row',
    unallocated !== undefined && unallocated.committed === 12_000_000);
  check('first period', 'the registered contract still carries its own value',
    r.procurement.some((x) => x.id === 'CT-01' && x.committed === 48_000_000));
  // The evaluation scorecard skips the bookkeeping row rather than scoring it.
  const assessed = assessCounterparties(r.procurement, r.claims, r.ncrs, r.variations, r.wbs);
  check('first period', 'the "not yet packaged" row is not scored as a counterparty',
    !assessed.some((a) => a.name === 'Not yet packaged'));
}

// -- certificate, claim, confirmed payment ---------------------------------
{
  const { p, r } = stage('certificate + claim + payment', [create, period, ipc, claim, pay]);
  check('cash', 'certified is the certificate plus the approved claim',
    p.ipcSubmitted === 6_000_000);
  check('cash', 'paid is the two nets plus the confirmed transfer',
    p.paid === 3_800_000 + 1_900_000 + 150_000);
  const cert = r.claims.find((c) => c.id === 'IPC-01');
  const rec = r.claims.find((c) => c.id === 'PC-90-01');
  check('cash', 'the certificate is a register row with its own retention',
    cert !== undefined && cert.approved === 4_000_000 && cert.retention === 200_000);
  check('cash', 'the recorded claim keeps the consultant\'s verification',
    rec !== undefined && rec.verified === 2_000_000 && rec.verifiedBy === 'QS Partner');
  check('cash', 'transfers across the register sum to the position',
    r.claims.reduce((a, c) => a + c.paid, 0) === p.paid);
}

// -- a contract recorded AFTER registration --------------------------------
// The next dead end a real user hit: contracts could only enter at
// registration, so a development that later bought another slice of scope
// had no way to say so. `contract:award` appends a package, or awards one
// that was registered out to tender — and only an award moves committed.
{
  const award = {
    kind: 'contract:award', at, projectId: ID,
    contract: { id: 'CT-02', name: 'Structure', wbs: '2', contractor: 'Second Org', role: 'Trade Contractor', value: 130_000_000, retention: 5, awarded: '2026-08-25' },
  };
  const log = [create, period, ipc, claim, pay, award];
  const { p, r } = stage('award', log);
  check('award', 'awarding the tendered package moves committed by its value',
    p.committed === 60_000_000 + 130_000_000);
  check('award', 'the awarded package replaces the tender row on the register',
    r.procurement.some((x) => x.id === 'CT-02' && x.committed === 130_000_000 && x.awarded === '2026-08-25'));
  check('award', 'the residual "not yet packaged" row still carries exactly the difference',
    r.procurement.find((x) => x.id === 'PKG-UNALLOCATED')?.committed === 12_000_000);

  const projects = replayProjects(DB.projects, log);
  check('award', 'a second award of the same package is refused',
    (awardProblem(award, DB, projects, log) ?? '').includes('already been awarded'));
  check('award', 'an award past the approved budget is refused in a sentence',
    (awardProblem({ ...award, contract: { ...award.contract, id: 'CT-03', value: 320_000_000 } },
      DB, projects, log) ?? '').includes('approved budget'));
  check('award', 'a closed development refuses an award (contract:award is a reporting kind)',
    REPORTING_KINDS.includes('contract:award'));

  // A SEEDED development takes a recorded package the same way: appended
  // beside the stored register, with the stored rows apportioned to the
  // residual so control 7 cannot read the award twice.
  const seededAward = {
    kind: 'contract:award', at, projectId: 'RES-02',
    contract: { id: 'CT-NEW', name: 'External works', wbs: '4', contractor: 'Najd Landscapes Co.', role: 'Trade Contractor', value: 40_000_000, retention: 5, awarded: '2026-08-25' },
  };
  const before = replayProjects(DB.projects, []).find((x) => x.id === 'RES-02');
  const after = replayProjects(DB.projects, [seededAward]).find((x) => x.id === 'RES-02');
  check('award', 'a seeded development takes the award into committed',
    after.committed === before.committed + 40_000_000);
  const r2 = registersFor('RES-02', DB, replayProjects(DB.projects, [seededAward]), [seededAward]);
  check('award', 'the recorded package appears beside the stored register',
    r2.procurement.some((x) => x.id === 'CT-NEW' && x.committed === 40_000_000));
  check('award', 'a package number colliding with a stored row is refused',
    (awardProblem({ ...seededAward, contract: { ...seededAward.contract, id: r2.procurement[0].id } },
      DB, replayProjects(DB.projects, [seededAward]), [seededAward]) ?? '').includes('already exists'));
  for (const c of runControls(after, r2, DB.months, DB.scurve).filter((c) => c.result !== 'OK')) {
    check('award', `control ${c.no} (${c.name}) fails after a seeded award: ${c.a} vs ${c.b}`, false);
  }
}

// -- the programme dates, and the status a reported position implies -------
// A registered development arrives with "To be confirmed" dates and could
// never state its programme; and its status stood at "On Track" for ever,
// however its periods read. The amendment carries the dates; the period
// derives the status — SPI/CPI below 0.95 is At Risk, below 0.90 is
// Delayed, and a period reported past the stated planned finish with the
// work not complete is Delayed whatever SPI compression says.
{
  const dates = {
    kind: 'project:update', at, projectId: ID,
    start: '2025-08-01', finish: '2026-08-01', note: 'Programme stated',
  };
  const p1 = replayProjects(DB.projects, [create, dates]).find((x) => x.id === ID);
  check('programme', 'the amendment records the programme dates',
    p1.start === '2025-08-01' && p1.finish === '2026-08-01');
  check('programme', 'the duration follows the dates', p1.duration === '12 months');

  // SPI 0.8 on the period: behind, and past the stated finish.
  const late = {
    ...period,
    dataDate: '31 Aug 2026',
    packages: [
      { code: '1', name: 'Enabling', phase: 'P1', budget: 50_000_000, plannedPct: 0.5, actualPct: 0.4, cost: 21_000_000, committed: 48_000_000 },
      { code: '2', name: 'Structure', phase: 'P2', budget: 300_000_000, plannedPct: 0, actualPct: 0, cost: 0, committed: 12_000_000 },
    ],
    categories: [
      { cat: 'Construction', budget: 350_000_000, committed: 60_000_000, actual: 21_000_000, afc: 350_000_000 },
      { cat: 'Contingency', budget: 150_000_000, committed: 0, actual: 0, afc: 150_000_000 },
    ],
  };
  const p2 = replayProjects(DB.projects, [create, dates, late]).find((x) => x.id === ID);
  check('programme', `SPI ${p2.spi} reads Delayed, not "${p2.status}"`, p2.status === 'Delayed');

  // On plan and on cost: the same period reported healthy is On Track.
  const fine = {
    ...late,
    dataDate: '31 Jul 2026',
    packages: [
      { code: '1', name: 'Enabling', phase: 'P1', budget: 50_000_000, plannedPct: 0.5, actualPct: 0.5, cost: 25_000_000, committed: 48_000_000 },
      { code: '2', name: 'Structure', phase: 'P2', budget: 300_000_000, plannedPct: 0, actualPct: 0, cost: 0, committed: 12_000_000 },
    ],
    categories: [
      { cat: 'Construction', budget: 350_000_000, committed: 60_000_000, actual: 25_000_000, afc: 350_000_000 },
      { cat: 'Contingency', budget: 150_000_000, committed: 0, actual: 0, afc: 150_000_000 },
    ],
  };
  const p3 = replayProjects(DB.projects, [create, dates, fine]).find((x) => x.id === ID);
  check('programme', 'the same figures on plan read On Track', p3.status === 'On Track');

  // Complete on the day is not "delayed" for being reported on the last day:
  // past-finish only bites while the work is not complete.
  const done = {
    ...late,
    packages: [
      { code: '1', name: 'Enabling', phase: 'P1', budget: 50_000_000, plannedPct: 1, actualPct: 1, cost: 48_000_000, committed: 48_000_000 },
      { code: '2', name: 'Structure', phase: 'P2', budget: 300_000_000, plannedPct: 1, actualPct: 1, cost: 12_000_000, committed: 12_000_000 },
    ],
    categories: [
      { cat: 'Construction', budget: 350_000_000, committed: 60_000_000, actual: 60_000_000, afc: 350_000_000 },
      { cat: 'Contingency', budget: 150_000_000, committed: 0, actual: 0, afc: 150_000_000 },
    ],
  };
  const p4 = replayProjects(DB.projects, [create, dates, done]).find((x) => x.id === ID);
  check('programme', 'a complete development reported past the finish is not Delayed by the calendar',
    p4.status === 'On Track');
}

// -- a budget amendment moves the registers with it ------------------------
{
  const log = [{ kind: 'project:update', at, projectId: 'RES-02', budget: 1_100_000_000, note: 'Board uplift' }];
  const projects = replayProjects(DB.projects, log);
  const p = projects.find((x) => x.id === 'RES-02');
  const r = registersFor('RES-02', DB, projects, log);
  const root = r.wbs.find((n) => n.level === 0);
  check('amendment', `WBS root shows ${root?.budget}, the band ${p.budget} — the register `
    + 'restates the old budget', root?.budget === p.budget);
  const catBudget = r.costCategories.reduce((a, c) => a + c.budget, 0);
  check('amendment', `cost categories sum to ${catBudget} against an amended budget of ${p.budget}`,
    catBudget === p.budget);
  for (const c of runControls(p, r, DB.months, DB.scurve).filter((c) => c.result !== 'OK')) {
    check('amendment', `control ${c.no} (${c.name}) fails after amendment: ${c.a} vs ${c.b}`, false);
  }
  // A name-only amendment re-derives nothing: the pristine rows stay pristine.
  const renamed = [{ kind: 'project:update', at, projectId: 'RES-02', name: 'Renamed', note: 'Spelling' }];
  const r2 = registersFor('RES-02', DB, replayProjects(DB.projects, renamed), renamed);
  check('amendment', 'a name-only amendment left the stored registers alone',
    JSON.stringify(r2.wbs) === JSON.stringify(registersFor('RES-02', DB, DB.projects, []).wbs));
}

// -- one definition of "open" ----------------------------------------------
// "Open" was written out four ways and two survived the first unification.
// A Completed non-conformance is answered and signed off: it is not open, and
// no criterion may score it as though it were.
{
  check('open', 'a Completed NCR is not open', !isOpenNcr({ status: 'Completed' }));
  const pkg = [{ id: 'P1', name: 'X', cat: 'C', type: 'W', contractor: 'Org', role: 'Main Contractor', wbs: '1', value: 100, committed: 100, paid: 0, retention: 0, awarded: '2026-01-01', prog: 0, status: 'In Progress' }];
  const ncr = [{ no: 'N1', title: 't', packageId: 'P1', discipline: 'Civil', type: 'Workmanship', severity: 'Major', raised: '01 Jan 2026', due: '01 Feb 2026', status: 'Completed', resp: 'x', loc: 'y', desc: '', docs: [] }];
  const [a] = assessCounterparties(pkg, [], ncr, [], []);
  const quality = a.criteria.find((c) => c.name === 'Quality');
  check('open', 'the scorecard counts a Completed NCR as open',
    quality !== undefined && quality.measured === 'None open');
}

console.log(`\nnew development  ${checks} checks across the lifecycle`);
if (failures.length) {
  for (const f of failures.slice(0, 30)) console.error(`  FAIL  ${f}`);
  if (failures.length > 30) console.error(`  ... and ${failures.length - 30} more`);
  console.error(`\n  ${failures.length} failure(s). A development registered through the app`);
  console.error('  holds only what was recorded against it, reconciles at every step of');
  console.error('  its lifecycle, and an amendment moves the registers with the budget.\n');
  process.exit(1);
}
console.log('  registered, reported, certified, claimed, paid and amended — every register');
console.log('  row is something recorded against it, and all twenty controls hold throughout.\n');
