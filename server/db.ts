// Postgres access. `pg` speaks the wire protocol and nothing else, so the same
// code connects to a managed instance, a cluster on our own tenant, or the
// local one the tests run against. DATABASE_URL is the only thing that differs.
import { Pool } from 'pg';
import type { Project } from '../src/domain/types.js';
import type { Mutation } from '../src/data/mutations.js';
import type { CorporateData } from '../src/data/contracts.js';
// A VALUE import, so relative and with the extension: the serverless bundler
// does not resolve the `@/` alias, and check-bundle.mjs fails the build on one
// that needs it at runtime.
import { isPortfolioTone } from '../src/domain/portfolios.js';
import type { Capabilities, Role } from './auth.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Behind a transaction pooler the pooling is already on the other side, so
  // an instance needs very few of its own: ten per instance is how a free tier
  // runs out of them. It was ONE, on the reasoning that a serverless
  // invocation is a single request — which is no longer true. An instance can
  // serve several requests at once, and with a connection deadline (below) a
  // request that finds the single connection busy now fails rather than
  // waiting. Three is enough for that overlap and still far under any pooler's
  // ceiling.
  //
  // It is NOT what fixes the write-path deadlock — threading the lock's client
  // through the whole write is (see `withWriteLock`). Raising this number to
  // paper over a deadlock would only move the hang to the third concurrent
  // write.
  max: Number(process.env.PGPOOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
  // WITHOUT THIS, POOL EXHAUSTION IS A HANG RATHER THAN AN ERROR.
  //
  // `pool.connect()` waits forever by default. On the deployment the pool holds
  // ONE client, so any code that asked the pool for a second one while the
  // first was checked out waited until the platform killed the invocation at
  // its 30s limit — the caller saw FUNCTION_INVOCATION_TIMEOUT and no log line,
  // because nothing had failed. That is exactly what happened to every write
  // that took the write lock (see `withWriteLock`), and it never reproduced
  // locally, where the pool holds ten.
  //
  // The threading fix below is what stops it happening. This is the net under
  // it: a pool that cannot hand out a connection now says so, in words, in a
  // fifth of the time the platform allows.
  connectionTimeoutMillis: Number(process.env.PGPOOL_TIMEOUT_MS ?? 6_000),
});

// An idle client can error on its own — a pooler dropping the connection, a
// network reset. `pg` emits that on the Pool, and an 'error' event with no
// listener is an uncaught exception that ends the self-hosted process. Logged
// and survived; the next query gets a fresh client.
pool.on('error', (err) => {
  console.error('[pg] idle client error', err.message);
});

/**
 * Run `fn` inside a transaction that holds the single write lock.
 *
 * Every write to the position — a mutation, an approval — first checks that
 * the result would still reconcile, then writes. Two of those in flight at
 * once are each checked against a log that lacks the other, and both pass,
 * and the committed log then fails the very check both passed. So writes are
 * serialised: one advisory lock, taken for the transaction, released at
 * commit. A read taken after the lock is acquired sees every write that came
 * before it, because those writes released the lock only by committing.
 *
 * The lock key is arbitrary and constant. There is one position.
 *
 * EVERYTHING `fn` DOES MUST GO THROUGH THE CLIENT IT IS HANDED.
 *
 * Not a style preference — two reasons, and the second one took a deployment
 * down. A read issued on the pool from inside `fn` is OUTSIDE this
 * transaction, so it does not see the writes this transaction has made and is
 * not protected by the lock it holds; the reconciliation check would then be
 * run against a position that is not the one about to be written. And on the
 * deployment the pool holds a single client — the one checked out here — so
 * asking it for another blocks until that client is released, which cannot
 * happen until `fn` returns. The invocation deadlocks against itself and dies
 * at the platform's limit with no error and no outgoing request to show for it.
 */
export async function withWriteLock<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(7413)');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * bigint columns arrive as strings because a Postgres bigint can exceed
 * Number.MAX_SAFE_INTEGER. SAR budgets do not come close, so Number() is exact
 * here — but the conversion is explicit rather than implicit so the assumption
 * is visible.
 */
const money = (v: string | number | null): number => Number(v ?? 0);

interface ProjectRow {
  id: string; name: string; portfolio: string; route: string; pmc: string;
  budget: string; control: string; afc: string; committed: string; actual: string;
  ev: string; pv: string; spi: number; cpi: number; progress: number; status: string;
  start_label: string; finish_label: string; duration_label: string;
  paid: string; ipc_submitted: string; risks: number; high_risks: number;
  open_ncr: number; open_issues: number; emv: string;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  portfolio: r.portfolio,
  route: r.route,
  pmc: r.pmc,
  budget: money(r.budget),
  control: money(r.control),
  afc: money(r.afc),
  committed: money(r.committed),
  actual: money(r.actual),
  ev: money(r.ev),
  pv: money(r.pv),
  spi: r.spi,
  cpi: r.cpi,
  progress: r.progress,
  status: r.status as Project['status'],
  start: r.start_label,
  finish: r.finish_label,
  duration: r.duration_label,
  paid: money(r.paid),
  ipcSubmitted: money(r.ipc_submitted),
  risks: r.risks,
  highRisks: r.high_risks,
  openNcr: r.open_ncr,
  openIssues: r.open_issues,
  emv: money(r.emv),
});

