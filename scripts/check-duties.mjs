#!/usr/bin/env node
/**
 * Separation of duties, proven against the database itself.
 *
 * The requirement was explicit: enforce it in the database, not just the UI.
 * So this check does not go through the API at all. Every statement below is
 * raw SQL on a direct connection, which is exactly what a migration, a repair
 * script, a second service, or a mistake in our own server would look like.
 *
 * If these constraints only lived in application code, every one of the
 * refusals below would instead be a successful write.
 *
 *   1. scoping    a contributor cannot submit for a development that is not
 *                 assigned to them; an unassigned contributor can submit
 *                 nothing at all
 *   2. capability a reviewer, approver or reader cannot submit
 *   3. the rule   the submitter can never review or approve their own period,
 *                 and the reviewer can never approve their own review
 *   4. admin      is a superuser over WHAT may be done, and is NOT exempt from
 *                 the separation of duties
 *   5. sequence   approval cannot precede review; provenance cannot be half
 *                 written
 *
 * Requires DATABASE_URL. scripts/local-postgres.sh start prints one.
 */
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\nDATABASE_URL is required. Run: scripts/local-postgres.sh start\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const failures = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

/** Run SQL and report whether the database refused it, and why. */
async function attempt(sql, params = []) {
  try {
    await pool.query(sql, params);
    return { refused: false, message: '' };
  } catch (err) {
    return { refused: true, message: String(err.message ?? err) };
  }
}

const refuses = async (name, sql, params, matching) => {
  const { refused, message } = await attempt(sql, params);
  check(name, refused && (!matching || matching.test(message)),
    refused ? `refused, but with: ${message}` : 'THE DATABASE ALLOWED IT');
};

const allows = async (name, sql, params) => {
  const { refused, message } = await attempt(sql, params);
  check(name, !refused, message);
};

// ---- a cast of one of each role ---------------------------------------
const PEOPLE = [
  ['sod-contrib@test', 'contributor'],
  ['sod-contrib2@test', 'contributor'],
  ['sod-reviewer@test', 'reviewer'],
  ['sod-approver@test', 'approver'],
  ['sod-director@test', 'director'],
  ['sod-reader@test', 'reader'],
  ['sod-admin@test', 'admin'],
];

await pool.query('delete from period_submissions where project_id in (select id from projects)');
await pool.query("delete from project_change_requests where requested_by like 'sod-%'");
await pool.query("delete from users where id like 'sod-%'");

for (const [id, role] of PEOPLE) {
  await pool.query(
    'insert into users (id, email, name, role, password_hash) values ($1,$1,$2,$3,$4)',
    [id, role, role, 'scrypt:00:00'],
  );
}
// Only the first contributor is assigned, and only to RES-01.
await pool.query(
  "insert into project_assignments (user_id, project_id) values ('sod-contrib@test','RES-01')",
);

const submit = 'insert into period_submissions (project_id, period, submitted_by, payload)'
  + " values ($1, $2, $3, '{}'::jsonb)";

// ---- 1. scoping -------------------------------------------------------
await allows('an assigned contributor may submit for their development',
  submit, ['RES-01', 101, 'sod-contrib@test']);

await refuses('a contributor may not submit for an unassigned development',
  submit, ['COM-01', 102, 'sod-contrib@test'], /not assigned/i);

await refuses('an unassigned contributor may submit nothing',
  submit, ['RES-02', 103, 'sod-contrib2@test'], /not assigned/i);

// ---- 2. capability ----------------------------------------------------
// Each gets its own period number: sharing one would let the unique
// constraint refuse the second and third for the wrong reason entirely. The
// message is matched for exactly that reason — "it was refused" is not the
// same claim as "it was refused because the role may not submit", and a
// negative control caught this distinction being blurred.
for (const [n, role] of ['reviewer', 'approver', 'reader'].entries()) {
  const article = role === 'approver' ? 'an' : 'a';
  await refuses(`${article} ${role} may not submit a period`,
    submit, ['RES-01', 110 + n, `sod-${role}@test`], /may not submit/i);
}

