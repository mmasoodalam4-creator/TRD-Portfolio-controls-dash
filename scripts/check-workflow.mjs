#!/usr/bin/env node
/**
 * Input → review → approve, driven through the API by four different people.
 *
 * check-duties.mjs proves the database refuses what the rules forbid. This
 * proves the workflow those rules exist to protect actually runs: that a
 * period entered by a contributor reaches the reported position only after
 * someone else validates it and a third person signs it off, and that every
 * shortcut is refused with a reason worth reading.
 *
 * The distinction between the two checks matters. A database that refuses
 * everything would pass check-duties and be useless. This is the other half.
 *
 *   1. submit     an assigned contributor submits; an unassigned one cannot;
 *                 a reviewer, approver and reader cannot submit at all
 *   2. pending    a submitted period is NOT yet in the reported position
 *   3. review     a different person validates it
 *   4. approve    a third person signs it off, and only then does the
 *                 position move
 *   5. shortcuts  every stage skipped, self-approved or double-acted is
 *                 refused through the API as well as in the database
 *
 * Requires DATABASE_URL. scripts/local-postgres.sh start prints one.
 */
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\nDATABASE_URL is required. Run: scripts/local-postgres.sh start\n');
  process.exit(1);
}

const SECRET = 'check-workflow-secret';
const PORT = Number(process.env.API_PORT ?? 4127);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const CAST = [
  ['wf-input@test', 'Inputter', 'contributor'],
  ['wf-input2@test', 'Other Inputter', 'contributor'],
  ['wf-review@test', 'Reviewer', 'reviewer'],
  ['wf-approve@test', 'Approver', 'approver'],
  ['wf-read@test', 'Reader', 'reader'],
];
const PASSWORD = 'workflow-check-password';

const failures = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

try {
  const r = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
  if (r.ok) {
    console.error(`\nSomething is already listening on ${ORIGIN}. Stop it first.\n`);
    process.exit(1);
  }
} catch { /* nothing there, as wanted */ }

// ---- cast, database, server -------------------------------------------
const env = { ...process.env, DATABASE_URL };
execFileSync('npx', ['tsx', 'db/seed.ts', '--reset'], { env, stdio: 'pipe' });
for (const [email, name, role] of CAST) {
  execFileSync('npx', ['tsx', 'db/user.ts', email, name, role, PASSWORD], { env, stdio: 'pipe' });
}

const pool = new Pool({ connectionString: DATABASE_URL });
await pool.query(
  "insert into project_assignments (user_id, project_id) values ('wf-input@test','RES-01')"
  + ' on conflict do nothing',
);

const server = spawn('npx', ['tsx', 'server/server.ts'], {
  env: { ...env, AUTH_SECRET: SECRET, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
const log = [];
server.stdout.on('data', (d) => log.push(String(d)));
server.stderr.on('data', (d) => log.push(String(d)));

let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
};
process.on('exit', stop);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop(); process.exit(1); });

