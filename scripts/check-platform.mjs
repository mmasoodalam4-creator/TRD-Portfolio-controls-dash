#!/usr/bin/env node
/**
 * The platform build, end to end in a real browser.
 *
 * Everything else proves the offline deliverable is unchanged. This proves the
 * other build actually works — that a person can open the app, be stopped by
 * the sign-in screen, sign in, and see figures that came out of Postgres.
 *
 * It is the only check that exercises the whole chain at once:
 *
 *   browser -> HttpRepository -> HTTP -> API -> Postgres
 *
 * and the only one that can catch the class of defect where each half works
 * alone and they disagree about a header, a status code or a shape.
 *
 *   1. gated      the app shows sign-in and NO data before authentication
 *   2. refused    a wrong password does not get in
 *   3. signed in  the correct password reaches the dashboard
 *   4. real data  the figures on screen came from the database, proven by
 *                 changing a value in Postgres and seeing the app follow
 *   5. roles      a reader gets the app but not the write actions, and no
 *                 module its seat may not use
 *   6. reviewer   validates, and is never offered entry
 *
 * Requires DATABASE_URL. scripts/local-postgres.sh start prints one.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\nDATABASE_URL is required. Run: scripts/local-postgres.sh start\n');
  process.exit(1);
}

const SECRET = 'check-platform-secret';
const PORT = Number(process.env.API_PORT ?? 4125);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BUILD_DIR = resolve('tests/platform');
const WEB_PORT = Number(process.env.WEB_PORT ?? 4126);
const APP = `http://127.0.0.1:${WEB_PORT}/index.html`;

const WRITER = { email: 'platform-writer@tazayud.test', password: 'writer-password-1', role: 'contributor' };
const READER = { email: 'platform-reader@tazayud.test', password: 'reader-password-1', role: 'reader' };
const REVIEWER = { email: 'platform-reviewer@tazayud.test', password: 'reviewer-password-1', role: 'reviewer' };
const ADMIN = { email: 'platform-admin@tazayud.test', password: 'admin-password-1', role: 'admin' };

const failures = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

// ---- refuse to run against someone else's server ----------------------
try {
  const r = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
  if (r.ok) {
    console.error(`\nSomething is already listening on ${ORIGIN}. Stop it first.\n`);
    process.exit(1);
  }
} catch { /* nothing there, as wanted */ }

// ---- seed the database and the accounts -------------------------------
const env = { ...process.env, DATABASE_URL };
execFileSync('npx', ['tsx', 'db/seed.ts', '--reset'], { env, stdio: 'pipe' });
for (const u of [WRITER, READER, REVIEWER, ADMIN]) {
  execFileSync('npx', ['tsx', 'db/user.ts', u.email, u.email, u.role, u.password], { env, stdio: 'pipe' });
}
// A project manager sees the developments assigned to them and no others, so
// an unassigned one signs in to an empty portfolio. This gate is about the
// served build reaching Postgres, so the writer is given the development the
// checks below read; scripts/check-api.mjs is where the scoping itself is
// proven, on requests rather than on a rendered screen.
{
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });
  await pool.query(
    'insert into project_assignments (user_id, project_id) values ($1, $2) on conflict do nothing',
    [WRITER.email, 'RES-01'],
  );
  await pool.end();
}

// ---- the API ----------------------------------------------------------
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

// ---- the platform build ----------------------------------------------
// A separate output directory so it can never be mistaken for, or overwrite,
// the portable dist/index.html the pitch runs on.
execFileSync('npx', ['vite', 'build', '--outDir', 'tests/platform', '--emptyOutDir'], {
  env: { ...process.env, VITE_API_URL: ORIGIN },
  stdio: 'pipe',
});

// A minimal static server for the built app. The platform build is a website;
// serving it is how it is meant to run, and it is what gives the page a real
// origin so its requests to the API are ordinary CORS rather than blocked.
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));

const open = async () => {
  await page.goto(APP);
  await page.waitForLoadState('networkidle');
};

