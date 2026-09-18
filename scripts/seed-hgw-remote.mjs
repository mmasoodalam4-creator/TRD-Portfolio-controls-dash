#!/usr/bin/env node
/**
 * SEED HAYAT GARDEN WALK RESIDENCE INTO A DEPLOYED PLATFORM.
 *
 * The acceptance run (npm run check:e2e) proves the year-long scenario in a
 * local browser; this script puts the SAME year into a real deployment,
 * through the deployment's own API — the same routes, the same validation,
 * the same twenty reconciliation controls before every write. Nothing here
 * touches a database directly.
 *
 * Usage, admin-only (the admin exemption lets one account enter, validate
 * and approve — the trail names the admin at every stage):
 *
 *   node scripts/seed-hgw-remote.mjs \
 *     --api https://your-deployment.vercel.app \
 *     --admin admin@example.com:PASSWORD
 *
 * Or with the real seats, for the faithful trail (Momin files, Muqtida
 * validates, Raza approves and handles the commercial acts):
 *
 *   node scripts/seed-hgw-remote.mjs --api https://... \
 *     --admin masood@...:PW --momin momin@...:PW \
 *     --muqtida muqtida@...:PW --raza raza@...:PW
 *
 * It refuses to run if RES-03 already exists on the target — this seeds a
 * demonstration, it does not repair one. Requires migrations up to 014.
 */
import {
  ID, NAME, BUDGET, CONTROL, START, FINISH, PKG, CONTRACTS, AWARD,
  periodMutation, claimMutation, CLAIMS, STATUS, monthOf,
  CERTIFIED_TOTAL, PAID_TOTAL, RELEASE, FINAL, monthData,
} from './hgw-scenario.mjs';

// ---- arguments ---------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const cred = (name) => {
  const v = opt(name);
  if (!v) return undefined;
  const at = v.indexOf(':');
  if (at <= 0) {
    console.error(`--${name} must be email:password`);
    process.exit(1);
  }
  return { email: v.slice(0, at), password: v.slice(at + 1) };
};

const API = (opt('api') ?? '').replace(/\/+$/, '');
const ADMIN = cred('admin');
const MOMIN = cred('momin');
const MUQTIDA = cred('muqtida');
const RAZA = cred('raza');
if (!API || !ADMIN) {
  console.error('\nUsage: node scripts/seed-hgw-remote.mjs --api https://host --admin email:password');
  console.error('       [--momin email:pw --muqtida email:pw --raza email:pw]\n');
  console.error('Admin alone works: the admin exemption lets one account enter, validate and approve.');
  process.exit(1);
}
const faithful = MOMIN && MUQTIDA && RAZA;
// Who takes each act. Without the full cast, the admin takes them all.
const SUBMITTER = faithful ? MOMIN : ADMIN;
const REVIEWER = faithful ? MUQTIDA : ADMIN;
const APPROVER = faithful ? RAZA : ADMIN;