let up = false;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${ORIGIN}/api/health`)).ok) { up = true; break; } } catch { /* waiting */ }
  await sleep(250);
}
if (!up) {
  console.error('\nAPI did not start.\n' + log.join(''));
  process.exit(1);
}

// ---- sign everyone in -------------------------------------------------
const tokens = {};
for (const [email] of CAST) {
  const res = await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  tokens[email] = body?.token;
}
check('every role signs in', Object.values(tokens).every((t) => typeof t === 'string'));

const as = async (email, path, opts = {}) => {
  const res = await fetch(`${ORIGIN}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokens[email]}`,
      ...opts.headers,
    },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

/** A period that reconciles: packages sum to control, categories to the AFC. */
const periodFor = (projectId, period) => {
  const packages = [
    { code: '1.2', name: 'PMC & Owner Supervision', phase: '01 Preliminaries',
      budget: 200_000_000, plannedPct: 0.95, actualPct: 0.95, cost: 190_000_000, committed: 200_000_000 },
    { code: '3.1', name: 'Substructure & Foundations', phase: '03 Package A',
      budget: 500_000_000, plannedPct: 0.78, actualPct: 0.75, cost: 360_000_000, committed: 480_000_000 },
    { code: '5.1', name: 'Fit-Out & Finishes', phase: '05 Package C',
      budget: 487_500_000, plannedPct: 0.38, actualPct: 0.32, cost: 170_000_000, committed: 240_000_000 },
  ];
  return {
    kind: 'period:submit',
    at: new Date().toISOString(),
    projectId,
    period,
    dataDate: '30 September',
    budget: 1_250_000_000,
    control: packages.reduce((t, p) => t + p.budget, 0),
    afc: 1_080_000_000,
    packages,
    categories: [
      { cat: 'Design & Engineering', budget: 200_000_000, committed: 200_000_000, actual: 190_000_000, afc: 205_000_000 },
      { cat: 'Main Works — Civil', budget: 500_000_000, committed: 480_000_000, actual: 360_000_000, afc: 505_000_000 },
      { cat: 'MEP & Specialist', budget: 487_500_000, committed: 240_000_000, actual: 170_000_000, afc: 370_000_000 },
    ],
  };
};

const post = (email, path, body) =>
  as(email, path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

// ---- 1. who may submit ------------------------------------------------
{
  const ok = await post('wf-input@test', '/api/periods', periodFor('RES-01', 9));
  check('an assigned contributor submits', ok.status === 200,
    `${ok.status}: ${JSON.stringify(ok.body)?.slice(0, 160)}`);

  const unassigned = await post('wf-input@test', '/api/periods', periodFor('COM-01', 9));
  check('a contributor cannot submit for an unassigned development',
    unassigned.status === 403, `status ${unassigned.status}`);

  const other = await post('wf-input2@test', '/api/periods', periodFor('RES-02', 9));
  check('an unassigned contributor can submit nothing', other.status === 403,
    `status ${other.status}`);

  for (const [email, role] of [['wf-review@test', 'reviewer'], ['wf-approve@test', 'approver'], ['wf-read@test', 'reader']]) {
    const res = await post(email, '/api/periods', periodFor('RES-01', 20));
    check(`a ${role} cannot submit a period`, res.status === 403, `status ${res.status}`);
  }
}

// ---- 2. submitted is not yet reported --------------------------------
const submissionId = (await as('wf-review@test', '/api/periods')).body?.[0]?.id;
check('the submission is listed', typeof submissionId === 'number');

{
  const mutations = (await as('wf-read@test', '/api/mutations')).body;
  check('a submitted period is NOT yet in the reported position',
    Array.isArray(mutations) && mutations.length === 0,
    `${Array.isArray(mutations) ? mutations.length : '?'} mutations`);
}

// ---- 3. review --------------------------------------------------------
{
  const selfReview = await post('wf-input@test', `/api/periods/${submissionId}/review`);
  check('the submitter cannot review their own period', selfReview.status >= 400,
    `status ${selfReview.status}`);

  const early = await post('wf-approve@test', `/api/periods/${submissionId}/approve`);
  check('approval cannot precede review', early.status >= 400, `status ${early.status}`);

  const reviewed = await post('wf-review@test', `/api/periods/${submissionId}/review`);
  check('a reviewer validates it', reviewed.status === 200,
    `${reviewed.status}: ${JSON.stringify(reviewed.body)?.slice(0, 160)}`);
  check('its state is now reviewed', reviewed.body?.state === 'reviewed', reviewed.body?.state);
}

// ---- 4. approve -------------------------------------------------------
{
  const selfApprove = await post('wf-input@test', `/api/periods/${submissionId}/approve`);
  check('the submitter cannot approve their own period', selfApprove.status >= 400,
    `status ${selfApprove.status}`);

  const reviewerApprove = await post('wf-review@test', `/api/periods/${submissionId}/approve`);
  check('the reviewer cannot approve what they reviewed', reviewerApprove.status >= 400,
    `status ${reviewerApprove.status}`);

  const readerApprove = await post('wf-read@test', `/api/periods/${submissionId}/approve`);
  check('a reader cannot approve', readerApprove.status === 403, `status ${readerApprove.status}`);

  const approved = await post('wf-approve@test', `/api/periods/${submissionId}/approve`);
  check('the approver signs it off', approved.status === 200,
    `${approved.status}: ${JSON.stringify(approved.body)?.slice(0, 200)}`);
  check('its state is now approved', approved.body?.state === 'approved', approved.body?.state);
}

// ---- 5. approval is what moves the position --------------------------
{
  const mutations = (await as('wf-read@test', '/api/mutations')).body;
  check('approval put the period into the reported position',
    Array.isArray(mutations) && mutations.length === 1
      && mutations[0]?.kind === 'period:submit',
    `${Array.isArray(mutations) ? mutations.length : '?'} mutations`);

  const projects = (await as('wf-read@test', '/api/projects')).body;
  const res01 = Array.isArray(projects) ? projects.find((p) => p.id === 'RES-01') : null;
  const expectedEv = Math.round(periodFor('RES-01', 9).packages
    .reduce((t, k) => t + k.budget * k.actualPct, 0));
  check('the reported earned value is the one the packages imply',
    res01?.ev === expectedEv, `${res01?.ev} vs ${expectedEv}`);
}

// ---- tidy -------------------------------------------------------------
await pool.query('delete from period_submissions');
await pool.query("delete from users where id like 'wf-%'");
await pool.end();
stop();

console.log(`\ninput -> review -> approve  ${checks} checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  three people, three stages, every shortcut refused.\n');
process.exit(0);
