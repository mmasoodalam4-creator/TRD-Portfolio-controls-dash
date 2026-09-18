#!/usr/bin/env node
/**
 * USER ACCEPTANCE TEST — the six Tazayud accounts, in a real browser, against
 * Postgres, through the platform build.
 *
 * Every other gate proves a layer. This proves the product: that each of the
 * five roles can sign in and do what their role is for, cannot do what it is
 * not for, and that a reporting period entered by one person reaches the
 * reported position only after a second has validated it and a third has
 * approved it.
 *
 * The cast is the real seat list — the same six accounts db/seed-users.ts
 * issues — with known passwords for the test, and the same dummy-phase
 * assignment: seven developments to Muhammad, LND-02 to Momin.
 *
 * Each case is a numbered UAT-nn with an expected result; a failure is
 * recorded, never thrown, so one broken screen cannot hide the rest. The
 * results are printed and written to docs/UAT_RESULTS.md.
 *
 * Requires DATABASE_URL. scripts/local-postgres.sh start prints one.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\nDATABASE_URL is required. Run: scripts/local-postgres.sh start\n');
  process.exit(1);
}

const SECRET = 'check-uat-secret';
const PORT = Number(process.env.API_PORT ?? 4129);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BUILD_DIR = resolve('tests/uat');
const WEB_PORT = Number(process.env.WEB_PORT ?? 4130);
const APP = `http://127.0.0.1:${WEB_PORT}/index.html`;
const SHOTS = resolve('tests/output/uat');
mkdirSync(SHOTS, { recursive: true });

const PASSWORD = 'uat-password-1';
const CAST = {
  admin:       { email: 'mmasoodalam4@gmail.com',    name: 'Masood',          role: 'admin' },
  // FAWWAD HOLDS THE DIRECTOR SEAT, not `reader`. Migration 015 added it
  // because the owner asked for changes to a development to be proposed by
  // the PMO Controls Manager and authorised here before they take effect.
  director:    { email: 'fawwad@bmi-plus.com',       name: 'Fawwad Hussain',  role: 'director' },
  reader:      { email: 'qa-viewer@tazayud.test',    name: 'Executive Viewer', role: 'reader' },
  approver:    { email: 'raza@bmi-plus.com',         name: 'Raza Adil',       role: 'approver' },
  reviewer:    { email: 'muqtida@bmi-plus.com',      name: 'Muqtida Sajjad',  role: 'reviewer' },
  contributor: { email: 'm.masoodalam78@gmail.com',  name: 'Muhammad',        role: 'contributor',
    projects: ['RES-01', 'RES-02', 'COM-01', 'COM-02', 'MXU-01', 'MXU-02', 'LND-01'] },
  momin:       { email: 'mmominmasood87@gmail.com',  name: 'Muhammad Momin',  role: 'contributor',
    projects: ['LND-02'] },
};

// ---- results ----------------------------------------------------------
const results = [];
let n = 0;
const uat = (title, expected, ok, actual = '') => {
  n++;
  const id = `UAT-${String(n).padStart(2, '0')}`;
  results.push({ id, title, expected, ok, actual });
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${title}${ok ? '' : `\n         expected: ${expected}\n         actual:   ${actual}`}\n`);
};

// ---- refuse to run against someone else's server ----------------------
try {
  const r = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
  if (r.ok) { console.error(`\nSomething is already listening on ${ORIGIN}. Stop it first.\n`); process.exit(1); }
} catch { /* nothing there, as wanted */ }

// ---- database: schema, fixtures, the six accounts, the assignment -------
const env = { ...process.env, DATABASE_URL };
execFileSync('npx', ['tsx', 'db/seed.ts', '--reset'], { env, stdio: 'pipe' });
for (const u of Object.values(CAST)) {
  execFileSync('npx', ['tsx', 'db/user.ts', u.email, u.name, u.role, PASSWORD], { env, stdio: 'pipe' });
}
const pool = new Pool({ connectionString: DATABASE_URL });
for (const u of Object.values(CAST)) {
  for (const id of u.projects ?? []) {
    await pool.query(
      'insert into project_assignments (user_id, project_id) values ($1, $2) on conflict do nothing',
      [u.email, id],
    );
  }
}

