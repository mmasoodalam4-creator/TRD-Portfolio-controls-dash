#!/usr/bin/env node
/**
 * The backend seam, proven.
 *
 * Phase 5's claim is that the database is a deployment decision: the app runs
 * on the fixtures or on Postgres and shows the same figures either way. That
 * claim is worth exactly as much as the check behind it, so this script does
 * not test the API in isolation — it runs BOTH repositories and compares them
 * field by field.
 *
 *   1. parity     every method of HttpRepository returns what MockRepository
 *                 returns, deep-equal, for all 8 developments
 *   2. write      a mutation posted to the API reaches the database, and the
 *                 replayed position matches the mock given the same log
 *   3. integrity  a mutation that would break reconciliation is REFUSED 422
 *                 and leaves the log untouched — the control the product is
 *                 sold on, enforced where it cannot be bypassed
 *   4. sign-in    a real account signs in through the same route the app
 *                 uses; a wrong password and an unknown address are refused
 *                 identically
 *   5. identity   no token is 401; a reader token is 403 on write
 *   6. period     a reporting period goes submit -> validate -> approve through
 *                 three different people, and ONLY then moves the position;
 *                 the shortcut of posting it as a bare mutation is refused
 *   7. import     a filled PT_TEMPLATE is read and files nothing
 *   8. validation a mutation that is the wrong shape, the wrong sign or names
 *                 a development that does not exist is refused before any
 *                 control runs; each kind is limited to the roles that own it
 *
 * Every token here names a REAL account. The API asks the users table for
 * the role on every request, so a token for an account that does not exist
 * is refused — which is what stops a removed person keeping their access
 * until their token expires.
 *
 * Requires DATABASE_URL. scripts/local-postgres.sh start prints one.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createHash, createHmac } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\nDATABASE_URL is required. Run: scripts/local-postgres.sh start\n');
  process.exit(1);
}

const SECRET = 'check-api-secret';
const PORT = Number(process.env.API_PORT ?? 4123);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const failures = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

// ---- tokens, minted the same way the API verifies them -----------------
const token = (sub, role) => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({ sub, role, exp: Math.floor(Date.now() / 1000) + 3600 });
  const mac = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${mac}`;
};

// The accounts behind the tokens. Created in the database before the server
// starts, because the server checks the table on every request.
const ACCOUNTS = [
  ['checker@check.test', 'contributor'],
  ['viewer@check.test', 'reader'],
  ['admin@check.test', 'admin'],
  ['reviewer@check.test', 'reviewer'],
  ['approver@check.test', 'approver'],
  ['director@check.test', 'director'],
];
const WRITER = token('checker@check.test', 'contributor');
const READER = token('viewer@check.test', 'reader');
const ADMIN = token('admin@check.test', 'admin');
const REVIEWER = token('reviewer@check.test', 'reviewer');
const APPROVER = token('approver@check.test', 'approver');
const DIRECTOR = token('director@check.test', 'director');

{
  const { execFileSync } = await import('node:child_process');
  const env = { ...process.env, DATABASE_URL };
  execFileSync('npx', ['tsx', 'db/seed.ts', '--reset'], { env, stdio: 'pipe' });
  for (const [email, role] of ACCOUNTS) {
    execFileSync('npx', ['tsx', 'db/user.ts', email, email, role, 'check-api-password'], { env, stdio: 'pipe' });
  }
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });
  // The contributor is assigned the developments the checks certify against.
  for (const id of ['RES-01', 'COM-01']) {
    await pool.query(
      'insert into project_assignments (user_id, project_id) values ($1, $2) on conflict do nothing',
      ['checker@check.test', id],
    );
  }
  await pool.end();
}

const api = async (path, opts = {}) => {
  // A transport failure is a FINDING, not a crash. If the server resets the
  // connection, the check that provoked it must report that, not take the
  // whole suite down with a stack trace in place of the result.
  //
  // AND A REQUEST THAT NEVER ANSWERS IS A FINDING TOO. Without a deadline a
  // deadlocked write path hangs this suite for ever, which reads as a broken
  // gate rather than as the defect it is; on the platform the same hang is a
  // 30s FUNCTION_INVOCATION_TIMEOUT. Nothing here legitimately takes 20s.
  let res;
  try {
    res = await fetch(`${ORIGIN}${path}`, {
      signal: AbortSignal.timeout(20_000),
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token === null ? {} : { Authorization: `Bearer ${opts.token ?? WRITER}` }),
        ...opts.headers,
      },
    });
  } catch (err) {
    return { status: 0, body: { error: `transport: ${err?.cause?.code ?? err?.message ?? err}` } };
  }
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

/**
 * THE PMO CONTROLS MANAGER'S ROAD: propose, and have the Director authorise.
 *
 * Registering, amending, deleting, restoring, closing, reopening and awarding
 * take two people on the platform, so a seat that can only APPROVE gets 202
 * and a row in the queue rather than 200 and a change. That is the feature,
 * not a failure — and it is why every lifecycle act below carries a `reason`
 * and goes through here: the checks are about the LIFECYCLE, and they should
 * read the same whether the act took one signature or two.
 *
 * A response that is not 202 is passed through untouched, so a refusal on the
 * merits still reaches the check that was looking for it.
 */
const authorised = async (proposal) => {
  if (proposal.status !== 202) return proposal;
  const id = proposal.body?.request?.id;
  const decided = await api(`/api/changes/${id}/approve`, {
    method: 'POST', token: DIRECTOR,
    body: JSON.stringify({ note: 'Authorised at the portfolio review' }),
  });
  // The route answers { request, log }; the callers here expect the log, the
  // same shape a direct write returns.
  return decided.status === 200 ? { status: 200, body: decided.body?.log ?? [] } : decided;
};

// ---- boot the server --------------------------------------------------
//
// Refuse to run if something is already listening. An earlier run that died
// without cleaning up leaves a server on this port built from the PREVIOUS
// code, the health check finds it, and the whole suite then reports on code
// that is no longer on disk. That happened while this script was being
// written: it reported an ordering failure that had already been fixed. A gate
// that can silently test the wrong binary is worse than no gate.
{
  let occupied = false;
  try {
    const r = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
    occupied = r.ok;
  } catch { /* nothing there, which is what we want */ }

  if (occupied) {
    console.error(`\nSomething is already listening on ${ORIGIN}.`);
    console.error('Stop it first:  pkill -f "tsx server/server.ts"\n');
    process.exit(1);
  }
}

// PGPOOL_MAX=1 IS THE DEPLOYMENT'S POOL, AND IT IS NOT AN OPTIMISATION HERE.
//
// On Vercel the pool holds a single connection, because a serverless invocation
// is one request and the pooling is on the other side. Locally it holds ten,
// and ten is enough to hide a whole class of defect: code that checks a client
// out of the pool and then asks the pool for another one. With ten spare that
// is invisible; with one it is a deadlock, and the platform ends it at thirty
// seconds as FUNCTION_INVOCATION_TIMEOUT — which is precisely what every
// POST /api/mutations did on the deployment while every gate here passed.
//
// So this gate runs the server the way the deployment runs it. Every write
// below — a certificate, a period approval, registering a development — now
// crosses the one connection the platform gives it.
const server = spawn('npx', ['tsx', 'server/server.ts'], {
  env: {
    ...process.env, DATABASE_URL, AUTH_SECRET: SECRET, PORT: String(PORT), ALLOW_RESET: '1',
    PGPOOL_MAX: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  // Its own process group: `npx` execs tsx which execs node, so killing the
  // pid only kills the shim and leaves the server listening. Killing the
  // group takes the whole tree, which is what stops orphans accumulating.
  detached: true,
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(String(d)));
server.stderr.on('data', (d) => serverLog.push(String(d)));

let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    server.kill('SIGKILL');
  }
};
process.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stop(); process.exit(1); });
}

let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`${ORIGIN}/api/health`);
    if (r.ok) { up = true; break; }
  } catch { /* not listening yet */ }
  await sleep(250);
}
if (!up) {
  console.error('\nAPI did not start.\n' + serverLog.join(''));
  process.exit(1);
}

// ---- the mock, in this process ---------------------------------------
const { DB } = await import('../src/data/index.ts');
const { replayProjects, registersFor } = await import('../src/data/project-state.ts');
const { SHIPPED_PORTFOLIOS, SHIPPED_ROUTES } = await import('../src/domain/portfolios.ts');

const mockProjects = (log) => replayProjects(DB.projects, log);
const mockRegisters = (id, log) => registersFor(id, DB, mockProjects(log), log);

/**
 * A response body that should be an array, or a recorded failure and [].
 *
 * Without this the suite CRASHES when an endpoint errors: the body is an error
 * object, `replayProjects` is handed a non-iterable, and node exits with a
 * stack trace instead of naming the failing check. That is the harness dying
 * in place of the thing it is meant to report on — the same defect the
 * integrity checks hit when they clicked a button whose literal text was
 * "10/10". A gate must survive the failure it exists to detect.
 */
const asArray = (name, body) => {
  if (Array.isArray(body)) return body;
  check(name, false, `expected an array, got ${JSON.stringify(body)?.slice(0, 160)}`);
  return [];
};