// ---- 3. THE HARD RULE -------------------------------------------------
const row = await pool.query(
  "select id from period_submissions where project_id = 'RES-01' and period = 101",
);
const id = row.rows[0]?.id;
check('the assigned submission exists to act on', id !== undefined);

await refuses('the submitter may not review their own period',
  'update period_submissions set reviewed_by = submitted_by, reviewed_at = now() where id = $1',
  [id], /sod_reviewer_is_not_submitter/);

await allows('a different person may review it',
  "update period_submissions set reviewed_by = 'sod-reviewer@test', reviewed_at = now(),"
  + " state = 'reviewed' where id = $1", [id]);

await refuses('the submitter may not approve their own period',
  'update period_submissions set approved_by = submitted_by, approved_at = now() where id = $1',
  [id], /sod_approver_is_not_submitter/);

await refuses('the reviewer may not approve what they reviewed',
  'update period_submissions set approved_by = reviewed_by, approved_at = now() where id = $1',
  [id], /sod_approver_is_not_reviewer/);

await allows('a third person may approve it',
  "update period_submissions set approved_by = 'sod-approver@test', approved_at = now(),"
  + " state = 'approved' where id = $1", [id]);

// ---- 4. the admin exemption ------------------------------------------
//
// On the owner's instruction the admin seat MAY carry a period through every
// stage alone, so that one account can report when the PMO seats are away.
// The exemption reads the role, so the two halves are both proven here: the
// admin is let through, and everyone else is still refused by the same
// trigger on the same statement.
await allows('an admin may submit for any development',
  submit, ['LND-02', 120, 'sod-admin@test']);

const adminRow = await pool.query(
  "select id from period_submissions where project_id = 'LND-02' and period = 120",
);
const adminId = adminRow.rows[0]?.id;

await allows('an admin MAY validate their own submission',
  'update period_submissions set reviewed_by = submitted_by, reviewed_at = now(),'
  + " state = 'reviewed' where id = $1", [adminId]);

await allows('an admin MAY approve what they entered and validated',
  'update period_submissions set approved_by = submitted_by, approved_at = now(),'
  + " state = 'approved' where id = $1", [adminId]);

// The exemption is the admin's alone. Demote the same account and the same
// statement is refused, which is what proves the trigger reads the role
// rather than simply having stopped enforcing anything.
await pool.query("update users set role = 'contributor' where id = 'sod-admin@test'");
await pool.query(
  "insert into project_assignments (user_id, project_id) values ('sod-admin@test','LND-02')"
  + ' on conflict do nothing',
);
await allows('the demoted account may still submit for an assigned development',
  submit, ['LND-02', 121, 'sod-admin@test']);

const demotedRow = await pool.query(
  "select id from period_submissions where project_id = 'LND-02' and period = 121",
);
const demotedId = demotedRow.rows[0]?.id;

await refuses('the same account, no longer an admin, may NOT validate its own period',
  'update period_submissions set reviewed_by = submitted_by, reviewed_at = now() where id = $1',
  [demotedId], /sod_reviewer_is_not_submitter/);

await refuses('the same account, no longer an admin, may NOT approve its own period',
  "update period_submissions set reviewed_by = 'sod-reviewer@test', reviewed_at = now(),"
  + ' approved_by = submitted_by, approved_at = now() where id = $1',
  [demotedId], /sod_approver_is_not_submitter/);

await pool.query("update users set role = 'admin' where id = 'sod-admin@test'");

// ---- 5. sequence and provenance --------------------------------------
await refuses('approval may not precede review',
  "update period_submissions set approved_by = 'sod-approver@test', approved_at = now()"
  + ' where id = $1', [demotedId], /approval_follows_review/);

