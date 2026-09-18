#!/usr/bin/env node
/**
 * HAYAT GARDEN WALK RESIDENCE — the owner's acceptance run, a year end to end.
 *
 * A small development (19.2M SAR, under the owner's 20M cap) taken through its
 * ENTIRE PROGRAMME on the served platform, in a real browser, by the four real
 * seats, using the screens a person would use:
 *
 *   Raza (approver)    registers it from the new-development workbook, states
 *                      the programme (Aug 2025 → Aug 2026), awards the tendered
 *                      finishes package mid-year through the Procurement form,
 *                      records the quarterly payment claims, approves every
 *                      period, and releases retention at the end
 *   Masood (admin)     assigns it to Muhammad Momin
 *   Momin (PM)         files THIRTEEN monthly periods in the Project Workspace,
 *                      August 2025 to August 2026
 *   Muqtida (reviewer) validates every one of them
 *
 * The story the figures tell, by design: three contractors on different
 * packages, paid to roughly 80% of their commitments; the job planned to
 * finish 1 August 2026 and still at 90% a month later — behind schedule, so
 * the reported status reads At Risk through the middle of the job, Delayed
 * where the indices genuinely broke down, and Delayed at the end because the
 * calendar has been missed whatever SPI compression says.
 *
 * Then the integration sweep: both years of the month strip, every register
 * module, the dashboards, the Report Centre export, the integrity engine —
 * with the exact figures the periods produced, no NaN anywhere, and zero
 * console errors.
 *
 * Requires DATABASE_URL. Accounts are (re)seeded with known passwords for the
 * run; the emails are the real platform accounts.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { Pool } from 'pg';
import { writeWorkbook } from '../server/xlsx-write.js';
// The scenario itself — every figure of the year — lives in ONE module,
// shared with the remote seeder (seed-hgw-remote.mjs) so the browser proof
// and the deployment seed can never drift apart.
import {
  ID, NAME, BUDGET, CONTROL, START, FINISH, HAYAT, GULF, NOOR, PKG, CONTRACTS,
  COMMITTED_AT_CREATE, AWARD, monthOf, monthData, STATUS, CLAIMS, VERIFIER,
  CERTIFIED_TOTAL, RELEASE, PAID_TOTAL, cumCertified, FINAL,
} from './hgw-scenario.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\nDATABASE_URL is required. Run: scripts/local-postgres.sh start\n');
  process.exit(1);
}

const SECRET = 'e2e-hgw-secret';
const PORT = Number(process.env.API_PORT ?? 4145);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BUILD_DIR = resolve('tests/hgw-build');
const WEB_PORT = Number(process.env.WEB_PORT ?? 4146);
const APP = `http://127.0.0.1:${WEB_PORT}/index.html`;
const OUT = resolve('tests/output/hgw');
mkdirSync(OUT, { recursive: true });

// The real accounts, reseeded with run-local passwords.
const MASOOD = { email: 'mmasoodalam4@gmail.com', name: 'Masood', role: 'admin', password: 'hgw-admin-passphrase' };
const MOMIN = { email: 'mmominmasood87@gmail.com', name: 'Muhammad Momin', role: 'contributor', password: 'hgw-momin-passphrase' };
const MUQTIDA = { email: 'muqtida@bmi-plus.com', name: 'Muqtida Sajjad', role: 'reviewer', password: 'hgw-muqtida-passphrase' };
const RAZA = { email: 'raza@bmi-plus.com', name: 'Raza Adil', role: 'approver', password: 'hgw-raza-passphrase' };
// THE DIRECTOR. Every act that decides what a development IS — registering it,
// amending it, deleting it, closing it out, awarding a package against it — is
// proposed by Raza and authorised here. A run that posted the authorisation at
// the API would prove the route works and say nothing about whether anybody
// can reach it, so this seat drives the queue in its own browser.
const FAWWAD = { email: 'fawwad@bmi-plus.com', name: 'Fawwad Hussain', role: 'director', password: 'hgw-fawwad-passphrase' };

// ---- the development: figures imported from hgw-scenario.mjs ----------
const OWN_PARTIES = new Set([HAYAT, GULF, NOOR]);

// ---- harness -----------------------------------------------------------
const failures = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(`  ${mark}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  return ok;
};
const act = (title) => console.log(`\n== ${title}`);

try {
  const r = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
  if (r.ok) { console.error(`\nSomething is already listening on ${ORIGIN}. Stop it first.\n`); process.exit(1); }
} catch { /* free, as wanted */ }