/** Anything with a `query` — the pool, or a client holding a transaction. */
export type Queryable = Pick<import('pg').Pool, 'query'>;

/**
 * The seeded projects, in their shipped order.
 *
 * Takes a `Queryable` for the same reason `appendMutation` does: called from
 * inside `withWriteLock` it must run on that transaction's client, both to see
 * what the transaction has done and because the pool has no second connection
 * to give it.
 */
export async function seedProjects(q: Queryable = pool): Promise<Project[]> {
  const { rows } = await q.query<ProjectRow>('select * from projects order by seq');
  return rows.map(toProject);
}

/** The change log, oldest first — the order the replay depends on. */
export async function mutationLog(q: Queryable = pool): Promise<Mutation[]> {
  const { rows } = await q.query<{ payload: Mutation }>(
    'select payload from mutations order by seq',
  );
  return rows.map((r) => r.payload);
}

/**
 * Append to the log. Takes a client so it can run inside withWriteLock.
 *
 * The row's `at` is the SERVER's clock, not the request's. The mutation keeps
 * its own `at` inside the payload — that is when the person says the figures
 * are for — but the moment the log recorded it is not something a client
 * gets to assert, or an audit trail could be back-dated by anyone who can
 * write to it.
 */
export async function appendMutation(
  m: Mutation, actor: string, client: Queryable = pool,
): Promise<void> {
  await client.query(
    'insert into mutations (kind, at, actor, payload) values ($1, now(), $2, $3)',
    [m.kind, actor, JSON.stringify(m)],
  );
}

export async function clearMutations(): Promise<void> {
  // THE QUEUE GOES WITH THE LOG. A reset means "return to the shipped data
  // set", and a proposal left standing afterwards refers to a development the
  // reset has just recreated — so the next attempt at the same act comes back
  // "already has a change waiting for authorisation", naming a proposal
  // nobody in the room made. Truncated together, in one statement, so a reset
  // can never leave one without the other.
  await pool.query('truncate table mutations, project_change_requests restart identity');
}

export async function corporate(q: Queryable = pool): Promise<CorporateData> {
  const [{ rows }, portfolioRows, routeRows] = await Promise.all([
    q.query<{ key: string; value: unknown }>('select key, value from corporate'),
    listPortfolioRows(q),
    listRouteRows(q),
  ]);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // A partial seed used to surface later, as a 500 from deep inside the
  // integrity engine reading `months` of undefined. Name the gap here.
  const required = ['months', 'scurve', 'activities', 'reconciliation', 'reports', 'notifications', 'roles'];
  const missing = required.filter((k) => !(k in byKey));
  if (missing.length) throw new Error(`corporate data is incomplete: missing ${missing.join(', ')}`);
  // THE PORTFOLIOS COME FROM THEIR OWN TABLE, not from the `corporate`
  // key/value row the fixtures seeded. That row is a snapshot of what the
  // product shipped with; this is what the deployment holds now, and the two
  // stop agreeing the moment an administrator adds a fifth portfolio. The
  // seeded key is left in place and ignored — dropping it would break a
  // replay of the seed against an older build for no gain.
  return {
    ...(byKey as unknown as CorporateData),
    portfolios: portfolioRows.map((r) => ({
      name: r.name,
      tone: isPortfolioTone(r.tone) ? r.tone : 'grey',
      sort: r.sort,
      builtIn: r.built_in,
      developments: 0,
    })),
    routes: routeRows.map((r) => ({
      name: r.name,
      describes: r.describes,
      sort: r.sort,
      builtIn: r.built_in,
      developments: 0,
    })),
  };
}

// ==========================================================================
// THE PORTFOLIOS AND THE DELIVERY ROUTES
//
// Rows since migration 017, for the same reason seats are: the shape of the
// owner's organisation is theirs to state. Read on every `corporate()`, which
// every snapshot already costs — so making them editable costs no request.
//
// `developments` is counted from the REPLAYED position, not from a foreign
// key, and the route that removes one is where that count is taken. A
// development registered through the application lives only in the mutation
// log, so no constraint on `projects` could see it — the same reason
// migration 013 removed two.
// ==========================================================================

export interface PortfolioRow {
  name: string;
  tone: string;
  sort: number;
  built_in: boolean;
}

export interface RouteRow {
  name: string;
  describes: string;
  sort: number;
  built_in: boolean;
}

