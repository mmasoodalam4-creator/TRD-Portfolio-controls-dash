#!/usr/bin/env node
// Create or update a user account.
//
//   DATABASE_URL=... npx tsx db/user.ts <email> <name> <role> [password]
//
// Roles: contributor | reviewer | approver | director | reader | admin,
// and any seat an administrator has defined in `role_capabilities`.
//
// With no password one is generated and printed once. It is never stored in
// plaintext and cannot be recovered — rerun this command to set a new one.
// That is deliberate: a system holding the owner's cost position should not
// have a password anywhere it can be read back.
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import { hashPassword, isRoleName, ROLES } from '../server/auth.js';

const [email, name, role, given] = process.argv.slice(2);

if (!email || !name || !role) {
  console.error('usage: tsx db/user.ts <email> <name> <contributor|reviewer|approver|reader|admin> [password]');
  process.exit(1);
}
// The role list is imported, never restated. A second copy is how this file
// came to accept only the original three long after the model had five.
if (!isRoleName(role)) {
  console.error(`role must be one of: ${ROLES.join(', ')}`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Readable but not guessable: 18 random bytes, base64url. */
const password = given ?? randomBytes(18).toString('base64url');

async function main(): Promise<void> {
  // EVERY migration, in name order — never the one this script happens to
  // need. Applying a named subset is how `db/seed-users.ts` came to put a
  // dropped CHECK constraint back over the top of a later migration; see the
  // note there.
  for (const file of readdirSync(join(here, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(here, 'migrations', file), 'utf8'));
  }

  // Deterministic id from the address, so rerunning updates rather than
  // duplicating, and so the id in the change log stays stable for a person.
  const id = email.trim().toLowerCase();

  await pool.query(
    `insert into users (id, email, name, role, password_hash)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       email = excluded.email, name = excluded.name, role = excluded.role,
       password_hash = excluded.password_hash`,
    [id, email.trim(), name, role, hashPassword(password)],
  );

  console.log(`\n  ${name} <${email}>  role: ${role}`);
  if (!given) console.log(`  password: ${password}     (shown once — it is not recoverable)`);
  console.log('');
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
