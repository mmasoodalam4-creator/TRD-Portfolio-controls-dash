#!/usr/bin/env node
// Seeds a database from the shipped fixtures.
//
// The fixtures are the same module the app reads, so a seeded database and the
// mock start from an identical position. scripts/check-api.mjs depends on that:
// it proves the two backends return the same figures, which is only meaningful
// if they began the same.
//
//   DATABASE_URL=postgres://... npx tsx db/seed.ts [--reset]
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import { DB } from '../src/data/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main(): Promise<void> {
  // --reset DROPS the tables rather than truncating them. The migration uses
  // `create table if not exists`, so a truncate would silently keep an old
  // shape: the first run of the seq column did exactly that, the inserts
  // failed against a table that had no such column, and the parity gate then
  // compared a populated mock against an empty database. A reset has to mean
  // the schema too.
  if (process.argv.includes('--reset')) {
    // ALL of them. Dropping only the three data tables CASCADEd away the
    // foreign keys that period_submissions and project_assignments carried
    // to projects — and migration 004's `create table if not exists` then
    // left both tables standing, FK-less, with whatever rows they held. A
    // reset that leaves two tables in a shape no migration would produce is
    // not a reset.
    //
    // `project_change_requests` and `messages` are here for the same reason,
    // and it is not theoretical: a proposal left standing from a previous run
    // made the NEXT run refuse the same act with "already has a change waiting
    // for authorisation", against a development the reset had just recreated.
    // `role_capabilities` too — a seat an administrator defined is state, and
    // a reset that kept it would leave accounts pointing at a row no migration
    // wrote. `portfolios` and `delivery_routes` are the same kind of thing: a
    // fifth portfolio somebody added is state, and a reset that kept it would
    // leave the seeded eight developments beside a portfolio holding none.
    await pool.query(
      'drop table if exists period_submissions, project_assignments, messages, '
      + 'project_change_requests, users, role_capabilities, '
      + 'portfolios, delivery_routes, '
      + 'projects, mutations, corporate cascade',
    );
  }

  // Every migration, in name order. Listing them individually is how one gets
  // forgotten and a constraint silently stays behind the code.
  for (const file of readdirSync(join(here, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(here, 'migrations', file), 'utf8'));
  }

  for (const [seq, p] of DB.projects.entries()) {
    await pool.query(
      `insert into projects (
         id, seq, name, portfolio, route, pmc, budget, control, afc, committed, actual,
         ev, pv, spi, cpi, progress, status, start_label, finish_label, duration_label,
         paid, ipc_submitted, risks, high_risks, open_ncr, open_issues, emv
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,$22,$23,$24,$25,$26,$27
       ) on conflict (id) do nothing`,
      [
        p.id, seq, p.name, p.portfolio, p.route, p.pmc, p.budget, p.control, p.afc,
        p.committed, p.actual, p.ev, p.pv, p.spi, p.cpi, p.progress, p.status,
        p.start, p.finish, p.duration, p.paid, p.ipcSubmitted, p.risks,
        p.highRisks, p.openNcr, p.openIssues, p.emv,
      ],
    );
  }

  const reference = {
    portfolios: DB.portfolios,
    months: DB.months,
    scurve: DB.scurve,
    activities: DB.activities,
    reconciliation: DB.reconciliation,
    reports: DB.reports,
    notifications: DB.notifications,
    roles: DB.roles,
  };

  for (const [key, value] of Object.entries(reference)) {
    await pool.query(
      `insert into corporate (key, value) values ($1, $2)
       on conflict (key) do update set value = excluded.value`,
      [key, JSON.stringify(value)],
    );
  }

  const { rows } = await pool.query<{ n: string }>('select count(*)::text as n from projects');
  console.log(`seeded: ${rows[0]?.n ?? '0'} developments, ${Object.keys(reference).length} reference collections`);
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