export async function listPortfolioRows(q: Queryable = pool): Promise<PortfolioRow[]> {
  const { rows } = await q.query<PortfolioRow>(
    'select name, tone, sort, built_in from portfolios order by sort, name',
  );
  return rows;
}

export async function listRouteRows(q: Queryable = pool): Promise<RouteRow[]> {
  const { rows } = await q.query<RouteRow>(
    'select name, describes, sort, built_in from delivery_routes order by sort, name',
  );
  return rows;
}

export async function portfolioByName(name: string): Promise<PortfolioRow | null> {
  const { rows } = await pool.query<PortfolioRow>(
    'select name, tone, sort, built_in from portfolios where name = $1', [name],
  );
  return rows[0] ?? null;
}

export async function routeByName(name: string): Promise<RouteRow | null> {
  const { rows } = await pool.query<RouteRow>(
    'select name, describes, sort, built_in from delivery_routes where name = $1', [name],
  );
  return rows[0] ?? null;
}

/** The next reading position, so a new row lands at the end rather than first. */
const nextSort = async (table: 'portfolios' | 'delivery_routes'): Promise<number> => {
  const { rows } = await pool.query<{ n: number | null }>(
    `select max(sort) as n from ${table}`,
  );
  return (rows[0]?.n ?? 0) + 1;
};

export async function createPortfolio(name: string, tone: string): Promise<PortfolioRow> {
  const { rows } = await pool.query<PortfolioRow>(
    `insert into portfolios (name, tone, sort, built_in) values ($1, $2, $3, false)
     returning name, tone, sort, built_in`,
    [name, tone, await nextSort('portfolios')],
  );
  return rows[0];
}

export async function createRoute(name: string, describes: string): Promise<RouteRow> {
  const { rows } = await pool.query<RouteRow>(
    `insert into delivery_routes (name, describes, sort, built_in) values ($1, $2, $3, false)
     returning name, describes, sort, built_in`,
    [name, describes, await nextSort('delivery_routes')],
  );
  return rows[0];
}

/**
 * Change what a portfolio looks like. NOT its name.
 *
 * A rename is not an edit: every development carries the portfolio's name as
 * its own value, in `projects` and inside payloads in the change log, and a
 * rename here would orphan all of them silently. The route offers add and
 * remove; a portfolio called the wrong thing is added under the right name
 * and the developments moved, which is an act somebody can see.
 */
export async function updatePortfolio(
  name: string, patch: { tone?: string; sort?: number },
): Promise<PortfolioRow | null> {
  const { rows } = await pool.query<PortfolioRow>(
    `update portfolios set tone = coalesce($2, tone), sort = coalesce($3, sort)
      where name = $1 returning name, tone, sort, built_in`,
    [name, patch.tone ?? null, patch.sort ?? null],
  );
  return rows[0] ?? null;
}

export async function updateRoute(
  name: string, patch: { describes?: string; sort?: number },
): Promise<RouteRow | null> {
  const { rows } = await pool.query<RouteRow>(
    `update delivery_routes set describes = coalesce($2, describes), sort = coalesce($3, sort)
      where name = $1 returning name, describes, sort, built_in`,
    [name, patch.describes ?? null, patch.sort ?? null],
  );
  return rows[0] ?? null;
}

export async function deletePortfolio(name: string): Promise<void> {
  await pool.query('delete from portfolios where name = $1 and not built_in', [name]);
}

export async function deleteRoute(name: string): Promise<void> {
  await pool.query('delete from delivery_routes where name = $1 and not built_in', [name]);
}

// ------------------------------------------------------------------ people

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  /** A withdrawn account keeps its history and cannot sign in. */
  active: boolean;
  avatar: string | null;
}