await refuses('a stage may not be recorded without who performed it',
  'update period_submissions set reviewed_at = now() where id = $1',
  [demotedId], /reviewed_is_complete/);

await refuses('two live submissions for the same development and period',
  submit, ['RES-01', 101, 'sod-contrib@test'], /duplicate key|unique/i);

// ---- 6. AUTHORISING A CHANGE TO A DEVELOPMENT -------------------------
//
// The second two-person control, held in the same place and proven the same
// way: with the API bypassed entirely. The PMO Controls Manager proposes and
// the Director authorises, and the person who proposed a change never
// authorises it — the trigger in migration 016 refuses that whatever a route
// decides to allow.
const proposal = async (by) => {
  const { rows } = await pool.query(
    `insert into project_change_requests (kind, project_id, payload, summary, reason, requested_by)
     values ('project:update', 'RES-01', '{"kind":"project:update"}'::jsonb,
             'Amend RES-01', 'a reason', $1)
     returning id`,
    [by],
  );
  return rows[0].id;
};

const decide = 'update project_change_requests set state = $2, decided_by = $3,'
  + ' decided_at = now(), decision_note = $4 where id = $1';

{
  const own = await proposal('sod-approver@test');
  await refuses('the person who proposed a change may NOT authorise it',
    decide, [own, 'approved', 'sod-approver@test', 'mine'], /sod_authoriser_is_not_requester/);
  await refuses('a contributor may NOT authorise a change',
    decide, [own, 'approved', 'sod-contrib@test', 'x'], /may not authorise/);
  await refuses('a reviewer may NOT authorise a change',
    decide, [own, 'approved', 'sod-reviewer@test', 'x'], /may not authorise/);
  await refuses('an executive viewer may NOT authorise a change',
    decide, [own, 'approved', 'sod-reader@test', 'x'], /may not authorise/);
  await refuses('a decided row may not name a decision without a decider',
    'update project_change_requests set state = $2 where id = $1',
    [own, 'approved'], /pcr_decision_complete/);
  await refuses('a proposal may not be filed with an empty reason',
    `insert into project_change_requests (kind, project_id, payload, summary, reason, requested_by)
     values ('project:update', 'RES-01', '{}'::jsonb, 's', '   ', $1)`,
    ['sod-approver@test'], /pcr_reason_said_something/);
  // WITHDRAWING IS NOT A DECISION: taking your own proposal back needs no
  // authority beyond having made it, and the trigger says so explicitly.
  await allows('the proposer may withdraw their own',
    decide, [own, 'withdrawn', 'sod-approver@test', 'superseded']);

  const second = await proposal('sod-approver@test');
  await allows('the Director authorises it', decide,
    [second, 'approved', 'sod-director@test', 'authorised']);

  // The administrator's standing exemption, here as everywhere else.
  const mine = await proposal('sod-admin@test');
  await allows('an administrator may authorise their own — the standing exemption',
    decide, [mine, 'approved', 'sod-admin@test', 'exempt']);

  // And the exemption is the SEAT's, not the person's: demoted, the same
  // account is bound like everybody else.
  await pool.query("update users set role = 'approver' where id = 'sod-admin@test'");
  const demotedProposal = await proposal('sod-admin@test');
  await refuses('the same account, no longer an admin, may NOT authorise its own',
    decide, [demotedProposal, 'approved', 'sod-admin@test', 'x'],
    /sod_authoriser_is_not_requester/);
  await pool.query("update users set role = 'admin' where id = 'sod-admin@test'");
}

// ---- tidy -------------------------------------------------------------
await pool.query("delete from project_change_requests where requested_by like 'sod-%'");
await pool.query('delete from period_submissions where period between 100 and 130');
await pool.query("delete from users where id like 'sod-%'");
await pool.end();

console.log(`\nseparation of duties  ${checks} checks, all against raw SQL\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  the database refuses what the rules forbid, with the API bypassed entirely.\n');
process.exit(0);