const signIn = async (u) => {
  await page.fill('#signin-email', u.email);
  await page.fill('#signin-password', u.password);
  await page.click('button[type=submit]');
};

// Everything that drives the browser runs inside this block. A missing
// precondition — no sign-in form because the gate was removed — must be
// REPORTED, not thrown: an uncaught Playwright timeout replaces the finding
// with a stack trace, which is the harness dying in place of the thing it
// exists to detect. Proven by removing the gate and watching this report
// "the app is not gated" instead of crashing.
try {

// ---- 1. gated ---------------------------------------------------------
await open();
const gated = await page.locator('#signin-email').isVisible();
check('the platform build shows sign-in', gated);
check('no data is shown before signing in', !(await page.locator('.sidebar').isVisible()));
if (!gated) throw new Error('the app is not gated: no sign-in form was shown');

// ---- 2. a wrong password is refused -----------------------------------
await signIn({ ...WRITER, password: 'wrong' });
await page.waitForSelector('.signin-error', { timeout: 10_000 });
check('a wrong password is refused in the UI', await page.locator('.signin-error').isVisible());
check('still gated after a failed attempt', !(await page.locator('.sidebar').isVisible()));

// ---- 3. signing in ----------------------------------------------------
await page.fill('#signin-password', WRITER.password);
await page.click('button[type=submit]');
await page.waitForSelector('.sidebar', { timeout: 20_000 });
check('the correct password reaches the application', await page.locator('.sidebar').isVisible());

// ---- 4. the figures came from the database ----------------------------
//
// The strongest available proof that this is not still the fixtures: change a
// value in Postgres, reload, and require the screen to follow. If the app were
// quietly falling back to the mock, this is the check that would catch it.
{
  const pool = new Pool({ connectionString: DATABASE_URL });

  // A full reload, not just a hash change. The app loads its snapshot once and
  // renders synchronously from it, so navigating the hash would show the copy
  // already in memory and this check would pass whatever the database said —
  // proving nothing. Reading the original name from the database rather than
  // hard-coding it means the restore cannot put the wrong value back.
  const projectRow = async () => {
    await page.goto(`${APP}#/projects`);
    await page.reload();
    await page.waitForSelector('tbody tr', { timeout: 20_000 });
    return page.evaluate(() => {
      const row = [...document.querySelectorAll('tbody tr')]
        .find((r) => r.textContent.includes('RES-01'));
      return row?.textContent ?? '';
    });
  };

  const { rows } = await pool.query("select name from projects where id = 'RES-01'");
  const originalName = rows[0].name;

  const before = await projectRow();
  check('the project register renders after sign-in', before.includes('RES-01'), before.slice(0, 80));
  check('the register shows the name held in the database',
    before.includes(originalName), `expected ${originalName}`);

  await pool.query("update projects set name = 'Database Provenance Check' where id = 'RES-01'");
  const after = await projectRow();
  check('a change made in Postgres reaches the screen',
    after.includes('Database Provenance Check'), after.slice(0, 120));

  await pool.query('update projects set name = $1 where id = $2', [originalName, 'RES-01']);
  await pool.end();
}

// ---- 5. a reader gets the app but not the actions ---------------------
{
  const readerPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await readerPage.goto(APP);
  await readerPage.waitForSelector('#signin-email', { timeout: 20_000 });
  await readerPage.fill('#signin-email', READER.email);
  await readerPage.fill('#signin-password', READER.password);
  await readerPage.click('button[type=submit]');
  await readerPage.waitForSelector('.sidebar', { timeout: 20_000 });
  check('a reader can sign in and read', await readerPage.locator('.sidebar').isVisible());

  // The server is the authority: whatever the UI offers, the write is refused.
  const refused = await readerPage.evaluate(async (origin) => {
    const token = sessionStorage.getItem('tazayud.token');
    const res = await fetch(`${origin}/api/mutations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        kind: 'ipc', at: new Date().toISOString(), projectId: 'RES-01',
        certified: 1, retention: 0, reference: 'READER-ATTEMPT',
      }),
    });
    return res.status;
  }, ORIGIN);
  check("a reader's write is refused by the server", refused === 403, `status ${refused}`);

  // The owner found an executive viewer being offered Period Entry. The server
  // refused the write, so nothing was ever at risk — but a form whose every
  // action is rejected teaches a person that the system does not know who they
  // are. A module a seat may not use does not belong in its sidebar.
  const readerNav = await readerPage.$$eval('.nav-item .lbl', (els) => els.map((e) => e.textContent.trim()));
  // Entry lives inside the Project Workspace now, so this asserts where it
  // actually is. "Not in the sidebar" would pass for every seat and prove
  // nothing.
  check('an executive viewer opens the Project Workspace',
    readerNav.includes('Project Workspace'), readerNav.join(', '));
  await readerPage.click('.nav-item:has-text("Project Workspace")');
  await readerPage.waitForTimeout(400);
  const readerOpen = readerPage.locator('button:has-text("Open RES-")');
  if (await readerOpen.count()) { await readerOpen.first().click(); await readerPage.waitForTimeout(500); }
  const readerTabs = await readerPage.$$eval('.ws-tab', (els) => els.map((e) => e.textContent.trim()));
  check('an executive viewer is not offered Monthly Reporting inside it',
    !readerTabs.includes('Monthly Reporting'), readerTabs.join(', '));
  check('an executive viewer is not offered Review & Approve', !readerNav.includes('Review & Approve'),
    readerNav.join(', '));
  check('an executive viewer is not offered Evaluation', !readerNav.includes('Evaluation'),
    readerNav.join(', '));
  check('an executive viewer still reads the position', readerNav.includes('Dashboard')
    && readerNav.includes('Cost & Financials'), readerNav.join(', '));

  // And typing the URL gets the reason rather than the form.
  await readerPage.goto(`${APP}#/period`);
  await readerPage.waitForTimeout(700);
  const entryBody = await readerPage.textContent('.content');
  check('typing the entry URL refuses with a reason, not a form',
    (entryBody ?? '').includes('not part of your role'), (entryBody ?? '').slice(0, 90));

  await readerPage.close();
}

// ---- 5b. registering a development, through the served app ------------
//
// The owner clicked Add Project on the deployment, waited, and found nothing
// had been registered. check-actions drives that button against the OFFLINE
// build, where the repository is the fixtures and there is no server in the
// way; nothing drove it against a real one. This is that gap.
{
  const adminPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const adminErrors = [];
  adminPage.on('console', (m) => { if (m.type() === 'error') adminErrors.push(m.text()); });
  adminPage.on('requestfailed', (r) => adminErrors.push(`REQUEST FAILED ${r.url()} ${r.failure()?.errorText}`));

  await adminPage.goto(APP);
  await adminPage.waitForSelector('#signin-email', { timeout: 20_000 });
  await adminPage.fill('#signin-email', ADMIN.email);
  await adminPage.fill('#signin-password', ADMIN.password);
  await adminPage.click('button[type=submit]');
  await adminPage.waitForSelector('.sidebar', { timeout: 20_000 });

  await adminPage.click('button:has-text("Add Project")');
  await adminPage.waitForSelector('#ap-id', { timeout: 10_000 });
  await adminPage.fill('#ap-id', 'RES-05');
  await adminPage.fill('#ap-name', 'Platform Gardens');
  await adminPage.fill('#ap-budget', '640000000');

  const apiCalls = [];
  adminPage.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push(r.url().replace(ORIGIN, '')); });

  const posted = adminPage.waitForResponse(
    (r) => r.url().includes('/api/mutations') && r.request().method() === 'POST',
    { timeout: 25_000 },
  ).catch(() => null);
  await adminPage.click('button:has-text("Create Project")');
  const res = await posted;
  check('the served app posts the new development to the API', res !== null,
    'no POST /api/mutations was made');
  if (res) {
    check('the API accepts it', res.status() === 200,
      `status ${res.status()} ${JSON.stringify(await res.json().catch(() => null))?.slice(0, 200)}`);
  }

  // The dialog must close, which only happens when the promise resolves.
  await adminPage.waitForSelector('#ap-id', { state: 'detached', timeout: 25_000 })
    .then(() => check('the dialog closes rather than hanging', true))
    .catch(() => check('the dialog closes rather than hanging', false, 'still open after 25s'));

  // In the database, not merely on the screen.
  const db = new Pool({ connectionString: DATABASE_URL });
  const inDb = await db.query("select 1 from mutations where payload->'project'->>'id' = 'RES-05'");
  await db.end();
  check('the development reaches the database', inDb.rowCount === 1, `${inDb.rowCount} rows`);

  // And on every screen that should now know about it.
  await adminPage.goto(`${APP}#/projects`);
  await adminPage.waitForSelector('tbody tr', { timeout: 20_000 });
  const listed = await adminPage.evaluate(() =>
    [...document.querySelectorAll('tbody tr')].some((r) => r.textContent.includes('RES-05')));
  check('the new development appears in the project register', listed);

  // The project selector only renders at Project scope, so ask for it.
  await adminPage.goto(`${APP}#/dashboard?level=Project&portfolio=Residential&project=RES-01`);
  await adminPage.waitForSelector('.scope-field', { timeout: 20_000 });
  await adminPage.waitForTimeout(600);
  const scoped = await adminPage.evaluate(() =>
    [...document.querySelectorAll('.scope-field select')].some((s) =>
      [...s.options].some((o) => o.value === 'RES-05')));
  check('the new development appears in the scope selector', scoped);

  // One click should not cost a dozen round trips. On a serverless host each
  // is its own cold-startable invocation with its own database connection, and
  // that fan-out is what made registering a development look like it had hung.
  const registerCalls = apiCalls.filter((u) => u.includes('/api/registers/'));
  check('registering does not fan out one request per development',
    registerCalls.length <= 1, `${registerCalls.length} register requests: ${registerCalls.join(' ')}`);

  check('no console errors while registering', adminErrors.length === 0, adminErrors.join(' | '));
  await adminPage.close();
}

// ---- 6. a reviewer validates, and does not enter ----------------------
{
  const reviewPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await reviewPage.goto(APP);
  await reviewPage.waitForSelector('#signin-email', { timeout: 20_000 });
  await reviewPage.fill('#signin-email', REVIEWER.email);
  await reviewPage.fill('#signin-password', REVIEWER.password);
  await reviewPage.click('button[type=submit]');
  await reviewPage.waitForSelector('.sidebar', { timeout: 20_000 });

  const nav = await reviewPage.$$eval('.nav-item .lbl', (els) => els.map((e) => e.textContent.trim()));
  await reviewPage.click('.nav-item:has-text("Project Workspace")');
  await reviewPage.waitForTimeout(400);
  const revOpen = reviewPage.locator('button:has-text("Open RES-")');
  if (await revOpen.count()) { await revOpen.first().click(); await reviewPage.waitForTimeout(500); }
  const revTabs = await reviewPage.$$eval('.ws-tab', (els) => els.map((e) => e.textContent.trim()));
  check('a reviewer is not offered Monthly Reporting inside the workspace',
    !revTabs.includes('Monthly Reporting'), revTabs.join(', '));
  check('a reviewer keeps Review & Approve', nav.includes('Review & Approve'), nav.join(', '));
  check('a reviewer sees Evaluation', nav.includes('Evaluation'), nav.join(', '));

  await reviewPage.goto(`${APP}#/period`);
  await reviewPage.waitForTimeout(700);
  const body = await reviewPage.textContent('.content');
  check('a reviewer typing the entry URL is refused with a reason',
    (body ?? '').includes('not part of your role'), (body ?? '').slice(0, 90));
  await reviewPage.close();
}

check('no console errors throughout', consoleErrors.length === 0, consoleErrors.join(' | '));

} catch (err) {
  check('the browser flow completed', false, String(err).split('\n')[0]);
}

await browser.close();
web.close();
stop();

console.log(`\nplatform build  ${checks} checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  gated before sign-in, signs in, and renders figures that came from Postgres.\n');
process.exit(0);