/** Looked up case-insensitively: nobody should fail to sign in over capitals. */
export async function userByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `select id, email, name, role, password_hash, active, avatar
       from users where lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export async function touchUser(id: string): Promise<void> {
  await pool.query('update users set last_seen_at = now() where id = $1', [id]);
}

/**
 * The role the user holds NOW, or null if the account no longer exists.
 *
 * A token carries the role it was minted with, for up to eight hours. A
 * person demoted or removed this morning would otherwise keep this
 * morning's capability until it expired. Every authenticated request asks
 * the table instead; one primary-key read, and the token becomes only proof
 * of who, never proof of what they may do.
 */
export async function currentRole(id: string): Promise<string | null> {
  // `active` is read here too, so withdrawing an account takes effect on the
  // person's very next request rather than when their token expires.
  const { rows } = await pool.query<{ role: string }>(
    'select role from users where id = $1 and active', [id],
  );
  return rows[0]?.role ?? null;
}

// =========================================================================
// SEATS — what a role may do, read from the table the administrator edits
//
// One query per authenticated request, joined onto the role lookup that was
// already happening, so making capabilities editable costs nothing at
// runtime. The token proves who; this says what they may do NOW — a seat
// whose flags changed this morning takes effect on the next click, exactly
// as a withdrawn account does.
// =========================================================================

export interface SeatRow {
  role: string;
  title: string;
  describes: string;
  may_input: boolean;
  may_review: boolean;
  may_approve: boolean;
  may_authorise: boolean;
  may_administer: boolean;
  sod_exempt: boolean;
  built_in: boolean;
}

/**
 * QUALIFIED, and every query below aliases `role_capabilities` as `c`.
 *
 * Unqualified this read `role, title, ...`, which is unambiguous in four of
 * the five queries and AMBIGUOUS in the one that matters: `currentSeat` joins
 * users onto role_capabilities and both carry a `role` column. Postgres
 * answers 42702 there, the route answers 500, and because that lookup runs on
 * every authenticated request, the whole platform is down while the four
 * queries a gate would reach directly all pass. Prefixing costs nothing and
 * makes the mistake unavailable.
 */
const SEAT_COLUMNS = `c.role, c.title, c.describes, c.may_input, c.may_review, c.may_approve,
  c.may_authorise, c.may_administer, c.sod_exempt, c.built_in`;

const capsOf = (r: SeatRow): Capabilities => ({
  input: r.may_input,
  review: r.may_review,
  approve: r.may_approve,
  authorise: r.may_authorise,
  administer: r.may_administer,
});

/** The role an account holds now, and what that seat may do. Null if withdrawn. */
export async function currentSeat(
  id: string,
): Promise<{ role: string; caps: Capabilities } | null> {
  const { rows } = await pool.query<SeatRow>(
    `select ${SEAT_COLUMNS}
       from users u join role_capabilities c on c.role = u.role
      where u.id = $1 and u.active`,
    [id],
  );
  const seat = rows[0];
  return seat ? { role: seat.role, caps: capsOf(seat) } : null;
}

/** Every seat, with how many accounts hold it. Ordered so admin reads last. */
export async function listSeats(): Promise<(SeatRow & { holders: number })[]> {
  const { rows } = await pool.query<SeatRow & { holders: string }>(
    `select ${SEAT_COLUMNS},
            (select count(*) from users u where u.role = c.role and u.active) as holders
       from role_capabilities c
      order by c.built_in desc, c.may_administer, c.role`,
  );
  return rows.map((r) => ({ ...r, holders: Number(r.holders) }));
}

export async function seatByName(role: string): Promise<SeatRow | null> {
  const { rows } = await pool.query<SeatRow>(
    `select ${SEAT_COLUMNS} from role_capabilities c where c.role = $1`, [role],
  );
  return rows[0] ?? null;
}

export async function createSeat(seat: {
  role: string; title: string; describes: string; caps: Capabilities;
}): Promise<SeatRow> {
  const { rows } = await pool.query<SeatRow>(
    `insert into role_capabilities as c
       (role, title, describes, may_input, may_review, may_approve,
        may_authorise, may_administer, sod_exempt, built_in)
     values ($1,$2,$3,$4,$5,$6,$7,$8,false,false)
     returning ${SEAT_COLUMNS}`,
    [seat.role, seat.title, seat.describes, seat.caps.input, seat.caps.review,
      seat.caps.approve, seat.caps.authorise, seat.caps.administer],
  );
  return rows[0];
}

/**
 * Change what a seat may do.
 *
 * `sod_exempt` is deliberately NOT settable from here. The exemption is the
 * owner's standing instruction for the administrator and nobody else, and a
 * screen that could hand it to a new seat would be a screen that could
 * dissolve separation of duties in two clicks. Changing it is a migration,
 * which is the friction it should have.
 */
export async function updateSeat(
  role: string, patch: { title?: string; describes?: string; caps?: Capabilities },
): Promise<SeatRow | null> {
  const { rows } = await pool.query<SeatRow>(
    `update role_capabilities c set
       title = coalesce($2, title),
       describes = coalesce($3, describes),
       may_input = coalesce($4, may_input),
       may_review = coalesce($5, may_review),
       may_approve = coalesce($6, may_approve),
       may_authorise = coalesce($7, may_authorise),
       may_administer = coalesce($8, may_administer)
     where c.role = $1
     returning ${SEAT_COLUMNS}`,
    [role, patch.title ?? null, patch.describes ?? null,
      patch.caps?.input ?? null, patch.caps?.review ?? null, patch.caps?.approve ?? null,
      patch.caps?.authorise ?? null, patch.caps?.administer ?? null],
  );
  return rows[0] ?? null;
}

export async function deleteSeat(role: string): Promise<void> {
  await pool.query('delete from role_capabilities where role = $1 and not built_in', [role]);
}

/** How many active accounts hold a seat. A seat in use is never deleted. */
export async function seatHolders(role: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    'select count(*) as n from users where role = $1', [role],
  );
  return Number(rows[0]?.n ?? 0);
}

/** How many active accounts can authorise a change. Used to refuse the last one. */
export async function authoriserCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*) as n
       from users u join role_capabilities c on c.role = u.role
      where u.active and (c.may_authorise or c.may_administer)`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function upsertUser(
  u: { id: string; email: string; name: string; role: string; passwordHash: string },
): Promise<void> {
  await pool.query(
    `insert into users (id, email, name, role, password_hash)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       email = excluded.email, name = excluded.name, role = excluded.role,
       password_hash = excluded.password_hash`,
    [u.id, u.email, u.name, u.role, u.passwordHash],
  );
}