/** Deep equality that reports the first path that differs. */
function firstDifference(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null) return `${path || '<root>'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  if (typeof a !== 'object') return `${path || '<root>'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object mismatch`;
  if (Array.isArray(a) && a.length !== b.length) return `${path}.length: ${a.length} vs ${b.length}`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = firstDifference(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

// ---- 0. start clean ---------------------------------------------------
await api('/api/reset', { method: 'POST', token: ADMIN });
check('reset leaves an empty log',
  asArray('GET /api/mutations returns a list', (await api('/api/mutations')).body).length === 0);

// ---- 1. parity on the shipped position --------------------------------
//
// Read as the ADMIN, not as the contributor the rest of this file writes as.
// A project manager now sees only the developments assigned to them, so
// comparing the two repositories through that token would compare the whole
// portfolio against a slice of it and call the difference a defect. Section
// 1b is where that slice is checked, deliberately.
{
  const apiProjects = asArray('GET /api/projects returns a list', (await api('/api/projects', { token: ADMIN })).body);
  const diff = firstDifference(mockProjects([]), apiProjects);
  check('projects identical across both backends', diff === null, diff);

  for (const p of mockProjects([])) {
    const { body: apiRegisters } = await api(`/api/registers/${p.id}`, { token: ADMIN });
    const d = firstDifference(mockRegisters(p.id, []), apiRegisters);
    check(`registers identical for ${p.id}`, d === null, d);
  }

  const { body: corp } = await api('/api/corporate');
  for (const key of ['months', 'scurve', 'roles', 'reports']) {
    const d = firstDifference(DB[key], corp[key]);
    check(`corporate.${key} identical`, d === null, d);
  }
  // THE PORTFOLIOS ARE COMPARED AGAINST WHAT THE FIXTURES BUILD SERVES, not
  // against `DB.portfolios`. Those are two different things since migration
  // 017: `DB.portfolios` is the name list the seed writes into the corporate
  // key/value row, and the corporate PAYLOAD carries the rows — name, tone,
  // reading order — because that is what a screen draws with.
  const dPf = firstDifference([...SHIPPED_PORTFOLIOS], corp.portfolios);
  check('corporate.portfolios identical', dPf === null, dPf);
  const dRt = firstDifference([...SHIPPED_ROUTES], corp.routes);
  check('corporate.routes identical', dRt === null, dRt);
  check('the seeded name list and the portfolio rows agree',
    DB.portfolios.join('|') === corp.portfolios.map((p) => p.name).join('|'),
    `${DB.portfolios.join('|')} vs ${corp.portfolios.map((p) => p.name).join('|')}`);
}

// ---- 2. a write reaches the database and both agree afterwards --------
{
  const ipc = {
    kind: 'ipc',
    at: new Date().toISOString(),
    projectId: 'RES-01',
    certified: 12_000_000,
    retention: 600_000,
    reference: 'CHECK-API-IPC-01',
  };

  const posted = await api('/api/mutations', { method: 'POST', body: JSON.stringify(ipc) });
  check('a valid certificate is accepted', posted.status === 200, JSON.stringify(posted.body));

  const log = asArray('GET /api/mutations returns a list', (await api('/api/mutations')).body);
  check('the change log records it', log.length === 1 && log[0]?.reference === 'CHECK-API-IPC-01');

  const after = asArray('GET /api/projects returns a list after the write',
    (await api('/api/projects', { token: ADMIN })).body);
  const d = firstDifference(mockProjects(log), after);
  check('replayed position identical across both backends', d === null, d);

  const { body: regs } = await api('/api/registers/RES-01');
  const dr = firstDifference(mockRegisters('RES-01', log), regs);
  check('registers re-derived identically after the write', dr === null, dr);
}

// ---- 3. THE NEGATIVE CONTROL -----------------------------------------
//
// No well-formed mutation can break reconciliation on its own: the registers
// are DERIVED from each project's position, so they follow it by construction.
// That is a property of the design, not an excuse to skip the control — it
// means a negative control has to plant the defect somewhere the mutation
// cannot, and then prove the server notices.
//
// So: perturb one development's earned value in the database directly, behind
// the API's back — the drift a bad migration or a hand-edited row would cause.
// The perturbed development must be one that NO mutation has touched: a
// touched project has its registers re-derived from its current position, so
// they would follow the perturbation rather than disagree with it. MXU-01 is
// untouched here, so it keeps its authored registers, which now contradict the
// perturbed figure. The server must then refuse an otherwise perfectly valid
// certificate for a DIFFERENT development, because the system as a whole no
// longer reconciles.
//
// Then the perturbation is undone and the identical request is replayed. It
// must succeed. Without that second half the refusal proves nothing — it could
// have been the request rather than the fault.
{
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const perturb = (delta) =>
    pool.query('update projects set ev = ev + $1 where id = $2', [delta, 'MXU-01']);

  const valid = {
    kind: 'ipc',
    at: new Date().toISOString(),
    projectId: 'RES-01',
    certified: 5_000_000,
    retention: 250_000,
    reference: 'CHECK-API-NEGATIVE',
  };

  const before = asArray('log readable before the perturbation',
    (await api('/api/mutations')).body).length;

  await perturb(5_000_000);
  const refused = await api('/api/mutations', { method: 'POST', body: JSON.stringify(valid) });
  check('a write onto a system that no longer reconciles is refused',
    refused.status === 422, `status ${refused.status}`);
  check('the refusal names the failing control',
    typeof refused.body?.error === 'string' && /control/i.test(refused.body.error),
    JSON.stringify(refused.body));

  const during = asArray('log readable during the perturbation',
    (await api('/api/mutations')).body).length;
  check('the refused mutation was not recorded', during === before, `${before} -> ${during}`);

  await perturb(-5_000_000);
  const accepted = await api('/api/mutations', { method: 'POST', body: JSON.stringify(valid) });
  check('the identical request succeeds once the defect is removed',
    accepted.status === 200, `status ${accepted.status}: ${JSON.stringify(accepted.body)}`);

  await pool.end();
}

// ---- 4. sign-in -------------------------------------------------------
//
// A real account, created through the same command an administrator would run,
// then signed in through the same route the app uses.
{
  const { execFileSync } = await import('node:child_process');
  const EMAIL = 'gate-check@tazayud.test';
  const PASSWORD = 'correct-horse-battery-staple';

  execFileSync('npx', ['tsx', 'db/user.ts', EMAIL, 'Gate Check', 'contributor', PASSWORD],
    { env: { ...process.env, DATABASE_URL }, stdio: 'pipe' });

  const good = await api('/api/auth/login', {
    method: 'POST', token: null,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check('a correct password signs in', good.status === 200, `status ${good.status}`);
  check('sign-in returns a token and the account',
    typeof good.body?.token === 'string' && good.body?.user?.role === 'contributor',
    JSON.stringify(good.body)?.slice(0, 120));

  // The address is deliberately capitalised differently. Nobody should fail to
  // sign in over capitals.
  const cased = await api('/api/auth/login', {
    method: 'POST', token: null,
    body: JSON.stringify({ email: EMAIL.toUpperCase(), password: PASSWORD }),
  });
  check('the email is matched case-insensitively', cased.status === 200, `status ${cased.status}`);

  const wrong = await api('/api/auth/login', {
    method: 'POST', token: null,
    body: JSON.stringify({ email: EMAIL, password: 'not-the-password' }),
  });
  check('a wrong password is refused', wrong.status === 401, `status ${wrong.status}`);

  const unknown = await api('/api/auth/login', {
    method: 'POST', token: null,
    body: JSON.stringify({ email: 'nobody@tazayud.test', password: PASSWORD }),
  });
  check('an unknown address is refused', unknown.status === 401, `status ${unknown.status}`);
  // Same wording for both: telling them apart tells an attacker which
  // addresses are real.
  check('wrong password and unknown address are indistinguishable',
    JSON.stringify(wrong.body) === JSON.stringify(unknown.body),
    `${JSON.stringify(wrong.body)} vs ${JSON.stringify(unknown.body)}`);

  // The token minted by sign-in must work on a real route.
  const me = await api('/api/me', { token: good.body?.token });
  check('the issued token authenticates', me.status === 200, `status ${me.status}`);
}

// ---- 5. identity ------------------------------------------------------
{
  const anon = await api('/api/projects', { token: null });
  check('no token is refused', anon.status === 401, `status ${anon.status}`);

  const reader = await api('/api/mutations', {
    method: 'POST',
    token: READER,
    body: JSON.stringify({
      kind: 'ipc', at: new Date().toISOString(), projectId: 'RES-01',
      certified: 1, retention: 0, reference: 'READER',
    }),
  });
  check('a reader may not write', reader.status === 403, `status ${reader.status}`);

  const garbage = await api('/api/projects', { token: 'not.a.token' });
  check('a malformed token is refused', garbage.status === 401, `status ${garbage.status}`);
}

// ---- 6. ENTERING A REPORTING PERIOD -----------------------------------
//
// The point of the whole product, exercised end to end: a project manager
// submits the figures from PT_TEMPLATE, a second person validates them, a
// third approves them, and ONLY THEN does the reported position move. Earned
// value is COMPUTED from the work packages rather than typed, and the system
// refuses a submission whose figures do not reconcile.
//
// The shortcut — posting the period straight to /api/mutations as if it were
// a certificate — used to be accepted, and this very section used to assert
// that it was. That was a way to file a period for any development with one
// request and nobody else's signature. It is refused now, and that refusal
// is the first thing checked here.
{
  await api('/api/reset', { method: 'POST', token: ADMIN });

  // Section 4 of the template. The packages must break down the CONTROL
  // budget — that is the identity control 1 checks, and the same one the
  // spreadsheet checks at its own total row. Their cost incurred (720M) is
  // at least what RES-01 has certified to date (671.5M): control 15 refuses
  // a period that reports less cost than has already been certified, and
  // the first draft of this data did exactly that (283M) — again the engine
  // catching the mistake a real submission would make.
  const packages = [
    { code: '1.2', name: 'Project Management Consultancy', phase: '01 Preliminaries',
      budget: 200_000_000, plannedPct: 0.95, actualPct: 0.95, cost: 190_000_000, committed: 200_000_000 },
    { code: '3.1', name: 'Substructure, Piling & Foundations', phase: '03 Contract Package A',
      budget: 500_000_000, plannedPct: 0.78, actualPct: 0.75, cost: 360_000_000, committed: 480_000_000 },
    { code: '5.1', name: 'Architectural Fit-Out & Finishes', phase: '05 Contract Package C',
      budget: 487_500_000, plannedPct: 0.38, actualPct: 0.32, cost: 170_000_000, committed: 240_000_000 },
  ];
  const control = packages.reduce((t, k) => t + k.budget, 0);

  const period = {
    kind: 'period:submit',
    at: new Date().toISOString(),
    projectId: 'RES-01',
    period: 9,
    dataDate: '30 September',
    budget: 1_250_000_000,
    control,
    afc: 1_080_000_000,
    packages,
    // Section 5. The category AFCs must sum to the project's adopted AFC —
    // control 6. The first draft of this test data summed to 1,200M against an
    // adopted 1,080M and the server refused it, which is the engine doing
    // exactly its job on exactly the mistake a real submission would make.
    categories: [
      { cat: 'Design & Engineering Consultancy', budget: 200_000_000, committed: 200_000_000, actual: 190_000_000, afc: 205_000_000 },
      { cat: 'Main Works Contracts — Civil & Structural', budget: 500_000_000, committed: 480_000_000, actual: 360_000_000, afc: 505_000_000 },
      { cat: 'MEP & Specialist Works Contracts', budget: 487_500_000, committed: 240_000_000, actual: 170_000_000, afc: 370_000_000 },
    ],
  };

  // ---- the shortcut is refused ----
  const shortcut = await api('/api/mutations', { method: 'POST', body: JSON.stringify(period) });
  check('a period posted as a bare mutation is refused', shortcut.status === 403,
    `status ${shortcut.status}: ${JSON.stringify(shortcut.body)?.slice(0, 160)}`);
  check('the refusal says where periods go',
    typeof shortcut.body?.error === 'string' && shortcut.body.error.includes('/api/periods'),
    JSON.stringify(shortcut.body)?.slice(0, 160));
  check('the shortcut recorded nothing',
    asArray('log after the shortcut', (await api('/api/mutations')).body).length === 0);

  // ---- the road: submit ----
  const submitted = await api('/api/periods', { method: 'POST', body: JSON.stringify(period) });
  check('a reporting period is submitted', submitted.status === 200,
    `status ${submitted.status}: ${JSON.stringify(submitted.body)?.slice(0, 200)}`);
  const submissionId = submitted.body?.id;
  check('a submitted period is NOT yet in the position',
    asArray('log after submit', (await api('/api/mutations')).body).length === 0);

  // ---- validate, by a different person ----
  const reviewed = await api(`/api/periods/${submissionId}/review`, { method: 'POST', token: REVIEWER, body: '{}' });
  check('a reviewer validates it', reviewed.status === 200,
    `status ${reviewed.status}: ${JSON.stringify(reviewed.body)?.slice(0, 160)}`);
  check('a validated period is STILL not in the position',
    asArray('log after review', (await api('/api/mutations')).body).length === 0);

  // ---- approve, by a third ----
  const approved = await api(`/api/periods/${submissionId}/approve`, { method: 'POST', token: APPROVER, body: '{}' });
  check('an approver signs it off', approved.status === 200,
    `status ${approved.status}: ${JSON.stringify(approved.body)?.slice(0, 160)}`);

  const log = asArray('log after approval', (await api('/api/mutations')).body);
  check('approval is what puts the period into the position',
    log.length === 1 && log[0]?.kind === 'period:submit', `${log.length} mutations`);

  const projects = asArray('projects after the period', (await api('/api/projects', { token: ADMIN })).body);
  const res01 = projects.find((p) => p.id === 'RES-01');

  // Earned value is a CONSEQUENCE of the packages, not an input. This is the
  // check that proves it: recompute the sum here and require the API to agree.
  const expectedEv = Math.round(packages.reduce((t, k) => t + k.budget * k.actualPct, 0));
  const expectedPv = Math.round(packages.reduce((t, k) => t + k.budget * k.plannedPct, 0));
  const expectedAc = packages.reduce((t, k) => t + k.cost, 0);

  check('earned value is computed from the work packages', res01?.ev === expectedEv,
    `${res01?.ev} vs ${expectedEv}`);
  check('planned value is computed from the work packages', res01?.pv === expectedPv,
    `${res01?.pv} vs ${expectedPv}`);
  check('actual cost is the sum of package cost incurred', res01?.actual === expectedAc,
    `${res01?.actual} vs ${expectedAc}`);

  // Both backends must agree about an entered period too.
  const d = firstDifference(mockProjects(log), projects);
  check('entered period replays identically on both backends', d === null, d);

  const regs = (await api('/api/registers/RES-01')).body;
  const dr = firstDifference(mockRegisters('RES-01', log), regs);
  check('entered registers identical on both backends', dr === null, dr);
  // The entered rows are the leaves; every parent their codes imply ("3" for
  // "3.1") is rolled up above them, and the root restates the development.
  const impliedParents = new Set(packages.map((k) => k.code.split('.')[0])).size;
  check('the WBS register carries the entered packages',
    regs?.wbs?.length === packages.length + impliedParents + 1
      && packages.every((k) => regs.wbs.some((r) => r.code === k.code)),
    `${regs?.wbs?.length} rows`);

  // ---- an approved period cannot be quietly replaced ----
  const replay = await api('/api/periods', { method: 'POST', body: JSON.stringify({ ...period, at: new Date().toISOString() }) });
  check('re-submitting an approved period is refused', replay.status === 409,
    `status ${replay.status}: ${JSON.stringify(replay.body)?.slice(0, 160)}`);
  check('the approval record survives the attempt',
    (await api('/api/periods')).body?.find?.((s) => s.id === submissionId)?.state === 'approved');

  // ---- the refusal that is the product ----
  // Packages that do not break down the control budget cannot reconcile. The
  // spreadsheet flags this; the platform must refuse to record it.
  const broken = structuredClone(period);
  broken.at = new Date().toISOString();
  broken.period = 10;
  broken.control = control + 25_000_000;
  const refused = await api('/api/periods', { method: 'POST', body: JSON.stringify(broken) });
  check('a period whose packages do not sum to the control budget is refused',
    refused.status === 422, `status ${refused.status}`);

  await api('/api/reset', { method: 'POST', token: ADMIN });
}

// ---- 10. CLOSING A DEVELOPMENT OUT ------------------------------------
//
// The third lifecycle state, and the one with teeth: a closed development is
// FROZEN. Archiving hides a cancelled development; closing settles a delivered
// one and leaves it on the record, readable, with its figures final.
//
// What is proven here is the freeze, because that is the part a person is
// entitled to rely on. If a certificate can still land on a settled final
// account then "closed" is decoration, and the closing figures are not final
// at all — they are just the last ones anybody happened to enter.
{
  const at = new Date().toISOString();
  // `reason` rides alongside every lifecycle act: it is what the Director
  // reads where the seat proposes, and is stripped from the stored mutation
  // either way. `authorised` then takes a 202 through the queue, so these
  // checks read as the lifecycle they are about.
  const close = async (id, token, note = 'Final account agreed, ref FA-01') => authorised(await api('/api/mutations', {
    method: 'POST', token, body: JSON.stringify({ kind: 'project:close', at, projectId: id, note, reason: note || 'closing out' }),
  }));
  const reopen = async (id, token, note = 'Retention release outstanding') => authorised(await api('/api/mutations', {
    method: 'POST', token, body: JSON.stringify({ kind: 'project:reopen', at, projectId: id, note, reason: note }),
  }));
  const certificate = (id, token) => api('/api/mutations', {
    method: 'POST', token, body: JSON.stringify({
      kind: 'ipc', at, projectId: id, certified: 1_000_000, retention: 50_000, reference: 'CLOSE-TEST',
    }),
  });

  check('a contributor may not close a development out', (await close('RES-02')).status === 403);
  check('a reviewer may not close a development out', (await close('RES-02', REVIEWER)).status === 403);
  check('a reader may not close a development out', (await close('RES-02', READER)).status === 403);
  check('a closure with no reason is refused',
    (await close('RES-02', APPROVER, '')).status === 400);

  const closed = await close('RES-02', APPROVER);
  check('the PMO manager may close a development out',
    closed.status === 200, `status ${closed.status}: ${closed.body?.error ?? ''}`);

  // It is STILL THERE. This is the whole difference from archiving, and the
  // owner's requirement in one assertion: available for view and for
  // documentation, not hidden behind a seat that can restore it.
  const after = asArray('projects after the closure', (await api('/api/projects', { token: ADMIN })).body);
  const it = after.find((p) => p.id === 'RES-02');
  check('a closed development stays in the portfolio and is readable', Boolean(it));
  check('it carries the closeout date and the reason',
    Boolean(it?.closedAt) && /Final account/.test(it?.closeNote ?? ''),
    JSON.stringify({ closedAt: it?.closedAt, closeNote: it?.closeNote }));
  check('its registers are still served',
    (await api('/api/registers/RES-02', { token: ADMIN })).status === 200);

  // ---- frozen ---------------------------------------------------------
  const refusedIpc = await certificate('RES-02', ADMIN);
  check('a certificate against a closed development is refused, even for an admin',
    refusedIpc.status === 403 && /closed out/.test(refusedIpc.body?.error ?? ''),
    `status ${refusedIpc.status}: ${refusedIpc.body?.error ?? ''}`);

  const refusedAmend = await api('/api/mutations', {
    method: 'POST', token: APPROVER, body: JSON.stringify({
      kind: 'project:update', at, projectId: 'RES-02', name: 'Renamed While Closed',
      note: 'try it', reason: 'try it',
    }),
  });
  check('an amendment to a closed development is refused',
    refusedAmend.status === 403 && /closed out/.test(refusedAmend.body?.error ?? ''),
    `status ${refusedAmend.status}: ${refusedAmend.body?.error ?? ''}`);

  // A VALID body, so the refusal proves the freeze and not the validator.
  // The first version of this check posted a malformed period and asserted
  // status >= 400 — which the 400 for the malformed body satisfied, so the
  // gate stayed green while a well-formed period sailed through /api/periods
  // onto a closed development: that route never consulted the freeze at all.
  const refusedPeriod = await api('/api/periods', {
    method: 'POST', token: ADMIN, body: JSON.stringify({
      kind: 'period:submit', at, projectId: 'RES-02', period: 9, dataDate: '30 Sep 2026',
      budget: 980_000_000, control: 833_000_000, afc: 970_000_000,
      packages: [{ code: '1', name: 'Works', phase: 'P1', budget: 833_000_000,
        plannedPct: 0.51, actualPct: 0.51, cost: 425_000_000, committed: 680_000_000 }],
      categories: [{ cat: 'Works', budget: 833_000_000, committed: 680_000_000,
        actual: 425_000_000, afc: 823_000_000 },
      { cat: 'Contingency', budget: 147_000_000, committed: 0, actual: 0, afc: 147_000_000 }],
    }),
  });
  check('a well-formed period is refused against a closed development, with the reason',
    refusedPeriod.status === 403 && /closed out/.test(refusedPeriod.body?.error ?? ''),
    `status ${refusedPeriod.status}: ${JSON.stringify(refusedPeriod.body)?.slice(0, 160)}`);

  check('closing an already closed development is refused',
    (await close('RES-02', APPROVER)).status === 403);

  // ---- and reversible -------------------------------------------------
  check('a contributor may not reopen one', (await reopen('RES-02')).status === 403);
  const reopened = await reopen('RES-02', APPROVER);
  check('the PMO manager may reopen it',
    reopened.status === 200, `status ${reopened.status}: ${reopened.body?.error ?? ''}`);

  const back = asArray('projects after the reopening', (await api('/api/projects', { token: ADMIN })).body)
    .find((p) => p.id === 'RES-02');
  check('a reopened development carries no closure', !back?.closedAt && !back?.closeNote,
    JSON.stringify({ closedAt: back?.closedAt, closeNote: back?.closeNote }));
  check('reopening a development that is not closed is refused',
    (await reopen('RES-02', APPROVER)).status === 403);
  // The freeze is lifted — proven two ways, and neither of them by picking an
  // amount that happens to fit. A certificate is no longer refused FOR BEING
  // CLOSED (control 15 still bounds it by actual cost, as it bounds every
  // certificate, and that is a different refusal with a different meaning),
  // and an amendment — refused outright a moment ago — is now recorded.
  const acceptsAgain = await certificate('RES-02', ADMIN);
  check('a certificate is no longer refused for being closed',
    !/closed out/.test(acceptsAgain.body?.error ?? ''),
    `status ${acceptsAgain.status}: ${acceptsAgain.body?.error ?? ''}`);

  const amendAgain = await authorised(await api('/api/mutations', {
    method: 'POST', token: APPROVER, body: JSON.stringify({
      kind: 'project:update', at, projectId: 'RES-02', name: 'Rimal Heights',
      note: 'reopened, name confirmed', reason: 'reopened, name confirmed',
    }),
  }));
  check('and it accepts an amendment again',
    amendAgain.status === 200, `status ${amendAgain.status}: ${amendAgain.body?.error ?? ''}`);

  await api('/api/reset', { method: 'POST', token: ADMIN });
}

// ---- 7. IMPORTING A FILLED PT_TEMPLATE --------------------------------
//
// The second door onto the same schema. The import must produce exactly what
// the form produces, arrive at the same validation, and refuse a workbook
// whose structure has drifted rather than read figures from the wrong rows.
{
  const { readFileSync } = await import('node:fs');

  // The real workbook that ships with the repository, not a fixture of it.
  const file = readFileSync('excel/Tazayud_Owner_PMO_Integrated_Controls_System.xlsm');

  // Wrapped as the app sends it, so the body is JSON under the JSON content
  // type — a host that parses bodies first (Vercel) refuses a bare string.
  const parsed = await api('/api/periods/parse?project=RES-01', {
    method: 'POST',
    body: JSON.stringify({ file: file.toString('base64') }),
  });
  check('a filled PT_TEMPLATE is read', parsed.status === 200,
    `${parsed.status}: ${JSON.stringify(parsed.body)?.slice(0, 200)}`);

  const period = parsed.body?.period;
  check('the import produces the same shape the form produces',
    period?.kind === 'period:submit'
      && Array.isArray(period?.packages) && Array.isArray(period?.categories),
    JSON.stringify(period)?.slice(0, 160));

  // It must choose the DEVELOPMENT'S OWN sheet, not the blank template. The
  // workbook contains both, and reading the template for a real project would
  // file a period of zeros that looks perfectly well-formed.
  check("the import reads the development's own sheet, not the blank template",
    parsed.body?.summary?.sheet === 'PT_RES-01', parsed.body?.summary?.sheet);

  // The sheet's own PROJECT TOTAL row, read here independently of the import.
  // If the import took the wrong column or the wrong sheet, these disagree.
  const sheetTotal = 87_767_785;
  const total = period?.packages?.reduce((t, p) => t + p.budget, 0) ?? 0;
  check("package budgets total to the sheet's own PROJECT TOTAL",
    total === sheetTotal, `${total} vs ${sheetTotal}`);

  check('work packages were read', (period?.packages?.length ?? 0) > 0,
    `${period?.packages?.length ?? 0} packages`);
  check('cost categories were read', (period?.categories?.length ?? 0) > 0,
    `${period?.categories?.length ?? 0} categories`);

  // ---- negative controls ----
  //
  // Silent mis-import is the failure mode that matters, so a workbook whose
  // structure has drifted must be REFUSED rather than read from the wrong
  // rows. That needs a workbook that is VALID but WRONG: rubbish bytes only
  // exercise the zip reader, and a negative control proved it — removing the
  // structure check entirely broke nothing, because nothing reached it.
  //
  // So one is built here: a real xlsx, stored uncompressed, with a PT_ sheet
  // whose section headers are not where the template puts them.
  const wrongWorkbook = (() => {
    const parts = [
      ['xl/workbook.xml',
        '<?xml version="1.0"?><workbook xmlns:r="r"><sheets>'
        + '<sheet name="PT_WRONG" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels',
        '<?xml version="1.0"?><Relationships>'
        + '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
      ['xl/worksheets/sheet1.xml',
        '<?xml version="1.0"?><worksheet><sheetData><row r="6">'
        + '<c r="A6" t="inlineStr"><is><t>Something else entirely</t></is></c>'
        + '</row></sheetData></worksheet>'],
    ];

    // A minimal zip, stored (method 0), written by hand so the check needs no
    // archiving dependency of its own.
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc32 = (buf) => {
      let c = 0xffffffff;
      for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };

    const locals = [];
    const central = [];
    let offset = 0;

    for (const [name, xml] of parts) {
      const nameBuf = Buffer.from(name);
      const data = Buffer.from(xml);
      const crc = crc32(data);

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      locals.push(local, nameBuf, data);

      const dir = Buffer.alloc(46);
      dir.writeUInt32LE(0x02014b50, 0);
      dir.writeUInt16LE(20, 6);
      dir.writeUInt32LE(crc, 16);
      dir.writeUInt32LE(data.length, 20);
      dir.writeUInt32LE(data.length, 24);
      dir.writeUInt16LE(nameBuf.length, 28);
      dir.writeUInt32LE(offset, 42);
      central.push(dir, nameBuf);

      offset += 30 + nameBuf.length + data.length;
    }

    const body = Buffer.concat(locals);
    const dirBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(parts.length, 8);
    end.writeUInt16LE(parts.length, 10);
    end.writeUInt32LE(dirBuf.length, 12);
    end.writeUInt32LE(body.length, 16);

    return Buffer.concat([body, dirBuf, end]);
  })();

  const drifted = await api('/api/periods/parse?project=RES-01', {
    method: 'POST', body: wrongWorkbook.toString('base64'),
  });
  check('a workbook whose structure has drifted is refused', drifted.status === 422,
    `status ${drifted.status}: ${JSON.stringify(drifted.body)?.slice(0, 140)}`);
  check('the refusal names the row that moved',
    typeof drifted.body?.error === 'string' && /row \d+/.test(drifted.body.error),
    JSON.stringify(drifted.body)?.slice(0, 160));

  const notAWorkbook = Buffer.from('this is not a spreadsheet at all');
  const rejected = await api('/api/periods/parse?project=RES-01', {
    method: 'POST', body: notAWorkbook.toString('base64'),
  });
  check('something that is not a workbook is refused', rejected.status >= 400,
    `status ${rejected.status}`);

  const noProject = await api('/api/periods/parse', {
    method: 'POST', body: file.toString('base64'),
  });
  check('an import without a development is refused', noProject.status === 400,
    `status ${noProject.status}`);

  // Parsing must not file anything. An import that wrote straight into the
  // workflow would be a way to enter data without looking at it.
  const log = asArray('log after parsing', (await api('/api/mutations')).body);
  check('parsing a workbook files nothing', log.length === 0, `${log.length} mutations`);
}

// ---- 8. VALIDATION AND WHO MAY DO WHAT ----------------------------------
//
// The reconciliation controls check that figures agree with each other. They
// cannot check that a figure is a number, or that a riyal amount is not
// negative — a negative certificate passed all ten, because a touched
// development's registers are re-derived from the very figure it corrupted.
// So shape and range are checked first, and each kind is limited to the
// roles that own it.
{
  await api('/api/reset', { method: 'POST', token: ADMIN });
  const at = new Date().toISOString();
  const post = (body, token) => api('/api/mutations', { method: 'POST', body: JSON.stringify(body), ...(token ? { token } : {}) });
  const expect = async (name, body, status, token) => {
    const r = await post(body, token);
    check(name, r.status === status, `status ${r.status}: ${JSON.stringify(r.body)?.slice(0, 140)}`);
    return r;
  };

  await expect('a negative certificate is refused',
    { kind: 'ipc', at, projectId: 'RES-01', certified: -500_000_000, retention: 0, reference: 'NEG' }, 400);
  await expect('retention above the certified value is refused',
    { kind: 'ipc', at, projectId: 'RES-01', certified: 1_000, retention: 2_000, reference: 'RET' }, 400);
  await expect('a number sent as text is refused, not concatenated',
    { kind: 'ipc', at, projectId: 'RES-01', certified: '5000000', retention: 0, reference: 'STR' }, 400);
  await expect('a certificate for a development that does not exist is refused',
    { kind: 'ipc', at, projectId: 'ZZZ-99', certified: 1_000, retention: 0, reference: 'GHOST' }, 400);
  await expect('a mutation with a bad timestamp is refused',
    { kind: 'ipc', at: 'not-a-date', projectId: 'RES-01', certified: 1_000, retention: 0, reference: 'AT' }, 400);
  await expect('a certificate for an unassigned development is refused',
    { kind: 'ipc', at, projectId: 'MXU-01', certified: 1_000, retention: 0, reference: 'UNASSIGNED' }, 403);
  await expect('a reviewer may not record a certificate',
    { kind: 'ipc', at, projectId: 'RES-01', certified: 1_000, retention: 0, reference: 'REV' }, 403, REVIEWER);
  // ---- payment claims ------------------------------------------------
  //
  // A claim carries an APPROVAL, so it is stricter than a certificate: the
  // contributor assigned to the development may record a certificate and may
  // NOT record a claim.
  const claim = (over) => ({
    kind: 'claim:record', at, projectId: 'RES-01', packageId: 'PR-004',
    milestone: 'M-05 Riser installation', claimed: 5_000_000,
    verifiedBy: 'Ledger Quantity Surveyors', verifiedOn: '2026-06-05',
    verifiedRef: 'VR-901', verified: 4_800_000, approved: 4_700_000,
    retentionRate: 5, reference: 'CHECK-API-CLAIM', ...over,
  });

  await expect('a contributor may not record a payment claim',
    claim({ reference: 'CLAIM-CONTRIB' }), 403);
  await expect('a reviewer may not record a payment claim',
    claim({ reference: 'CLAIM-REV' }), 403, REVIEWER);
  await expect('an approval above what the consultant verified is refused',
    claim({ approved: 4_900_000, reference: 'CLAIM-OVER' }), 400, APPROVER);
  await expect('a verification above what was claimed is refused',
    claim({ verified: 6_000_000, reference: 'CLAIM-VERIF' }), 400, APPROVER);
  await expect('a retention rate above 100 per cent is refused',
    claim({ retentionRate: 140, reference: 'CLAIM-RATE' }), 400, APPROVER);
  await expect('a retention rate sent as text is refused',
    claim({ retentionRate: '5', reference: 'CLAIM-RATESTR' }), 400, APPROVER);
  await expect('a claim against a development that does not exist is refused',
    claim({ projectId: 'ZZZ-99', reference: 'CLAIM-GHOST' }), 400, APPROVER);

  const accepted = await expect('an approver records a payment claim',
    claim({ reference: 'CHECK-API-CLAIM-01' }), 200, APPROVER);
  if (accepted.status === 200) {
    const log2 = asArray('the log after the claim', (await api('/api/mutations')).body);
    const recorded = log2.find((m) => m.reference === 'CHECK-API-CLAIM-01');
    check('the claim is in the change log', recorded !== undefined);

    const after2 = asArray('projects after the claim',
      (await api('/api/projects', { token: ADMIN })).body);
    const d2 = firstDifference(mockProjects(log2), after2);
    check('position identical across both backends after a claim', d2 === null, d2);

    const { body: regs2 } = await api('/api/registers/RES-01', { token: ADMIN });
    const dr2 = firstDifference(mockRegisters('RES-01', log2), regs2);
    check('claim register identical across both backends', dr2 === null, dr2);

    const row = (regs2?.claims ?? []).find((c) => c.id === 'CHECK-API-CLAIM-01');
    check('the recorded claim appears in the register', row !== undefined,
      JSON.stringify((regs2?.claims ?? []).map((c) => c.id)));
    check('retention is the rate applied to the approval, not a typed figure',
      row?.retention === 235_000, `retention ${row?.retention}`);
    check('the transfer is the approval less the retention',
      row?.paid === 4_465_000, `paid ${row?.paid}`);

    const sumApproved = (regs2?.claims ?? []).reduce((a2, c) => a2 + (c.approved ?? 0), 0);
    const sumPaid = (regs2?.claims ?? []).reduce((a2, c) => a2 + c.paid, 0);
    const proj = after2.find((x) => x.id === 'RES-01');
    check('control 19 holds after the claim: approvals sum to certified',
      sumApproved === proj?.ipcSubmitted, `${sumApproved} vs ${proj?.ipcSubmitted}`);
    check('control 20 holds after the claim: transfers sum to paid',
      sumPaid === proj?.paid, `${sumPaid} vs ${proj?.paid}`);
  }

  // ---- confirming that a payment was made ----------------------------
  //
  // PAID IS CONFIRMED, NEVER INFERRED. Approving a claim says what a
  // contractor is owed; this says the money left the account, and it is the
  // PMO manager's act alone. It moves `paid` and NOTHING else — the checks
  // below prove that certified did not move with it, because a payment that
  // also certified would count the same milestone twice against one budget.
  const pay = (over) => ({
    kind: 'claim:pay', at, projectId: 'RES-01', claimId: 'CHECK-API-CLAIM-01',
    amount: 1_000_000, valueDate: '2026-10-15', reference: 'CHECK-API-PAY', ...over,
  });

  await expect('a contributor may not confirm a payment', pay({}), 403);
  await expect('a reviewer may not confirm a payment', pay({}), 403, REVIEWER);
  await expect('a payment of nothing is refused',
    pay({ amount: 0 }), 400, APPROVER);
  await expect('a negative payment is refused',
    pay({ amount: -5_000_000 }), 400, APPROVER);
  await expect('an amount sent as text is refused, not concatenated',
    pay({ amount: '1000000' }), 400, APPROVER);
  await expect('a payment against a development that does not exist is refused',
    pay({ projectId: 'ZZZ-99' }), 400, APPROVER);

  {
    const before = asArray('projects before the payment',
      (await api('/api/projects', { token: ADMIN })).body).find((x) => x.id === 'RES-01');
    // Control 14 bounds a transfer at what has been certified. Asking for
    // everything certified plus a riyal must come back 422 with a reason,
    // not 500 and not silently accepted.
    const over = await expect('a transfer above certified is refused by control 14',
      pay({ amount: (before?.ipcSubmitted ?? 0) - (before?.paid ?? 0) + 1, reference: 'PAY-OVER' }),
      422, APPROVER);
    check('the refusal names the control rather than failing generically',
      JSON.stringify(over.body ?? {}).toLowerCase().includes('paid'),
      JSON.stringify(over.body)?.slice(0, 160));

    const ok = await expect('the PMO manager confirms a payment',
      pay({ amount: 1_000_000, reference: 'CHECK-API-PAY-01' }), 200, APPROVER);
    if (ok.status === 200) {
      const log3 = asArray('the log after the payment', (await api('/api/mutations')).body);
      check('the payment is in the change log',
        log3.some((m) => m.kind === 'claim:pay' && m.reference === 'CHECK-API-PAY-01'));

      const after3 = asArray('projects after the payment',
        (await api('/api/projects', { token: ADMIN })).body);
      const d3 = firstDifference(mockProjects(log3), after3);
      check('position identical across both backends after a payment', d3 === null, d3);

      const now = after3.find((x) => x.id === 'RES-01');
      check('paid moved by exactly the amount transferred',
        now?.paid === (before?.paid ?? 0) + 1_000_000,
        `${before?.paid} -> ${now?.paid}`);
      check('certified did NOT move: a transfer is not a certification',
        now?.ipcSubmitted === before?.ipcSubmitted,
        `${before?.ipcSubmitted} -> ${now?.ipcSubmitted}`);
      check('actual cost did NOT move: cost comes from the period',
        now?.actual === before?.actual, `${before?.actual} -> ${now?.actual}`);
      check('earned value did NOT move: a payment is not progress',
        now?.ev === before?.ev, `${before?.ev} -> ${now?.ev}`);

      const { body: regs3 } = await api('/api/registers/RES-01', { token: ADMIN });
      const dr3 = firstDifference(mockRegisters('RES-01', log3), regs3);
      check('claim register identical across both backends after a payment', dr3 === null, dr3);
      const paidSum = (regs3?.claims ?? []).reduce((a2, c) => a2 + c.paid, 0);
      check('control 20 still holds: transfers sum to paid',
        paidSum === now?.paid, `${paidSum} vs ${now?.paid}`);
    }
  }

  // ---- the new-development workbook, both ways -----------------------
  {
    const { buildProjectTemplate } = await import('../server/project-template.ts');
    const { writeWorkbook } = await import('../server/xlsx-write.ts');

    const denied = await api('/api/projects/template');
    check('a contributor may not download the new-development template',
      denied.status === 403, `status ${denied.status}`);

    const got = await api('/api/projects/template', { token: APPROVER });
    check('an approver downloads the new-development template', got.status === 200,
      `status ${got.status}`);
    const served = Buffer.from(got.body?.base64 ?? '', 'base64');
    check('the served template is the workbook this build produces',
      served.equals(buildProjectTemplate()), `${served.length} bytes`);

    // Feed the served bytes back to the importer. A template the importer
    // refuses is a round trip that only looks complete.
    const back = await api('/api/projects/parse', {
      method: 'POST', token: APPROVER,
      body: JSON.stringify({ file: served.toString('base64') }),
    });
    check('the importer accepts the template it serves', back.status === 200,
      `status ${back.status}: ${JSON.stringify(back.body)?.slice(0, 160)}`);

    // A workbook that opens but whose columns have moved must be refused,
    // not read confidently and wrongly.
    const moved = writeWorkbook([
      { name: '1 Project', rows: [['Field', 'Value'], ['Project ID', ''], ['Project Name', ''],
        ['Portfolio', ''], ['Delivery Route', ''], ['Approved Budget (SAR)', '']] },
      { name: '2 Packages', rows: [['Package / Scope', 'WBS Code', 'Package Budget (SAR)']] },
      { name: '3 Contracts', rows: [['Package No.', 'Contract / Scope', 'WBS Code', 'Contractor',
        'Role', 'Award Value (SAR)', 'Retention %', 'Award Date (YYYY-MM-DD)']] },
    ]);
    const bad = await api('/api/projects/parse', {
      method: 'POST', token: APPROVER,
      body: JSON.stringify({ file: Buffer.from(moved).toString('base64') }),
    });
    check('a workbook whose columns have moved is refused', bad.status === 422,
      `status ${bad.status}: ${JSON.stringify(bad.body)?.slice(0, 120)}`);

    // A filled workbook, read and then registered.
    const filled = writeWorkbook([
      { name: '1 Project', rows: [['Field', 'Value'],
        ['Project ID', 'RES-07'], ['Project Name', 'Wadi Heights'],
        ['Portfolio', 'Residential'], ['Delivery Route', 'PMC-Delivered'],
        ['Approved Budget (SAR)', 900_000_000]] },
      { name: '2 Packages', rows: [['WBS Code', 'Package / Scope', 'Package Budget (SAR)'],
        ['1.1', 'Pre-Construction', 60_000_000], ['1.2', 'Substructure', 240_000_000],
        ['1.3', 'Superstructure', 405_000_000], ['1.4', 'MEP', 150_000_000]] },
      { name: '3 Contracts', rows: [['Package No.', 'Contract / Scope', 'WBS Code', 'Contractor',
        'Role', 'Award Value (SAR)', 'Retention %', 'Award Date (YYYY-MM-DD)'],
        ['PKG-01', 'Enabling works', '1.1', 'Arjan Contracting', 'Trade Contractor', 55_000_000, 5, '2026-03-01'],
        ['PKG-02', 'Substructure', '1.2', 'BuildTech Co.', 'Main Contractor', 230_000_000, 5, '2026-04-10'],
        ['PKG-03', 'Superstructure', '1.3', 'BuildTech Co.', 'Main Contractor', 380_000_000, 5, '']] },
    ]);
    const parsedProject = await api('/api/projects/parse', {
      method: 'POST', token: APPROVER,
      body: JSON.stringify({ file: Buffer.from(filled).toString('base64') }),
    });
    check('a filled workbook is read', parsedProject.status === 200,
      `status ${parsedProject.status}`);
    const said = parsedProject.body ?? {};
    check('the workbook names the development', said.project?.id === 'RES-07', said.project?.id);
    check('the workbook carries its work packages', said.packages?.length === 4,
      String(said.packages?.length));
    check('the workbook carries its contracts', said.contracts?.length === 3,
      String(said.contracts?.length));
    check('a package with no award date reads as out to tender',
      said.contracts?.[2]?.awarded === null, JSON.stringify(said.contracts?.[2]?.awarded));

    await expect('packages above the approved budget are refused',
      { kind: 'project:create', at, project: { id: 'RES-08', name: 'Too big',
        portfolio: 'Residential', route: 'PMC-Delivered', budget: 100_000_000 },
        packages: [{ code: '1.1', name: 'One', phase: '', budget: 200_000_000,
          plannedPct: 0, actualPct: 0, cost: 0, committed: 0 }] }, 400, APPROVER);

    await expect('a contract with an unknown role is refused',
      { kind: 'project:create', at, project: { id: 'RES-08', name: 'Bad role',
        portfolio: 'Residential', route: 'PMC-Delivered', budget: 900_000_000 },
        contracts: [{ id: 'PKG-01', name: 'x', wbs: '1.1', contractor: 'Someone',
          role: 'Subcontractor', value: 1_000, retention: 5, awarded: null }] }, 400, APPROVER);

    // Proposed by the manager and authorised by the Director, which is what
    // registering a development takes on the platform. `expect` asserts the
    // 202 the proposal earns; `authorised` then applies it.
    const proposedProject = await expect('an approver PROPOSES the development the workbook describes',
      { kind: 'project:create', at, project: said.project, packages: said.packages.map((k) => ({
        code: k.code, name: k.name, phase: '', budget: k.budget,
        plannedPct: 0, actualPct: 0, cost: 0, committed: 0,
      })), contracts: said.contracts, reason: 'Board approved the acquisition' }, 202, APPROVER);
    const registered = await authorised(proposedProject);
    check('the Director authorises it and it registers',
      registered.status === 200, `status ${registered.status}: ${JSON.stringify(registered.body)?.slice(0, 160)}`);

    if (registered.status === 200) {
      const after3 = asArray('projects after registering from the workbook',
        (await api('/api/projects', { token: ADMIN })).body);
      const made = after3.find((x) => x.id === 'RES-07');
      check('the control budget is what the packages come to',
        made?.control === 855_000_000, `control ${made?.control}`);
      check('only awarded packages reach committed cost',
        made?.committed === 285_000_000, `committed ${made?.committed}`);

      const { body: madeRegs } = await api('/api/registers/RES-07', { token: ADMIN });
      const level1 = (madeRegs?.wbs ?? []).filter((n) => n.level === 1)
        .reduce((a2, n) => a2 + n.budget, 0);
      check('control 1 holds on the day it is registered',
        level1 === made?.control, `${level1} vs ${made?.control}`);
      const committedSum = (madeRegs?.procurement ?? []).reduce((a2, x) => a2 + x.committed, 0);
      check('control 7 holds on the day it is registered',
        committedSum === made?.committed, `${committedSum} vs ${made?.committed}`);

      // Read as the ADMIN. The change log is scoped like everything else, and
      // a contributor cannot see a development nobody has assigned to them —
      // so fetching it as the contributor would compare the whole portfolio
      // against a slice of it and call the difference a defect.
      const log3 = asArray('the log after registering',
        (await api('/api/mutations', { token: ADMIN })).body);
      const d3 = firstDifference(mockProjects(log3), after3);
      check('position identical across both backends after the workbook',
        d3 === null, d3);
      const dr3 = firstDifference(mockRegisters('RES-07', log3), madeRegs);
      check('registers identical across both backends after the workbook', dr3 === null, dr3);
    }
  }

  await expect('a contributor may not approve a variation',
    { kind: 'variation:approve', at, projectId: 'RES-01', no: 'VO-014' }, 403);
  await expect('an approver approves a variation',
    { kind: 'variation:approve', at, projectId: 'RES-01', no: 'VO-014' }, 200, APPROVER);
  await expect('a contributor may not add a development',
    { kind: 'project:create', at, project: { id: 'RES-09', name: 'Test', portfolio: 'Residential', route: 'PMC-Delivered', budget: 1_000_000 } }, 403);
  await expect('a development with a bogus portfolio is refused even for an admin',
    { kind: 'project:create', at, project: { id: 'RES-09', name: 'Test', portfolio: 'Bogus', route: 'PMC-Delivered', budget: 1_000_000 } }, 400, ADMIN);
  await expect('a development whose id already exists is refused',
    { kind: 'project:create', at, project: { id: 'RES-01', name: 'Dup', portfolio: 'Residential', route: 'PMC-Delivered', budget: 1_000_000 } }, 400, ADMIN);
  await expect('an admin adds a well-formed development',
    { kind: 'project:create', at, project: { id: 'RES-09', name: 'Test Development', portfolio: 'Residential', route: 'PMC-Delivered', budget: 1_000_000 } }, 200, ADMIN);

  // Reset is an administrator's act, and only where a deployment allows it.
  const contributorReset = await api('/api/reset', { method: 'POST' });
  check('a contributor may not reset the log', contributorReset.status === 403, `status ${contributorReset.status}`);
  const approverReset = await api('/api/reset', { method: 'POST', token: APPROVER });
  check('an approver may not reset the log', approverReset.status === 403, `status ${approverReset.status}`);

  // A body over the ceiling is 413, not an internal error.
  const huge = await api('/api/mutations', { method: 'POST', body: 'x'.repeat(1_100_000) });
  check('an oversized body is refused as too large', huge.status === 413, `status ${huge.status}`);

  // A return needs a note, and a reader may not return.
  const p = await api('/api/periods', { method: 'POST', body: JSON.stringify({
    kind: 'period:submit', at, projectId: 'COM-01', period: 9, dataDate: '30 Sep',
    budget: 1_800_000_000, control: 1_500_000_000, afc: 1_480_000_000,
    packages: [{ code: '1', name: 'All', phase: 'p', budget: 1_500_000_000, plannedPct: 0.5, actualPct: 0.5, cost: 830_000_000, committed: 900_000_000 }],
    categories: [{ cat: 'All', budget: 1_500_000_000, committed: 900_000_000, actual: 830_000_000, afc: 1_480_000_000 }],
  }) });
  if (p.status === 200) {
    const readerReturn = await api(`/api/periods/${p.body.id}/return`, { method: 'POST', token: READER, body: JSON.stringify({ note: 'no' }) });
    check('a reader may not return a period', readerReturn.status === 403, `status ${readerReturn.status}`);
    const selfReturn = await api(`/api/periods/${p.body.id}/return`, { method: 'POST', body: JSON.stringify({ note: 'mine' }) });
    check('the submitter may not return their own period', selfReturn.status >= 400, `status ${selfReturn.status}`);
    const noNote = await api(`/api/periods/${p.body.id}/return`, { method: 'POST', token: REVIEWER, body: '{}' });
    check('a return without a note is refused', noNote.status === 400, `status ${noNote.status}`);
    const returned = await api(`/api/periods/${p.body.id}/return`, { method: 'POST', token: REVIEWER, body: JSON.stringify({ note: 'Package 1 AC looks wrong' }) });
    check('a reviewer returns it with a note', returned.status === 200, `status ${returned.status}: ${JSON.stringify(returned.body)?.slice(0, 120)}`);
    check('the return records who and when',
      returned.body?.returnedBy === 'reviewer@check.test' && typeof returned.body?.returnedAt === 'string',
      JSON.stringify(returned.body)?.slice(0, 200));
  } else {
    check('a COM-01 period submits for the return checks', false, `status ${p.status}: ${JSON.stringify(p.body)?.slice(0, 160)}`);
  }

  await api('/api/reset', { method: 'POST', token: ADMIN });
}

// =======================================================================
// 9. VISIBILITY, AND RETIRING A DEVELOPMENT
// =======================================================================
//
// A project manager sees the developments assigned to them and no others.
// Enforced on the server, so the proof is a request rather than a screenshot
// of a screen with rows hidden.
{
  await api('/api/reset', { method: 'POST', token: ADMIN });
  const at = new Date().toISOString();

  const mine = asArray('a contributor lists developments', (await api('/api/projects')).body);
  check('a contributor sees only their assigned developments',
    mine.length === 2 && mine.every((p) => ['RES-01', 'COM-01'].includes(p.id)),
    mine.map((p) => p.id).join(' '));

  const all = asArray('an admin lists developments', (await api('/api/projects', { token: ADMIN })).body);
  check('the PMO and the admin still see the whole portfolio', all.length === 8, `${all.length}`);
  const seen = asArray('a reader lists developments', (await api('/api/projects', { token: READER })).body);
  check('a Director still sees the whole portfolio', seen.length === 8, `${seen.length}`);

  // 404 rather than 403, so an id cannot be probed for existence.
  const hidden = await api('/api/projects/MXU-01');
  check('a development that is not theirs is not found', hidden.status === 404, `status ${hidden.status}`);
  const hiddenRegs = await api('/api/registers/MXU-01');
  check('its registers are not found either', hiddenRegs.status === 404, `status ${hiddenRegs.status}`);
  const ownRegs = await api('/api/registers/RES-01');
  check('their own registers are served', ownRegs.status === 200, `status ${ownRegs.status}`);

  // ---- who may delete a development, and for how long it is kept -------
  //
  // DELETING IS AN ARCHIVE THAT EXPIRES. The owner asked to be able to remove
  // a development from every dashboard and every report, to be ASKED how long
  // it is kept, never to be allowed to answer less than thirty days, and to
  // be able to change their mind inside that window.
  const archive = async (id, token, extra = {}) => authorised(await api('/api/mutations', {
    method: 'POST', token, body: JSON.stringify({
      kind: 'project:archive', at, projectId: id, note: 'check', reason: 'check',
      retainDays: 30, ...extra,
    }),
  }));

  check('a contributor may not delete a development',
    (await archive('RES-01')).status === 403);
  check('a reader may not delete a development',
    (await archive('RES-01', READER)).status === 403);
  check('a reviewer may not delete a development',
    (await archive('RES-01', REVIEWER)).status === 403);

  // The window is part of the ACT, not a setting somewhere, and the floor is
  // the one constant `src/domain/retention.ts` states — so the API cannot
  // accept a period the form would refuse, or the reverse.
  check('a deletion with no retention period is refused',
    (await archive('LND-01', ADMIN, { retainDays: undefined })).status === 403);
  // 400 rather than 403: the bound is in `validateMutation`, which reads the
  // same constant the form does, so a period the API would refuse is one the
  // dialog never offers.
  check('a retention period below thirty days is refused',
    (await archive('LND-01', ADMIN, { retainDays: 7 })).status === 400);
  check('a retention period beyond two years is refused',
    (await archive('LND-01', ADMIN, { retainDays: 900 })).status === 400);
  check('a fractional retention period is refused',
    (await archive('LND-01', ADMIN, { retainDays: 30.5 })).status === 400);

  check('the PMO manager may delete a development',
    (await archive('LND-01', APPROVER)).status === 200);

  const afterArchive = asArray('projects after the deletion', (await api('/api/projects', { token: ADMIN })).body);
  check('a deleted development leaves the portfolio',
    afterArchive.length === 7 && !afterArchive.some((p) => p.id === 'LND-01'),
    `${afterArchive.length}`);

  const archived = await api('/api/projects?archived=1', { token: APPROVER });
  check('the PMO manager can list what was deleted',
    archived.status === 200 && archived.body?.length === 1 && archived.body[0]?.id === 'LND-01',
    `status ${archived.status}: ${JSON.stringify(archived.body)?.slice(0, 120)}`);
  // The retention window travels with the development, so a screen can count
  // the days without asking a second question.
  const kept = archived.body?.[0];
  check('it carries the date it was deleted and the date its retention closes',
    Boolean(kept?.archivedAt) && Boolean(kept?.retainUntil)
      && Date.parse(kept.retainUntil) - Date.parse(kept.archivedAt) === 30 * 86_400_000,
    JSON.stringify({ archivedAt: kept?.archivedAt, retainUntil: kept?.retainUntil }));
  check('the Director can list what was deleted — that seat authorises restoring it',
    (await api('/api/projects?archived=1', { token: DIRECTOR })).status === 200);
  check('an executive viewer may not list deleted developments',
    (await api('/api/projects?archived=1', { token: READER })).status === 403);
  check('deleting a development that is already deleted is refused',
    (await archive('LND-01', ADMIN)).status === 403);

  // Removing outright is refused for anything that has reported figures and
  // is still inside its window: the window is exactly what makes a permanent
  // removal safe later.
  const del = (id, token) => api('/api/mutations', {
    method: 'POST', token, body: JSON.stringify({
      kind: 'project:delete', at, projectId: id, note: 'removed for good', reason: 'removed for good',
    }),
  });
  const refusedDelete = await del('LND-01', APPROVER);
  check('a development inside its retention window cannot be removed for good',
    refusedDelete.status === 403 && /administrator/.test(refusedDelete.body?.error ?? ''),
    `status ${refusedDelete.status}: ${refusedDelete.body?.error ?? ''}`);
  const refusedByAdmin = await del('LND-01', ADMIN);
  check('nor by an administrator, while the window is open',
    refusedByAdmin.status === 403 && /retention period/.test(refusedByAdmin.body?.error ?? ''),
    `status ${refusedByAdmin.status}: ${refusedByAdmin.body?.error ?? ''}`);

  const restored = await authorised(await api('/api/mutations', {
    method: 'POST', token: APPROVER, body: JSON.stringify({
      kind: 'project:restore', at, projectId: 'LND-01',
      note: 'Board reversed the cancellation', reason: 'Board reversed the cancellation',
    }),
  }));
  check('the PMO manager can put it back', restored.status === 200, `status ${restored.status}`);
  const backList = asArray('projects after the restore', (await api('/api/projects', { token: ADMIN })).body);
  check('a restored development is back in the portfolio', backList.length === 8);
  const backOne = backList.find((p) => p.id === 'LND-01');
  check('and carries no trace of the deletion — no archived flag, no window',
    backOne !== undefined && !('archived' in backOne) && !('retainUntil' in backOne)
      && !('archivedAt' in backOne),
    JSON.stringify(Object.keys(backOne ?? {}).filter((k) => /archiv|retain/.test(k))));
  check('restoring a development that is in the portfolio is refused',
    (await authorised(await api('/api/mutations', {
      method: 'POST', token: ADMIN,
      body: JSON.stringify({ kind: 'project:restore', at, projectId: 'LND-01', reason: 'again' }),
    }))).status === 403);

  // A development registered and never used may be removed outright.
  const created = await authorised(await api('/api/mutations', {
    method: 'POST', token: APPROVER, body: JSON.stringify({
      kind: 'project:create', at, reason: 'a development to remove',
      project: { id: 'RES-09', name: 'Never Used', portfolio: 'Residential', route: 'PMC-Delivered', budget: 100_000_000 },
    }),
  }));
  check('the PMO manager may register a development', created.status === 200, `status ${created.status}`);
  const removed = await authorised(await del('RES-09', APPROVER));
  check('a development that never reported anything may be removed outright',
    removed.status === 200, `status ${removed.status}: ${removed.body?.error ?? ''}`);
  check('it is gone from the portfolio',
    !asArray('projects after the removal', (await api('/api/projects', { token: ADMIN })).body)
      .some((p) => p.id === 'RES-09'));

  await api('/api/reset', { method: 'POST', token: ADMIN });
}

// =======================================================================
// 10. A DIRECTOR SEES STATE, NOT UNAPPROVED FIGURES
// =======================================================================
//
// Approval is publication. Until then a Director sees that a period was filed
// and who is holding it, and the figures are not in the response at all —
// stripped on the server rather than hidden by the screen.
{
  await api('/api/reset', { method: 'POST', token: ADMIN });
  const at = new Date().toISOString();

  const filed = await api('/api/periods', { method: 'POST', body: JSON.stringify({
    kind: 'period:submit', at, projectId: 'COM-01', period: 9, dataDate: '30 Sep',
    budget: 1_800_000_000, control: 1_500_000_000, afc: 1_480_000_000,
    packages: [{ code: '1', name: 'All', phase: 'p', budget: 1_500_000_000, plannedPct: 0.5, actualPct: 0.5, cost: 900_000_000, committed: 900_000_000 }],
    categories: [{ cat: 'All', budget: 1_500_000_000, committed: 900_000_000, actual: 900_000_000, afc: 1_480_000_000 }],
  }) });
  check('a period is filed for the Director checks', filed.status === 200,
    `status ${filed.status}: ${JSON.stringify(filed.body)?.slice(0, 160)}`);

  const asReader = asArray('a reader lists periods', (await api('/api/periods', { token: READER })).body);
  const readerRow = asReader.find((r) => r.id === filed.body?.id);
  check('a Director sees that the period exists and who filed it',
    readerRow?.state === 'submitted' && readerRow?.submittedBy === 'checker@check.test',
    JSON.stringify(readerRow)?.slice(0, 160));
  check('a Director is not served the unapproved figures', readerRow?.payload === null,
    JSON.stringify(readerRow?.payload)?.slice(0, 120));

  const asReviewer = asArray('a reviewer lists periods', (await api('/api/periods', { token: REVIEWER })).body);
  check('the PMO lead is served the figures, because validating means reading them',
    asReviewer.find((r) => r.id === filed.body?.id)?.payload?.budget === 1_800_000_000);

  await api(`/api/periods/${filed.body?.id}/review`, { method: 'POST', token: REVIEWER, body: '{}' });
  await api(`/api/periods/${filed.body?.id}/approve`, { method: 'POST', token: APPROVER, body: '{}' });

  const afterApproval = asArray('a reader lists periods after approval',
    (await api('/api/periods', { token: READER })).body);
  check('once approved, the Director sees the figures too',
    afterApproval.find((r) => r.id === filed.body?.id)?.payload?.budget === 1_800_000_000);

  await api('/api/reset', { method: 'POST', token: ADMIN });
}

// =======================================================================
// 11. THE ADMIN EXEMPTION, THROUGH THE API
// =======================================================================
//
// The owner's decision: one admin may carry a period through every stage.
// Everyone else is still refused, which section 6 proves.
{
  await api('/api/reset', { method: 'POST', token: ADMIN });
  const at = new Date().toISOString();

  const solo = await api('/api/periods', { method: 'POST', token: ADMIN, body: JSON.stringify({
    kind: 'period:submit', at, projectId: 'COM-02', period: 9, dataDate: '30 Sep',
    budget: 1_150_000_000, control: 1_100_000_000, afc: 1_050_000_000,
    packages: [{ code: '1', name: 'All', phase: 'p', budget: 1_100_000_000, plannedPct: 0.5, actualPct: 0.5, cost: 520_000_000, committed: 620_000_000 }],
    categories: [{ cat: 'All', budget: 1_100_000_000, committed: 620_000_000, actual: 520_000_000, afc: 1_050_000_000 }],
  }) });
  check('an admin files a period', solo.status === 200,
    `status ${solo.status}: ${JSON.stringify(solo.body)?.slice(0, 160)}`);

  const selfReview = await api(`/api/periods/${solo.body?.id}/review`, { method: 'POST', token: ADMIN, body: '{}' });
  check('an admin may validate their own period', selfReview.status === 200,
    `status ${selfReview.status}: ${selfReview.body?.error ?? ''}`);

  const selfApprove = await api(`/api/periods/${solo.body?.id}/approve`, { method: 'POST', token: ADMIN, body: '{}' });
  check('an admin may approve what they entered and validated', selfApprove.status === 200,
    `status ${selfApprove.status}: ${selfApprove.body?.error ?? ''}`);
  check('the trail shows one name at all three stages',
    selfApprove.body?.submittedBy === 'admin@check.test'
    && selfApprove.body?.reviewedBy === 'admin@check.test'
    && selfApprove.body?.approvedBy === 'admin@check.test',
    JSON.stringify(selfApprove.body)?.slice(0, 200));

  await api('/api/reset', { method: 'POST', token: ADMIN });
}

// =======================================================================
// 12. THE REPORTING WORKBOOK, SERVED AND READ BACK
// =======================================================================
//
// The template a person downloads must be one the importer accepts. Proven by
// doing it: fetch the bytes the API serves, hand them straight back to the
// import route, and require it to read the sheet rather than refuse it.
{
  const served = await api('/api/periods/template');
  check('the blank workbook is served', served.status === 200
    && typeof served.body?.base64 === 'string' && served.body.base64.length > 1000,
  `status ${served.status}`);
  check('it is named for what it is', served.body?.filename === 'PT_TEMPLATE.xlsx');

  const bytes = Buffer.from(served.body?.base64 ?? '', 'base64');
  check('the bytes are a zip, as every xlsx is',
    bytes[0] === 0x50 && bytes[1] === 0x4b, `${bytes[0]} ${bytes[1]}`);
  check('the digest matches what the module claims',
    createHash('sha256').update(bytes).digest('hex') === served.body?.sha256);

  const readBack = await api('/api/periods/parse?project=RES-01', {
    method: 'POST', body: JSON.stringify({ file: served.body?.base64 }),
  });
  check('the served workbook is one the importer accepts', readBack.status === 200,
    `status ${readBack.status}: ${JSON.stringify(readBack.body)?.slice(0, 200)}`);
  check('and it reads the work packages out of it',
    (readBack.body?.period?.packages?.length ?? 0) > 0,
    `${readBack.body?.period?.packages?.length ?? 0} packages`);

  check('a reader may not download the workbook they could not file',
    (await api('/api/periods/template', { token: READER })).status === 403);
}

// =======================================================================
// 13. A PERSON'S OWN PROFILE
// =======================================================================
{
  const named = await api('/api/me/profile', {
    method: 'POST', body: JSON.stringify({ name: 'Checker Renamed' }),
  });
  check('a person may change their own name', named.status === 200
    && named.body?.name === 'Checker Renamed', `status ${named.status}`);

  const blank = await api('/api/me/profile', { method: 'POST', body: JSON.stringify({ name: '   ' }) });
  check('a blank name is refused', blank.status === 400, `status ${blank.status}`);

  const badPic = await api('/api/me/profile', {
    method: 'POST', body: JSON.stringify({ avatar: 'https://example.test/me.png' }),
  });
  check('a picture that is not a data URI is refused', badPic.status === 400, `status ${badPic.status}`);

  const pic = await api('/api/me/profile', {
    method: 'POST',
    body: JSON.stringify({ avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }),
  });
  check('a small picture is accepted', pic.status === 200, `status ${pic.status}`);

  // Nobody sets their own role, whatever they post.
  const grab = await api('/api/me/profile', {
    method: 'POST', body: JSON.stringify({ name: 'Checker', role: 'admin' }),
  });
  const stillContributor = (await api('/api/me')).body?.role;
  check('a person cannot promote themselves through their profile',
    grab.status === 200 && stillContributor === 'contributor', `role ${stillContributor}`);

  const short = await api('/api/me/password', {
    method: 'POST', body: JSON.stringify({ current: 'check-api-password', next: 'short' }),
  });
  check('a password under twelve characters is refused', short.status === 400, `status ${short.status}`);

  const wrong = await api('/api/me/password', {
    method: 'POST', body: JSON.stringify({ current: 'not-the-password', next: 'a-long-enough-passphrase' }),
  });
  check('changing a password needs the current one', wrong.status === 403, `status ${wrong.status}`);

  const changed = await api('/api/me/password', {
    method: 'POST', body: JSON.stringify({ current: 'check-api-password', next: 'a-long-enough-passphrase' }),
  });
  check('with the current one it is changed', changed.status === 200, `status ${changed.status}`);

  const back = await api('/api/auth/login', {
    method: 'POST', token: null,
    body: JSON.stringify({ email: 'checker@check.test', password: 'a-long-enough-passphrase' }),
  });
  check('the new password signs in', back.status === 200, `status ${back.status}`);
  const old = await api('/api/auth/login', {
    method: 'POST', token: null,
    body: JSON.stringify({ email: 'checker@check.test', password: 'check-api-password' }),
  });
  check('the old password no longer does', old.status === 401, `status ${old.status}`);
}

// =======================================================================
// 14. ACCOUNTS — WHO MAY ISSUE AND WITHDRAW THEM
// =======================================================================
{
  for (const [name, token] of [['a contributor', undefined], ['a reader', READER],
    ['a reviewer', REVIEWER], ['the PMO manager', APPROVER]]) {
    check(`${name} may not list accounts`,
      (await api('/api/users', token ? { token } : {})).status === 403);
  }

  const list = await api('/api/users', { token: ADMIN });
  const listed = new Set((list.body ?? []).map((u) => u.id));
  check('an administrator lists every account',
    list.status === 200 && ACCOUNTS.every(([email]) => listed.has(email)),
    `status ${list.status}: ${[...listed].join(' ')}`);
  check('no password hash ever leaves the server',
    !JSON.stringify(list.body ?? '').includes('scrypt'));

  const created = await api('/api/users', {
    method: 'POST', token: ADMIN,
    body: JSON.stringify({
      email: 'new.person@check.test', name: 'New Person',
      role: 'contributor', password: 'a-perfectly-fine-passphrase',
    }),
  });
  check('an administrator issues an account', created.status === 200
    && created.body?.email === 'new.person@check.test', `status ${created.status}`);

  const dup = await api('/api/users', {
    method: 'POST', token: ADMIN,
    body: JSON.stringify({
      email: 'new.person@check.test', name: 'Twice', role: 'reader', password: 'a-perfectly-fine-passphrase',
    }),
  });
  check('the same address cannot be issued twice', dup.status === 409, `status ${dup.status}`);

  const weak = await api('/api/users', {
    method: 'POST', token: ADMIN,
    body: JSON.stringify({ email: 'weak@check.test', name: 'Weak', role: 'reader', password: 'short' }),
  });
  check('an account cannot be issued with a weak password', weak.status === 400, `status ${weak.status}`);

  const signedIn = await api('/api/auth/login', {
    method: 'POST', token: null,
    body: JSON.stringify({ email: 'new.person@check.test', password: 'a-perfectly-fine-passphrase' }),
  });
  check('the new account can sign in', signedIn.status === 200, `status ${signedIn.status}`);

  // Assignment is what a contributor may input for.
  const assigned = await api('/api/users/new.person@check.test/assignments', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ projects: ['RES-02'] }),
  });
  check('the administrator assigns a development', assigned.status === 200
    && assigned.body?.projects?.join() === 'RES-02', `status ${assigned.status}`);

  const ghost = await api('/api/users/new.person@check.test/assignments', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ projects: ['ZZZ-99'] }),
  });
  check('a development that does not exist cannot be assigned', ghost.status === 400, `status ${ghost.status}`);

  // Withdrawing takes effect on the very next request, not when the token expires.
  const withdrawn = await api('/api/users/new.person@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ active: false }),
  });
  check('an account is withdrawn', withdrawn.status === 200 && withdrawn.body?.active === false,
    `status ${withdrawn.status}`);
  const refusedLogin = await api('/api/auth/login', {
    method: 'POST', token: null,
    body: JSON.stringify({ email: 'new.person@check.test', password: 'a-perfectly-fine-passphrase' }),
  });
  check('a withdrawn account cannot sign in', refusedLogin.status === 401, `status ${refusedLogin.status}`);
  const staleToken = await api('/api/projects', { token: signedIn.body?.token });
  check('and its live session stops working at once', staleToken.status === 401,
    `status ${staleToken.status}`);

  const restored = await api('/api/users/new.person@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ active: true }),
  });
  check('and it can be restored', restored.status === 200 && restored.body?.active === true);

  // An account that never acted is erased; one that acted is not.
  const erased = await api('/api/users/new.person@check.test', { method: 'DELETE', token: ADMIN });
  check('an account that never acted is erased outright', erased.status === 200, `status ${erased.status}`);
  check('and is gone from the list',
    !(await api('/api/users', { token: ADMIN })).body?.some((u) => u.id === 'new.person@check.test'));

  const acted = await api('/api/users/checker@check.test', { method: 'DELETE', token: ADMIN });
  check('an account that has filed work is not erased, only withdrawn',
    acted.status === 409 && /withdraw the account instead/.test(acted.body?.error ?? ''),
    `status ${acted.status}: ${acted.body?.error ?? ''}`);

  // Nobody may edit themselves out of the system. This is also what keeps an
  // administrator in place at all times: the acting one always counts, so
  // removing any OTHER administrator still leaves at least this one.
  const selfRole = await api('/api/users/admin@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ role: 'reader' }),
  });
  check('an administrator cannot change their own role', selfRole.status === 409, `status ${selfRole.status}`);

  const selfOff = await api('/api/users/admin@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ active: false }),
  });
  check('an administrator cannot withdraw their own account', selfOff.status === 409, `status ${selfOff.status}`);

  const selfGone = await api('/api/users/admin@check.test', { method: 'DELETE', token: ADMIN });
  check('nor remove it', selfGone.status === 409, `status ${selfGone.status}`);

  const selfPassword = await api('/api/users/admin@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ password: 'a-long-enough-passphrase' }),
  });
  check('an administrator resets their own password under their profile, not here',
    selfPassword.status === 409, `status ${selfPassword.status}`);

  // A second administrator may be issued and demoted; the first is untouched,
  // so the system is never left without one.
  const second = await api('/api/users', {
    method: 'POST', token: ADMIN,
    body: JSON.stringify({
      email: 'second.admin@check.test', name: 'Second Admin',
      role: 'admin', password: 'another-fine-passphrase',
    }),
  });
  check('a second administrator can be issued', second.status === 200, `status ${second.status}`);

  const demoteOther = await api('/api/users/second.admin@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ role: 'reader' }),
  });
  check('and demoted by the first', demoteOther.status === 200
    && demoteOther.body?.role === 'reader', `status ${demoteOther.status}`);

  // Demotion out of contributor drops the assignments that went with it.
  await api('/api/users/second.admin@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ role: 'contributor' }),
  });
  await api('/api/users/second.admin@check.test/assignments', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ projects: ['COM-02'] }),
  });
  const promoted = await api('/api/users/second.admin@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ role: 'reader' }),
  });
  check('a role that is not a project manager holds no assignments',
    promoted.body?.projects?.length === 0, JSON.stringify(promoted.body?.projects));

  const nonContributor = await api('/api/users/second.admin@check.test/assignments', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ projects: ['COM-02'] }),
  });
  check('and cannot be given one', nonContributor.status === 409, `status ${nonContributor.status}`);

  await api('/api/users/second.admin@check.test', { method: 'DELETE', token: ADMIN });
  check('an administrator still holds the system',
    (await api('/api/users', { token: ADMIN })).status === 200);
}

// ---- 11. A DEVELOPMENT REGISTERED THROUGH THE APP, END TO END ----------
//
// The owner's day-one act, driven the way the owner will drive it: register a
// development from the workbook's fields, ASSIGN a project manager to it,
// file its first period, validate, approve — and then read its registers
// back. Two foreign keys to the seed table made the third and fourth steps a
// 500 (a created development exists only in the log, which is the point of
// the log), so no period could ever be filed for a created development, by
// anybody. This section is the proof the fix stays fixed. It also proves the
// freeze covers /api/periods, that archived developments are not served by
// id to the seats the list refuses, and that a crafted workbook is a bad
// upload rather than an internal error.
{
  await api('/api/reset', { method: 'POST', token: ADMIN });
  const at = new Date().toISOString();

  const made = await authorised(await api('/api/mutations', {
    method: 'POST', token: APPROVER, body: JSON.stringify({
      kind: 'project:create', at, reason: 'the lifecycle development this section drives',
      project: { id: 'RES-08', name: 'Lifecycle Development', portfolio: 'Residential', route: 'PMC-Delivered', budget: 500_000_000 },
      packages: [
        { code: '1', name: 'Enabling', phase: 'P1', budget: 50_000_000, plannedPct: 0, actualPct: 0, cost: 0, committed: 0 },
        { code: '2', name: 'Structure', phase: 'P2', budget: 300_000_000, plannedPct: 0, actualPct: 0, cost: 0, committed: 0 },
      ],
      contracts: [
        { id: 'CT-01', name: 'Enabling Works', wbs: '1', contractor: 'Lifecycle Contracting', role: 'Main Contractor', value: 48_000_000, retention: 5, awarded: '2026-08-01' },
      ],
    }),
  }));
  check('the development registers', made.status === 200, `status ${made.status}: ${made.body?.error ?? ''}`);

  // Assigning a created development used to violate a foreign key and 500.
  const SEEDED = ['RES-01', 'RES-02', 'COM-01', 'COM-02', 'MXU-01', 'MXU-02', 'LND-01', 'LND-02'];
  const assigned = await api('/api/users/checker@check.test/assignments', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ projects: [...SEEDED, 'RES-08'] }),
  });
  check('a created development can be assigned to a project manager',
    assigned.status === 200 && (assigned.body?.projects ?? []).includes('RES-08'),
    `status ${assigned.status}: ${assigned.body?.error ?? ''}`);

  // Filing a period for it used to violate the second foreign key and 500.
  const period = (n) => ({
    kind: 'period:submit', at, projectId: 'RES-08', period: n, dataDate: '31 Aug 2026',
    budget: 500_000_000, control: 350_000_000, afc: 500_000_000,
    packages: [
      { code: '1', name: 'Enabling', phase: 'P1', budget: 50_000_000, plannedPct: 0.2, actualPct: 0.16, cost: 6_000_000, committed: 48_000_000 },
      { code: '2', name: 'Structure', phase: 'P2', budget: 300_000_000, plannedPct: 0, actualPct: 0, cost: 0, committed: 12_000_000 },
    ],
    categories: [
      { cat: 'Construction', budget: 350_000_000, committed: 60_000_000, actual: 6_000_000, afc: 350_000_000 },
      { cat: 'Contingency', budget: 150_000_000, committed: 0, actual: 0, afc: 150_000_000 },
    ],
  });
  const filed = await api('/api/periods', { method: 'POST', body: JSON.stringify(period(1)) });
  check('the assigned project manager files its first period',
    filed.status === 200, `status ${filed.status}: ${JSON.stringify(filed.body)?.slice(0, 160)}`);

  const fid = filed.body?.id;
  check('a reviewer validates it',
    (await api(`/api/periods/${fid}/review`, { method: 'POST', token: REVIEWER })).status === 200);
  const approved = await api(`/api/periods/${fid}/approve`, { method: 'POST', token: APPROVER });
  check('an approver approves it', approved.status === 200,
    `status ${approved.status}: ${approved.body?.error ?? ''}`);

  // The registers after the first period are ONLY what was recorded against
  // it. They used to be RES-01's templates, scaled: thirteen packages under
  // other organisations' names and non-conformances dated before the
  // development existed.
  const regs = (await api('/api/registers/RES-08', { token: ADMIN })).body;
  const contractors = (regs?.procurement ?? []).map((x) => x.contractor);
  check('its procurement register holds its own contract and nothing borrowed',
    contractors.includes('Lifecycle Contracting')
      && contractors.every((c) => c === 'Lifecycle Contracting' || c === 'Not yet packaged'),
    JSON.stringify(contractors));
  check('registers nobody wrote to are empty',
    (regs?.ncrs ?? [1]).length === 0 && (regs?.risks ?? [1]).length === 0
      && (regs?.equipment ?? [1]).length === 0 && (regs?.manpower ?? [1]).length === 0,
    `ncrs ${regs?.ncrs?.length} risks ${regs?.risks?.length} equipment ${regs?.equipment?.length} manpower ${regs?.manpower?.length}`);

  // The freeze covers this route too: a second period is filed, the
  // development closes, and the approval — the legitimate order of those two
  // acts — is refused rather than making a settled figure move.
  const second = await api('/api/periods', { method: 'POST', body: JSON.stringify(period(2)) });
  check('a second period files while it is open', second.status === 200, `status ${second.status}`);
  const closing = await authorised(await api('/api/mutations', {
    method: 'POST', token: APPROVER, body: JSON.stringify({
      kind: 'project:close', at, projectId: 'RES-08', note: 'Delivered; final account FA-08',
      reason: 'Delivered; final account FA-08',
    }),
  }));
  check('the development closes out', closing.status === 200, `status ${closing.status}: ${closing.body?.error ?? ''}`);
  const lateApprove = await api(`/api/periods/${second.body?.id}/approve`, { method: 'POST', token: APPROVER });
  check('approving a period submitted before the closeout is refused',
    lateApprove.status === 403 && /closed out/.test(lateApprove.body?.error ?? ''),
    `status ${lateApprove.status}: ${lateApprove.body?.error ?? ''}`);
  const lateFile = await api('/api/periods', { method: 'POST', body: JSON.stringify(period(3)) });
  check('filing a period against the closed development is refused, with the reason',
    lateFile.status === 403 && /closed out/.test(lateFile.body?.error ?? ''),
    `status ${lateFile.status}: ${JSON.stringify(lateFile.body)?.slice(0, 160)}`);

  // An archived development leaves every read, not only the list. The list
  // route refused a Director; fetching the same development by id served it.
  await authorised(await api('/api/mutations', {
    method: 'POST', token: APPROVER, body: JSON.stringify({
      kind: 'project:archive', at, projectId: 'LND-02', note: 'check: deleted reads',
      reason: 'check: deleted reads', retainDays: 30,
    }),
  }));
  check('a deleted development is not served by id to an executive viewer',
    (await api('/api/projects/LND-02', { token: READER })).status === 404);
  check('nor its registers',
    (await api('/api/registers/LND-02', { token: READER })).status === 404);
  check('the PMO manager still reads it',
    (await api('/api/projects/LND-02', { token: APPROVER })).status === 200);
  await authorised(await api('/api/mutations', {
    method: 'POST', token: APPROVER,
    body: JSON.stringify({ kind: 'project:restore', at, projectId: 'LND-02', reason: 'check: put back' }),
  }));

  // A crafted archive — a zip whose central directory parses and whose local
  // headers do not — is a bad upload, not an internal error. It answered 500.
  const template = (await api('/api/projects/template', { token: APPROVER })).body;
  const bytes = Buffer.from(template?.base64 ?? '', 'base64');
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
      bytes[i] = 0x58; // every local file header signature broken; the central directory intact
    }
  }
  const crafted = await api('/api/projects/parse', {
    method: 'POST', token: APPROVER, body: JSON.stringify({ file: bytes.toString('base64') }),
  });
  check('a crafted workbook is refused as a bad upload, not a 500',
    crafted.status === 400 || crafted.status === 422, `status ${crafted.status}`);

  await api('/api/reset', { method: 'POST', token: ADMIN });
  // Put the boot assignment back so nothing downstream inherits RES-08.
  await api('/api/users/checker@check.test/assignments', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ projects: SEEDED }),
  });
}

// ---- 14. THE PROPOSAL QUEUE -------------------------------------------
//
// The second two-person control in this system. Acts that decide what a
// development IS are PROPOSED by the PMO Controls Manager and AUTHORISED by
// the Director, and nothing moves in between — so what has to be proven is
// that "in between" is real: the position must be unchanged while a proposal
// waits, the proposer must not be able to authorise their own, the change
// must be re-checked against the controls at authorisation rather than at
// proposal, and a decline must move nothing at all.
{
  await api('/api/reset', { method: 'POST', token: ADMIN });
  const at = new Date().toISOString();
  const budgetOf = async (id) => (await api(`/api/projects/${id}`, { token: ADMIN })).body?.budget;

  const propose = (body, token = APPROVER) => api('/api/mutations', {
    method: 'POST', token, body: JSON.stringify(body),
  });
  const amend = (extra = {}) => ({
    kind: 'project:update', at, projectId: 'COM-01', note: 'budget uplift approved',
    reason: 'Board approved the uplift on 3 September', ...extra,
  });

  const before = await budgetOf('COM-01');

  check('a proposal with no reason is refused',
    (await propose(amend({ name: 'Renamed', reason: '' }))).status === 400);
  check('a proposal with a reason of only spaces is refused',
    (await propose(amend({ name: 'Renamed', reason: '   ' }))).status === 400);

  // An amendment that would be refused ON ITS MERITS is refused NOW, while
  // the person still has the figures in front of them, rather than sitting in
  // a queue for a day and being refused there.
  const unsound = await propose(amend({ budget: 1 }));
  check('a proposal that would be refused on its merits is refused at once',
    unsound.status === 403 && /control budget/.test(unsound.body?.error ?? ''),
    `status ${unsound.status}: ${unsound.body?.error ?? ''}`);

  const queued = await propose(amend({ budget: 1_600_000_000 }));
  check('the PMO manager PROPOSES rather than amends', queued.status === 202,
    `status ${queued.status}: ${JSON.stringify(queued.body)?.slice(0, 140)}`);
  const requestId = queued.body?.request?.id;
  check('the queued proposal names the act, the development and the reason',
    queued.body?.request?.kind === 'project:update'
      && queued.body?.request?.project_id === 'COM-01'
      && /Board approved/.test(queued.body?.request?.reason ?? '')
      && /approved budget/.test(queued.body?.request?.summary ?? ''),
    JSON.stringify(queued.body?.request)?.slice(0, 200));

  // THE POSITION HAS NOT MOVED. This is the whole claim of the feature.
  check('a proposal moves no figure', (await budgetOf('COM-01')) === before,
    `${before} -> ${await budgetOf('COM-01')}`);
  const logWhilePending = asArray('the log while a proposal waits',
    (await api('/api/mutations', { token: ADMIN })).body);
  check('a proposal is not in the change log',
    !logWhilePending.some((m) => m.kind === 'project:update' && m.projectId === 'COM-01'),
    `${logWhilePending.length} entries`);

  check('one development holds one proposal at a time',
    (await propose(amend({ name: 'Something else' }))).status === 409);

  // WHO MAY DECIDE.
  const decide = (id, action, token, note = 'decided by the gate') => api(`/api/changes/${id}/${action}`, {
    method: 'POST', token, body: JSON.stringify({ note }),
  });
  check('a contributor may not authorise a change',
    (await decide(requestId, 'approve', WRITER)).status === 403);
  check('a reviewer may not authorise a change',
    (await decide(requestId, 'approve', REVIEWER)).status === 403);
  check('an executive viewer may not authorise a change',
    (await decide(requestId, 'approve', READER)).status === 403);
  check('a seat that cannot authorise is refused, whoever proposed it',
    (await decide(requestId, 'approve', APPROVER)).status === 403);

  // THE PROPOSER NEVER AUTHORISES THEIR OWN, and the interesting case is the
  // one that can actually arise: a seat that GAINS the capability after the
  // proposal was made. Granting it here also proves the flags are live —
  // no re-issued token, no restart, refused on the next request.
  await api('/api/roles/approver', {
    method: 'PATCH', token: ADMIN,
    body: JSON.stringify({ can: { input: false, review: false, approve: true, authorise: true, administer: false } }),
  });
  const ownApproval = await decide(requestId, 'approve', APPROVER);
  check('the person who proposed a change may not authorise it, even once they could',
    ownApproval.status === 403 && /proposed this change/.test(ownApproval.body?.error ?? ''),
    `status ${ownApproval.status}: ${ownApproval.body?.error ?? ''}`);
  await api('/api/roles/approver', {
    method: 'PATCH', token: ADMIN,
    body: JSON.stringify({ can: { input: false, review: false, approve: true, authorise: false, administer: false } }),
  });
  check('a decision with no note is refused',
    (await decide(requestId, 'approve', DIRECTOR, '')).status === 400);
  check('everyone signed in can read the queue',
    (await api('/api/changes', { token: READER })).status === 200);

  const authorisedNow = await decide(requestId, 'approve', DIRECTOR, 'Authorised at the portfolio review');
  check('the Director authorises it', authorisedNow.status === 200,
    `status ${authorisedNow.status}: ${JSON.stringify(authorisedNow.body)?.slice(0, 140)}`);
  check('and THEN the figure moves', (await budgetOf('COM-01')) === 1_600_000_000,
    String(await budgetOf('COM-01')));
  check('the decision is recorded against the proposal',
    authorisedNow.body?.request?.state === 'approved'
      && authorisedNow.body?.request?.decided_by === 'director@check.test'
      && /portfolio review/.test(authorisedNow.body?.request?.decision_note ?? ''),
    JSON.stringify(authorisedNow.body?.request)?.slice(0, 200));
  check('the change reaches the log at the moment it is authorised',
    asArray('the log after authorisation', (await api('/api/mutations', { token: ADMIN })).body)
      .some((m) => m.kind === 'project:update' && m.projectId === 'COM-01'));
  check('a proposal cannot be decided twice',
    (await decide(requestId, 'approve', DIRECTOR)).status === 409);

  // DECLINING MOVES NOTHING.
  const toDecline = await propose(amend({ name: 'Declined Name' }));
  check('a second proposal is accepted once the first is decided', toDecline.status === 202);
  const declined = await decide(toDecline.body?.request?.id, 'reject', DIRECTOR, 'Not this quarter');
  check('the Director declines it', declined.status === 200
    && declined.body?.state === 'rejected', `status ${declined.status}`);
  check('a declined change moves nothing',
    (await api('/api/projects/COM-01', { token: ADMIN })).body?.name !== 'Declined Name');

  // WITHDRAWING IS THE PROPOSER'S.
  const toWithdraw = await propose(amend({ name: 'Withdrawn Name' }));
  check('the Director may not withdraw somebody else’s proposal',
    (await decide(toWithdraw.body?.request?.id, 'withdraw', DIRECTOR)).status === 403);
  const withdrawn = await decide(toWithdraw.body?.request?.id, 'withdraw', APPROVER, 'Superseded');
  check('the proposer withdraws their own', withdrawn.status === 200
    && withdrawn.body?.state === 'withdrawn', `status ${withdrawn.status}`);

  // AN ADMINISTRATOR ACTS DIRECTLY, and that is the standing exemption said
  // once more: one account can still run the portfolio when the seats are away.
  const direct = await propose(amend({ name: 'Tazayud Business Park Tower A', reason: 'x' }), ADMIN);
  check('an administrator amends directly rather than proposing', direct.status === 200,
    `status ${direct.status}`);

  // RE-CHECKED AT AUTHORISATION, NOT AT PROPOSAL. A proposal that was sound
  // when it was made is refused if the position has moved underneath it —
  // which is the same reason a period is re-checked at approval.
  const stale = await propose({
    kind: 'project:close', at, projectId: 'COM-02', note: 'Delivered', reason: 'Delivered',
  });
  check('a closure is proposed', stale.status === 202, `status ${stale.status}`);
  await api('/api/mutations', {
    method: 'POST', token: ADMIN,
    body: JSON.stringify({ kind: 'project:close', at, projectId: 'COM-02', note: 'closed directly' }),
  });
  const nowStale = await decide(stale.body?.request?.id, 'approve', DIRECTOR, 'authorise the stale one');
  check('a proposal the position has overtaken is refused at authorisation',
    nowStale.status === 403 && /already closed out/.test(nowStale.body?.error ?? ''),
    `status ${nowStale.status}: ${nowStale.body?.error ?? ''}`);

  await api('/api/reset', { method: 'POST', token: ADMIN });
}

// ---- 15. SEATS ARE DATA -----------------------------------------------
//
// What a role may do is a row an administrator edits, not a constant compiled
// into this server. What has to be proven is that it is still a RULE: the
// flags decide, the administrator's own seat cannot be dismantled, a seat
// somebody holds cannot be removed, and the last authorising seat cannot lose
// the capability that empties the queue.
{
  const seats = await api('/api/roles', { token: READER });
  check('everyone signed in can read the seats', seats.status === 200, `status ${seats.status}`);
  check('the six the product defines are all there',
    ['contributor', 'reviewer', 'approver', 'director', 'reader', 'admin']
      .every((r) => seats.body?.some((x) => x.role === r)),
    (seats.body ?? []).map((x) => x.role).join(', '));
  const director = seats.body?.find((x) => x.role === 'director');
  check('the Director authorises and does nothing else',
    director?.may_authorise === true && director?.may_input === false
      && director?.may_review === false && director?.may_approve === false
      && director?.may_administer === false,
    JSON.stringify(director));
  check('the administrator is the one seat exempt from separation of duties',
    (seats.body ?? []).filter((x) => x.sod_exempt).map((x) => x.role).join(',') === 'admin',
    (seats.body ?? []).filter((x) => x.sod_exempt).map((x) => x.role).join(','));

  check('only an administrator may define a seat',
    (await api('/api/roles', { method: 'POST', token: APPROVER,
      body: JSON.stringify({ role: 'x', title: 'X', describes: 'x' }) })).status === 403);
  check('a seat name that could not travel in a URL is refused',
    (await api('/api/roles', { method: 'POST', token: ADMIN,
      body: JSON.stringify({ role: 'Not A Seat', title: 'X', describes: 'x' }) })).status === 400);

  const made = await api('/api/roles', {
    method: 'POST', token: ADMIN,
    body: JSON.stringify({ role: 'commercial_lead', title: 'Commercial Lead',
      describes: 'Approves claims and proposes changes',
      can: { input: false, review: false, approve: true, authorise: false, administer: false } }),
  });
  check('an administrator defines a seat', made.status === 200, `status ${made.status}`);
  check('a new seat is never exempt from separation of duties',
    made.body?.sod_exempt === false && made.body?.built_in === false, JSON.stringify(made.body));
  check('the same seat cannot be defined twice',
    (await api('/api/roles', { method: 'POST', token: ADMIN,
      body: JSON.stringify({ role: 'commercial_lead', title: 'X', describes: 'x' }) })).status === 409);

  // THE FLAGS DECIDE, not the name. An account moved to the new seat may do
  // exactly what its row says, on the next request — no re-issued token.
  const { execFileSync } = await import('node:child_process');
  execFileSync('npx', ['tsx', 'db/user.ts', 'lead@check.test', 'lead@check.test',
    'commercial_lead', 'check-api-password'], { env: { ...process.env, DATABASE_URL }, stdio: 'pipe' });
  const LEAD = token('lead@check.test', 'commercial_lead');
  const leadProposes = await api('/api/mutations', {
    method: 'POST', token: LEAD, body: JSON.stringify({
      kind: 'project:update', at: new Date().toISOString(), projectId: 'MXU-01',
      name: 'Named By The New Seat', note: 'the new seat proposes', reason: 'the new seat proposes',
    }),
  });
  check('a seat defined this morning proposes, because its flags say approve',
    leadProposes.status === 202, `status ${leadProposes.status}: ${JSON.stringify(leadProposes.body)?.slice(0, 120)}`);
  await api(`/api/changes/${leadProposes.body?.request?.id}/withdraw`, {
    method: 'POST', token: LEAD, body: JSON.stringify({ note: 'tidy' }),
  });

  check('a seat somebody holds cannot be removed',
    (await api('/api/roles/commercial_lead', { method: 'DELETE', token: ADMIN })).status === 409);

  // Taking the capability away takes the button away, on the next request.
  await api('/api/roles/commercial_lead', {
    method: 'PATCH', token: ADMIN,
    body: JSON.stringify({ can: { input: false, review: false, approve: false, authorise: false, administer: false } }),
  });
  const leadRefused = await api('/api/mutations', {
    method: 'POST', token: LEAD, body: JSON.stringify({
      kind: 'project:update', at: new Date().toISOString(), projectId: 'MXU-01',
      name: 'Nope', note: 'x', reason: 'x',
    }),
  });
  check('a seat whose flags were taken away is refused on the next request',
    leadRefused.status === 403, `status ${leadRefused.status}: ${leadRefused.body?.error ?? ''}`);

  check('the administrator seat is fixed',
    (await api('/api/roles/admin', { method: 'PATCH', token: ADMIN,
      body: JSON.stringify({ can: { input: false, review: false, approve: false, authorise: false, administer: false } }) })).status === 403);
  check('a seat the product defines cannot be removed',
    (await api('/api/roles/director', { method: 'DELETE', token: ADMIN })).status === 403);

  // Tidy: move the account off the seat, then the seat goes.
  await api('/api/users/lead@check.test', {
    method: 'POST', token: ADMIN, body: JSON.stringify({ role: 'reader' }),
  });
  check('a seat nobody holds is removed',
    (await api('/api/roles/commercial_lead', { method: 'DELETE', token: ADMIN })).status === 200);

  await api('/api/reset', { method: 'POST', token: ADMIN });
}

// ---- 16. THE PORTFOLIOS AND THE DELIVERY ROUTES ARE DATA ---------------
//
// The last two lists that needed a developer. What has to be proven is that
// they are a rule and not just a dropdown: the validator refuses a portfolio
// this deployment does not hold, a portfolio a development is IN is never
// removed, and a portfolio added through the API is one a development can be
// registered into a moment later — with no deploy in between.
{
  await api('/api/reset', { method: 'POST', token: ADMIN });
  const at = new Date().toISOString();

  const ref = await api('/api/reference', { token: READER });
  check('everyone signed in can read the portfolios and the routes',
    ref.status === 200, `status ${ref.status}`);
  check('the four the product ships with are there',
    ['Residential', 'Commercial', 'Mixed Use', 'Land Development']
      .every((n) => ref.body?.portfolios?.some((p) => p.name === n)),
    (ref.body?.portfolios ?? []).map((p) => p.name).join(', '));
  // COUNTED FROM THE REPLAY. The eight seeded developments sit two to a
  // portfolio, and this is the count a Remove button refuses on.
  check('each carries how many developments are in it',
    ref.body?.portfolios?.every((p) => p.developments === 2),
    JSON.stringify(ref.body?.portfolios?.map((p) => [p.name, p.developments])));

  check('only an administrator may define a portfolio',
    (await api('/api/reference', { method: 'POST', token: APPROVER,
      body: JSON.stringify({ kind: 'portfolios', name: 'Hospitality' }) })).status === 403);
  check('a one-character name is refused',
    (await api('/api/reference', { method: 'POST', token: ADMIN,
      body: JSON.stringify({ kind: 'portfolios', name: 'H' }) })).status === 400);
  check('a portfolio that already exists is refused',
    (await api('/api/reference', { method: 'POST', token: ADMIN,
      body: JSON.stringify({ kind: 'portfolios', name: 'Residential' }) })).status === 409);

  // ---- a development cannot be registered into a portfolio that does not
  // exist, and the refusal NAMES it ------------------------------------
  const intoNothing = await api('/api/mutations', {
    method: 'POST', token: ADMIN, body: JSON.stringify({
      kind: 'project:create', at,
      project: { id: 'HOS-01', name: 'Hotel', portfolio: 'Hospitality',
        route: 'PMC-Delivered', budget: 400_000_000 },
    }),
  });
  check('a development in a portfolio this system does not hold is refused, by name',
    intoNothing.status === 400 && /Hospitality is not a portfolio/.test(intoNothing.body?.error ?? ''),
    `status ${intoNothing.status}: ${intoNothing.body?.error ?? ''}`);

  const made = await api('/api/reference', {
    method: 'POST', token: ADMIN,
    body: JSON.stringify({ kind: 'portfolios', name: 'Hospitality', tone: 'teal' }),
  });
  check('an administrator defines a portfolio', made.status === 200, `status ${made.status}`);
  check('it is not one the product defines, so it can be removed later',
    made.body?.built_in === false && made.body?.tone === 'teal', JSON.stringify(made.body));
  check('a tone this application cannot draw is refused',
    (await api('/api/reference/portfolios/Hospitality', { method: 'PATCH', token: ADMIN,
      body: JSON.stringify({ tone: 'chartreuse' }) })).status === 400);

  // ---- AND THE SAME REGISTRATION NOW SUCCEEDS, with no deploy ---------
  const nowFine = await api('/api/mutations', {
    method: 'POST', token: ADMIN, body: JSON.stringify({
      kind: 'project:create', at,
      project: { id: 'HOS-01', name: 'Hotel', portfolio: 'Hospitality',
        route: 'PMC-Delivered', budget: 400_000_000 },
    }),
  });
  check('the identical registration succeeds once the portfolio exists',
    nowFine.status === 200, `status ${nowFine.status}: ${nowFine.body?.error ?? ''}`);
  check('the new portfolio reaches the corporate payload every screen draws with',
    (await api('/api/corporate', { token: ADMIN })).body?.portfolios
      ?.some((p) => p.name === 'Hospitality' && p.tone === 'teal'));

  // ---- a portfolio in use is never removed ---------------------------
  const inUse = await api('/api/reference/portfolios/Hospitality', { method: 'DELETE', token: ADMIN });
  check('a portfolio a development is in cannot be removed',
    inUse.status === 409 && /Move it first/.test(inUse.body?.error ?? ''),
    `status ${inUse.status}: ${inUse.body?.error ?? ''}`);
  check('nor one the product defines',
    (await api('/api/reference/portfolios/Residential', { method: 'DELETE', token: ADMIN })).status === 403);

  // Move the development out, and only then does it go.
  await api('/api/mutations', {
    method: 'POST', token: ADMIN, body: JSON.stringify({
      kind: 'project:update', at, projectId: 'HOS-01', portfolio: 'Commercial',
      note: 'moved so the portfolio can be removed',
    }),
  });
  check('once nothing is in it, it is removed',
    (await api('/api/reference/portfolios/Hospitality', { method: 'DELETE', token: ADMIN })).status === 200);

  // ---- delivery routes, the same shape -------------------------------
  const badRoute = await api('/api/mutations', {
    method: 'POST', token: ADMIN, body: JSON.stringify({
      kind: 'project:update', at, projectId: 'HOS-01', route: 'Design-Build',
      note: 'a route nobody has defined',
    }),
  });
  check('a delivery route this system does not hold is refused, by name',
    badRoute.status === 400 && /Design-Build is not a delivery route/.test(badRoute.body?.error ?? ''),
    `status ${badRoute.status}: ${badRoute.body?.error ?? ''}`);
  check('an administrator defines a delivery route',
    (await api('/api/reference', { method: 'POST', token: ADMIN,
      body: JSON.stringify({ kind: 'routes', name: 'Design-Build',
        describes: 'One counterparty designs and builds' }) })).status === 200);
  const onNewRoute = await api('/api/mutations', {
    method: 'POST', token: ADMIN, body: JSON.stringify({
      kind: 'project:update', at, projectId: 'HOS-01', route: 'Design-Build',
      note: 'moved onto the new route',
    }),
  });
  check('and the same amendment then succeeds', onNewRoute.status === 200,
    `status ${onNewRoute.status}: ${onNewRoute.body?.error ?? ''}`);
  check('a route a development is on cannot be removed',
    (await api('/api/reference/routes/Design-Build', { method: 'DELETE', token: ADMIN })).status === 409);
  check('nor one the product defines',
    (await api('/api/reference/routes/PMC-Delivered', { method: 'DELETE', token: ADMIN })).status === 403);

  // A RENAME IS NOT OFFERED, deliberately: every development carries the name
  // as its own value, so a rename would orphan them silently.
  check('renaming a portfolio is not a thing this API does',
    (await api('/api/reference/portfolios/Residential', { method: 'PATCH', token: ADMIN,
      body: JSON.stringify({ name: 'Homes' }) })).body?.name === 'Residential');

  await api('/api/reset', { method: 'POST', token: ADMIN });
  await api('/api/reference/routes/Design-Build', { method: 'DELETE', token: ADMIN });
}

// ---- tidy -------------------------------------------------------------
await api('/api/reset', { method: 'POST', token: ADMIN });
stop();

console.log(`\nbackend seam  ${checks} checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  both backends agree; writes persist; a write that cannot reconcile is refused.\n');
// Explicit: the spawned server keeps the event loop alive, so without this the
// script prints its result and then never exits.
process.exit(0);
