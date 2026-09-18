#!/usr/bin/env node
/**
 * EVERY OPTION, PRESSED.
 *
 * The other gates each prove one thing very well. check-platform proves the
 * served build reaches Postgres; check-actions drives the lifecycle against
 * the OFFLINE build; check-api compares the two repositories field by field.
 * Between them they left a gap the owner kept falling into: a control that
 * works in the fixtures and fails on the platform, or a button that produces
 * no file at all.
 *
 * Three defects found on the day this was written, none of which any existing
 * gate could see:
 *
 *   1. Registering a development from the WORKBOOK was refused with a 422.
 *      The template ships example package rows, package budgets become the
 *      control budget, and a set of them summing to zero took a fallback of
 *      95% of the authorised budget — so the control budget said 475M and the
 *      register said nothing, and control 1 refused the write. The dialog sat
 *      open. check-actions never saw it because it types the four fields, and
 *      check-platform never saw it because it does the same.
 *   2. The Report Centre's PDF and Excel buttons were wired to a toast saying
 *      export was not connected.
 *   3. The workbook told people to write "Self-Delivered" as the delivery
 *      route. The system has only ever accepted "Self-Execution".
 *
 * So this gate presses things. Every action that changes data or produces a
 * file, through the served application, in a real browser, against Postgres —
 * and by the seat that is supposed to be able to, then by one that is not.
 *
 * Requires DATABASE_URL. scripts/local-postgres.sh start prints one.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { Pool } from 'pg';
import { readProject, verifyProjectStructure } from '../server/project-template.js';
import { writeWorkbook } from '../server/xlsx-write.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\nDATABASE_URL is required. Run: scripts/local-postgres.sh start\n');
  process.exit(1);
}

const SECRET = 'check-qa-secret';
const PORT = Number(process.env.API_PORT ?? 4135);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BUILD_DIR = resolve('tests/qa-build');
const WEB_PORT = Number(process.env.WEB_PORT ?? 4136);
const APP = `http://127.0.0.1:${WEB_PORT}/index.html`;
const OUT = resolve('tests/output/qa');

// The five seats, named for what they are rather than what they may do, so a
// failure reads as "the approver could not amend" rather than "user 3".
const PMO_MANAGER = { email: 'qa-approver@tazayud.test', password: 'approver-password-1', role: 'approver' };
const DIRECTOR = { email: 'qa-director@tazayud.test', password: 'director-password-1', role: 'director' };
const PROJECT_MANAGER = { email: 'qa-contributor@tazayud.test', password: 'contributor-password-1', role: 'contributor' };
const REVIEWER = { email: 'qa-reviewer@tazayud.test', password: 'reviewer-password-1', role: 'reviewer' };
const VIEWER = { email: 'qa-reader@tazayud.test', password: 'reader-password-1', role: 'reader' };
const ADMIN = { email: 'qa-admin@tazayud.test', password: 'admin-password-1', role: 'admin' };

const failures = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  return ok;
};

mkdirSync(OUT, { recursive: true });

// ---- refuse to run against someone else's server ----------------------
try {
  const r = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
  if (r.ok) {
    console.error(`\nSomething is already listening on ${ORIGIN}. Stop it first.\n`);
    process.exit(1);
  }
} catch { /* nothing there, as wanted */ }

// ---- the database, the accounts and the assignment --------------------
const env = { ...process.env, DATABASE_URL };
execFileSync('npx', ['tsx', 'db/seed.ts', '--reset'], { env, stdio: 'pipe' });
for (const u of [PMO_MANAGER, DIRECTOR, PROJECT_MANAGER, REVIEWER, VIEWER, ADMIN]) {
  execFileSync('npx', ['tsx', 'db/user.ts', u.email, u.email, u.role, u.password], { env, stdio: 'pipe' });
}
{
  const pool = new Pool({ connectionString: DATABASE_URL });
  // Absence of an assignment is absence of permission, so the project manager
  // is given one development and no others.
  await pool.query(
    'insert into project_assignments (user_id, project_id) values ($1, $2) on conflict do nothing',
    [PROJECT_MANAGER.email, 'RES-01'],
  );
  // Seeding resets the position but knows nothing about conversations, and
  // messages accumulating across runs would make every count below drift.
  await pool.query('truncate messages');
  await pool.end();
}

// ---- a stub model -----------------------------------------------------
//
// The real model costs money, needs a key nobody should put in a repository,
// and would make this gate non-deterministic — the same question answered
// differently on two runs is a test that fails for no reason.
//
// So the whole path is proven against a stub that speaks the same wire
// format: the routes, the brief the server computes, the shape checking, the
// rate limit, the refusals, the form the fields land in, and the write going
// through the ordinary reconciliation controls. The one thing not proven here
// is Google's own uptime.
//
// It also RECORDS what it was sent, which is how the checks below can assert
// that the brief carried the real position and that a project manager's brief
// carried only their own developments.
const seen = [];
const stub = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const sent = JSON.parse(body || '{}');
    seen.push({ url: req.url, key: req.headers['x-goog-api-key'], sent });
    const asked = (sent.contents?.[0]?.parts ?? []).map((p) => p.text ?? '').join(' ');
    const wantsJson = sent.generationConfig?.responseMimeType === 'application/json';
    const text = wantsJson
      ? JSON.stringify({
        documentType: 'Interim Payment Certificate',
        projectId: 'RES-01',
        reference: 'IPC-STUB-01',
        period: 'August 2026',
        contractor: 'Al Rajhi Contracting',
        certified: 1_000_000,
        retention: 50_000,
        netPayable: 950_000,
        notes: 'Read from a stub model during acceptance testing.',
        confidence: {
          documentType: 97, projectId: 91, reference: 99,
          period: 88, contractor: 94, certified: 96, retention: 93,
        },
      })
      // Echoing a figure out of the brief is what lets a check below prove
      // the brief actually reached the model with the live position in it.
      : `STUB ANSWER. The brief named ${(asked.match(/\b[A-Z]{3}-\d{2}\b/g) ?? []).length} developments.`;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }));
  });
});
const STUB_PORT = Number(process.env.STUB_PORT ?? 4137);
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r));

// ---- the API ----------------------------------------------------------
const server = spawn('npx', ['tsx', 'server/server.ts'], {
  env: {
    ...env,
    AUTH_SECRET: SECRET,
    PORT: String(PORT),
    GEMINI_API_KEY: 'stub-key-for-acceptance-testing',
    GEMINI_MODEL: 'gemini-3.5-flash-lite',
    GEMINI_BASE_URL: `http://127.0.0.1:${STUB_PORT}/v1beta`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(String(d)));
server.stderr.on('data', (d) => serverLog.push(String(d)));

let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
};
process.on('exit', stop);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop(); process.exit(1); });

let up = false;
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`${ORIGIN}/api/health`)).ok) { up = true; break; } } catch { /* waiting */ }
  await sleep(250);
}
if (!up) {
  console.error('\nAPI did not start.\n' + serverLog.join(''));
  process.exit(1);
}

// ---- the platform build, served ---------------------------------------
execFileSync('npx', ['vite', 'build', '--outDir', 'tests/qa-build', '--emptyOutDir'], {
  env: { ...process.env, VITE_API_URL: ORIGIN },
  stdio: 'pipe',
});

const web = createServer((req, res) => {
  const rel = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
  const file = join(BUILD_DIR, rel);
  if (!file.startsWith(BUILD_DIR) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => web.listen(WEB_PORT, '127.0.0.1', r));

const browser = await chromium.launch();
const db = new Pool({ connectionString: DATABASE_URL });

/**
 * A signed-in page, with every console error and failed request collected.
 *
 * The errors are part of the result rather than printed as they happen: a
 * screen that renders but logs an exception is a screen that is broken in a
 * way nobody sees until it matters.
 */
async function signedInAs(user) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`REQUEST FAILED ${r.url()} ${r.failure()?.errorText}`));

  await page.goto(APP);
  await page.waitForSelector('#signin-email', { timeout: 25_000 });
  await page.fill('#signin-email', user.email);
  await page.fill('#signin-password', user.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('.sidebar', { timeout: 25_000 });
  return { page, errors };
}

/**
 * THE DIRECTOR AUTHORISES WHAT IS WAITING, through the screen.
 *
 * Registering, amending, deleting, restoring, closing out, reopening and
 * awarding are proposed by the PMO Controls Manager and authorised by the
 * Director. Driving the second half in a real browser is the point: a gate
 * that posted the authorisation through the API would prove the route works
 * and say nothing about whether anybody can reach it.
 *
 * Returns the summary line it authorised, so the caller can assert it was the
 * proposal it meant.
 */
async function authoriseTopOfQueue(note) {
  const { page, errors } = await signedInAs(DIRECTOR);
  await page.goto(`${APP}#/authorisations`);
  await page.waitForSelector('.card-h', { timeout: 25_000 });
  const summary = await page.locator('.card-b').first().innerText();
  await page.click('button:has-text("Authorise…")');
  await page.waitForSelector('textarea', { timeout: 15_000 });
  await page.fill('textarea', note);
  const posted = page.waitForResponse(
    (r) => /\/api\/changes\/\d+\/approve/.test(r.url()), { timeout: 30_000 },
  ).catch(() => null);
  await page.click('button:has-text("Authorise and apply")');
  const res = await posted;
  await page.waitForTimeout(1200);
  await page.close();
  return { summary, status: res?.status() ?? 0, errors };
}