// ---- the API, spoken plainly -------------------------------------------
const tokens = new Map();
async function token(user) {
  if (tokens.has(user.email)) return tokens.get(user.email);
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!r.ok) {
    console.error(`\nSign-in failed for ${user.email}: ${r.status} ${(await r.text()).slice(0, 200)}\n`);
    process.exit(1);
  }
  const t = (await r.json()).token;
  tokens.set(user.email, t);
  return t;
}
async function call(user, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await token(user)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

let steps = 0;
const step = (what) => { steps++; console.log(`  ok  ${what}`); };
const money = (n) => n.toLocaleString('en-US');

try {
  // ---- the target must not already carry the development ---------------
  const snapshot = await call(ADMIN, 'GET', '/api/snapshot');
  if (snapshot.projects.some((p) => p.id === ID)) {
    console.error(`\n${ID} already exists on ${API} — this seeds a fresh demonstration,`);
    console.error('it does not repair one. Remove or archive it first if you mean to reseed.\n');
    process.exit(1);
  }
  step(`${API} reachable, ${snapshot.projects.length} developments, ${ID} free`);

  // ---- register, programme, assign -------------------------------------
  await call(ADMIN, 'POST', '/api/mutations', {
    kind: 'project:create',
    at: new Date().toISOString(),
    project: { id: ID, name: NAME, portfolio: 'Residential', route: 'Self-Execution', budget: BUDGET },
    packages: PKG.map((p) => ({
      code: p.code, name: p.name, phase: '', budget: p.budget,
      plannedPct: 0, actualPct: 0, cost: 0, committed: 0,
    })),
    contracts: CONTRACTS.map(([id, name, wbs, contractor, role, value, retention, awarded]) => ({
      id, name, wbs, contractor, role, value, retention, awarded: awarded || null,
    })),
  });
  step(`registered ${ID} — ${NAME}, ${money(BUDGET)} SAR, control ${money(CONTROL)}`);

  await call(ADMIN, 'POST', '/api/mutations', {
    kind: 'project:update', at: new Date().toISOString(), projectId: ID,
    start: START, finish: FINISH,
    note: 'Programme stated at mobilisation: one year from 1 August 2025.',
  });
  step(`programme stated ${START} → ${FINISH}`);

  if (faithful) {
    const users = await call(ADMIN, 'GET', '/api/users');
    const momin = users.find((u) => u.email === MOMIN.email);
    const mine = momin?.projects ?? [];
    await call(ADMIN, 'POST', `/api/users/${encodeURIComponent(MOMIN.email)}/assignments`,
      { projects: [...new Set([...mine, ID])] });
    step(`assigned ${ID} to ${MOMIN.email}`);
  }

  // ---- the year: thirteen periods, the award, the claims ---------------
  for (let m = 1; m <= 13; m++) {
    if (m === 6) {
      await call(APPROVER, 'POST', '/api/mutations', {
        kind: 'contract:award', at: new Date().toISOString(), projectId: ID,
        contract: {
          id: AWARD.id, name: 'Finishes & landscaping', wbs: '1.5',
          contractor: 'Gulf Structures LLC', role: 'Trade Contractor',
          value: AWARD.value, retention: 5, awarded: AWARD.date,
        },
      });
      step(`awarded ${AWARD.id} at ${money(AWARD.value)} — committed reaches ${money(CONTROL)}`);
    }

    const sub = await call(SUBMITTER, 'POST', '/api/periods', periodMutation(m));
    await call(REVIEWER, 'POST', `/api/periods/${sub.id}/review`, {});
    await call(APPROVER, 'POST', `/api/periods/${sub.id}/approve`, {});

    const d = monthData(m);
    const p = (await call(ADMIN, 'GET', '/api/snapshot')).projects.find((x) => x.id === ID);
    if (p.ev !== d.ev || p.actual !== d.actual || p.status !== STATUS[m - 1]) {
      throw new Error(`period ${m}: expected EV ${d.ev} AC ${d.actual} ${STATUS[m - 1]}, `
        + `got EV ${p.ev} AC ${p.actual} ${p.status}`);
    }
    step(`period ${m} (${monthOf(m).label}) approved — EV ${money(d.ev)}, ${p.status}`);

    for (const c of CLAIMS[m] ?? []) {
      await call(APPROVER, 'POST', '/api/mutations', claimMutation(m, c));
      step(`claim ${c.ref} approved for ${money(c.approved)}`);
    }
  }

  // ---- release retention on the oldest claim ---------------------------
  await call(APPROVER, 'POST', '/api/mutations', {
    kind: 'claim:pay', at: new Date().toISOString(), projectId: ID,
    claimId: 'PC-A-01', amount: RELEASE, valueDate: '2026-08-31', reference: 'TT-2026-09-0102',
  });
  step(`released ${money(RELEASE)} retention against PC-A-01`);

  // ---- the position, exactly -------------------------------------------
  const p = (await call(ADMIN, 'GET', '/api/snapshot')).projects.find((x) => x.id === ID);
  const exact = p.ev === FINAL.ev && p.pv === FINAL.pv && p.actual === FINAL.ac
    && p.progress === FINAL.progress && p.status === 'Delayed'
    && p.ipcSubmitted === CERTIFIED_TOTAL && p.paid === PAID_TOTAL;
  if (!exact) {
    throw new Error(`final position off: EV ${p.ev} PV ${p.pv} AC ${p.actual} `
      + `progress ${p.progress} ${p.status} certified ${p.ipcSubmitted} paid ${p.paid}`);
  }
  step(`final position exact — EV ${money(FINAL.ev)}, 90% complete, Delayed, `
    + `certified ${money(CERTIFIED_TOTAL)}, paid ${money(PAID_TOTAL)}`);

  console.log(`\n${steps} steps — ${NAME} now lives on ${API}:`);
  console.log('a delayed, 90%-complete year of periods, claims, an award and a retention');
  console.log(`release, every write through the platform's own controls.\n`);
} catch (err) {
  console.error(`\nFAILED after ${steps} step(s): ${String(err.message ?? err)}\n`);
  console.error('Nothing here bypasses the platform — whatever was written before the');
  console.error('failure is real, reconciled data. Fix the cause and reseed on a clean');
  console.error(`target (archive or remove ${ID} first).\n`);
  process.exit(1);
}