// ------------------------------------------------------- period submissions
//
// A submitted period is not yet part of the reported position. It becomes so
// only on approval, when the mutation is appended to the log. Until then it is
// a submission: visible, auditable, and not yet fact.

import type { SubmitPeriodMutation } from '../src/data/mutations.js';
// The ONE definition, shared with the app. The server carried its own copy of
// this type, and the two had already drifted: the app gained fields the
// server's copy did not know. One contract, imported by both sides, is what
// keeps a field added on one side from silently being dropped on the other.
import type { Submission } from '../src/data/contracts.js';

export type { Submission };
export type SubmissionState = Submission['state'];

interface SubmissionRow {
  id: string; project_id: string; period: number; data_date: string;
  state: SubmissionState; submitted_by: string; submitted_at: Date;
  reviewed_by: string | null; reviewed_at: Date | null;
  approved_by: string | null; approved_at: Date | null;
  returned_by: string | null; returned_at: Date | null;
  returned_note: string | null; payload: SubmitPeriodMutation;
}

const toSubmission = (r: SubmissionRow): Submission => ({
  id: Number(r.id),
  projectId: r.project_id,
  period: r.period,
  dataDate: r.data_date,
  state: r.state,
  submittedBy: r.submitted_by,
  submittedAt: r.submitted_at.toISOString(),
  reviewedBy: r.reviewed_by,
  reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
  approvedBy: r.approved_by,
  approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
  returnedBy: r.returned_by,
  returnedAt: r.returned_at ? r.returned_at.toISOString() : null,
  returnedNote: r.returned_note,
  payload: r.payload,
});

const COLUMNS = 'id, project_id, period, data_date, state, submitted_by, submitted_at,'
  + ' reviewed_by, reviewed_at, approved_by, approved_at, returned_by, returned_at,'
  + ' returned_note, payload';
const SELECT = `select ${COLUMNS} from period_submissions`;

export async function listSubmissions(): Promise<Submission[]> {
  const { rows } = await pool.query<SubmissionRow>(`${SELECT} order by submitted_at desc`);
  return rows.map(toSubmission);
}

export async function getSubmission(id: number): Promise<Submission | null> {
  const { rows } = await pool.query<SubmissionRow>(`${SELECT} where id = $1`, [id]);
  return rows[0] ? toSubmission(rows[0]) : null;
}

/**
 * Record a submission.
 *
 * A resubmission after a return replaces the previous one rather than
 * accumulating rival versions of the same period, and it clears every earlier
 * stage: a period that has been changed has not been reviewed, whatever was
 * true of the version before it.
 */
export async function insertSubmission(
  m: SubmitPeriodMutation, submittedBy: string,
): Promise<Submission> {
  // The upsert replaces ONLY a submission that is still the submitter's to
  // change: one awaiting review, or one sent back. A reviewed period has a
  // validator's name on it, and an approved one is already in the reported
  // position with the approver's name on it — replacing either would silently
  // void a signature. Both are refused; the WHERE makes the upsert return no
  // row, and the caller turns that into 409.
  const { rows } = await pool.query<SubmissionRow>(
    `insert into period_submissions
       (project_id, period, data_date, submitted_by, payload)
     values ($1, $2, $3, $4, $5)
     on conflict (project_id, period) do update set
       data_date = excluded.data_date,
       submitted_by = excluded.submitted_by,
       submitted_at = now(),
       payload = excluded.payload,
       state = 'submitted',
       reviewed_by = null, reviewed_at = null,
       approved_by = null, approved_at = null,
       returned_by = null, returned_at = null, returned_note = null
     where period_submissions.state in ('submitted', 'returned')
     returning ${COLUMNS}`,
    [m.projectId, m.period, m.dataDate, submittedBy, JSON.stringify(m)],
  );
  if (!rows[0]) {
    throw new SubmissionLocked(
      `period ${m.period} for ${m.projectId} has already been validated or approved; `
      + 'it cannot be replaced. Ask for it to be returned first.',
    );
  }
  return toSubmission(rows[0]);
}

/** A resubmission refused because the earlier version is past the submitter. */
export class SubmissionLocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionLocked';
  }
}

