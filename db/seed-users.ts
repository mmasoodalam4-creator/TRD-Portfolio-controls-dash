#!/usr/bin/env node
// The initial Tazayud accounts.
//
//   DATABASE_URL=... npx tsx db/seed-users.ts
//
// Prints each generated password ONCE. They are stored only as scrypt hashes
// and cannot be read back; rerun `npm run db:user -- <email> <name> <role>` to
// set a new one.
//
// ROLES AND ASSIGNMENT, as Tazayud specified them.
//
// Input, review and approval are three stages performed by three different
// people. The roles name that separation rather than collapsing it, and the
// database enforces the part that matters: whoever submits a period can never
// be the one who reviews or approves it. See migration 004 — that rule is a
// CHECK constraint, so no role waives it, admin included.
//
// Contributors are scoped to their own developments. Absence of an assignment
// is absence of permission: an unassigned contributor can submit nothing.
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import { hashPassword, type Role } from '../server/auth.js';

interface Seat {
  email: string;
  name: string;
  /** The title Tazayud gave, kept so the mapping is auditable. */
  title: string;
  role: Role;
  /** Developments this person may input for. Contributors only. */
  projects?: string[];
}

const SEATS: Seat[] = [
  { email: 'mmasoodalam4@gmail.com', name: 'Masood',
    title: 'PMO Senior Lead & Expert', role: 'admin' },
  // THE DIRECTOR SEAT, not `reader`. Migration 015 added it because the owner
  // asked for changes to a development — its name, its budget, deleting it,
  // closing it out, awarding a package against it — to be proposed by the PMO
  // Controls Manager and AUTHORISED here before they take effect. `reader`
  // means "changes nothing", which is worth keeping as its own thing, so the
  // authority to let a change through is a seat rather than a power bolted on.
  //
  // It still files nothing and validates nothing: authorising a change to a
  // development is not approving a reporting period.
  { email: 'fawwad@bmi-plus.com', name: 'Fawwad Hussain',
    title: 'Head of PRGC / Director', role: 'director' },
  { email: 'raza@bmi-plus.com', name: 'Raza Adil',
    title: 'PMO Controls Manager', role: 'approver' },
  { email: 'muqtida@bmi-plus.com', name: 'Muqtida Sajjad',
    title: 'PMO Team Leader', role: 'reviewer' },
  // The two inputters.
  //
  // THIS SPLIT IS A DUMMY-PHASE ASSUMPTION, not project ownership. Seven of
  // the eight developments sit with Muhammad so one account can exercise
  // almost the whole portfolio, and LND-02 sits with Momin purely so his
  // account is testable — a contributor with no assignment can submit
  // nothing, so an unassigned account cannot be tested at all.
  //
  // Real ownership is assigned after the migration to the approved database.
  // Change the lists here and rerun `npm run db:users`.
  { email: 'm.masoodalam78@gmail.com', name: 'Muhammad',
    title: 'PMC Manager — project data input', role: 'contributor',
    projects: ['RES-01', 'RES-02', 'COM-01', 'COM-02', 'MXU-01', 'MXU-02', 'LND-01'] },
  { email: 'mmominmasood87@gmail.com', name: 'Muhammad Momin',
    title: 'Project Manager — user input', role: 'contributor',
    projects: ['LND-02'] },
];

const here = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main(): Promise<void> {
  // EVERY MIGRATION, IN NAME ORDER — never a list of the ones this script
  // happens to need.
  //
  // It used to apply 002 and 004 by name, and that is exactly the defect
  // db/seed.ts warns about two files away: migration 004 ADDS the CHECK
  // constraint `users_role_known`, listing the five roles it knew about, and
  // migration 015 drops it because seats are now rows in a table. Running the
  // two named files put the constraint back over the top of 015, so issuing
  // the Director account came back
  //
  //     new row violates check constraint "users_role_known"
  //
  // on a database whose schema was, a moment earlier, correct. Applying the
  // whole directory means a migration written tomorrow cannot be forgotten
  // here, and cannot be undone by one written yesterday.
  for (const file of readdirSync(join(here, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(here, 'migrations', file), 'utf8'));
  }

  console.log('\n  Accounts created. Passwords are shown once and are not recoverable.\n');
  console.log(`  ${'Name'.padEnd(18)}${'Role'.padEnd(14)}${'Email'.padEnd(30)}${'Password'.padEnd(20)}Developments`);
  console.log(`  ${'-'.repeat(130)}`);

  for (const seat of SEATS) {
    const password = randomBytes(12).toString('base64url');
    const id = seat.email.toLowerCase();

    await pool.query(
      `insert into users (id, email, name, role, password_hash)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update set
         email = excluded.email, name = excluded.name, role = excluded.role,
         password_hash = excluded.password_hash`,
      [id, seat.email, seat.name, seat.role, hashPassword(password)],
    );

    // Assignment is replaced wholesale rather than added to, so rerunning
    // this is idempotent and a removed project is actually removed.
    await pool.query('delete from project_assignments where user_id = $1', [id]);
    for (const projectId of seat.projects ?? []) {
      await pool.query(
        'insert into project_assignments (user_id, project_id) values ($1, $2)'
        + ' on conflict do nothing',
        [id, projectId],
      );
    }

    const scope = seat.projects ? seat.projects.join(' ') : '—';
    console.log(`  ${seat.name.padEnd(18)}${seat.role.padEnd(14)}${seat.email.padEnd(30)}${password.padEnd(20)}${scope}`);
  }

  // NO DEVELOPMENT MAY BE LEFT UNASSIGNED.
  //
  // Absence of an assignment is absence of permission, so an unassigned
  // development is one nobody can file a period for — silently, with no error
  // until someone tries. Checked here against the projects actually in the
  // database rather than against the list above, because the two drifting
  // apart is exactly how a development would be missed.
  const { rows: unassigned } = await pool.query<{ id: string }>(
    `select p.id from projects p
      where not exists (
        select 1 from project_assignments a where a.project_id = p.id
      )
      order by p.seq`,
  );

  if (unassigned.length > 0) {
    console.error(`\n  ${unassigned.length} development(s) have no contributor assigned:`);
    for (const row of unassigned) console.error(`    ${row.id}`);
    console.error('\n  Nobody can file a period for these. Add them to a seat above'
      + ' and rerun.\n');
    await pool.end();
    process.exit(1);
  }

  const { rows: [covered] } = await pool.query<{ n: string }>(
    'select count(distinct project_id)::text as n from project_assignments',
  );
  console.log(`\n  ${SEATS.length} accounts; every one of ${covered?.n ?? '0'} developments is assigned.`);
  console.log('  Send each person their own line, over something private.\n');
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