// Everything that drives the browser runs inside this block, so a missing
// precondition is REPORTED rather than replaced by a Playwright stack trace.
try {

// ======================================================================
// 1. THE NEW-DEVELOPMENT WORKBOOK, END TO END
//
// The reported defect, in the order the owner met it: download the template,
// fill it in, import it, press Create.
// ======================================================================
{
  const { page, errors } = await signedInAs(PMO_MANAGER);

  check('the PMO manager is offered Add Project',
    await page.locator('button:has-text("Add Project")').isVisible());
  await page.click('button:has-text("Add Project")');
  await page.waitForSelector('#ap-id', { timeout: 15_000 });

  // ---- the template actually arrives as a file -----------------------
  const downloaded = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  await page.click('button:has-text("Download template")');
  const got = await downloaded;
  check('Download template produces a file in the browser', got !== null,
    'no download event — the anchor or the object URL is wrong');

  let templatePath = null;
  if (got) {
    templatePath = join(OUT, 'template.xlsx');
    await got.saveAs(templatePath);
    check('the template has content', statSync(templatePath).size > 1000,
      `${statSync(templatePath).size} bytes`);
    // Read back by the very code that will read a filled one. A template the
    // importer would refuse is worse than no template at all.
    const complaint = verifyProjectStructure(Buffer.from(readFileSync(templatePath)));
    check('the served template is one the importer accepts', complaint === null, complaint ?? '');
  }

  // ---- a filled workbook, in the template's own shape ----------------
  //
  // Two package rows filled and four left as the template shipped them, which
  // is exactly what a person does. The unfilled rows must be IGNORED, not
  // registered as packages worth nothing.
  const filled = join(OUT, 'filled.xlsx');
  writeFileSync(filled, buildFilledWorkbook());
  const parsed = readProject(Buffer.from(readFileSync(filled)),
    ['Residential', 'Commercial', 'Mixed Use', 'Land Development']);
  check('the filled workbook parses to two packages', parsed.packages.length === 2,
    `${parsed.packages.length}`);
  check('the four unfilled package rows are skipped, not registered',
    parsed.skipped.packages === 4, `${parsed.skipped.packages}`);
  check('"Self-Delivered" in a workbook reads as Self-Execution',
    parsed.project.route === 'Self-Execution', parsed.project.route);

  const parseCall = page.waitForResponse((r) => r.url().includes('/api/projects/parse'), { timeout: 25_000 })
    .catch(() => null);
  await page.setInputFiles('input[type=file]', filled);
  const parseRes = await parseCall;
  check('the app posts the workbook to be read', parseRes !== null);
  if (parseRes) {
    check('the workbook is accepted', parseRes.status() === 200,
      `status ${parseRes.status()} ${(await parseRes.text()).slice(0, 200)}`);
  }
  await page.waitForTimeout(700);

  check('importing fills the Project ID', (await page.inputValue('#ap-id')) === 'RES-21',
    await page.inputValue('#ap-id'));
  check('importing fills the name',
    (await page.inputValue('#ap-name')).includes('Workbook'), await page.inputValue('#ap-name'));
  check('importing fills the budget', (await page.inputValue('#ap-budget')) === '900000000',
    await page.inputValue('#ap-budget'));
  check('the delivery route the workbook gave is one the form can show',
    (await page.inputValue('#ap-route')) === 'Self-Execution', await page.inputValue('#ap-route'));
  check('the screen says how many rows were left unfilled',
    (await page.locator('.modal-b').innerText()).includes('4 package row'));

  // ---- the manager PROPOSES; the Director authorises -------------------
  //
  // Registering a development is one of the acts the owner asked to take two
  // people. The manager's button says what it will actually do, and the
  // reason it asks for is what the Director reads.
  check('the button says the registration will be sent for authorisation',
    await page.locator('button:has-text("Send for authorisation")').isVisible());
  check('and it is unavailable until a reason is given',
    await page.locator('button:has-text("Send for authorisation")').isDisabled());
  check('the form says why rather than leaving a dead button',
    /Required/.test(await page.locator('#ap-reason-hint').textContent() ?? ''));
  await page.fill('#ap-reason', 'Board approved the acquisition on 2 September 2026');

  const posted = page.waitForResponse(
    (r) => r.url().includes('/api/mutations') && r.request().method() === 'POST',
    { timeout: 30_000 },
  ).catch(() => null);
  await page.click('button:has-text("Send for authorisation")');
  const res = await posted;
  check('the proposal is posted', res !== null);
  if (res) {
    const body = res.status() === 202 ? '' : (await res.text()).slice(0, 240);
    check('the API queues it rather than registering it',
      res.status() === 202, `status ${res.status()} ${body}`);
  }
  const closed = await page.waitForSelector('#ap-id', { state: 'detached', timeout: 25_000 })
    .then(() => true).catch(() => false);
  check('the dialog closes rather than sitting open', closed,
    'still open — the write was refused and the person is left guessing');

  // NOTHING HAS MOVED. This is the whole claim of a two-person control.
  const pending = await snapshotAs(PMO_MANAGER);
  check('the development is NOT in the portfolio while it waits',
    !pending.projects.some((p) => p.id === 'RES-21'));
  const queueRow = await db.query(
    "select state, summary, reason from project_change_requests where kind = 'project:create'",
  );
  check('it is waiting in the queue, with the reason the manager gave',
    queueRow.rowCount === 1 && queueRow.rows[0].state === 'pending'
      && /Board approved/.test(queueRow.rows[0].reason ?? ''),
    JSON.stringify(queueRow.rows[0])?.slice(0, 160));
  check('and it is not in the change log',
    (await db.query("select 1 from mutations where payload->'project'->>'id' = 'RES-21'")).rowCount === 0);

  const decided = await authoriseTopOfQueue('Authorised at the portfolio review of 8 September 2026');
  check('the queue names the development the manager proposed',
    /RES-21/.test(decided.summary), decided.summary.slice(0, 160));
  check('the Director authorises it through the screen', decided.status === 200,
    `status ${decided.status}`);
  check('no console errors on the authorisations screen',
    decided.errors.length === 0, decided.errors.join(' | '));

  const row = await db.query("select payload from mutations where payload->'project'->>'id' = 'RES-21'");
  check('and THEN it reaches the change log', row.rowCount === 1, `${row.rowCount} rows`);
  if (row.rowCount === 1) {
    const p = row.rows[0].payload;
    check('only the filled packages travelled', (p.packages ?? []).length === 2,
      `${(p.packages ?? []).length}`);
  }

  // The control budget is the packages, and the register agrees with it —
  // which is precisely what the 422 was about.
  const snap = await snapshotAs(PMO_MANAGER);
  const made = snap.projects.find((p) => p.id === 'RES-21');
  check('the development is in the portfolio', made !== undefined);
  if (made) {
    check('its control budget is the sum of its packages', made.control === 700_000_000,
      `${made.control}`);
    check('its committed cost is the awarded contract only', made.committed === 260_000_000,
      `${made.committed}`);
  }

  check('no console errors registering from a workbook', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ======================================================================
// 1b. A DEVELOPMENT WHOSE PACKAGES SUM TO NOTHING
//
// The importer now drops unfilled rows, so the screen above can no longer
// produce this. The API still can, and the defect it caused lived in the
// arithmetic rather than in the reader: package budgets became the WBS
// register, but the CONTROL budget fell back to 95% of the authorised figure
// whenever they summed to zero — so the two disagreed by 95% of the budget
// and control 1 refused the write.
//
// Deriving both from the same list is what makes them unable to disagree.
// This check is what stops that fallback creeping back: revert it and this
// returns 422 while every screen-driven check still passes.
// ======================================================================
{
  const zeroed = await postAs(ADMIN, {
    kind: 'project:create',
    at: new Date().toISOString(),
    project: {
      id: 'RES-22', name: 'Packages Not Yet Priced', portfolio: 'Residential',
      route: 'PMC-Delivered', budget: 500_000_000,
    },
    packages: ['1.1', '1.2', '1.3'].map((code) => ({
      code, name: `Package ${code}`, phase: '', budget: 0,
      plannedPct: 0, actualPct: 0, cost: 0, committed: 0,
    })),
  });
  check('packages that sum to nothing do not break reconciliation',
    zeroed.status === 200, `status ${zeroed.status} ${zeroed.body.slice(0, 200)}`);

  const snap = await snapshotAs(ADMIN);
  const p = snap.projects.find((x) => x.id === 'RES-22');
  check('and its control budget follows its packages rather than a fallback',
    p?.control === 0, `control ${p?.control} against a budget of ${p?.budget}`);
}

// ======================================================================
// 2. AMENDING A DEVELOPMENT
//
// The act that turns placeholder names into the real register, without a
// migration and without a developer.
// ======================================================================
{
  const { page, errors } = await signedInAs(PMO_MANAGER);
  await page.goto(`${APP}#/projects`);
  await page.waitForSelector('tbody tr', { timeout: 25_000 });

  // The position BEFORE the amendment. Captured rather than written down: an
  // assertion against a figure typed into a test proves the test was updated,
  // not that the figure held still.
  const before = (await snapshotAs(PMO_MANAGER)).projects.find((x) => x.id === 'RES-02');

  check('the PMO manager is offered an amend action',
    await page.locator('[aria-label="Amend RES-02"]').isVisible());
  await page.click('[aria-label="Amend RES-02"]');
  await page.waitForSelector('#ep-name', { timeout: 15_000 });

  check('the form opens on the current name',
    (await page.inputValue('#ep-name')) === 'Rimal Heights', await page.inputValue('#ep-name'));

  // ---- a budget below the control budget is refused, in words --------
  await page.fill('#ep-budget', '1000');
  await page.fill('#ep-note', 'testing the floor');
  await page.click('button:has-text("Save amendment")');
  await page.waitForTimeout(400);
  const complaint = await page.locator('.modal-b').innerText();
  check('an approved budget below the control budget is refused before it is sent',
    complaint.includes('control budget'), complaint.slice(0, 200));

  // ---- the real amendment --------------------------------------------
  await page.fill('#ep-name', 'Rimal Heights Phase 2');
  await page.fill('#ep-budget', '1050000000');
  await page.fill('#ep-note', 'Renamed to the title-deed name; budget uplift approved by the board');
  await page.selectOption('#ep-route', 'PMC-Delivered');
  await page.fill('#ep-pmc', 'Delta Project Management');

  const posted = page.waitForResponse(
    (r) => r.url().includes('/api/mutations') && r.request().method() === 'POST',
    { timeout: 30_000 },
  ).catch(() => null);
  await page.click('button:has-text("Save amendment")');
  const res = await posted;
  check('the amendment is posted', res !== null);
  if (res) {
    check('the API queues it for the Director rather than applying it',
      res.status() === 202,
      `status ${res.status()} ${res.status() === 202 ? '' : (await res.text()).slice(0, 240)}`);
  }
  await page.waitForSelector('#ep-name', { state: 'detached', timeout: 25_000 })
    .then(() => check('the amendment dialog closes', true))
    .catch(() => check('the amendment dialog closes', false, 'still open'));

  // The name is UNCHANGED while the proposal waits.
  check('the register is untouched while the amendment waits',
    (await snapshotAs(PMO_MANAGER)).projects.find((x) => x.id === 'RES-02')?.name === 'Rimal Heights');

  const authorisedAmend = await authoriseTopOfQueue('Uplift authorised by the board');
  check('the Director authorises the amendment', authorisedAmend.status === 200,
    `status ${authorisedAmend.status}`);

  const snap = await snapshotAs(PMO_MANAGER);
  const p = snap.projects.find((x) => x.id === 'RES-02');
  check('the new name is on the register', p?.name === 'Rimal Heights Phase 2', p?.name);
  check('the new route is on the register', p?.route === 'PMC-Delivered', p?.route);
  check('the new delivery partner is on the register', p?.pmc === 'Delta Project Management', p?.pmc);
  check('the new approved budget is on the register', p?.budget === 1_050_000_000, String(p?.budget));
  // An amendment describes; it does not report. The position must be exactly
  // where the approved periods left it.
  check('amending did not touch the reported cost', p?.actual === before?.actual,
    `${before?.actual} became ${p?.actual}`);
  check('amending did not touch earned value', p?.ev === before?.ev,
    `${before?.ev} became ${p?.ev}`);
  check('amending did not touch what has been certified', p?.ipcSubmitted === before?.ipcSubmitted,
    `${before?.ipcSubmitted} became ${p?.ipcSubmitted}`);
  check('amending did not touch what has been paid', p?.paid === before?.paid,
    `${before?.paid} became ${p?.paid}`);
  check('amending did not touch committed cost', p?.committed === before?.committed,
    `${before?.committed} became ${p?.committed}`);

  // And the whole system still reconciles afterwards.
  const badge = await page.locator('button:has-text("/20")').first().innerText().catch(() => '');
  check('every control still passes after an amendment', badge.trim().endsWith('20/20'), badge);

  check('no console errors amending', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ======================================================================
// 3. THE SEATS THAT MAY NOT
// ======================================================================
{
  const { page } = await signedInAs(PROJECT_MANAGER);
  await page.goto(`${APP}#/projects`);
  await page.waitForSelector('tbody tr', { timeout: 25_000 });
  check('a project manager is not offered Add Project',
    !(await page.locator('button:has-text("Add Project")').isVisible()));
  check('a project manager is not offered an amend action',
    (await page.locator('[aria-label^="Amend "]').count()) === 0);
  await page.close();

  // Not merely hidden: refused. The button being absent is a courtesy; the
  // server refusing is the control.
  const refused = await postAs(PROJECT_MANAGER, {
    kind: 'project:update', at: new Date().toISOString(), projectId: 'RES-01',
    name: 'Renamed by someone who may not', note: 'attempt',
  });
  check('the API refuses an amendment from a project manager', refused.status === 403,
    `status ${refused.status} ${refused.body.slice(0, 160)}`);
  check('and says why', refused.body.includes('PMO manager'), refused.body.slice(0, 160));

  const readerRefused = await postAs(VIEWER, {
    kind: 'project:update', at: new Date().toISOString(), projectId: 'RES-01',
    name: 'Renamed by a viewer', note: 'attempt',
  });
  check('the API refuses an amendment from an executive viewer', readerRefused.status === 403,
    `status ${readerRefused.status}`);

  // The reported position is not reachable through this route at all.
  const notAField = await postAs(ADMIN, {
    kind: 'project:update', at: new Date().toISOString(), projectId: 'RES-01',
    actual: 1, ev: 1, note: 'attempting to file a figure through the amend route',
  });
  check('an amendment carrying a reported figure and nothing else is refused',
    notAField.status === 400, `status ${notAField.status} ${notAField.body.slice(0, 160)}`);
}

// ======================================================================
// 4. THE THINGS THAT PRODUCE A FILE
// ======================================================================
{
  const { page, errors } = await signedInAs(ADMIN);

  // ---- the integrity report ------------------------------------------
  await page.click('button:has-text("/20")');
  await page.waitForSelector('button:has-text("Export Report")', { timeout: 15_000 });
  const csv = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  await page.click('button:has-text("Export Report")');
  const csvFile = await csv;
  check('the integrity report exports a file', csvFile !== null);
  if (csvFile) {
    const at = join(OUT, 'integrity.csv');
    await csvFile.saveAs(at);
    const text = readFileSync(at).toString('utf8');
    check('the integrity export carries every control',
      (text.match(/\n/g) ?? []).length >= 20, `${(text.match(/\n/g) ?? []).length} lines`);
    check('the integrity export starts with a byte-order mark', text.charCodeAt(0) === 0xFEFF,
      'Excel on Windows will mis-read non-ASCII names without it');
  }
  await page.keyboard.press('Escape');

  // ---- a report from the Report Centre --------------------------------
  await page.goto(`${APP}#/reports`);
  await page.waitForSelector('button:has-text("Preview")', { timeout: 20_000 });
  await page.locator('button:has-text("Preview")').first().click();
  await page.waitForSelector('button:has-text("Excel")', { timeout: 15_000 });

  const report = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  await page.click('button:has-text("Excel")');
  const reportFile = await report;
  check('the Report Centre Excel button produces a file', reportFile !== null,
    'it used to toast "export is not connected"');
  if (reportFile) {
    const at = join(OUT, 'report.csv');
    await reportFile.saveAs(at);
    const text = readFileSync(at).toString('utf8');
    check('the exported report carries the developments on screen',
      text.includes('RES-01') && text.includes('LND-02'), text.slice(0, 160));
    check('the exported report carries the headline figures',
      text.includes('Approved Budget (SAR)') && text.includes('AFC (SAR)'));
  }

  // The PDF button is the browser's print dialogue. It cannot be opened
  // headlessly, so what is proven here is that the print stylesheet exists and
  // leaves the report sheet visible — the failure mode being a print that
  // comes out blank because an ancestor was display:none.
  const printable = await page.evaluate(() => {
    const sheet = document.querySelector('.report-sheet');
    if (!sheet) return 'no .report-sheet on the preview';
    const rules = [...document.styleSheets]
      .flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
      .filter((r) => r.conditionText?.includes('print') || r.media?.mediaText?.includes('print'));
    if (!rules.length) return 'no @media print rules are in the build';
    const text = rules.map((r) => r.cssText).join(' ');
    if (!text.includes('.report-sheet')) return '@media print does not mention .report-sheet';
    return null;
  });
  check('the PDF button has a print stylesheet that keeps the report visible',
    printable === null, printable ?? '');

  check('no console errors exporting', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ======================================================================
// 5. EVERY MODULE, EVERY SEAT, WITHOUT AN ERROR
//
// A screen that renders but throws is broken in a way nobody sees until the
// day it matters. Each seat walks its own sidebar — which is the point: the
// sidebar is meant to hold only what that seat may use.
// ======================================================================
for (const user of [ADMIN, PMO_MANAGER, PROJECT_MANAGER, REVIEWER, VIEWER]) {
  const { page, errors } = await signedInAs(user);
  const labels = await page.$$eval('.nav-item', (els) => els.map((e) => e.textContent.trim()));
  check(`${user.role}: the sidebar has modules`, labels.length > 0);

  let blank = [];
  for (const label of labels) {
    await page.click(`.nav-item:has-text("${label}")`);
    await page.waitForTimeout(320);
    const body = (await page.locator('.content').innerText().catch(() => '')).trim();
    if (body.length < 40) blank.push(label);
  }
  check(`${user.role}: no module renders empty`, blank.length === 0, blank.join(', '));
  check(`${user.role}: no console errors walking every module`, errors.length === 0,
    errors.slice(0, 4).join(' | '));

  // A seat is never offered a module it may not use.
  //
  // Entry moved INSIDE the Project Workspace, so the assertion moved with it.
  // Left as "Period Entry is not in the sidebar" it would have gone on passing
  // for ever — the label is in nobody's sidebar now — which is a check that
  // has stopped looking at anything.
  const wsTabs = async () => {
    await page.click('.nav-item:has-text("Project Workspace")');
    await page.waitForTimeout(400);
    const open = page.locator('button:has-text("Open RES-")');
    if (await open.count()) { await open.first().click(); await page.waitForTimeout(500); }
    return page.$$eval('.ws-tab', (b2) => b2.map((x) => x.textContent.trim()));
  };
  if (user === VIEWER) {
    check('an executive viewer opens the workspace', labels.includes('Project Workspace'));
    const tabs = await wsTabs();
    check('an executive viewer is not offered Monthly Reporting', !tabs.includes('Monthly Reporting'),
      tabs.join(', '));
    check('an executive viewer still reads the registers inside it', tabs.includes('Cost & Financials'),
      tabs.join(', '));
    check('an executive viewer is not offered Review & Approve', !labels.includes('Review & Approve'));
  }
  if (user === REVIEWER) {
    const tabs = await wsTabs();
    check('a reviewer is not offered Monthly Reporting', !tabs.includes('Monthly Reporting'),
      tabs.join(', '));
    check('a reviewer is offered Review & Approve', labels.includes('Review & Approve'));
  }
  await page.close();
}

// ======================================================================
// 6. ARCHIVE AND RESTORE, THROUGH THE SCREEN
// ======================================================================
{
  const { page, errors } = await signedInAs(ADMIN);
  await page.goto(`${APP}#/projects`);
  await page.waitForSelector('tbody tr', { timeout: 25_000 });

  // The reason is REQUIRED, and the dialog says so rather than presenting a
  // button that does nothing. The owner reported the archive button as "not
  // working at all", which is what a control that refuses in silence looks
  // like from the outside — so the disabled state and the sentence explaining
  // it are both checked here.
  await page.click('[aria-label="Delete RES-21"]');
  await page.waitForSelector('#act-note', { timeout: 15_000 });
  check('deleting is unavailable until a reason is given',
    await page.locator('button:has-text("Delete development")').isDisabled());
  check('and the dialog says why rather than leaving a dead button',
    /Required/.test(await page.locator('#act-note-hint').textContent() ?? ''));

  // THE SYSTEM ASKS HOW LONG IT IS KEPT, on the owner's instruction, and will
  // not accept less than thirty days — said on the screen, not only refused
  // by the API.
  check('the dialog asks how many days it is kept',
    (await page.inputValue('#act-days')) === '30', await page.inputValue('#act-days'));
  await page.fill('#act-note', 'Registered in error during acceptance testing');
  await page.fill('#act-days', '7');
  await page.waitForTimeout(200);
  check('a retention period below thirty days is refused on the screen',
    await page.locator('button:has-text("Delete development")').isDisabled());
  check('and the dialog says what the floor is',
    /at least 30 days/.test(await page.locator('#act-days-hint').textContent() ?? ''),
    await page.locator('#act-days-hint').textContent() ?? '');
  await page.fill('#act-days', '45');
  await page.waitForTimeout(200);
  check('once a reason and a valid period are given the button is live',
    await page.locator('button:has-text("Delete development")').isEnabled());
  check('and the dialog says the date it can no longer be restored',
    /Restorable in one click until/.test(await page.locator('#act-days-hint').textContent() ?? ''));
  await page.click('button:has-text("Delete development")');
  await page.waitForTimeout(1500);

  let snap = await snapshotAs(ADMIN);
  check('a deleted development leaves the portfolio',
    !snap.projects.some((p) => p.id === 'RES-21'));

  await page.click('button:has-text("Archive")');
  await page.waitForTimeout(600);
  const archiveOverflow = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.tbl-wrap *')) {
      if (el.children.length > 0) continue;
      const text = (el.textContent ?? '').trim();
      if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      if (range.getBoundingClientRect().width > box.width - (parseFloat(cs.paddingRight) || 0) + 1) {
        bad.push(`"${text.slice(0, 30)}"`);
      }
    }
    return bad;
  });
  check('nothing in the Archive is painted outside its own cell',
    archiveOverflow.length === 0, archiveOverflow.join(' | ').slice(0, 200));

  const archiveTab = await page.locator('.tbl-wrap').innerText();
  check('the archive lists it with the reason it was deleted',
    /Registered in error/.test(archiveTab), archiveTab.slice(0, 200));
  check('and counts the days left before it can no longer be restored',
    /4[45] days left/.test(archiveTab), archiveTab.slice(0, 300));
  await page.click('button:has-text("Restore")');
  await page.waitForSelector('#act-note', { timeout: 15_000 });
  await page.fill('#act-note', 'Acceptance testing complete; put back');
  await page.click('button:has-text("Restore development")');
  await page.waitForTimeout(1500);

  snap = await snapshotAs(ADMIN);
  check('and comes back when it is restored', snap.projects.some((p) => p.id === 'RES-21'));
  const backRow = snap.projects.find((p) => p.id === 'RES-21');
  check('a restored development carries no trace of the deletion',
    backRow !== undefined && !('archived' in backRow) && !('retainUntil' in backRow),
    JSON.stringify(Object.keys(backRow ?? {}).filter((k) => /archiv|retain/.test(k))));
  check('no console errors deleting and restoring', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ======================================================================
// 6a. CLOSING A DEVELOPMENT OUT, THROUGH THE SCREEN
//
// The third lifecycle state, driven the way a person drives it. What is being
// proven is the owner's requirement in full: a delivered development leaves
// the portfolio ARITHMETIC without leaving the SYSTEM — it keeps its screens,
// its registers and its audit trail, is marked closed wherever it appears,
// and accepts nothing further until somebody reopens it.
// ======================================================================
{
  const { page, errors } = await signedInAs(ADMIN);
  await page.goto(`${APP}#/projects`);
  await page.waitForSelector('tbody tr', { timeout: 25_000 });

  const countBefore = Number(await page.locator('.kpi').first().locator('.kpi-v').textContent());

  await page.click('[aria-label="Close RES-21 out"]');
  await page.waitForSelector('#act-note', { timeout: 15_000 });
  check('closing out is unavailable until the closeout record is given',
    await page.locator('button:has-text("Close development out")').isDisabled());
  await page.fill('#act-note', 'Final account agreed 30 August 2026, ref FA-RES-21');
  await page.click('button:has-text("Close development out")');
  await page.waitForTimeout(1800);

  // ---- out of the arithmetic ------------------------------------------
  const countAfter = Number(await page.locator('.kpi').first().locator('.kpi-v').textContent());
  check('a closed development leaves the portfolio count',
    countAfter === countBefore - 1, `${countBefore} -> ${countAfter}`);

  // ---- and NOT out of the system --------------------------------------
  const after = await snapshotAs(ADMIN);
  const closed = after.projects.find((p) => p.id === 'RES-21');
  check('but stays in the portfolio and keeps its figures', Boolean(closed?.closedAt));
  check('its registers are still readable', Boolean(after.registers?.['RES-21']));

  await page.click('button:has-text("Completed")');
  await page.waitForTimeout(700);
  check('it is listed under Completed',
    await page.locator('tbody tr:has-text("RES-21")').isVisible());
  check('the Completed tab says the figures are outside the portfolio totals',
    /outside the portfolio figures/.test(await page.locator('.card .between').last().textContent() ?? ''));

  // ---- frozen, said on the screen it is read on ------------------------
  await page.goto(`${APP}#/cost?level=Project&portfolio=Residential&project=RES-21`);
  await page.waitForSelector('.proj-band', { timeout: 20_000 });
  check('every screen of a closed development says it is closed',
    /Closed out/.test(await page.locator('.proj-band').textContent() ?? ''));
  check('and says the figures are final',
    /no longer accepts periods/.test(await page.locator('.closed-note').textContent() ?? ''));

  // ---- reopened --------------------------------------------------------
  // Reopening is reached from the Completed tab, because that is where a
  // closed development now lives — it is deliberately not in the list of what
  // is being delivered.
  await page.goto(`${APP}#/projects`);
  await page.waitForSelector('tbody tr', { timeout: 25_000 });
  await page.click('button:has-text("Completed")');
  await page.waitForTimeout(700);
  await page.click('button:has-text("Reopen")');
  await page.waitForSelector('#act-note', { timeout: 15_000 });
  await page.fill('#act-note', 'Retention release outstanding');
  await page.click('button:has-text("Reopen development")');
  await page.waitForTimeout(1800);

  const reopened = (await snapshotAs(ADMIN)).projects.find((p) => p.id === 'RES-21');
  check('reopening puts it back into the portfolio', reopened && !reopened.closedAt);
  check('no console errors closing out and reopening', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ======================================================================
// 6c. SEATS, FROM THE ADMINISTRATION SCREEN
//
// The owner's requirement in one section: "if I want to add users, change
// roles and authorisations, delete users, increase users and roles I can do
// it through the system using the admin account without needing to go to the
// backend or to ask you".
//
// So this drives it the way they will: define a seat, give it a capability,
// take one away, and watch a person holding it be refused on the very next
// request. Nothing here touches SQL.
// ======================================================================
{
  const { page, errors } = await signedInAs(ADMIN);
  await page.goto(`${APP}#/admin`);
  await page.waitForSelector('.tabs', { timeout: 25_000 });
  await page.click('button.tab:has-text("Roles & Permissions")');
  await page.waitForSelector('table', { timeout: 15_000 });

  // ---- THE LAYOUT DETECTORS, ON A SCREEN check:layout CANNOT REACH ----
  //
  // `check:layout` drives the offline build, and these two panels — the seats
  // table and the Archive tab — do not exist there: one has no seats to read
  // and the other no accounts to delete a development. So the one place they
  // are measured is here.
  //
  // Text wider than its box is measured with a Range over the element's own
  // text, NOT `scrollWidth`: with overflow at its default `visible` there is
  // no scrollable area, so Chrome reports `scrollWidth === clientWidth` while
  // the words are painted straight across the next column — which is exactly
  // the defect this was written for, found on the seats table's description
  // column running under the capability chips.
  const overflowing = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.tbl-wrap *')) {
      if (el.closest('svg') || el.children.length > 0) continue;
      const text = (el.textContent ?? '').trim();
      if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      if (cs.textOverflow === 'ellipsis') continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const laid = range.getBoundingClientRect();
      const pad = parseFloat(cs.paddingRight) || 0;
      if (laid.width > box.width - pad + 1) {
        bad.push(`"${text.slice(0, 30)}" needs ${Math.ceil(laid.width)}px in ${Math.round(box.width)}px`);
      }
    }
    return bad;
  });
  check('nothing on the seats table is painted outside its own cell',
    overflowing.length === 0, overflowing.join(' | ').slice(0, 240));

  const table = await page.locator('.tbl-wrap').innerText();
  check('the seats screen lists the six the product defines',
    ['Owner Admin', 'PMO Director', 'PMO Controls Manager', 'PMO Team Leader',
      'Project Manager', 'Executive Viewer'].every((t) => table.includes(t)),
    table.slice(0, 220));
  check('it says which seat is exempt from separation of duties',
    /Exempt from separation of duties/.test(table));
  check('the administrator seat is not editable from the screen',
    await page.locator('button[aria-label="Administer for Owner Admin"]').count() === 0);

  // ---- define a seat --------------------------------------------------
  await page.click('button:has-text("Add a seat")');
  await page.waitForSelector('#seat-name', { timeout: 15_000 });
  check('adding a seat is unavailable until it is named',
    await page.locator('button:has-text("Add this seat")').isDisabled());
  await page.fill('#seat-name', 'Commercial Lead');
  await page.waitForTimeout(200);
  check('a name that could not travel in a URL is refused, and the form says so',
    /lower case/.test(await page.locator('.form-hint').last().textContent() ?? ''),
    await page.locator('.form-hint').last().textContent() ?? '');
  await page.fill('#seat-name', 'commercial_lead');
  await page.fill('#seat-title', 'Commercial Lead');
  await page.fill('#seat-does', 'Approves claims and proposes changes to a development');
  await page.click('button.chip:has-text("Approve")');
  await page.waitForTimeout(200);
  check('once it is named and described the seat can be added',
    await page.locator('button:has-text("Add this seat")').isEnabled());
  await page.click('button:has-text("Add this seat")');
  await page.waitForTimeout(1500);

  const withNew = await page.locator('.tbl-wrap').innerText();
  check('the new seat appears in the table', /Commercial Lead/.test(withNew),
    withNew.slice(0, 200));

  const seatRow = await db.query("select * from role_capabilities where role = 'commercial_lead'");
  check('and it is a row in the database, with the flags that were chosen',
    seatRow.rowCount === 1 && seatRow.rows[0].may_approve === true
      && seatRow.rows[0].may_administer === false,
    JSON.stringify(seatRow.rows[0])?.slice(0, 200));
  check('a seat defined from the screen is never exempt from separation of duties',
    seatRow.rows[0]?.sod_exempt === false);

  // ---- issue an account to it, from the Users tab ---------------------
  await page.click('button.tab:has-text("Users")');
  await page.waitForSelector('table', { timeout: 15_000 });
  await page.click('button:has-text("Add user")');
  await page.waitForSelector('#nu-email', { timeout: 15_000 });
  const options = await page.locator('#nu-role option').allTextContents();
  check('the new seat is offered when an account is issued',
    options.includes('Commercial Lead'), options.join(', '));
  await page.close();

  // ---- taking the capability away is felt on the next request ---------
  //
  // Through the API rather than the browser, because what is being proven is
  // that the SERVER reads the flags on every request — not that a screen
  // hides a button.
  await db.query(
    "update users set role = 'commercial_lead' where id = $1", [PROJECT_MANAGER.email],
  );
  const proposesNow = await postAs(PROJECT_MANAGER, {
    kind: 'project:update', at: new Date().toISOString(), projectId: 'RES-01',
    name: 'Named by a seat defined this morning', note: 'x', reason: 'x',
  });
  check('an account moved to the new seat proposes, because its flags say approve',
    proposesNow.status === 202, `status ${proposesNow.status}: ${proposesNow.body?.slice?.(0, 140) ?? ''}`);

  const admin2 = await signedInAs(ADMIN);
  await admin2.page.goto(`${APP}#/admin`);
  await admin2.page.waitForSelector('.tabs', { timeout: 25_000 });
  await admin2.page.click('button.tab:has-text("Roles & Permissions")');
  await admin2.page.waitForSelector('table', { timeout: 15_000 });
  await admin2.page.click('button[aria-label="Approve for Commercial Lead"]');
  await admin2.page.waitForTimeout(1500);

  const refusedNow = await postAs(PROJECT_MANAGER, {
    kind: 'project:update', at: new Date().toISOString(), projectId: 'RES-01',
    name: 'Should not land', note: 'x', reason: 'x',
  });
  check('and is refused on the very next request once the flag is taken away',
    refusedNow.status === 403, `status ${refusedNow.status}`);

  // ---- a seat somebody holds cannot be removed ------------------------
  const stillHeld = await admin2.page.locator('tr:has-text("Commercial Lead")').innerText();
  check('the screen says a seat somebody holds cannot be removed',
    /Move them to another seat first/.test(stillHeld), stillHeld.slice(0, 200));

  await db.query("update users set role = 'contributor' where id = $1", [PROJECT_MANAGER.email]);
  await db.query("delete from project_change_requests where requested_by = $1", [PROJECT_MANAGER.email]);
  await db.query("delete from role_capabilities where role = 'commercial_lead'");
  check('no console errors defining and editing a seat', errors.length === 0, errors.join(' | '));
  await admin2.page.close();
}

// ======================================================================
// 6d. PORTFOLIOS AND DELIVERY ROUTES, FROM THE ADMINISTRATION SCREEN
//
// The last two lists that needed a developer. The owner's words: "if in
// future we want to add portfolio or delete some portfolio it should be
// through system".
//
// What is proven here is the whole round trip: define a portfolio on the
// Administration screen, register a development into it from the Add Project
// form a moment later without a reload, and watch the Remove button refuse
// while that development is in it.
// ======================================================================
{
  const { page, errors } = await signedInAs(ADMIN);
  await page.goto(`${APP}#/admin`);
  await page.waitForSelector('.tabs', { timeout: 25_000 });
  await page.click('button.tab:has-text("Portfolios & Routes")');
  await page.waitForSelector('#new-portfolio', { timeout: 15_000 });

  const listed = await page.locator('.tbl-wrap').first().innerText();
  check('the four portfolios the product ships with are listed',
    ['Residential', 'Commercial', 'Mixed Use', 'Land Development'].every((n) => listed.includes(n)),
    listed.slice(0, 200));
  check('a portfolio the product defines offers no Remove',
    (await page.locator('tr:has-text("Residential") button:has-text("Remove")').count()) === 0);
  check('adding is unavailable until a name is typed',
    await page.locator('button:has-text("Add portfolio")').isDisabled());

  await page.fill('#new-portfolio', 'R');
  await page.waitForTimeout(200);
  check('a one-character name is refused, and the form says why',
    /at least two characters/.test(await page.locator('#new-portfolio-hint').textContent() ?? ''));
  await page.fill('#new-portfolio', 'Residential');
  await page.waitForTimeout(200);
  check('a portfolio that already exists is refused before it is sent',
    (await page.locator('button:has-text("Add portfolio")').isDisabled())
      && /already exists/.test(await page.locator('#new-portfolio-hint').textContent() ?? ''));

  await page.fill('#new-portfolio', 'Hospitality');
  await page.selectOption('#new-tone', 'teal');
  await page.click('button:has-text("Add portfolio")');
  await page.waitForTimeout(1600);

  const row = await db.query("select name, tone, built_in from portfolios where name = 'Hospitality'");
  check('the portfolio is a row in the database, with the colour that was chosen',
    row.rowCount === 1 && row.rows[0].tone === 'teal' && row.rows[0].built_in === false,
    JSON.stringify(row.rows[0]));

  // ---- and it reaches the form, with no reload -----------------------
  await page.goto(`${APP}#/projects`);
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Add Project")');
  await page.waitForSelector('#ap-portfolio', { timeout: 15_000 });
  const options = await page.locator('#ap-portfolio option').allTextContents();
  check('the new portfolio is offered on the Add Project form without a reload',
    options.includes('Hospitality'), options.join(', '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---- register a development into it, then try to remove it ---------
  const registered = await postAs(ADMIN, {
    kind: 'project:create', at: new Date().toISOString(),
    project: { id: 'HOS-01', name: 'Coastal Hotel', portfolio: 'Hospitality',
      route: 'PMC-Delivered', budget: 300_000_000 },
  });
  check('a development registers into the new portfolio', registered.status === 200,
    `status ${registered.status}: ${registered.body?.slice?.(0, 140) ?? ''}`);

  await page.goto(`${APP}#/admin`);
  await page.waitForSelector('.tabs', { timeout: 25_000 });
  await page.click('button.tab:has-text("Portfolios & Routes")');
  await page.waitForSelector('#new-portfolio', { timeout: 15_000 });
  const held = await page.locator('tr:has-text("Hospitality")').innerText();
  check('the panel counts the development in it',
    /Hospitality[\s\S]*\b1\b/.test(held), held.replace(/\s+/g, ' ').slice(0, 160));
  check('and the Remove button is unavailable, saying why',
    (await page.locator('tr:has-text("Hospitality") button:has-text("Remove")').isDisabled())
      && /Move them to another portfolio first/.test(held),
    held.replace(/\s+/g, ' ').slice(0, 200));

  // ---- move it out, and only then does the portfolio go --------------
  await postAs(ADMIN, {
    kind: 'project:update', at: new Date().toISOString(), projectId: 'HOS-01',
    portfolio: 'Commercial', note: 'moved so the portfolio can be removed',
  });
  await page.reload();
  await page.waitForSelector('.tabs', { timeout: 25_000 });
  await page.click('button.tab:has-text("Portfolios & Routes")');
  await page.waitForSelector('#new-portfolio', { timeout: 15_000 });
  await page.click('tr:has-text("Hospitality") button:has-text("Remove")');
  await page.waitForTimeout(1500);
  check('once nothing is in it, the portfolio is removed',
    (await db.query("select 1 from portfolios where name = 'Hospitality'")).rowCount === 0);

  // ---- the same detectors the layout gate cannot reach ---------------
  const spill = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.tbl-wrap *')) {
      if (el.closest('svg') || el.children.length > 0) continue;
      const text = (el.textContent ?? '').trim();
      if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      if (range.getBoundingClientRect().width > box.width - (parseFloat(cs.paddingRight) || 0) + 1) {
        bad.push(`"${text.slice(0, 30)}"`);
      }
    }
    return bad;
  });
  check('nothing on the portfolios panel is painted outside its own cell',
    spill.length === 0, spill.join(' | ').slice(0, 200));

  check('no console errors defining a portfolio', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ======================================================================
// 6b. MESSAGES
//
// The conversation around the figures. A message is NOT a mutation: it moves
// nothing, so it is not in the change log and not put through the controls —
// which is exactly what the last check in this block proves.
// ======================================================================
{
  const pm = await signedInAs(PROJECT_MANAGER);
  const manager = await signedInAs(PMO_MANAGER);

  // ---- every seat has it, including the one that may change nothing ----
  {
    const viewer = await signedInAs(VIEWER);
    // Reached from the TOP BAR, not the sidebar: a conversation is not one of
    // the things the portfolio is made of. The badge is what makes it
    // findable from every screen.
    const labels = await viewer.page.$$eval('.nav-item', (els) => els.map((e) => e.textContent.trim()));
    check('Messages is not in the sidebar', !labels.includes('Messages'));
    check('an executive viewer is offered Messages in the top bar',
      await viewer.page.locator('button[aria-label^="Messages,"]').isVisible(),
      'the person most likely to need to ask a question about a figure');
    // Scoped to the top bar: there is a second one beside the account name
    // in the sidebar, which is also a place people look for it.
    check('and a way to sign out, in the top bar',
      await viewer.page.locator('.topbar-right button[aria-label="Sign out"]').isVisible());
    await viewer.page.close();
  }

  // ---- the project manager writes to the PMO manager -------------------
  await pm.page.goto(`${APP}#/messages`);
  await pm.page.waitForSelector('.msg-person', { timeout: 25_000 });

  const listed = await pm.page.$$eval('.msg-person', (els) => els.map((e) => e.textContent));
  check('the directory lists the other seats',
    listed.some((t) => t.includes(PMO_MANAGER.email)), listed.join(' | ').slice(0, 200));

  await pm.page.click(`.msg-person:has-text("${PMO_MANAGER.email}")`);
  await pm.page.waitForSelector('.msg-compose textarea', { timeout: 15_000 });

  // Naming the development the question is about is the whole reason this
  // lives inside the system rather than in a chat app.
  await pm.page.selectOption('.msg-compose select', 'RES-01');
  await pm.page.fill('.msg-compose textarea', 'Is VO-015 going to be approved before I close period 9?');
  const posted = pm.page.waitForResponse(
    (r) => r.url().includes('/api/messages') && r.request().method() === 'POST',
    { timeout: 25_000 },
  ).catch(() => null);
  await pm.page.click('.msg-compose button[type=submit]');
  const sentRes = await posted;
  check('sending a message posts it', sentRes !== null);
  if (sentRes) {
    check('the API accepts it', sentRes.status() === 200,
      `status ${sentRes.status()} ${sentRes.status() === 200 ? '' : (await sentRes.text()).slice(0, 200)}`);
  }
  await pm.page.waitForTimeout(600);
  check('the message appears in the sender\'s own thread',
    (await pm.page.locator('.msg-bubble').count()) >= 1);
  check('and carries the development it is about',
    (await pm.page.locator('.msg-about').first().innerText()).includes('RES-01'));

  const stored = await db.query(
    'select body, project_id, read_at from messages where sender_id = $1 and recipient_id = $2',
    [PROJECT_MANAGER.email, PMO_MANAGER.email],
  );
  check('it reaches the database', stored.rowCount === 1, `${stored.rowCount} rows`);
  check('with the development reference', stored.rows[0]?.project_id === 'RES-01');
  check('and is unread until the recipient opens it', stored.rows[0]?.read_at === null);

  // ---- the PMO manager sees it, unread ---------------------------------
  //
  // Checked from the DASHBOARD, not from the Messages screen. Opening
  // Messages selects the most recent conversation and therefore reads it —
  // which is right, and which is why asserting the unread state there would
  // be racing the screen's own behaviour. The badge that matters is the one
  // in the shell: it is what tells somebody working on a period that a
  // question is waiting, from wherever they happen to be.
  //
  // Reloaded rather than waited out: this page signed in before the message
  // was sent, and the inbox polls every 25 seconds. What is being proven here
  // is that the badge RENDERS what the API reports; that the poll delivers
  // without a reload is proven below, on the conversation, whose interval is
  // short enough to wait for.
  await manager.page.goto(`${APP}#/dashboard`);
  await manager.page.reload();
  await manager.page.waitForSelector('.sidebar', { timeout: 25_000 });
  await manager.page.waitForTimeout(1500);
  const badge = manager.page.locator('button[aria-label^="Messages,"] .badge-dot');
  check('the shell shows an unread message badge from any screen',
    await badge.isVisible().catch(() => false),
    await manager.page.locator('button[aria-label^="Messages,"]').getAttribute('aria-label') ?? 'no button');
  check('and the badge counts the unread message',
    (await badge.innerText().catch(() => '')) === '1',
    await badge.innerText().catch(() => 'none'));

  await manager.page.goto(`${APP}#/messages`);
  await manager.page.waitForSelector('.msg-person', { timeout: 25_000 });
  await manager.page.waitForTimeout(600);

  await manager.page.click(`.msg-person:has-text("${PROJECT_MANAGER.email}")`);
  await manager.page.waitForSelector('.msg-bubble', { timeout: 15_000 });
  check('the recipient reads the message',
    (await manager.page.locator('.msg-body').innerText()).includes('VO-015'));

  await manager.page.waitForTimeout(600);
  const afterRead = await db.query(
    'select read_at from messages where sender_id = $1 and recipient_id = $2',
    [PROJECT_MANAGER.email, PMO_MANAGER.email],
  );
  check('opening the conversation marks it read', afterRead.rows[0]?.read_at !== null);
  check('and the unread badge clears',
    (await manager.page.locator('.msg-unread').count()) === 0);
  check('as does the one in the shell',
    !(await manager.page.locator('button[aria-label^="Messages,"] .badge-dot').isVisible()
      .catch(() => false)));

  // ---- and replies ------------------------------------------------------
  await manager.page.fill('.msg-compose textarea', 'Approving it tomorrow. File the period after that.');
  await manager.page.click('.msg-compose button[type=submit]');
  await manager.page.waitForTimeout(1200);

  // NOT reloaded. The project manager's thread has been sitting open this
  // whole time, and the reply must arrive on its own — that is the difference
  // between a conversation and a form you have to refresh. The conversation
  // polls every 8 seconds, so this waits for two ticks and no more.
  let arrived = false;
  for (let i = 0; i < 20 && !arrived; i++) {
    await sleep(1000);
    arrived = (await pm.page.locator('.msg-body').innerText()).includes('Approving it tomorrow');
  }
  check('the reply arrives in an open conversation without a reload', arrived,
    'the poll did not deliver it within 20 seconds');

  await pm.page.close();
  await manager.page.close();

  // ---- what the route refuses ------------------------------------------
  const token = await tokenFor(PROJECT_MANAGER);
  const post = async (body) => {
    const r = await fetch(`${ORIGIN}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.text() };
  };

  const toSelf = await post({ to: PROJECT_MANAGER.email, body: 'a note to myself' });
  check('a message to yourself is refused', toSelf.status === 400, `status ${toSelf.status}`);

  const empty = await post({ to: PMO_MANAGER.email, body: '   ' });
  check('an empty message is refused', empty.status === 400, `status ${empty.status}`);

  const nobody = await post({ to: 'ghost@tazayud.test', body: 'hello' });
  check('a message to an account that does not exist is refused',
    nobody.status === 404, `status ${nobody.status}`);

  const badRef = await post({ to: PMO_MANAGER.email, body: 'about', projectId: 'not-a-project' });
  check('a malformed development reference is refused',
    badRef.status === 400, `status ${badRef.status}`);

  const huge = await post({ to: PMO_MANAGER.email, body: 'x'.repeat(4001) });
  check('a message beyond the length limit is refused', huge.status === 400, `status ${huge.status}`);

  // ---- unauthenticated, and somebody else's conversation ----------------
  const anon = await fetch(`${ORIGIN}/api/messages`);
  check('messages are not readable without a token', anon.status === 401, `status ${anon.status}`);

  // There is no way to ASK for a conversation you are not in: both halves of
  // the query are anchored to the caller, so a reader who names two other
  // people gets their own (empty) conversation with one of them, never theirs.
  const readerToken = await tokenFor(VIEWER);
  const peeked = await (await fetch(
    `${ORIGIN}/api/messages/thread?with=${encodeURIComponent(PROJECT_MANAGER.email)}`,
    { headers: { authorization: `Bearer ${readerToken}` } },
  )).json();
  check('a third party cannot read somebody else\'s conversation',
    (peeked.messages ?? []).length === 0, `${(peeked.messages ?? []).length} messages returned`);

  // ---- a message is not a mutation --------------------------------------
  const log = await db.query('select count(*)::int as n from mutations where kind like $1', ['message%']);
  check('no message was written to the change log', log.rows[0].n === 0, `${log.rows[0].n} rows`);
}

// ======================================================================
// 6c. THE MODEL
//
// Driven against a stub that speaks the same wire format. What is proven is
// everything this system owns: that the key never leaves the server, that the
// brief carries the real position and only what the asker may see, that a
// read document fills a FORM rather than filing anything, and that the entry
// it produces goes through the ordinary controls.
// ======================================================================
{
  const before = seen.length;

  // ---- the status route is honest --------------------------------------
  {
    const token = await tokenFor(ADMIN);
    const status = await (await fetch(`${ORIGIN}/api/ai/status`, {
      headers: { authorization: `Bearer ${token}` },
    })).json();
    check('the app can ask whether a model is connected', status.configured === true);
    check('and which one', status.model === 'gemini-3.5-flash-lite', String(status.model));
  }

  // ---- the assistant ----------------------------------------------------
  {
    const { page, errors } = await signedInAs(PMO_MANAGER);
    await page.click('button[aria-label="PMO assistant"]');
    await page.waitForSelector('input[aria-label="Ask the assistant"]', { timeout: 15_000 });
    await page.fill('input[aria-label="Ask the assistant"]', 'What is our budget variance?');
    const asked = page.waitForResponse((r) => r.url().includes('/api/ai/assistant'), { timeout: 25_000 })
      .catch(() => null);
    await page.keyboard.press('Enter');
    const res = await asked;
    check('the assistant asks the API rather than a model in the browser', res !== null);
    if (res) check('and the API answers', res.status() === 200, `status ${res.status()}`);
    await page.waitForTimeout(900);
    check('the answer is shown', (await page.locator('.drawer-b').innerText()).includes('STUB ANSWER'));
    check('no console errors asking the assistant', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  const call = seen[seen.length - 1];
  check('the model was reached with the key as a header', call?.key === 'stub-key-for-acceptance-testing');
  const brief = (call?.sent.contents?.[0]?.parts ?? []).map((p) => p.text ?? '').join(' ');
  check('the brief carries the real position, not the question alone',
    brief.includes('Approved Budget:') && brief.includes('Budget Variance'), brief.slice(0, 120));
  check('the brief names the developments in scope', /\bRES-01\b/.test(brief));
  const system = (call?.sent.systemInstruction?.parts ?? []).map((p) => p.text ?? '').join(' ');
  check('the model is told to answer only from the brief',
    /must appear in the brief/i.test(system), system.slice(0, 120));
  check('and is told not to name what is behind it',
    /Do not discuss, name, hint at or speculate/i.test(system));
  check('and is told it cannot change anything',
    /You cannot change anything/i.test(system));
  check('temperature is zero — there is one right answer about money',
    call?.sent.generationConfig?.temperature === 0, String(call?.sent.generationConfig?.temperature));

  // ---- the brief is the access boundary ---------------------------------
  {
    const token = await tokenFor(PROJECT_MANAGER);
    await fetch(`${ORIGIN}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: 'Summarise every development we have.', level: 'Corporate' }),
    });
    const pmCall = seen[seen.length - 1];
    const pmBrief = (pmCall?.sent.contents?.[0]?.parts ?? []).map((p) => p.text ?? '').join(' ');
    const named = [...new Set(pmBrief.match(/\b[A-Z]{3}-\d{2}\b/g) ?? [])];
    // The project manager is assigned RES-01 and nothing else, so that is the
    // only development the model may be shown. A model can only tell somebody
    // what was put in front of it.
    check('a project manager\'s brief carries only their own developments',
      named.length === 1 && named[0] === 'RES-01', named.join(' '));
  }

  // ---- a closed development is out of the brief too ---------------------
  //
  // The brief TOTALS what it is given, so a development that has been closed
  // out must not be in it: the assistant would otherwise quote a portfolio
  // budget that no screen on the system agrees with. Asked at Corporate level
  // — at Project level a closed development is exactly what was asked about,
  // and the brief carries it, which is the same line ScopeProvider draws.
  {
    const token = await tokenFor(ADMIN);
    const at = new Date().toISOString();
    const post = (path, body) => fetch(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    await post('/api/mutations', {
      kind: 'project:close', at, projectId: 'LND-02', note: 'Final account agreed, QA',
    });

    await post('/api/ai/assistant', { question: 'What is the portfolio position?', level: 'Corporate' });
    const closedCall = seen[seen.length - 1];
    const closedBrief = (closedCall?.sent.contents?.[0]?.parts ?? []).map((p) => p.text ?? '').join(' ');
    check('a closed development is not in the portfolio brief the model is given',
      !/\bLND-02\b/.test(closedBrief),
      'the assistant would otherwise total a figure no screen shows');

    await post('/api/ai/assistant', {
      question: 'What did this one cost?', level: 'Project', project: 'LND-02',
    });
    const oneCall = seen[seen.length - 1];
    const oneBrief = (oneCall?.sent.contents?.[0]?.parts ?? []).map((p) => p.text ?? '').join(' ');
    check('but asking about it by name still answers from its own figures',
      /\bLND-02\b/.test(oneBrief));

    await post('/api/mutations', {
      kind: 'project:reopen', at, projectId: 'LND-02', note: 'QA teardown',
    });
  }

  // ---- reading a document ----------------------------------------------
  {
    const token = await tokenFor(PROJECT_MANAGER);
    const post = async (payload) => {
      const r = await fetch(`${ORIGIN}/api/ai/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      return { status: r.status, body: await r.text() };
    };

    const pdf = Buffer.from('%PDF-1.4 a stub document').toString('base64');
    const got = await post({ file: pdf, mimeType: 'application/pdf' });
    check('a document can be read', got.status === 200, `status ${got.status} ${got.body.slice(0, 160)}`);
    if (got.status === 200) {
      const doc = JSON.parse(got.body);
      check('the fields come back', doc.reference === 'IPC-STUB-01', String(doc.reference));
      check('with a confidence for each', doc.confidence?.certified === 96, String(doc.confidence?.certified));
      check('and amounts as numbers, not text', typeof doc.certified === 'number');
    }

    check('a file type the reader cannot read is refused',
      (await post({ file: pdf, mimeType: 'application/zip' })).status === 400);
    check('an empty upload is refused',
      (await post({ file: '', mimeType: 'application/pdf' })).status === 400);

    // NOTHING was filed. Reading is not recording.
    const log = await db.query("select count(*)::int as n from mutations where kind = 'ipc'");
    check('reading a document files nothing', log.rows[0].n === 0, `${log.rows[0].n} certificates`);
  }

  // ---- who may not -------------------------------------------------------
  {
    const readerToken = await tokenFor(VIEWER);
    const refused = await fetch(`${ORIGIN}/api/ai/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${readerToken}` },
      body: JSON.stringify({ file: 'eA==', mimeType: 'application/pdf' }),
    });
    check('an executive viewer may not read a document into the register',
      refused.status === 403, `status ${refused.status}`);

    const anon = await fetch(`${ORIGIN}/api/ai/assistant`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'hello' }),
    });
    check('the model is not reachable without a token', anon.status === 401, `status ${anon.status}`);
  }

  // ---- the rate limit ----------------------------------------------------
  {
    const token = await tokenFor(REVIEWER);
    let limited = 0;
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${ORIGIN}/api/ai/assistant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: `question ${i}`, level: 'Corporate' }),
      });
      if (r.status === 429) limited++;
    }
    check('one person cannot spend the whole deployment\'s quota', limited > 0,
      'twelve rapid questions were all allowed through');
  }

  check('the model was called, and only through the server', seen.length > before);
}

// ======================================================================
// 7. AND ALL OF IT STILL RECONCILES
// ======================================================================
// ---- the Project Workspace, and confirming a payment -------------------
//
// The workspace is one screen hosting fifteen modules, so the things worth
// proving here are the ones its own code owns: that it does not help itself to
// a development, that its tab row reaches every module, that the reporting
// calendar reads from what was actually filed, and that Monthly Reporting is
// not offered to a seat that may not file.
{
  const { page } = await signedInAs(PMO_MANAGER);
  await page.click('.nav-item:has-text("Project Workspace")');
  await page.waitForTimeout(500);

  const chooser = await page.locator('button:has-text("Open RES-")').count();
  check('the workspace asks which development rather than choosing one',
    chooser === 1, `${chooser} chooser button(s)`);

  await page.click('button:has-text("Open RES-")');
  await page.waitForTimeout(600);

  const tabs = await page.$$eval('.ws-tab', (b2) => b2.map((x) => x.textContent.trim()));
  check('the module tab row carries every module of the development',
    tabs.length >= 14, tabs.join(' | '));
  check('Monthly Reporting is not offered to the approver — they approve, they do not file',
    !tabs.includes('Monthly Reporting'), tabs.join(' | '));

  const months = await page.$$eval('.ws-mo .st', (b2) => b2.map((x) => x.textContent.trim()));
  check('the reporting calendar shows twelve months', months.length === 12, `${months.length}`);
  check('a month with nothing filed says so rather than reading approved',
    months.some((m) => m === 'Not reported' || m === 'Nothing filed' || m === 'Future'),
    months.join(', '));

  // Exactly one band, and above the tab row: the portal, not a second copy.
  await page.click('.ws-tab:has-text("Cost & Financials")');
  await page.waitForTimeout(500);
  const bands = await page.$$eval('.proj-band', (b2) => b2.length);
  check('the module band is drawn once, not twice', bands === 1, `${bands} band(s)`);
  const order = await page.evaluate(() => {
    const band = document.querySelector('.proj-band');
    const row = document.querySelector('.ws-tabs');
    return band && row
      ? Boolean(band.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)
      : false;
  });
  check('the band sits above the module tab row, where the design puts it', order);
  await page.close();
}

// PAID IS CONFIRMED, NEVER INFERRED — and by one seat only.
{
  const before = (await snapshotAs(ADMIN)).projects.find((x) => x.id === 'RES-01');

  const asPm = await postAs(PROJECT_MANAGER, {
    kind: 'claim:pay', at: new Date().toISOString(), projectId: 'RES-01',
    claimId: 'PC-001', amount: 1_000, valueDate: '2026-10-15', reference: 'QA-PAY-PM',
  });
  check('a project manager may not confirm that a payment was made',
    asPm.status === 403, `status ${asPm.status}`);

  const asReviewer = await postAs(REVIEWER, {
    kind: 'claim:pay', at: new Date().toISOString(), projectId: 'RES-01',
    claimId: 'PC-001', amount: 1_000, valueDate: '2026-10-15', reference: 'QA-PAY-REV',
  });
  check('a reviewer may not confirm that a payment was made',
    asReviewer.status === 403, `status ${asReviewer.status}`);

  const ok = await postAs(PMO_MANAGER, {
    kind: 'claim:pay', at: new Date().toISOString(), projectId: 'RES-01',
    claimId: 'PC-001', amount: 1_000, valueDate: '2026-10-15', reference: 'QA-PAY-OK',
  });
  check('the PMO manager confirms a payment', ok.status === 200, `status ${ok.status}`);

  const after = (await snapshotAs(ADMIN)).projects.find((x) => x.id === 'RES-01');
  check('paid moved by exactly what was transferred',
    after.paid === before.paid + 1_000, `${before.paid} -> ${after.paid}`);
  check('certified did not move with it — a transfer is not a certification',
    after.ipcSubmitted === before.ipcSubmitted, `${before.ipcSubmitted} -> ${after.ipcSubmitted}`);
  check('earned value did not move with it — a payment is not progress',
    after.ev === before.ev, `${before.ev} -> ${after.ev}`);
}

{
  const snap = await snapshotAs(ADMIN);
  check('every development is still readable after the whole run',
    snap.projects.length >= 8, `${snap.projects.length}`);
  const { page } = await signedInAs(ADMIN);
  const badge = (await page.locator('button:has-text("/20")').first().innerText()).trim();
  check('the reconciliation badge reads 20/20 at the end of the run',
    badge.endsWith('20/20'), badge);
  await page.close();
}

} catch (e) {
  failures.push(`the harness could not complete: ${e.message}`);
}

await db.end();
await browser.close();
web.close();
stub.close();
stop();

// ---- helpers ----------------------------------------------------------

/**
 * A workbook in the template's own shape, two package rows filled and four
 * left exactly as it ships — which is what a person actually hands back.
 *
 * The route deliberately says "Self-Delivered", the wording the template used
 * to tell people to write. Anybody holding one of those workbooks must still
 * be able to import it.
 */
function buildFilledWorkbook() {
  return writeWorkbook([
    {
      name: '1 Project',
      rows: [
        ['Field', 'Value'],
        ['Project ID', 'RES-21'],
        ['Project Name', 'Workbook Gardens'],
        ['Portfolio', 'residential'],
        ['Delivery Route', 'Self-Delivered'],
        ['Approved Budget (SAR)', '900,000,000'],
      ],
    },
    {
      name: '2 Packages',
      rows: [
        ['WBS Code', 'Package / Scope', 'Package Budget (SAR)'],
        ['1.1', 'Pre-Construction', 200_000_000],
        ['1.2', 'Substructure', 500_000_000],
        ['1.3', 'Superstructure', ''],
        ['1.4', 'MEP', ''],
        ['1.5', 'Finishes', ''],
        ['1.6', 'External Works', ''],
      ],
    },
    {
      name: '3 Contracts',
      rows: [
        ['Package No.', 'Contract / Scope', 'WBS Code', 'Contractor', 'Role',
          'Award Value (SAR)', 'Retention %', 'Award Date (YYYY-MM-DD)'],
        ['PKG-01', 'Enabling works', '1.1', 'Alpha Contracting', 'Main Contractor',
          260_000_000, 5, '2026-02-10'],
        ['PKG-02', 'Substructure', '1.2', '', 'Main Contractor', '', 5, ''],
      ],
    },
  ]);
}

async function tokenFor(user) {
  const r = await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  return (await r.json()).token;
}

async function snapshotAs(user) {
  const token = await tokenFor(user);
  const r = await fetch(`${ORIGIN}/api/snapshot`, { headers: { authorization: `Bearer ${token}` } });
  return r.json();
}

async function postAs(user, mutation) {
  const token = await tokenFor(user);
  const r = await fetch(`${ORIGIN}/api/mutations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(mutation),
  });
  return { status: r.status, body: await r.text() };
}

// ---- the result -------------------------------------------------------
const header = `\nQA  every option, pressed  —  ${checks} checks\n`;
if (failures.length) {
  console.error(header);
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s). Files from the run are in ${OUT}\n`);
  process.exit(1);
}
console.log(header);
console.log('  every action a person can take changes the data, produces the file, or is refused');
console.log('  with a reason — and the system reconciles at the end of it.\n');