export async function reviewSubmission(id: number, by: string): Promise<Submission | null> {
  const { rows } = await pool.query<SubmissionRow>(
    `update period_submissions
        set reviewed_by = $2, reviewed_at = now(), state = 'reviewed'
      where id = $1 and state = 'submitted'
     returning ${COLUMNS}`,
    [id, by],
  );
  return rows[0] ? toSubmission(rows[0]) : null;
}

/**
 * Approve, and record the period in the position — as ONE thing.
 *
 * These were two statements on two connections. A failure between them left
 * a row marked approved with nothing behind it in the log: approved, so it
 * could not be approved again; not returned, so it could not be sent back;
 * and absent from the reported position, so the two tables told different
 * stories about the same period, permanently. Approval is the accountable
 * act, and the accountable act has to be all-or-nothing.
 *
 * Runs inside the caller's transaction and lock; the caller has already
 * confirmed the position would still reconcile.
 */
export async function approveAndRecord(
  client: Queryable, id: number, by: string,
): Promise<Submission | null> {
  const { rows } = await client.query<SubmissionRow>(
    `update period_submissions
        set approved_by = $2, approved_at = now(), state = 'approved'
      where id = $1 and state = 'reviewed'
     returning ${COLUMNS}`,
    [id, by],
  );
  if (!rows[0]) return null;
  const done = toSubmission(rows[0]);
  // Nullable only in what a reader is served; the stored column is not null,
  // so this is a corrupt row rather than a period awaiting approval.
  if (!done.payload) throw new Error(`submission ${id} has no figures recorded`);
  await appendMutation(done.payload, by, client);
  return done;
}

export async function returnSubmission(
  id: number, note: string, by: string,
): Promise<Submission | null> {
  const { rows } = await pool.query<SubmissionRow>(
    `update period_submissions
        set state = 'returned', returned_note = $2,
            returned_by = $3, returned_at = now(),
            reviewed_by = null, reviewed_at = null
      where id = $1 and state in ('submitted', 'reviewed')
     returning ${COLUMNS}`,
    [id, note, by],
  );
  return rows[0] ? toSubmission(rows[0]) : null;
}

/**
 * Which developments a person may input for. Empty for a non-contributor.
 *
 * Takes a Queryable because `mayMutate` re-runs INSIDE the write lock, and a
 * read on the pool from inside it waits for the one client the lock itself
 * holds — the self-deadlock the note on `withWriteLock` describes, found
 * again the day the re-check was added.
 */
export async function assignmentsFor(userId: string, q: Queryable = pool): Promise<string[]> {
  const { rows } = await q.query<{ project_id: string }>(
    'select project_id from project_assignments where user_id = $1 order by project_id',
    [userId],
  );
  return rows.map((r) => r.project_id);
}

// =========================================================================
// ACCOUNTS
//
// An administrator issues and withdraws accounts from inside the system.
// Two rules shape everything below, and both live here rather than in the
// screens:
//
//   An account that has acted is never deleted. It is referenced by
//   period_submissions and by the change log, and erasing it would leave the
//   audit trail naming somebody who no longer exists. It is deactivated,
//   which refuses the sign-in and keeps every reference.
//
//   The last active administrator cannot be removed or demoted. A system
//   nobody can administer is not a safer system.
// =========================================================================

export interface AccountRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  avatar: string | null;
  created_at: string;
  last_seen_at: string | null;
  /** Developments this person may input for. */
  projects: string[];
  /** Whether they have filed, validated, approved or recorded anything. */
  has_acted: boolean;
}

const ACCOUNT_SELECT = `
  select u.id, u.email, u.name, u.role, u.active, u.avatar, u.created_at, u.last_seen_at,
         coalesce(a.projects, '{}') as projects,
         (exists (select 1 from period_submissions s
                   where s.submitted_by = u.id or s.reviewed_by = u.id
                      or s.approved_by = u.id or s.returned_by = u.id)
          or exists (select 1 from mutations m where m.actor = u.id)) as has_acted
    from users u
    left join lateral (
      select array_agg(project_id order by project_id) as projects
        from project_assignments where user_id = u.id
    ) a on true`;

export async function listAccounts(): Promise<AccountRow[]> {
  const { rows } = await pool.query<AccountRow>(`${ACCOUNT_SELECT} order by u.role, u.name`);
  return rows;
}

export async function accountById(id: string): Promise<AccountRow | null> {
  const { rows } = await pool.query<AccountRow>(`${ACCOUNT_SELECT} where u.id = $1`, [id]);
  return rows[0] ?? null;
}

/** How many administrators could still sign in. Never allowed to reach zero. */
export async function activeAdminCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "select count(*) as n from users where role = 'admin' and active",
  );
  return Number(rows[0]?.n ?? 0);
}

export async function createAccount(
  u: { email: string; name: string; role: Role; passwordHash: string },
): Promise<AccountRow | null> {
  // The email is the identity: it is the id, the login and what the audit
  // trail records. One row per person, and a second attempt at the same
  // address is a conflict rather than a silent overwrite of their role.
  await pool.query(
    'insert into users (id, email, name, role, password_hash) values ($1, $1, $2, $3, $4)',
    [u.email, u.name, u.role, u.passwordHash],
  );
  return accountById(u.email);
}