// ---- database, accounts ------------------------------------------------
act('Seeding the database and the four accounts');
const env = { ...process.env, DATABASE_URL };
execFileSync('npx', ['tsx', 'db/seed.ts', '--reset'], { env, stdio: 'pipe' });
for (const u of [MASOOD, MOMIN, MUQTIDA, RAZA, FAWWAD]) {
  execFileSync('npx', ['tsx', 'db/user.ts', u.email, u.name, u.role, u.password], { env, stdio: 'pipe' });
}
{
  const pool = new Pool({ connectionString: DATABASE_URL });
  await pool.query('truncate messages');
  await pool.end();
}

// ---- API + served build ------------------------------------------------
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
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`${ORIGIN}/api/health`)).ok) { up = true; break; } } catch { /* waiting */ }
  await sleep(250);
}
if (!up) { console.error('\nAPI did not start.\n' + serverLog.join('')); process.exit(1); }

act('Building and serving the platform build');
execFileSync('npx', ['vite', 'build', '--outDir', 'tests/hgw-build', '--emptyOutDir'], {
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

const consoleErrors = [];
async function signedInAs(user) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${user.name}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${user.name}] PAGEERROR ${e.message}`));
  await page.goto(APP);
  await page.waitForSelector('#signin-email', { timeout: 25_000 });
  await page.fill('#signin-email', user.email);
  await page.fill('#signin-password', user.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('.sidebar', { timeout: 25_000 });
  return page;
}
/** Navigate AND reload, so the snapshot reflects what other seats just did. */
const nav = async (page, hash) => {
  await page.goto(`${APP}#${hash}`);
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 25_000 });
  await page.waitForTimeout(400);
};
const lastToast = async (page) => {
  await page.waitForSelector('.toast', { timeout: 15_000 }).catch(() => null);
  const t = page.locator('.toast').last();
  return {
    text: ((await t.textContent().catch(() => '')) ?? '').trim(),
    err: await t.evaluate((el) => el.className.includes('err')).catch(() => false),
  };
};
async function tokenFor(user) {
  const r = await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  return (await r.json()).token;
}
async function getAs(user, path) {
  const r = await fetch(`${ORIGIN}${path}`, { headers: { authorization: `Bearer ${await tokenFor(user)}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
/**
 * Fawwad authorises the proposal at the top of the queue, through the screen.
 *
 * Returns the status of the decision, not the state of the page: a refused
 * decision leaves the note form open, so "no Authorise… button" is true both
 * when it worked and when it did not.
 */
async function authorise(note) {
  const page = await signedInAs(FAWWAD);
  await page.goto(`${APP}#/authorisations`);
  await page.waitForSelector('.card-h', { timeout: 25_000 });
  await page.locator('button:has-text("Authorise…")').first().click();
  await page.waitForSelector('textarea', { timeout: 15_000 });
  await page.fill('textarea', note);
  const posted = page.waitForResponse(
    (r) => /\/api\/changes\/\d+\/approve/.test(r.url()), { timeout: 30_000 },
  ).catch(() => null);
  await page.locator('button:has-text("Authorise and apply")').click();
  const res = await posted;
  const detail = res && res.status() !== 200 ? (await res.text()).slice(0, 200) : '';
  await page.waitForTimeout(1000);
  await page.close();
  return { status: res?.status() ?? 0, detail };
}

async function postAs(user, mutation) {
  const r = await fetch(`${ORIGIN}/api/mutations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await tokenFor(user)}` },
    body: JSON.stringify(mutation),
  });
  return { status: r.status, text: await r.text() };
}
const projectNow = async () =>
  (await getAs(MASOOD, '/api/snapshot')).body.projects.find((x) => x.id === ID);
const money = (n) => n.toLocaleString('en-US');

function buildWorkbook() {
  return writeWorkbook([
    {
      name: '1 Project',
      rows: [
        ['Field', 'Value'],
        ['Project ID', ID],
        ['Project Name', NAME],
        ['Portfolio', 'Residential'],
        ['Delivery Route', 'Self-Execution'],
        ['Approved Budget (SAR)', String(BUDGET)],
      ],
    },
    {
      name: '2 Packages',
      rows: [
        ['WBS Code', 'Package / Scope', 'Package Budget (SAR)'],
        ...PKG.map((p) => [p.code, p.name, p.budget]),
      ],
    },
    {
      name: '3 Contracts',
      rows: [
        ['Package No.', 'Contract / Scope', 'WBS Code', 'Contractor', 'Role',
          'Award Value (SAR)', 'Retention %', 'Award Date (YYYY-MM-DD)'],
        ...CONTRACTS,
      ],
    },
  ]);
}

try {

// ======================================================================
// ACT 1 — Raza registers the development from the workbook
// ======================================================================
act('Raza registers Hayat Garden Walk Residence from the workbook');
const raza = await signedInAs(RAZA);
{
  check('Raza is offered Add Project', await raza.locator('button:has-text("Add Project")').isVisible());
  await raza.click('button:has-text("Add Project")');
  await raza.waitForSelector('#ap-id', { timeout: 15_000 });

  const filled = join(OUT, 'hgw-workbook.xlsx');
  writeFileSync(filled, buildWorkbook());
  const parseCall = raza.waitForResponse((r) => r.url().includes('/api/projects/parse'), { timeout: 25_000 }).catch(() => null);
  await raza.setInputFiles('input[type=file]', filled);
  const parseRes = await parseCall;
  check('the workbook is read by the importer', parseRes !== null && parseRes.status() === 200,
    parseRes ? `status ${parseRes.status()}` : 'no request');
  await raza.waitForTimeout(700);
  check('importing fills the form', (await raza.inputValue('#ap-id')) === ID
    && (await raza.inputValue('#ap-name')) === NAME);

  const posted = raza.waitForResponse(
    (r) => r.url().includes('/api/mutations') && r.request().method() === 'POST', { timeout: 30_000 },
  ).catch(() => null);
  // Registering takes two people: Raza proposes, Fawwad authorises.
  await raza.fill('#ap-reason', 'Board approved the acquisition of Hayat Garden Walk.');
  await raza.click('button:has-text("Send for authorisation")');
  const res = posted ? await posted : null;
  check('the registration is queued for the Director, not applied',
    res !== null && res.status() === 202,
    res ? `status ${res.status()} ${(await res.text()).slice(0, 240)}` : 'no request');
  await raza.waitForSelector('#ap-id', { state: 'detached', timeout: 25_000 }).catch(() => null);
  check('nothing is in the portfolio while it waits', (await projectNow()) === undefined);
  const authorised = await authorise('Authorised at the portfolio review.');
  check('Fawwad authorises the registration', authorised.status === 200,
    `status ${authorised.status} ${authorised.detail}`);
  await raza.screenshot({ path: join(OUT, '01-created.png') });

  const p = await projectNow();
  check('the development is in the portfolio', p !== undefined);
  check(`control budget is the packages (${money(CONTROL)})`, p?.control === CONTROL, String(p?.control));
  check(`committed cost is the four awarded contracts (${money(COMMITTED_AT_CREATE)})`,
    p?.committed === COMMITTED_AT_CREATE, String(p?.committed));
  check('the programme dates are still to be confirmed', p?.start === 'To be confirmed');
}

// ======================================================================
// ACT 2 — Raza states the programme: Aug 2025 → Aug 2026
// ======================================================================
act('Raza states the programme through Amend details');
{
  await nav(raza, `/workspace?level=Project&portfolio=Residential&project=${ID}`);
  // Before the programme is stated the year strip cannot reach 2025.
  const yearsBefore = (await raza.locator('.ws-years').textContent().catch(() => '')) ?? '';
  check('before the amendment the strip has no 2025', !yearsBefore.includes('2025'), yearsBefore);

  await raza.locator('button:has-text("Amend details")').first().click();
  await raza.waitForSelector('#ep-start', { timeout: 15_000 });
  await raza.fill('#ep-start', START);
  await raza.fill('#ep-finish', FINISH);
  await raza.fill('#ep-note', 'Programme stated at mobilisation: one year from 1 August 2025.');
  await raza.locator('.modal-f button[class*="btn-gold"]').click();
  const t = await lastToast(raza);
  check('the programme amendment is sent for authorisation', !t.err, t.text);
  const authorisedProgramme = await authorise('Programme authorised.');
  check('Fawwad authorises the programme', authorisedProgramme.status === 200,
    `status ${authorisedProgramme.status} ${authorisedProgramme.detail}`);

  const p = await projectNow();
  check('the development carries its programme', p.start === START && p.finish === FINISH,
    `${p.start} → ${p.finish}`);
  check('the duration follows the dates (12 months)', p.duration === '12 months', p.duration);

  await nav(raza, `/workspace?level=Project&portfolio=Residential&project=${ID}`);
  const years = (await raza.locator('.ws-years').textContent().catch(() => '')) ?? '';
  check('the year strip now reaches 2025', years.includes('2025'), years);
  await raza.screenshot({ path: join(OUT, '02-programme.png') });
}

// ======================================================================
// ACT 3 — Masood assigns it to Muhammad Momin
// ======================================================================
act('Masood assigns the development to Muhammad Momin');
{
  const page = await signedInAs(MASOOD);
  await nav(page, '/admin');
  await page.waitForSelector('button:has-text("Manage")', { timeout: 15_000 });
  const row = page.locator('tr', { hasText: MOMIN.email });
  await row.locator('button:has-text("Manage")').click();
  await page.waitForSelector(`button.chip:has-text("${ID}")`, { timeout: 15_000 });
  await page.locator(`button.chip:has-text("${ID}")`).click();
  await page.locator('button:has-text("Save developments")').click();
  const t = await lastToast(page);
  check('the assignment saves from the Users screen', !t.err, t.text);
  await page.close();

  const rows = await db.query('select project_id from project_assignments where user_id = $1', [MOMIN.email]);
  check('the assignment reaches the database', rows.rows.some((x) => x.project_id === ID));
}

// ======================================================================
// ACT 4 — the year: thirteen periods through three pairs of hands,
//         the mid-year award, and the quarterly claims
// ======================================================================
const momin = await signedInAs(MOMIN);
const muqtida = await signedInAs(MUQTIDA);

/** Select the month on the workspace strip, for whatever year it is in. */
async function selectMonth(page, m) {
  const { year, index } = monthOf(m);
  const yearBtn = page.locator('.ws-years button', { hasText: String(year) });
  if (!((await yearBtn.getAttribute('class').catch(() => '')) ?? '').includes('on')) {
    await yearBtn.click();
    await page.waitForTimeout(250);
  }
  await page.locator('.ws-mo').nth(index).click();
  await page.waitForTimeout(250);
}

for (let m = 1; m <= 13; m++) {
  const { year, label } = monthOf(m);
  const d = monthData(m);
  act(`Period ${m} — ${label}`);

  // -- the mid-year award, through the Procurement form, before January ----
  if (m === 6) {
    await nav(raza, `/procurement?level=Project&portfolio=Residential&project=${ID}`);
    await raza.waitForSelector('button:has-text("Record package")', { timeout: 15_000 });
    await raza.locator('button:has-text("Record package")').click();
    await raza.waitForSelector('#aw-target', { timeout: 15_000 });
    await raza.selectOption('#aw-target', AWARD.id);
    check('awarding pre-fills the tender estimate', (await raza.inputValue('#aw-value')) === '2900000',
      await raza.inputValue('#aw-value'));
    await raza.fill('#aw-value', String(AWARD.value));
    await raza.fill('#aw-date', AWARD.date);
    await raza.fill('#aw-reason', 'Tender committee recommendation of 20 January 2026.');
    await raza.locator('button:has-text("Send for authorisation")').click();
    const t = await lastToast(raza);
    check('the finishes package is sent for authorisation', !t.err, t.text);
    const awarded = await authorise('Award authorised.');
    check('Fawwad authorises the award', awarded.status === 200,
      `status ${awarded.status} ${awarded.detail}`);
    await raza.screenshot({ path: join(OUT, '04-award.png') });

    const p = await projectNow();
    check(`the award moves committed to ${money(CONTROL)}`, p.committed === CONTROL, String(p.committed));
    const regs = (await getAs(MASOOD, `/api/registers/${ID}`)).body;
    const row = regs.procurement.find((x) => x.id === AWARD.id);
    check('the register shows the award, not the tender',
      row !== undefined && row.awarded === AWARD.date && row.committed === AWARD.value,
      JSON.stringify(row));
    check('no package is out to tender any more',
      regs.procurement.every((x) => x.awarded !== null));
  }

  // -- Momin files the period in the workspace -----------------------------
  await nav(momin, `/workspace?level=Project&portfolio=Residential&project=${ID}&mod=period`);
  await momin.waitForSelector('.ws-mo', { timeout: 20_000 });
  await selectMonth(momin, m);
  await momin.waitForSelector('.recon-check', { timeout: 20_000 });

  const sec2 = momin.locator('.card').filter({ has: momin.locator('h3', { hasText: '1 & 2' }) }).first();
  const formInputs = sec2.locator('input:not([type=file])');
  if (m === 1 || m === 13) {
    check(`the period number defaults to ${m} from the programme`,
      (await formInputs.nth(0).inputValue()) === String(m), await formInputs.nth(0).inputValue());
    check(`the data date defaults to ${label}`,
      (await formInputs.nth(1).inputValue()) === label, await formInputs.nth(1).inputValue());
  }
  await formInputs.nth(4).fill(String(d.afc));

  const pkgCard = momin.locator('.card').filter({ has: momin.locator('h3', { hasText: 'Work-package register' }) }).first();
  const rows = pkgCard.locator('tbody tr:not(.tbl-total)');
  if (m === 1) {
    check('the package rows seed from the registered work breakdown',
      (await rows.count()) === PKG.length, `${await rows.count()} rows`);
  }
  for (let i = 0; i < PKG.length; i++) {
    const cells = rows.nth(i).locator('input');
    await cells.nth(3).fill(String(d.packages[i].planned));
    await cells.nth(4).fill(String(d.packages[i].actual));
    await cells.nth(5).fill(String(d.packages[i].cost));
    await cells.nth(6).fill(String(d.packages[i].committed));
  }

  const catCard = momin.locator('.card').filter({ has: momin.locator('h3', { hasText: 'Development cost categories' }) }).first();
  if (m === 1) {
    for (let i = 1; i < d.categories.length; i++) {
      await catCard.locator('button:has-text("Add category")').click();
    }
  }
  const catRows = catCard.locator('tbody tr:not(.tbl-total)');
  for (let i = 0; i < d.categories.length; i++) {
    const c = d.categories[i];
    const cells = catRows.nth(i).locator('input');
    await cells.nth(0).fill(c.cat);
    await cells.nth(1).fill(String(c.budget));
    await cells.nth(2).fill(String(c.committed));
    await cells.nth(3).fill(String(c.actual));
    await cells.nth(4).fill(String(c.afc));
  }
  await momin.waitForTimeout(300);

  const bad = await momin.locator('.recon-check.bad').count();
  check('the entry reconciles before filing', bad === 0, `${bad} failing row(s)`);
  if (m === 1) await momin.screenshot({ path: join(OUT, '03-first-period.png'), fullPage: true });

  await momin.locator('button:has-text("File period")').click();
  const filed = await lastToast(momin);
  check('Momin files it for validation', !filed.err && /validation/i.test(filed.text), filed.text);

  // -- Muqtida validates, Raza approves ------------------------------------
  await nav(muqtida, '/submissions');
  const cardM = muqtida.locator('.card', { hasText: `${ID} — period ${m} · ${label}` });
  await cardM.waitFor({ timeout: 15_000 });
  await cardM.locator('button:has-text("Validate")').click();
  const v = await lastToast(muqtida);
  check('Muqtida validates it', !v.err, v.text);

  await nav(raza, '/submissions');
  const cardR = raza.locator('.card', { hasText: `${ID} — period ${m} · ${label}` });
  await cardR.waitFor({ timeout: 15_000 });
  await cardR.locator('button:has-text("Approve")').click();
  const a = await lastToast(raza);
  check('Raza approves it', !a.err, a.text);

  // -- the position is exactly what the period said ------------------------
  const p = await projectNow();
  check(`EV ${money(d.ev)} · PV ${money(d.pv)} · AC ${money(d.actual)}`,
    p.ev === d.ev && p.pv === d.pv && p.actual === d.actual,
    `got EV ${p.ev} PV ${p.pv} AC ${p.actual}`);
  check(`committed ${money(d.committed)} and AFC ${money(d.afc)} follow the period`,
    p.committed === d.committed && p.afc === d.afc,
    `got committed ${p.committed} afc ${p.afc}`);
  check(`the reported status is ${STATUS[m - 1]}`, p.status === STATUS[m - 1],
    `got ${p.status} (spi ${p.spi}, cpi ${p.cpi})`);

  // -- the quarter's claims, recorded by Raza ------------------------------
  for (const c of CLAIMS[m] ?? []) {
    await nav(raza, `/claims?level=Project&portfolio=Residential&project=${ID}`);
    await raza.waitForSelector('button:has-text("Record claim")', { timeout: 15_000 });
    await raza.locator('button:has-text("Record claim")').first().click();
    await raza.waitForSelector('#cl-pkg', { timeout: 15_000 });
    await raza.selectOption('#cl-pkg', c.pkg);
    await raza.fill('#cl-ref', c.ref);
    await raza.fill('#cl-ms', c.milestone);
    await raza.fill('#cl-vby', VERIFIER);
    await raza.fill('#cl-von', `${year}-${String(monthOf(m).index + 1).padStart(2, '0')}-20`);
    await raza.fill('#cl-vref', `VR-${c.ref}`);
    await raza.fill('#cl-claimed', String(c.claimed));
    await raza.fill('#cl-verified', String(c.verified));
    await raza.fill('#cl-approved', String(c.approved));
    await raza.fill('#cl-rate', '5');
    await raza.locator('form button:has-text("Record claim")').click();
    const t = await lastToast(raza);
    check(`claim ${c.ref} (${money(c.approved)} approved) is recorded`, !t.err, t.text);
  }
  if (CLAIMS[m]) {
    const after = await projectNow();
    check(`certified to date is ${money(cumCertified(m))}`,
      after.ipcSubmitted === cumCertified(m), String(after.ipcSubmitted));
  }
}

// ======================================================================
// ACT 5 — the refusals: the award door only opens for the right seat,
//         and never twice for the same package
// ======================================================================
act('The award refusals');
{
  const asMomin = await postAs(MOMIN, {
    kind: 'contract:award', at: new Date().toISOString(), projectId: ID,
    contract: { id: 'PKG-06', name: 'Signage', wbs: '1.5', contractor: 'Anybody LLC', role: 'Supplier', value: 100_000, retention: 5, awarded: '2026-08-01' },
  });
  check('a contributor may not award a contract', asMomin.status === 403, `status ${asMomin.status}`);

  const again = await postAs(RAZA, {
    kind: 'contract:award', at: new Date().toISOString(), projectId: ID,
    contract: { id: AWARD.id, name: 'Finishes again', wbs: '1.5', contractor: GULF, role: 'Trade Contractor', value: 3_000_000, retention: 5, awarded: '2026-08-01' },
  });
  // Refused ON ITS MERITS, at once — not queued and refused a day later.
  check('a package cannot be awarded twice',
    again.status !== 200 && again.status !== 202 && again.text.includes('already been awarded'),
    `status ${again.status} ${again.text.slice(0, 160)}`);

  const past = await postAs(RAZA, {
    kind: 'contract:award', at: new Date().toISOString(), projectId: ID,
    contract: { id: 'PKG-07', name: 'Everything else', wbs: '1.5', contractor: 'Big Org', role: 'Trade Contractor', value: 5_000_000, retention: 5, awarded: '2026-08-01' },
  });
  check('an award past the approved budget is refused in a sentence, before the queue',
    past.status !== 200 && past.status !== 202 && past.text.includes('approved budget'),
    `status ${past.status} ${past.text.slice(0, 160)}`);
}

// ======================================================================
// ACT 6 — Raza releases retention to Hayat, through the claims drawer
// ======================================================================
act('Raza releases retention through the claims drawer');
{
  await nav(raza, `/claims?level=Project&portfolio=Residential&project=${ID}`);
  await raza.waitForSelector('tbody tr', { timeout: 15_000 });
  await raza.locator('tr', { hasText: 'PC-A-01' }).first().click();
  const release = raza.locator('button:has-text("Release retention")');
  check('a paid claim holding security offers Release retention', await release.first().isVisible(),
    'button not offered');
  await release.first().click();
  await raza.waitForSelector('#cp-amt', { timeout: 15_000 });
  check('the amount defaults to what this claim still holds',
    (await raza.inputValue('#cp-amt')) === '110000', await raza.inputValue('#cp-amt'));
  await raza.fill('#cp-amt', String(RELEASE));
  await raza.fill('#cp-ref', 'TT-2026-09-0102');
  await raza.locator('form button:has-text("Release retention")').click();
  const t = await lastToast(raza);
  check('the release is recorded', !t.err && /released/i.test(t.text), t.text);
  await raza.waitForTimeout(600);
  await raza.screenshot({ path: join(OUT, '06-claims.png'), fullPage: true });

  const p = await projectNow();
  check(`paid to date is the nets plus the release (${money(PAID_TOTAL)})`,
    p.paid === PAID_TOTAL, String(p.paid));
  const regs = (await getAs(MASOOD, `/api/registers/${ID}`)).body;
  check('the register shows the release on the oldest claim',
    regs.claims.find((c) => c.id === 'PC-A-01')?.released === RELEASE,
    JSON.stringify(regs.claims.map((c) => [c.id, c.released])));
}

// ======================================================================
// ACT 7 — Momin messages Raza
// ======================================================================
act('Momin messages Raza');
{
  await nav(momin, '/messages');
  const person = momin.locator('.msg-person, button, tr', { hasText: RAZA.name }).first();
  await person.waitFor({ timeout: 15_000 });
  await person.click();
  await momin.waitForSelector('.msg-compose textarea', { timeout: 15_000 });
  await momin.fill('.msg-compose textarea',
    `Period 13 for ${ID} is approved — the job stands at 90% a month past planned completion.`);
  await momin.locator('.msg-compose button:has-text("Send")').click();
  await momin.waitForTimeout(700);
  check('the message is sent and shown in the thread',
    ((await momin.locator('.content').textContent()) ?? '').includes('90% a month past'));
}

// ======================================================================
// ACT 8 — INTEGRATION: a year of data, on every screen
// ======================================================================
act('Integration sweep — the year is everywhere it should be');
{
  const p = await projectNow();
  check(`the final position is exact — EV ${money(FINAL.ev)}, PV ${money(FINAL.pv)}, AC ${money(FINAL.ac)}`,
    p.ev === FINAL.ev && p.pv === FINAL.pv && p.actual === FINAL.ac,
    `EV ${p.ev} PV ${p.pv} AC ${p.actual}`);
  check('the development reads 90% complete', p.progress === FINAL.progress, String(p.progress));
  check('a month past its planned finish, it reads Delayed', p.status === 'Delayed', p.status);
  check(`certified ${money(CERTIFIED_TOTAL)} and paid ${money(PAID_TOTAL)}`,
    p.ipcSubmitted === CERTIFIED_TOTAL && p.paid === PAID_TOTAL,
    `certified ${p.ipcSubmitted} paid ${p.paid}`);

  const regs = (await getAs(MASOOD, `/api/registers/${ID}`)).body;
  check('procurement holds only the three contractors',
    regs.procurement.every((x) => OWN_PARTIES.has(x.contractor)),
    regs.procurement.map((x) => x.contractor).join(', '));
  check('all five packages are awarded, committing the full control budget',
    regs.procurement.reduce((a, x) => a + x.committed, 0) === CONTROL);
  check('the claims register is the eight recorded claims',
    regs.claims.length === 8, `${regs.claims.length} rows`);
  const paidByParty = {};
  for (const c of regs.claims) paidByParty[c.contractor] = (paidByParty[c.contractor] ?? 0) + c.paid;
  const share = (name, committed) => Math.round(((paidByParty[name] ?? 0) / committed) * 100);
  // Hayat sits a touch above 80 because the released retention landed on its
  // oldest claim; Noor's MEP is the least complete, so it trails.
  check('Hayat Builders is paid to ~80% of its commitment', Math.abs(share(HAYAT, 5_000_000) - 80) <= 2,
    `${share(HAYAT, 5_000_000)}%`);
  check('Gulf Structures is paid to ~80% of its commitment', Math.abs(share(GULF, 9_500_000) - 80) <= 2,
    `${share(GULF, 9_500_000)}%`);
  for (const [name2, rows2] of [['ncrs', regs.ncrs], ['risks', regs.risks], ['issues', regs.issues],
    ['variations', regs.variations], ['equipment', regs.equipment], ['manpower', regs.manpower]]) {
    check(`${name2} is honestly empty (nothing recorded)`, rows2.length === 0, `${rows2.length} rows`);
  }

  const page = await signedInAs(MASOOD);

  // Both years of the month strip: five approved in 2025, eight in 2026.
  await nav(page, `/workspace?level=Project&portfolio=Residential&project=${ID}`);
  await page.waitForSelector('.ws-mo', { timeout: 15_000 });
  await page.locator('.ws-years button', { hasText: '2025' }).click();
  await page.waitForTimeout(300);
  const strip25 = await page.locator('.ws-mo .st').allTextContents();
  check('2025 shows five approved periods, August to December',
    strip25.filter((s) => s === 'Approved').length === 5, strip25.join(', '));
  await page.screenshot({ path: join(OUT, '05-strip-2025.png') });
  await page.locator('.ws-years button', { hasText: '2026' }).click();
  await page.waitForTimeout(300);
  const strip26 = await page.locator('.ws-mo .st').allTextContents();
  check('2026 shows eight approved periods, January to August',
    strip26.filter((s) => s === 'Approved').length === 8, strip26.join(', '));
  const content = (await page.locator('.content').textContent()) ?? '';
  check('the workspace band says Delayed', content.includes('Delayed'));
  await page.screenshot({ path: join(OUT, '07-final-workspace.png'), fullPage: true });

  // The shell's integrity badge — nine developments, twenty controls, green.
  const badge = (await page.locator('.topbar', { hasText: '/' }).textContent().catch(() => '')) ?? '';
  check('the integrity badge shows 20/20 with the year of data in scope',
    badge.includes('20/20'), badge.slice(0, 120));

  // Every register module renders at Project scope with no NaN.
  for (const route of ['overview', 'wbs', 'cost', 'variations', 'change', 'procurement', 'claims',
    'evaluation', 'manpower', 'equipment', 'quality', 'hse', 'risk', 'issues', 'documents', 'reports', 'analytics']) {
    await nav(page, `/${route}?level=Project&portfolio=Residential&project=${ID}`);
    await page.waitForSelector('.content', { timeout: 15_000 });
    const text = (await page.locator('.content').textContent()) ?? '';
    check(`${route} renders for the development, no NaN`,
      text.trim().length > 40 && !text.includes('NaN'),
      text.includes('NaN') ? 'NaN found' : `${text.trim().length} chars`);
  }

  // Evaluation names the real counterparties.
  await nav(page, `/evaluation?level=Project&portfolio=Residential&project=${ID}`);
  await page.waitForTimeout(600);
  const evalText = (await page.locator('.content').textContent()) ?? '';
  check('Evaluation scores the registered counterparties', evalText.includes(HAYAT));

  // Projects marks it Delayed in the portfolio list.
  await nav(page, '/projects');
  await page.waitForSelector('tbody tr', { timeout: 15_000 });
  const row = page.locator('tbody tr', { hasText: ID }).first();
  check('Projects lists the development as Delayed',
    ((await row.textContent().catch(() => '')) ?? '').includes('Delayed'));

  // Dashboard at Corporate carries it, no NaN.
  await nav(page, '/dashboard?level=Corporate');
  await page.waitForSelector('.kpi', { timeout: 15_000 });
  const dashText = (await page.locator('.content').textContent()) ?? '';
  check('no NaN on the Dashboard', !dashText.includes('NaN'));
  await page.screenshot({ path: join(OUT, '08-dashboard.png'), fullPage: true });

  // The report preview and the Corporate CSV export carry it.
  await nav(page, '/reports?level=Corporate');
  await page.waitForSelector('.content', { timeout: 15_000 });
  await page.locator('button:has-text("Preview")').first().click();
  await page.waitForSelector('button:has-text("Excel")', { timeout: 15_000 });
  const dl = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  await page.locator('button:has-text("Excel")').first().click().catch(() => null);
  const got = await dl;
  if (check('the Report Centre exports a CSV', got !== null)) {
    const path = join(OUT, 'corporate-report.csv');
    await got.saveAs(path);
    const csv = readFileSync(path, 'utf8');
    check('the export carries the development', csv.includes(ID), csv.slice(0, 120));
  }
  await page.close();
}

} catch (err) {
  check('the browser flow completed', false, String(err).split('\n')[0]);
}

await db.end();
await browser.close();
web.close();
stop();

console.log(`\nHayat Garden Walk Residence — a year end to end  ${checks} checks`);
if (consoleErrors.length) {
  console.log('\n  console errors:');
  for (const e of consoleErrors.slice(0, 12)) console.log(`    ${e}`);
}
check('zero console errors across every session', consoleErrors.length === 0, `${consoleErrors.length}`);
if (failures.length) {
  console.error(`\n  ${failures.length} failure(s):\n`);
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('\n  registered, programmed, assigned; thirteen periods filed, validated and');
console.log('  approved; a package awarded mid-year; eight claims recorded; retention');
console.log('  released — and a delayed, 90%-complete year on every screen and export.\n');