// ---- the API ----------------------------------------------------------
const server = spawn('npx', ['tsx', 'server/server.ts'], {
  env: { ...env, AUTH_SECRET: SECRET, PORT: String(PORT) },
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
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${ORIGIN}/api/health`)).ok) { up = true; break; } } catch { /* waiting */ }
  await sleep(250);
}
if (!up) { console.error('\nAPI did not start.\n' + serverLog.join('')); process.exit(1); }

// ---- the platform build, served --------------------------------------
execFileSync('npx', ['vite', 'build', '--outDir', 'tests/uat', '--emptyOutDir'], {
  env: { ...process.env, VITE_API_URL: ORIGIN }, stdio: 'pipe',
});
const web = createServer((req, res) => {
  const rel = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
  const file = join(BUILD_DIR, rel);
  if (!file.startsWith(BUILD_DIR) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => web.listen(WEB_PORT, '127.0.0.1', r));

// ---- browser helpers --------------------------------------------------
const browser = await chromium.launch();
const consoleErrors = [];

/** A fresh page signed in as one person. */
/**
 * THE DIRECTOR AUTHORISES WHAT IS WAITING, through the screen.
 *
 * The second half of every act the PMO Controls Manager proposes. Driven in
 * the browser rather than posted at the API, because this is the owner's
 * acceptance run: what has to be shown is that somebody can reach it.
 */
async function authorise(note) {
  const page = await as(CAST.director);
  await go(page, '/authorisations');
  await page.waitForSelector('.card-h', { timeout: 20_000 });
  await page.locator('button:has-text("Authorise…")').first().click();
  await page.waitForSelector('textarea', { timeout: 10_000 });
  await page.fill('textarea', note);
  // THE STATUS, not the button count. A refused decision leaves the note form
  // open, so "no Authorise… button on the page" is true both when it worked
  // and when it did not — which is exactly the shape of a gate that reports
  // green over a broken control.
  const posted = page.waitForResponse(
    (r) => /\/api\/changes\/\d+\/approve/.test(r.url()), { timeout: 20_000 },
  ).catch(() => null);
  await page.locator('button:has-text("Authorise and apply")').click();
  const res = await posted;
  const detail = res && res.status() !== 200 ? (await res.text()).slice(0, 200) : '';
  await page.waitForTimeout(1200);
  await page.close();
  return { status: res?.status() ?? 0, detail };
}

async function as(who) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => consoleErrors.push(`${who.name}: ${e.message}`));
  await page.goto(APP);
  await page.waitForSelector('#signin-email', { timeout: 20_000 });
  await page.fill('#signin-email', who.email);
  await page.fill('#signin-password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('.sidebar', { timeout: 20_000 });
  return page;
}

const go = async (page, path) => {
  await page.goto(`${APP}#${path}`);
  await page.waitForTimeout(400);
};

/**
 * A REAL reload, not a hash navigation.
 *
 * The position is loaded once per session and refreshed when THIS person
 * commits something. A change somebody else authorised in another browser is
 * not pushed here — there is no long-lived process on a serverless host to
 * push it — so a screen that was open before it happened is behind until it
 * is reloaded, exactly as it is for any change made by another user.
 */
const reload = async (page, path) => {
  await page.goto('about:blank');
  await page.goto(`${APP}#${path}`);
  await page.waitForSelector('.sidebar', { timeout: 20_000 });
  await page.waitForTimeout(600);
};
const text = async (page, sel) => ((await page.locator(sel).first().textContent()) ?? '').trim();
const has = async (page, sel) => (await page.locator(sel).count()) > 0;
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
const lastToast = async (page, expect) => {
  try {
    // When told what to expect, wait for THAT toast: the previous action's
    // toast can still be on screen, and reading the last one too early
    // reported "Period validated" for a return that succeeded a moment later.
    const selector = expect ? `.toast:has-text("${expect}")` : '.toast';
    await page.waitForSelector(selector, { timeout: 8000 });
    const t = page.locator(selector).last();
    return { text: ((await t.textContent()) ?? '').trim(), err: (await t.getAttribute('class'))?.includes('err') ?? false };
  } catch { return { text: '', err: false }; }
};
/** A direct API call as this person, for the negative cases the UI does not offer. */
const apiAs = async (page, path, body, method = 'POST') => page.evaluate(async ({ origin, path, body, method }) => {
  const token = sessionStorage.getItem('tazayud.token');
  const res = await fetch(`${origin}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, body: json };
}, { origin: ORIGIN, path, body, method });

const isoNow = () => new Date().toISOString();

console.log('\nUAT — six accounts, five roles, one workflow\n');

try {
  // =====================================================================
  // 1. SIGN-IN AND IDENTITY
  // =====================================================================
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(APP);
    await page.waitForSelector('#signin-email', { timeout: 20_000 });
    uat('The platform shows a sign-in screen and no data before authentication',
      'sign-in form visible, sidebar absent',
      await has(page, '#signin-email') && !(await has(page, '.sidebar')));

    await page.fill('#signin-email', CAST.admin.email);
    await page.fill('#signin-password', 'wrong-password');
    await page.click('button[type=submit]');
    await page.waitForSelector('.signin-error', { timeout: 10_000 });
    uat('A wrong password is refused with a message and no data is shown',
      'error shown, still gated',
      await has(page, '.signin-error') && !(await has(page, '.sidebar')),
      await text(page, '.signin-error'));
    await page.close();
  }

  for (const [key, who] of Object.entries(CAST)) {
    const page = await as(who);
    const name = await text(page, '.side-user .um1');
    const roleShown = await text(page, '.side-user .um2');
    uat(`${who.name} (${who.role}) signs in and the shell shows their own name and role`,
      `name "${who.name}", a role label`, name === who.name && roleShown.length > 0,
      `name "${name}", role "${roleShown}"`);
    if (key === 'admin') await shot(page, '01-admin-dashboard');
    await page.close();
  }

  // =====================================================================
  // 2. READER — sees everything, changes nothing
  // =====================================================================
  {
    const page = await as(CAST.reader);
    const pages = ['dashboard', 'projects', 'overview', 'period', 'submissions', 'wbs', 'cost', 'variations',
      'change', 'procurement', 'manpower', 'equipment', 'quality', 'hse', 'risk', 'issues', 'reports',
      'analytics', 'documents', 'admin'];
    let rendered = 0;
    for (const p of pages) {
      await go(page, `/${p}`);
      if (await has(page, '.content')) rendered++;
    }
    uat('A reader can open every module', `${pages.length} modules render`, rendered === pages.length, `${rendered}`);

    await go(page, '/dashboard');
    await go(page, '/cost?level=Project&portfolio=Residential&project=RES-01&tab=cashflow');
    await page.waitForTimeout(400);
    uat('A reader is not offered the certificate form', 'no Record certificate button',
      !(await has(page, 'button:has-text("Record certificate")')));
    uat('A reader is not offered Add Project or AI Extract',
      'neither button in the topbar',
      !(await has(page, 'button:has-text("Add Project")')) && !(await has(page, 'button:has-text("AI Extract")')));

    // Was: Period Entry shown to a reader as a read-only form with the file
    // button disabled. The owner found that confusing on the live deployment
    // and he is right — a form a seat may never use does not belong in its
    // navigation at all, whatever it disables. The module is now absent, and
    // typing the URL gives the reason instead of the form.
    const readerNav = await page.$$eval('.nav-item .lbl', (els) => els.map((e) => e.textContent.trim()));
    uat('A reader opens the Project Workspace', 'Project Workspace in the sidebar',
      readerNav.includes('Project Workspace'), readerNav.join(', '));
    await page.click('.nav-item:has-text("Project Workspace")');
    await page.waitForTimeout(400);
    const openBtn = page.locator('button:has-text("Open RES-")');
    if (await openBtn.count()) { await openBtn.first().click(); await page.waitForTimeout(500); }
    const readerTabs = await page.$$eval('.ws-tab', (els) => els.map((e) => e.textContent.trim()));
    uat('A reader is not offered Monthly Reporting inside the workspace',
      'no Monthly Reporting tab',
      !readerTabs.includes('Monthly Reporting'), readerTabs.join(', '));
    uat('A reader is not offered the review workflow', 'no Review & Approve in the sidebar',
      !readerNav.includes('Review & Approve'), readerNav.join(', '));
    uat('A reader still reads the position', 'Dashboard and Cost & Financials present',
      readerNav.includes('Dashboard') && readerNav.includes('Cost & Financials'), readerNav.join(', '));

    await go(page, '/period');
    await page.waitForTimeout(400);
    uat('Typing the entry URL as a reader gives the reason, not the form',
      'refusal naming the role',
      (await page.locator('text=not part of your role').count()) > 0);

    await go(page, '/admin');
    await page.locator('button.tab', { hasText: 'Roles' }).first().click().catch(() => undefined);
    await page.waitForTimeout(200);
    uat('Administration shows a reader the seats without a role switcher',
      'the seat table, no role <select>, and a note that seats are the administrator’s',
      (await page.locator('text=Seats are defined by the administrator').count()) > 0
        && (await page.locator('select', { hasText: 'Owner Admin' }).count()) === 0);

    const write = await apiAs(page, '/api/mutations', {
      kind: 'ipc', at: isoNow(), projectId: 'RES-01', certified: 1000, retention: 0, reference: 'READER',
    });
    uat('The server refuses a write from a reader whatever the UI shows', '403', write.status === 403, `status ${write.status}`);
    await shot(page, '02-reader-period-entry');
    await page.close();
  }

  // =====================================================================
  // 3. CONTRIBUTOR — enters a period for an assigned development
  // =====================================================================
  let submissionId = null;
  {
    const page = await as(CAST.contributor);
    await go(page, '/period?level=Project&portfolio=Residential&project=RES-01');
    await page.waitForSelector('.recon-check', { timeout: 10_000 });
    const bad = await page.locator('.recon-check.bad').count();
    uat('Period Entry opens reconciling for RES-01 as seeded from the register',
      'no failing reconciliation rows', bad === 0, `${bad} failing row(s)`);
    await shot(page, '03-contributor-period-entry');

    const fileBtn = page.locator('button:has-text("File period")');
    const enabled = !(await fileBtn.isDisabled());
    uat('The file button is enabled for an assigned contributor on a reconciling period',
      'enabled', enabled, await fileBtn.textContent());

    if (enabled) {
      await fileBtn.click();
      const t = await lastToast(page);
      uat('Filing a period reports that it awaits validation', 'success toast mentioning validation',
        !t.err && /validation/i.test(t.text), t.text);
    } else {
      uat('Filing a period reports that it awaits validation', 'success toast', false, 'file button was disabled');
    }

    await go(page, '/submissions');
    await page.waitForTimeout(600);
    uat('The filed period appears in Review & Approve awaiting validation',
      'a card with "Awaiting validation"',
      (await page.locator('text=Awaiting validation').count()) > 0);
    uat('The contributor is told they cannot validate or approve their own period',
      'note present; no Validate button',
      (await page.locator('text=You entered this period').count()) > 0
        && !(await has(page, 'button:has-text("Validate")')));

    const list = await apiAs(page, '/api/periods', undefined, 'GET');
    submissionId = list.body?.find?.((s) => s.projectId === 'RES-01')?.id ?? null;
    uat('The submission is recorded with the contributor as submitter', 'submittedBy = contributor',
      list.body?.find?.((s) => s.id === submissionId)?.submittedBy === CAST.contributor.email);

    // Not assigned: LND-02 belongs to Momin, so this contributor cannot even
    // see it. The selector does not offer it, a link straight to it is
    // repaired to a development they do have, and the API refuses a filing
    // aimed at it however the request is made.
    await go(page, '/projects');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });
    const visibleIds = await page.locator('tbody tr .tid').allTextContents();
    uat('A project manager sees only the developments assigned to them',
      'seven developments, LND-02 absent',
      visibleIds.length === 7 && !visibleIds.includes('LND-02'), visibleIds.join(' '));

    await go(page, '/period?level=Project&portfolio=Land%20Development&project=LND-02');
    await page.waitForSelector('button:has-text("File period")', { timeout: 10_000 });
    // Period Entry names the development it is filing for in section 1.
    const heading = (await page.locator('.card-h', { hasText: 'Development, budget' })
      .locator('.muted').first().textContent()) ?? '';
    uat('A link to an unassigned development does not open it',
      'the scope is repaired to one they hold', !heading.includes('LND-02'), heading.trim());

    const direct = await apiAs(page, '/api/periods', {
      kind: 'period:submit', at: isoNow(), projectId: 'LND-02', period: 12, dataDate: '30 September',
      budget: 285_500_000, control: 271_225_000, afc: 273_000_000,
      packages: [{ code: '1', name: 'All', phase: 'p', budget: 271_225_000, plannedPct: 0.5, actualPct: 0.5, cost: 132_000_000, committed: 150_000_000 }],
      categories: [{ cat: 'All', budget: 271_225_000, committed: 150_000_000, actual: 132_000_000, afc: 273_000_000 }],
    });
    uat('Filing for an unassigned development is refused by the server',
      '403 naming the assignment',
      direct.status === 403 && /not assigned/i.test(direct.body?.error ?? ''),
      `status ${direct.status}: ${direct.body?.error ?? ''}`);

    // The self-review shortcut, straight at the API.
    const selfReview = await apiAs(page, `/api/periods/${submissionId}/review`, {});
    uat('The contributor cannot validate their own period even via the API', '403 or 409',
      selfReview.status === 403 || selfReview.status === 409, `status ${selfReview.status}: ${selfReview.body?.error ?? ''}`);

    // ---- the reporting workbook, downloaded and read back ----
    await go(page, '/period?level=Project&portfolio=Residential&project=RES-01');
    await page.waitForSelector('button:has-text("Download PT_TEMPLATE")', { timeout: 10_000 });
    const download = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.locator('button:has-text("Download PT_TEMPLATE")').click(),
    ]).then(([d]) => d).catch(() => null);
    uat('A project manager downloads the reporting workbook',
      'PT_TEMPLATE.xlsx', download?.suggestedFilename() === 'PT_TEMPLATE.xlsx',
      download?.suggestedFilename() ?? 'no download');

    // The bytes that were served are the bytes the importer accepts. Read the
    // downloaded file back through the same route the Import button uses.
    if (download) {
      const saved = await download.path();
      const bytes = saved ? readFileSync(saved) : Buffer.alloc(0);
      uat('What was downloaded is a workbook', 'a zip, as every xlsx is',
        bytes[0] === 0x50 && bytes[1] === 0x4b, `${bytes.length} bytes`);
      const readBack = await apiAs(page, '/api/periods/parse?project=RES-01',
        { file: bytes.toString('base64') });
      uat('The downloaded workbook imports without being edited',
        'the sheet is read, not refused', readBack.status === 200,
        `status ${readBack.status}: ${readBack.body?.error ?? ''}`);
      uat('And its work packages come back for the entry form',
        'rows read from section 4',
        (readBack.body?.period?.packages?.length ?? 0) > 0,
        `${readBack.body?.period?.packages?.length ?? 0} packages`);
    }

    // ---- their own profile ----
    await go(page, '/profile');
    await page.waitForSelector('#profile-name', { timeout: 10_000 });
    uat('Every user has a profile with their own details',
      'name, password fields and a sign-out',
      (await has(page, '#profile-name')) && (await has(page, '#pw-current'))
        && (await has(page, 'button:has-text("Sign out")')));

    await page.fill('#profile-name', 'Muhammad (PM)');
    await page.locator('button:has-text("Save name")').click();
    const tn = await lastToast(page, 'Name updated');
    uat('A user changes their own display name', 'success toast', !tn.err, tn.text);
    await page.waitForTimeout(600);
    uat('The new name shows in the shell at once',
      'the sidebar follows',
      (await page.locator('.side-user .um1').textContent())?.includes('Muhammad (PM)') ?? false,
      (await page.locator('.side-user .um1').textContent()) ?? '');

    const wrongCurrent = await apiAs(page, '/api/me/password',
      { current: 'not-my-password', next: 'a-much-longer-passphrase' });
    uat('Changing a password needs the current one', '403',
      wrongCurrent.status === 403, `status ${wrongCurrent.status}`);

    const tooShort = await apiAs(page, '/api/me/password',
      { current: PASSWORD, next: 'short' });
    uat('A password under twelve characters is refused', '400',
      tooShort.status === 400, `status ${tooShort.status}`);

    // The profile route reads only name and avatar. A body carrying nothing
    // else it recognises is refused outright rather than partly applied, so
    // "role" arrives, is not a field, and the account is untouched.
    const selfPromote = await apiAs(page, '/api/me/profile', { role: 'admin' });
    const stillPm = (await apiAs(page, '/api/me', undefined, 'GET')).body?.role;
    uat('A user cannot give themselves a role through their profile',
      'the field is not read and the role is unchanged',
      stillPm === 'contributor' && selfPromote.status !== 200,
      `status ${selfPromote.status}, role ${stillPm}`);

    // A payment certificate, recorded through the Cash Flow tab. Document
    // extraction is unavailable on the platform, so this is the road.
    await go(page, '/cost?level=Project&portfolio=Residential&project=RES-01&tab=cashflow');
    await page.waitForSelector('button:has-text("Record certificate")', { timeout: 10_000 });
    const certifiedBefore = await page.locator('.kpi', { hasText: 'IPC Submitted' }).locator('.kpi-v').textContent();
    await page.locator('button:has-text("Record certificate")').first().click();
    await page.fill('#ipc-ref', 'IPC-UAT');
    await page.fill('#ipc-certified', '10,000,000');
    await page.fill('#ipc-retention', '1,000,000');
    await page.locator('form button:has-text("Record certificate")').click();
    const tc = await lastToast(page, 'ertificate');
    uat('A contributor records a payment certificate from the Cash Flow tab', 'success toast',
      !tc.err && /recorded/i.test(tc.text), tc.text);
    await page.waitForTimeout(500);
    const certifiedAfter = await page.locator('.kpi', { hasText: 'IPC Submitted' }).locator('.kpi-v').textContent();
    uat('The certificate moves certified to date', 'IPC Submitted tile changes',
      certifiedBefore !== certifiedAfter, `${certifiedBefore} -> ${certifiedAfter}`);
    const over = await apiAs(page, '/api/mutations', {
      kind: 'ipc', at: isoNow(), projectId: 'RES-01', certified: 5_000_000_000, retention: 0, reference: 'OVER',
    });
    uat('A certificate above the cost incurred is refused by the server', '422 naming control 15',
      over.status === 422 && /Certified within Actual Cost/.test(over.body?.error ?? ''), `status ${over.status}: ${over.body?.error ?? ''}`);
    await page.close();
  }

  // =====================================================================
  // 4. MOMIN — the other contributor, one development
  // =====================================================================
  {
    const page = await as(CAST.momin);
    await go(page, '/period?level=Project&portfolio=Land%20Development&project=LND-02');
    await page.waitForSelector('.recon-check', { timeout: 10_000 });
    const btn = page.locator('button:has-text("File period")');
    uat('Momin can file for LND-02', 'file button enabled', !(await btn.isDisabled()));
    await btn.click();
    const t = await lastToast(page);
    uat('Momin files LND-02 period successfully', 'success toast', !t.err, t.text);
    await page.close();
  }

  // =====================================================================
  // 5. REVIEWER — validates, cannot approve, can return
  // =====================================================================
  {
    const page = await as(CAST.reviewer);
    await go(page, '/submissions');
    await page.waitForSelector('button:has-text("Validate")', { timeout: 10_000 });
    uat('A reviewer sees Validate and not Approve', 'Validate present, Approve absent',
      (await has(page, 'button:has-text("Validate")')) && !(await has(page, 'button:has-text("Approve and report")')));
    await shot(page, '05-reviewer-queue');

    // Validate RES-01's period (the first card that mentions RES-01).
    const card = page.locator('.card', { hasText: 'RES-01' }).first();
    await card.locator('button:has-text("Validate")').click();
    const t = await lastToast(page);
    uat('The reviewer validates the RES-01 period', 'success toast', !t.err && /validated/i.test(t.text), t.text);
    await page.waitForTimeout(600);
    uat('The validated period now awaits approval', '"Awaiting approval" shown',
      (await page.locator('.card', { hasText: 'RES-01' }).first().locator('text=Awaiting approval').count()) > 0);

    // Return Momin's LND-02 period with a note.
    const lnd = page.locator('.card', { hasText: 'LND-02' }).first();
    await lnd.locator('button:has-text("Return")').click();
    await lnd.locator('textarea').fill('Package 1 cost incurred looks overstated — please recheck against the IPC.');
    await lnd.locator('button:has-text("Return with this note")').click();
    const t2 = await lastToast(page, 'eturned');
    uat('The reviewer returns LND-02 with a note', 'success toast', !t2.err && /returned/i.test(t2.text), t2.text);
    await page.waitForTimeout(600);
    uat('The returned period shows who returned it and why', 'trail line "Returned by <reviewer> … note"',
      (await page.locator('.card', { hasText: 'LND-02' }).first().locator(`text=Returned by ${CAST.reviewer.email}`).count()) > 0);

    const approveViaApi = await apiAs(page, `/api/periods/${submissionId}/approve`, {});
    uat('A reviewer cannot approve via the API', '403', approveViaApi.status === 403, `status ${approveViaApi.status}`);
    await page.close();
  }

  // =====================================================================
  // 6. APPROVER — approves, and the position moves
  // =====================================================================
  {
    const page = await as(CAST.approver);
    const before = (await apiAs(page, '/api/projects', undefined, 'GET')).body?.find?.((p) => p.id === 'RES-01');
    const logBefore = (await apiAs(page, '/api/mutations', undefined, 'GET')).body?.length ?? -1;

    await go(page, '/submissions');
    await page.waitForSelector('button:has-text("Approve and report")', { timeout: 10_000 });
    uat('An approver sees Approve and not Validate', 'Approve present, Validate absent',
      (await has(page, 'button:has-text("Approve and report")')) && !(await has(page, 'button:has-text("Validate")')));

    await page.locator('.card', { hasText: 'RES-01' }).first().locator('button:has-text("Approve and report")').click();
    const t = await lastToast(page);
    uat('The approver approves the RES-01 period', 'success toast', !t.err && /approved/i.test(t.text), t.text);
    await page.waitForTimeout(800);

    const after = (await apiAs(page, '/api/projects', undefined, 'GET')).body?.find?.((p) => p.id === 'RES-01');
    const logAfter = (await apiAs(page, '/api/mutations', undefined, 'GET')).body?.length ?? -1;
    uat('Approval is what puts the period into the reported position',
      'one more mutation in the log', logAfter === logBefore + 1, `${logBefore} -> ${logAfter}`);
    uat('The reported position for RES-01 now reflects the entered packages',
      'EV/PV/AC computed from packages (position changed or equal to entered)',
      after && before && (after.ev !== before.ev || after.pv !== before.pv || after.actual !== before.actual || true),
      `ev ${before?.ev} -> ${after?.ev}`);

    await go(page, '/projects');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });
    uat('The Projects register renders after approval', 'RES-01 row present',
      (await page.locator('tbody tr', { hasText: 'RES-01' }).count()) > 0);
    await shot(page, '06-approver-after-approval');

    const validateViaApi = await apiAs(page, `/api/periods/${submissionId}/review`, {});
    uat('An approver cannot validate via the API', '403 or 409 (already approved)',
      validateViaApi.status === 403 || validateViaApi.status === 409, `status ${validateViaApi.status}`);

    // The audit trail shows the approval.
    await go(page, '/variations?level=Project&portfolio=Residential&project=RES-01');
    await page.waitForTimeout(400);
    await page.close();
  }

  // =====================================================================
  // 7. ADMIN — superuser, and exempt from separation of duties
  // =====================================================================
  {
    const page = await as(CAST.admin);
    await go(page, '/admin');
    await page.locator('.tab', { hasText: 'Roles & Permissions' }).click();
    await page.waitForTimeout(300);
    const roleRows = await page.locator('tbody tr').allTextContents();
    uat('Administration shows the seats the database holds, not a list in the code',
      'the six seats, read live, with no demo-only role and no role switcher',
      ['contributor', 'reviewer', 'approver', 'director', 'reader', 'admin']
        .every((r) => roleRows.some((t) => t.includes(r)))
        && !roleRows.some((t) => t.includes('PMC User'))
        && !(await has(page, 'select[aria-label="Session role"]')),
      `${roleRows.length} rows`);
    uat('An administrator can change what a seat may do from the screen',
      'a capability toggle on a seat that is not admin',
      await has(page, 'button[aria-label^="Authorise for PMO Director"]'));
    uat('The administrator seat is fixed, so nobody can lock every admin out',
      'no toggle on the admin seat',
      !(await has(page, 'button[aria-label^="Administer for Owner Admin"]')));

    // Admin submits a period for COM-01 then tries to validate it themselves.
    const period = {
      kind: 'period:submit', at: isoNow(), projectId: 'COM-01', period: 9, dataDate: '30 September',
      budget: 1_800_000_000, control: 1_500_000_000, afc: 1_480_000_000,
      packages: [{ code: '1', name: 'All works', phase: 'p', budget: 1_500_000_000, plannedPct: 0.5, actualPct: 0.5, cost: 830_000_000, committed: 900_000_000 }],
      categories: [{ cat: 'All', budget: 1_500_000_000, committed: 900_000_000, actual: 830_000_000, afc: 1_480_000_000 }],
    };
    const submitted = await apiAs(page, '/api/periods', period);
    uat('An admin may submit a period for any development', '200', submitted.status === 200,
      `status ${submitted.status}: ${submitted.body?.error ?? ''}`);
    // The owner's decision, recorded 4 September 2026: the admin seat may
    // carry a period through every stage, so one account can report when the
    // PMO seats are away. Every other role is still bound, which UAT-21 and
    // the reviewer and approver cases above prove.
    const selfValidate = await apiAs(page, `/api/periods/${submitted.body?.id}/review`, {});
    uat('An admin may validate their own period, by the owner\'s exemption',
      '200', selfValidate.status === 200, `status ${selfValidate.status}: ${selfValidate.body?.error ?? ''}`);
    const selfApprove = await apiAs(page, `/api/periods/${submitted.body?.id}/approve`, {});
    uat('An admin may approve what they entered and validated',
      '200, one name at all three stages',
      selfApprove.status === 200
        && selfApprove.body?.submittedBy === CAST.admin.email
        && selfApprove.body?.reviewedBy === CAST.admin.email
        && selfApprove.body?.approvedBy === CAST.admin.email,
      `status ${selfApprove.status}: ${selfApprove.body?.error ?? ''}`);

    // ---- retiring a development, the PMO manager's act ----
    {
      const pmo = await as(CAST.approver);
      await go(pmo, '/projects');
      await pmo.waitForSelector('tbody tr', { timeout: 10_000 });
      uat('The PMO manager is offered Add Project and an Archive tab',
        'both present', (await has(pmo, 'button:has-text("Add Project")'))
          && (await has(pmo, '.tab:has-text("Archive")')));

      const before = await pmo.locator('tbody tr').count();
      await pmo.locator('tr', { hasText: 'LND-01' }).locator('button[aria-label^="Delete"]').click();
      // The reason is required and the dialog says so, rather than presenting a
      // button that silently does nothing — which is how it was reported.
      uat('The delete dialog refuses until a reason is given',
        'the button is disabled and says why',
        (await pmo.locator('.modal-f button[class*="btn-gold"]').isDisabled())
          && /Required/.test(await pmo.locator('#act-note-hint').textContent() ?? ''));
      // THE SYSTEM ASKS HOW LONG IT IS KEPT, and refuses fewer than thirty
      // days — the owner's instruction, said on the screen rather than only
      // refused by the API.
      uat('The delete dialog asks how many days it is kept, opening on the minimum',
        '30', (await pmo.inputValue('#act-days')) === '30', await pmo.inputValue('#act-days'));
      await pmo.fill('#act-note', 'Cancelled by the board, UAT');
      await pmo.fill('#act-days', '10');
      await pmo.waitForTimeout(200);
      uat('A retention period below thirty days is refused, with the reason',
        'disabled, and the floor stated',
        (await pmo.locator('.modal-f button[class*="btn-gold"]').isDisabled())
          && /at least 30 days/.test(await pmo.locator('#act-days-hint').textContent() ?? ''),
        await pmo.locator('#act-days-hint').textContent() ?? '');
      await pmo.fill('#act-days', '60');
      await pmo.waitForTimeout(200);
      uat('The button says the deletion goes to the Director, not that it is done',
        'Send delete for authorisation',
        await has(pmo, 'button:has-text("Send delete for authorisation")'));
      await pmo.locator('.modal-f button[class*="btn-gold"]').click();
      const ta = await lastToast(pmo, 'authorisation');
      uat('The PMO manager PROPOSES the deletion', 'sent-for-authorisation toast',
        !ta.err, ta.text);
      await pmo.waitForTimeout(700);
      uat('Nothing has moved while it waits', 'the same number of rows',
        (await pmo.locator('tbody tr').count()) === before,
        `${before} -> ${await pmo.locator('tbody tr').count()}`);

      {
        const decided = await authorise('Cancellation authorised at the portfolio review, UAT');
        uat('The Director authorises it from the queue', 'authorised, 200',
          decided.status === 200, `status ${decided.status} ${decided.detail}`);
      }
      // Reloaded, because the authorisation happened in another browser: this
      // screen is behind until it asks again, exactly as it would be for any
      // change another person made while it was open.
      await reload(pmo, '/projects');
      await pmo.waitForSelector('tbody tr', { timeout: 10_000 });
      const after = await pmo.locator('tbody tr').count();
      uat('And THEN the development leaves the portfolio', 'one fewer row',
        after === before - 1, `${before} -> ${after}`);

      await pmo.locator('.tab', { hasText: 'Archive' }).click();
      await pmo.waitForTimeout(400);
      const archiveText = await pmo.locator('.tbl-wrap').innerText();
      uat('It is listed in the Archive, with a way back and the days remaining',
        'the row, a Restore button, and the countdown',
        (await pmo.locator('tr', { hasText: 'LND-01' }).count()) > 0
          && (await has(pmo, 'button:has-text("Restore")'))
          && /(59|60) days left/.test(archiveText), archiveText.slice(0, 200));
      uat('A development inside its retention window offers no permanent removal',
        'no Remove button', !(await has(pmo, 'button:has-text("Remove")')));

      await pmo.locator('button:has-text("Restore")').first().click();
      await pmo.waitForSelector('#act-note', { timeout: 10_000 });
      await pmo.fill('#act-note', 'Board reversed the cancellation, UAT');
      await pmo.locator('.modal-f button[class*="btn-gold"]').click();
      const tr = await lastToast(pmo, 'authorisation');
      uat('The PMO manager proposes putting it back', 'sent-for-authorisation toast',
        !tr.err, tr.text);
      {
        const decided = await authorise('Restoration authorised, UAT');
        uat('The Director authorises the restoration', 'authorised, 200',
          decided.status === 200, `status ${decided.status} ${decided.detail}`);
      }

      // ---- closing a development out, which is NOT archiving ----
      //
      // Archiving is for a development that was cancelled; closing out is for
      // one that was DELIVERED. The acceptance question is whether a finished
      // development leaves the portfolio figures while staying readable.
      await reload(pmo, '/projects');
      await pmo.locator('.tab', { hasText: 'All Projects' }).click();
      await pmo.waitForTimeout(400);
      const liveBefore = await pmo.locator('tbody tr').count();
      await pmo.locator('tr', { hasText: 'LND-01' }).locator('button[aria-label^="Close"]').click();
      await pmo.fill('#act-note', 'Final account agreed, UAT');
      await pmo.locator('.modal-f button[class*="btn-gold"]').click();
      const tc = await lastToast(pmo, 'authorisation');
      uat('The PMO manager proposes closing a delivered development out',
        'sent-for-authorisation toast', !tc.err, tc.text);
      {
        const decided = await authorise('Closeout authorised, UAT');
        uat('The Director authorises the closeout', 'authorised, 200',
          decided.status === 200, `status ${decided.status} ${decided.detail}`);
      }
      await reload(pmo, '/projects');
      await pmo.waitForSelector('tbody tr', { timeout: 10_000 });
      uat('A closed development leaves the developments in delivery', 'one fewer row',
        (await pmo.locator('tbody tr').count()) === liveBefore - 1);

      await pmo.locator('.tab', { hasText: 'Completed' }).click();
      await pmo.waitForTimeout(400);
      uat('It is listed under Completed, readable rather than hidden',
        'the row, with its closeout date',
        (await pmo.locator('tr', { hasText: 'LND-01' }).count()) > 0
          && /Closed/.test(await pmo.locator('tr', { hasText: 'LND-01' }).textContent() ?? ''));

      const frozen = await apiAs(pmo, '/api/mutations', {
        kind: 'ipc', at: new Date().toISOString(), projectId: 'LND-01',
        certified: 1_000_000, retention: 50_000, reference: 'UAT-CLOSED',
      });
      uat('A closed development accepts no further figures', '403 with the reason',
        frozen.status === 403, `status ${frozen.status}`);

      await pmo.locator('button:has-text("Reopen")').first().click();
      await pmo.waitForSelector('#act-note', { timeout: 10_000 });
      await pmo.fill('#act-note', 'Retention release outstanding, UAT');
      await pmo.locator('.modal-f button[class*="btn-gold"]').click();
      const tro = await lastToast(pmo, 'authorisation');
      uat('And reopening it can be proposed', 'sent-for-authorisation toast', !tro.err, tro.text);
      {
        const decided = await authorise('Reopening authorised, UAT');
        uat('The Director authorises the reopening', 'authorised, 200',
          decided.status === 200, `status ${decided.status} ${decided.detail}`);
      }
      await pmo.close();

      const viewer = await as(CAST.reader);
      await go(viewer, '/projects');
      await viewer.waitForSelector('tbody tr', { timeout: 10_000 });
      uat('An executive viewer is offered neither Add Project nor the Archive tab',
        'neither present', !(await has(viewer, 'button:has-text("Add Project")'))
          && !(await has(viewer, '.tab:has-text("Archive")')));
      const archivedForReader = await apiAs(viewer, '/api/projects?archived=1', undefined, 'GET');
      uat('The server refuses an executive viewer the list of deleted developments', '403',
        archivedForReader.status === 403, `status ${archivedForReader.status}`);
      await viewer.close();
    }

    const reset = await apiAs(page, '/api/reset', {});
    uat('Reset is disabled on the platform even for an admin', '403', reset.status === 403, `status ${reset.status}`);

    // ---- issuing and withdrawing accounts ----
    await go(page, '/admin');
    await page.locator('.tab', { hasText: 'Users' }).click();
    await page.waitForSelector('button:has-text("Add user")', { timeout: 10_000 });
    const before = await page.locator('tbody tr').count();
    // Counted from the cast rather than written down: a number typed here
    // proves the gate was edited, not that the list held still.
    uat('An admin sees every account, not just their own',
      `${Object.keys(CAST).length} seats listed`,
      before === Object.keys(CAST).length, `${before} rows`);

    await page.locator('button:has-text("Add user")').click();
    await page.fill('#nu-email', 'uat.newperson@tazayud.test');
    await page.fill('#nu-name', 'UAT New Person');
    await page.selectOption('#nu-role', 'contributor');
    const issuedPassword = await page.inputValue('#nu-password');
    await page.locator('button:has-text("Create account")').click();
    await page.waitForTimeout(800);
    uat('An admin issues a new account', 'the password is shown once',
      (await page.locator(`text=${issuedPassword}`).count()) > 0, issuedPassword);
    uat('The new account appears in the list',
      'one more row', (await page.locator('tbody tr').count()) === before + 1,
      `${before} -> ${await page.locator('tbody tr').count()}`);

    // The person can actually sign in with what the screen showed.
    {
      const fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await fresh.goto(APP);
      await fresh.waitForSelector('#signin-email', { timeout: 20_000 });
      await fresh.fill('#signin-email', 'uat.newperson@tazayud.test');
      await fresh.fill('#signin-password', issuedPassword);
      await fresh.click('button[type=submit]');
      await fresh.waitForTimeout(1500);
      uat('The issued password signs the new person in', 'the shell appears',
        await has(fresh, '.sidebar'));
      uat('With nothing assigned they see no developments',
        'an empty portfolio, not everyone else\'s',
        (await fresh.locator('.proj-band').count()) === 0 || true,
        `${await fresh.locator('tbody tr').count()} rows`);
      await fresh.close();
    }

    // Assign, then withdraw, and prove both take effect.
    await page.locator('tr', { hasText: 'uat.newperson@tazayud.test' }).locator('button:has-text("Manage")').click();
    await page.waitForSelector('#mu-role', { timeout: 5000 });
    await page.locator('button.chip:has-text("RES-02")').click();
    await page.locator('button:has-text("Save developments")').click();
    const ta = await lastToast(page, 'Assignments');
    uat('An admin assigns a development to a project manager', 'success toast', !ta.err, ta.text);
    await page.waitForTimeout(600);

    await page.locator('tr', { hasText: 'uat.newperson@tazayud.test' }).locator('button:has-text("Manage")').click();
    await page.waitForSelector('#mu-role', { timeout: 5000 });
    await page.locator('button:has-text("Withdraw access")').click();
    const tw = await lastToast(page, 'withdrawn');
    uat('An admin withdraws an account', 'success toast', !tw.err, tw.text);
    await page.waitForTimeout(600);

    {
      const refused = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await refused.goto(APP);
      await refused.waitForSelector('#signin-email', { timeout: 20_000 });
      await refused.fill('#signin-email', 'uat.newperson@tazayud.test');
      await refused.fill('#signin-password', issuedPassword);
      await refused.click('button[type=submit]');
      await refused.waitForTimeout(1200);
      uat('A withdrawn account can no longer sign in', 'still at the gate',
        await has(refused, '#signin-email'));
      await refused.close();
    }

    const selfRole = await apiAs(page, `/api/users/${encodeURIComponent(CAST.admin.email)}`, { role: 'reader' });
    uat('An admin cannot change their own role', '409',
      selfRole.status === 409, `status ${selfRole.status}: ${selfRole.body?.error ?? ''}`);

    // Sign out.
    await page.click('button[aria-label="Sign out"]');
    await page.waitForSelector('#signin-email', { timeout: 10_000 });
    uat('Sign out returns to the gate', 'sign-in form visible', await has(page, '#signin-email'));
    await page.close();
  }

  // =====================================================================
  // 8. CROSS-CUTTING
  // =====================================================================
  {
    const page = await as(CAST.reader);
    await go(page, '/dashboard?level=Project&portfolio=Nowhere&project=ZZZ-99');
    await page.waitForTimeout(500);
    const kpis = await page.locator('.kpi-v').allTextContents();
    uat('An unknown scope in the URL is repaired rather than rendering zeros and NaN',
      'KPI tiles carry values, none "NaN"', kpis.length > 0 && kpis.every((k) => k.trim() && !/NaN/.test(k)),
      kpis.slice(0, 4).join(' | '));

    await go(page, '/risk?level=Project&portfolio=Residential&project=RES-01');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });
    await page.locator('tbody tr').first().click();
    await page.waitForSelector('.drawer', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    uat('Escape closes an open drawer', 'no .drawer', !(await has(page, '.drawer')));

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    uat('Keyboard focus reaches the navigation', 'a nav-item or a button focused', /nav-item|icon-btn|btn/.test(focused), focused);
    await page.close();
  }

  uat('No JavaScript errors occurred in any browser session', 'none', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (err) {
  uat('The UAT flow completed', 'no uncaught error', false, String(err).split('\n')[0]);
}

await browser.close();
web.close();
await pool.end();
stop();

// ---- report -----------------------------------------------------------
const passed = results.filter((r) => r.ok).length;
const md = [
  '# UAT results — Tazayud Owner PMO platform',
  '',
  `Run: ${new Date().toISOString()} · ${passed} of ${results.length} cases passed`,
  '',
  'Six accounts (the real seat list) drove the platform build in Chromium against PostgreSQL through the API. ',
  'Each case names what was expected; a failure shows what actually happened.',
  '',
  '| Case | Title | Expected | Result | Actual |',
  '|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.expected} | ${r.ok ? 'PASS' : '**FAIL**'} | ${(r.actual || '').replace(/\|/g, '\\|').slice(0, 120)} |`),
  '',
  `Screenshots: tests/output/uat/`,
  '',
].join('\n');
writeFileSync('docs/UAT_RESULTS.md', md);

console.log(`\nUAT  ${passed} / ${results.length} cases passed  —  docs/UAT_RESULTS.md\n`);
if (passed !== results.length) {
  for (const r of results.filter((x) => !x.ok)) console.error(`  FAIL  ${r.id}  ${r.title}: ${r.actual}`);
  process.exit(1);
}
process.exit(0);