export async function setAccountRole(id: string, role: Role): Promise<AccountRow | null> {
  await pool.query('update users set role = $2 where id = $1', [id, role]);
  return accountById(id);
}

export async function setAccountActive(id: string, active: boolean): Promise<AccountRow | null> {
  await pool.query('update users set active = $2 where id = $1', [id, active]);
  return accountById(id);
}

export async function setAccountPassword(id: string, passwordHash: string): Promise<void> {
  await pool.query('update users set password_hash = $2 where id = $1', [id, passwordHash]);
}

/** A person's own name and picture. Never their role: that is not theirs to set. */
export async function updateProfile(
  id: string, patch: { name?: string; avatar?: string | null },
): Promise<AccountRow | null> {
  await pool.query(
    `update users set name = coalesce($2, name),
                      avatar = case when $3::boolean then $4 else avatar end
      where id = $1`,
    [id, patch.name ?? null, patch.avatar !== undefined, patch.avatar ?? null],
  );
  return accountById(id);
}

/**
 * Erase an account outright. Only ever called for one that has never acted;
 * the route checks, and the foreign keys would refuse anyway.
 */
export async function deleteAccount(id: string): Promise<void> {
  await pool.query('delete from project_assignments where user_id = $1', [id]);
  await pool.query('delete from users where id = $1', [id]);
}

/** Replace the set of developments a contributor may input for. */
export async function setAssignments(id: string, projectIds: readonly string[]): Promise<string[]> {
  await withWriteLock(async (client) => {
    await client.query('delete from project_assignments where user_id = $1', [id]);
    for (const projectId of projectIds) {
      await client.query(
        'insert into project_assignments (user_id, project_id) values ($1, $2) on conflict do nothing',
        [id, projectId],
      );
    }
  });
  return assignmentsFor(id);
}

// =====================================================================
// MESSAGES
//
// A message is not a mutation: it moves no figure, so it is not in the
// change log, not replayed, and not subject to the reconciliation controls.
// It is an append-only record of who said what to whom — never edited,
// never deleted, for the same reason an account that has acted is withdrawn
// rather than erased.
// =====================================================================

export interface MessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  project_id: string | null;
  sent_at: string;
  read_at: string | null;
}

/** One correspondent, as the inbox lists them. */
export interface CorrespondentRow {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  avatar: string | null;
  /** The last thing either of us said, whoever said it. */
  last_body: string | null;
  last_at: string | null;
  last_from_me: boolean | null;
  /** How many they have sent me that I have not opened. */
  unread: number;
}

/**
 * Everyone this person could message, each with the state of that
 * conversation.
 *
 * ONE query rather than a directory query and then a thread query per person.
 * On a serverless host every round trip is its own invocation with its own
 * cold start and its own connection, and the inbox is the screen a person
 * leaves open — the same reason /api/snapshot exists.
 *
 * Withdrawn accounts appear only when there is already a conversation with
 * them: their history is part of the record, but they cannot be written to
 * and a directory of people who can no longer sign in is a directory of dead
 * ends.
 */
export async function correspondentsFor(me: string): Promise<CorrespondentRow[]> {
  const { rows } = await pool.query<CorrespondentRow>(
    `with them as (
       select u.id, u.name, u.role, u.active, u.avatar
         from users u
        where u.id <> $1
     ),
     last as (
       select distinct on (other) other, body, sent_at, from_me
         from (
           select recipient_id as other, body, sent_at, true  as from_me
             from messages where sender_id = $1
           union all
           select sender_id    as other, body, sent_at, false as from_me
             from messages where recipient_id = $1
         ) m
        order by other, sent_at desc
     ),
     unread as (
       select sender_id as other, count(*)::int as n
         from messages
        where recipient_id = $1 and read_at is null
        group by sender_id
     )
     select them.id, them.name, them.role, them.active, them.avatar,
            last.body      as last_body,
            last.sent_at   as last_at,
            last.from_me   as last_from_me,
            coalesce(unread.n, 0) as unread
       from them
       left join last   on last.other   = them.id
       left join unread on unread.other = them.id
      where them.active or last.sent_at is not null
      order by last.sent_at desc nulls last, them.name`,
    [me],
  );
  return rows;
}

/** Every message between two people, oldest first. */
export async function conversation(me: string, other: string, limit = 300): Promise<MessageRow[]> {
  const { rows } = await pool.query<MessageRow>(
    `select * from (
       select id::text, sender_id, recipient_id, body, project_id, sent_at, read_at
         from messages
        where (sender_id = $1 and recipient_id = $2)
           or (sender_id = $2 and recipient_id = $1)
        order by sent_at desc, id desc
        limit $3
     ) t order by sent_at asc, id asc`,
    [me, other, limit],
  );
  return rows;
}

export async function sendMessage(
  from: string, to: string, body: string, projectId: string | null,
): Promise<MessageRow> {
  const { rows } = await pool.query<MessageRow>(
    `insert into messages (sender_id, recipient_id, body, project_id)
     values ($1, $2, $3, $4)
     returning id::text, sender_id, recipient_id, body, project_id, sent_at, read_at`,
    [from, to, body, projectId],
  );
  return rows[0];
}

/**
 * Mark everything one person has sent me as read.
 *
 * `read_at is null` in the WHERE clause is not an optimisation: without it,
 * opening a conversation twice would rewrite the timestamp on messages that
 * were read days ago.
 */
export async function markConversationRead(me: string, other: string): Promise<number> {
  const { rowCount } = await pool.query(
    'update messages set read_at = now() where recipient_id = $1 and sender_id = $2 and read_at is null',
    [me, other],
  );
  return rowCount ?? 0;
}

/** Whether an account exists, is active, and so may be written to. */
export async function isWritableAccount(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ active: boolean }>(
    'select active from users where id = $1', [id],
  );
  return rows[0]?.active === true;
}

// =========================================================================
// PROPOSED CHANGES TO A DEVELOPMENT
//
// The maker-checker queue (migration 016). A row here has moved NOTHING —
// the mutation is appended to the change log at the moment it is authorised,
// through the same route, the same write lock and the same twenty
// reconciliation controls a direct act goes through. This table is where a
// proposal waits, and nowhere else in the system reads it as fact.
//
// Modelled on `period_submissions` deliberately: same shape, same trigger
// pattern, same "the queue is not the record" rule. Two queues that behaved
// differently would be two things for a person to learn.
// =========================================================================

export interface ChangeRequestRow {
  id: number;
  kind: string;
  project_id: string | null;
  payload: Mutation;
  summary: string;
  reason: string;
  state: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

const CHANGE_COLUMNS = `id, kind, project_id, payload, summary, reason, state,
  requested_by, requested_at, decided_by, decided_at, decision_note`;

export async function insertChangeRequest(r: {
  kind: string; projectId: string | null; payload: Mutation;
  summary: string; reason: string; requestedBy: string;
}): Promise<ChangeRequestRow> {
  const { rows } = await pool.query<ChangeRequestRow>(
    `insert into project_change_requests
       (kind, project_id, payload, summary, reason, requested_by)
     values ($1,$2,$3,$4,$5,$6)
     returning ${CHANGE_COLUMNS}`,
    [r.kind, r.projectId, JSON.stringify(r.payload), r.summary, r.reason, r.requestedBy],
  );
  return rows[0];
}

/**
 * The queue, newest first.
 *
 * Everything decided is kept: "who authorised the budget increase, and when"
 * is precisely the question this table exists to answer, and a queue that
 * cleared itself would answer it for a fortnight.
 */
export async function listChangeRequests(limit = 200): Promise<ChangeRequestRow[]> {
  const { rows } = await pool.query<ChangeRequestRow>(
    `select ${CHANGE_COLUMNS} from project_change_requests
      order by (state = 'pending') desc, requested_at desc
      limit $1`,
    [limit],
  );
  return rows;
}

export async function changeRequestById(
  id: number, q: Queryable = pool,
): Promise<ChangeRequestRow | null> {
  const { rows } = await q.query<ChangeRequestRow>(
    `select ${CHANGE_COLUMNS} from project_change_requests where id = $1`, [id],
  );
  return rows[0] ?? null;
}

/**
 * Record the decision, and only if the row is still pending.
 *
 * The `where state = 'pending'` is the whole concurrency story: two directors
 * deciding the same proposal in the same second produce one row update and
 * one no-row answer, and the caller turns the second into 409. Without it the
 * later decision would silently overwrite the earlier one and the mutation
 * would be applied twice.
 */
export async function decideChangeRequest(
  id: number,
  decision: 'approved' | 'rejected' | 'withdrawn',
  decidedBy: string,
  note: string,
  q: Queryable = pool,
): Promise<ChangeRequestRow | null> {
  const { rows } = await q.query<ChangeRequestRow>(
    `update project_change_requests
        set state = $2, decided_by = $3, decided_at = now(), decision_note = $4
      where id = $1 and state = 'pending'
      returning ${CHANGE_COLUMNS}`,
    [id, decision, decidedBy, note],
  );
  return rows[0] ?? null;
}

/** Whether a development already has a proposal waiting. */
export async function pendingChangeFor(projectId: string): Promise<ChangeRequestRow | null> {
  const { rows } = await pool.query<ChangeRequestRow>(
    `select ${CHANGE_COLUMNS} from project_change_requests
      where project_id = $1 and state = 'pending'
      order by requested_at limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}
