// ==========================================================================
// THE ROUTES
//
// Implements docs/api-contract.md over plain node:http. Small on purpose:
// there are eight routes, and a framework would add a dependency surface
// without removing any work.
//
// THE POINT OF THIS SERVER is the write path. Reconciliation cannot be
// enforced in the browser — a client that posts straight at a database can
// write a position the controls reject, and the engine would only report the
// disagreement afterwards, which is the failure this product exists to
// prevent. So every mutation is applied to a candidate state HERE, the ten
// controls are run against it HERE, and the write is refused if any of them
// fail. The browser runs the same controls for the same reason it always did:
// to show the user. It is no longer the thing standing between a bad figure
// and the database.
//
// The controls are imported from src/domain — one implementation, shared, so
// the server and the app cannot disagree about what reconciling means.
// ==========================================================================
import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { DB } from '../src/data/index.js';
import {
  awardProblem, lifecycleProblem, replayProjects, registersFor,
} from '../src/data/project-state.js';
import { isPortfolioTone, PORTFOLIO_TONES } from '../src/domain/portfolios.js';
import {
  AUTHORISED_KINDS, isUntouched, REPORTING_KINDS, summarise, type Mutation,
} from '../src/data/mutations.js';
import { integrityReport } from '../src/domain/integrity.js';
import { active } from '../src/domain/calc.js';
import {
  accountById, activeAdminCount, appendMutation, approveAndRecord, assignmentsFor, clearMutations,
  authoriserCount, changeRequestById, conversation, corporate, correspondentsFor, createAccount,
  createPortfolio, createRoute, createSeat, currentSeat, decideChangeRequest, deleteAccount,
  deletePortfolio, deleteRoute, deleteSeat, insertChangeRequest, listPortfolioRows, listRouteRows,
  portfolioByName, routeByName, updatePortfolio, updateRoute,
  listChangeRequests, listSeats, pendingChangeFor, seatByName, seatHolders, updateSeat,
  getSubmission, insertSubmission, isWritableAccount, listAccounts, listSubmissions,
  markConversationRead, mutationLog, returnSubmission, reviewSubmission, seedProjects,
  sendMessage, setAccountActive, setAccountPassword, setAccountRole, setAssignments,
  SubmissionLocked, touchUser, updateProfile, userByEmail, withWriteLock, type AccountRow,
  type Queryable,
} from './db.js';
import {
  can, DUMMY_HASH, hashPassword, Hs256Verifier, isRoleName, mayWrite, NO_CAPABILITIES, ROLES,
  verifyPassword, type Capabilities, type Principal, type Role,
} from './auth.js';
import { parsePeriod, TemplateError } from './pt-template.js';
import {
  buildProjectTemplate, readProject, verifyProjectStructure,
  PROJECT_TEMPLATE_FILENAME,
} from './project-template.js';
import { PT_TEMPLATE_BASE64, PT_TEMPLATE_FILENAME, PT_TEMPLATE_SHA256 } from './pt-template-file.js';
import {
  asMutation, checkAvatar, checkEmail, checkPassword, checkPersonName, validateMutation,
} from './validate.js';
import {
  aiConfigured, asJson, generate, ASSISTANT_IDENTITY, EXTRACTION_IDENTITY, GEMINI_MODEL,
  ModelError,
} from './gemini.js';
import { buildBrief } from './ai-brief.js';
import type { ProjectRegisters } from '../src/data/contracts.js';

/** What the reader accepts. Gemini reads PDFs and images directly. */
const EXTRACTABLE = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
]);

/** The shape the extraction route asks the model for, before it is checked. */
interface ExtractedDocument {
  documentType?: unknown; projectId?: unknown; reference?: unknown; period?: unknown;
  contractor?: unknown; certified?: unknown; retention?: unknown; netPayable?: unknown;
  notes?: unknown;
  confidence?: {
    documentType?: unknown; projectId?: unknown; reference?: unknown; period?: unknown;
    contractor?: unknown; certified?: unknown; retention?: unknown;
  };
}

/**
 * A per-person ceiling on model calls.
 *
 * The published limits for this model are of the order of 15 requests a minute
 * and a few hundred a day for the whole KEY — which means one person holding
 * Enter on the assistant can spend the quota for everybody, and the next
 * person to open a document gets a refusal they did not cause.
 *
 * In memory, deliberately. On a serverless host each instance keeps its own
 * counter, so the real ceiling is this times the number of warm instances —
 * still far below the key's limit, and it costs no table, no round trip and
 * nothing to operate. A shared counter belongs here only if a bill ever says
 * otherwise.
 */
const CALLS = new Map<string, number[]>();
const PER_MINUTE = 8;
const PER_HOUR = 60;

function spend(who: string): string | null {
  const now = Date.now();
  const seen = (CALLS.get(who) ?? []).filter((t) => now - t < 3_600_000);
  if (seen.filter((t) => now - t < 60_000).length >= PER_MINUTE) {
    return 'That is a lot of questions at once. Wait a moment and ask again.';
  }
  if (seen.length >= PER_HOUR) {
    return 'You have reached this hour\'s limit for the assistant. It resets shortly.';
  }
  seen.push(now);
  CALLS.set(who, seen);
  // Bounded: without this the map grows one entry per account that ever
  // asked anything, for the life of the instance.
  if (CALLS.size > 500) {
    for (const [k, v] of CALLS) if (v.every((t) => now - t > 3_600_000)) CALLS.delete(k);
  }
  return null;
}

export const signer = new Hs256Verifier(process.env.AUTH_SECRET ?? '');

/** How long a session lasts before the user signs in again. */
const TOKEN_TTL_SECONDS = (() => {
  const raw = process.env.TOKEN_TTL_SECONDS;
  if (raw === undefined) return 8 * 3600;
  const n = Number(raw);
  // A misspelt value used to become `exp: NaN`, serialised as null, and every
  // token failed verification with nothing in any log to say why.
  if (!Number.isFinite(n) || n <= 0) throw new Error(`TOKEN_TTL_SECONDS is not a positive number: ${raw}`);
  return n;
})();

/**
 * The self-contained build has a Reset in Administration that clears the
 * demo's local change log. On the platform the same route would truncate the
 * audit trail — every approved period, every certificate — and it is not
 * something a system of record should be able to do from a button. It is
 * off unless a deployment says otherwise, and then admin-only.
 */
const ALLOW_RESET = process.env.ALLOW_RESET === '1';

interface Json { status: number; body: unknown }
const ok = (body: unknown): Json => ({ status: 200, body });
const fail = (status: number, message: string): Json => ({ status, body: { error: message } });

/** Thrown by readBody; mapped to 413 rather than the generic 500. */
export class PayloadTooLarge extends Error {
  constructor() { super('payload too large'); this.name = 'PayloadTooLarge'; }
}

/**
 * Turn a database error into the response it deserves.
 *
 * The separation-of-duties constraints and the assignment trigger raise with
 * messages written to be read by the person refused, and those are returned
 * verbatim — they are the information the control exists to produce. Every
 * other database error is NOT for the client: a connection string, a column
 * type, an authentication failure against Postgres. Those are rethrown so
 * the handler's generic 500 applies and the detail stays in the server log.
 */
function refusal(err: unknown): Json {
  const message = err instanceof Error ? err.message : '';
  if (err instanceof SubmissionLocked) return fail(409, message);
  if (/sod_reviewer_is_not_submitter/.test(message)) return fail(409, 'the person who entered a period cannot validate it');
  if (/sod_approver_is_not_submitter/.test(message)) return fail(409, 'the person who entered a period cannot approve it');
  if (/sod_approver_is_not_reviewer/.test(message)) return fail(409, 'the person who validated a period cannot also approve it');
  if (/approval_follows_review/.test(message)) return fail(409, 'a period must be validated before it is approved');
  if (/is not assigned to|may not submit periods|unknown submitter/.test(message)) return fail(403, message);
  throw err;
}

/** Read the request body, with a ceiling so a large POST cannot exhaust memory. */
async function readBody(req: IncomingMessage, limit = 1_000_000): Promise<string> {
  // The two hosts hand the body over differently, and only one of them hands
  // over a stream.
  //
  // server/server.ts is plain node:http: nothing has touched the request, so
  // reading it below is the only way to get the body.
  //
  // Vercel's Node runtime PARSES THE BODY BEFORE THE HANDLER RUNS and exposes
  // it as req.body, having consumed the stream to do it. Iterating that stream
  // then yields nothing — and, when the 'end' it is waiting for has already
  // fired, yields nothing forever. The function hangs until the platform kills
  // it, which the browser sees as an HTML error page rather than an API
  // response: no status worth reading, no useful log line, and a POST that
  // fails while every GET succeeds.
  //
  // So take what the host has already read, when it has read it.
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined && parsed !== null) {
    const raw = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    if (raw.length > limit) throw new PayloadTooLarge();
    return raw;
  }
  // A consumed stream that left no body is empty, not pending. Never wait on it.
  if (req.readableEnded) return '';

  // Plain events rather than `for await`. Leaving an async iteration early
  // destroys the stream, and refusing while the client is still sending
  // closes the socket under it — it sees a connection reset, never the 413,
  // and a client with a bug never learns what the bug was. So on overflow
  // the rest of the body is let through and DISCARDED (the limit is about
  // memory, not bandwidth), bounded so a stream that never ends cannot hold
  // the request open, and only then is the request refused with a status
  // the client can read.
  return new Promise<string>((resolve, reject) => {
    let size = 0;
    let over = false;
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { req.destroy(); reject(new PayloadTooLarge()); }, 10_000);
    req.on('data', (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > limit) { over = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      clearTimeout(timer);
      if (over) reject(new PayloadTooLarge());
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/** A JSON object body, or null if the body is not one. */
async function readJson(req: IncomingMessage, limit?: number): Promise<Record<string, unknown> | null> {
  const raw = await readBody(req, limit);
  if (raw.trim() === '') return {};
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * The five capability flags out of a request body.
 *
 * Anything absent or not a boolean is FALSE. A seat is defined by what it may
 * do, and a typo in the payload must never be read as a grant.
 */
function capsFrom(v: unknown): Capabilities {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const flag = (k: string): boolean => o[k] === true;
  return {
    input: flag('input'),
    review: flag('review'),
    approve: flag('approve'),
    authorise: flag('authorise'),
    administer: flag('administer'),
  };
}

/**
 * Would this mutation leave the system reconciling?
 *
 * Builds the state the log WOULD produce with the mutation appended, runs the
 * controls over every development in scope, and reports the first failure.
 * Nothing is written unless this returns null.
 *
 * `q` is the connection to read on, and every caller inside `withWriteLock`
 * MUST pass that lock's client. Two reasons, and both matter: the check has to
 * see the transaction it is about to write into, and on the deployment the pool
 * holds a single connection — reading on the pool from inside the lock waits for
 * a client the lock itself is holding, which is a deadlock the platform ends at
 * thirty seconds. See the note on `withWriteLock`.
 */
async function wouldBreakIntegrity(candidate: Mutation, q?: Queryable): Promise<string | null> {
  const [seed, log, corp] = await Promise.all([seedProjects(q), mutationLog(q), corporate(q)]);
  const next = [...log, candidate];
  const projects = replayProjects(seed, next);

  const report = integrityReport(
    projects,
    (id) => registersFor(id, DB, projects, next),
    corp.months,
    corp.scurve,
  );

  if (report.passed === report.total) return null;
  const broken = report.controls.filter((c) => c.result !== 'OK').map((c) => c.name);
  return `would break ${report.total - report.passed} of ${report.total} reconciliation `
    + `controls: ${broken.join(', ')}`;
}

/**
 * Parse and validate a mutation body.
 *
 * Returns the mutation, or the reason it was refused. Validation runs against
 * the developments the position currently holds, so a mutation naming a
 * development that does not exist is refused rather than appended to the
 * audit log as a no-op.
 */
async function parseMutation(
  raw: string,
): Promise<{ mutation: Mutation; sent: Record<string, unknown> } | { error: string }> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: 'the request body is not JSON' };
  }
  // The developments the position holds, AND the vocabulary this deployment
  // holds. Both are read here rather than known by the validator: portfolios
  // and delivery routes are rows an administrator edits (migration 017), so a
  // constant would refuse a portfolio somebody added this morning from a form
  // that offered it.
  const [seed, log, portfolioRows, routeRows] = await Promise.all([
    seedProjects(), mutationLog(), listPortfolioRows(), listRouteRows(),
  ]);
  const known = new Set(replayProjects(seed, log).map((p) => p.id));
  const error = validateMutation(value, known, {
    portfolios: new Set(portfolioRows.map((r) => r.name)),
    routes: new Set(routeRows.map((r) => r.name)),
  });
  // `sent` is the body as it arrived, for the ONE field that travels beside a
  // mutation without being part of it: the reason a change is being proposed.
  // It belongs to the proposal, not to the act — a mutation that carried it
  // would put it in the change log twice, worded once.
  return error
    ? { error }
    : { mutation: asMutation(value), sent: value as Record<string, unknown> };
}

/** An account as the app is allowed to see it. The hash never leaves here. */
function publicAccount(a: AccountRow): Json {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    role: a.role,
    active: a.active,
    avatar: a.avatar,
    createdAt: a.created_at,
    lastSeenAt: a.last_seen_at,
    projects: a.projects,
    hasActed: a.has_acted,
  } as unknown as Json;
}

/** The first real problem in a list of checks, or null. */
const firstProblem = (checks: readonly (string | null)[]): string | null =>
  checks.find((c) => c !== null) ?? null;

/**
 * Refuse a change that would leave nobody able to administer the system.
 *
 * Called before a demotion, a withdrawal and a deletion. It counts what would
 * remain rather than what is there now, so the last administrator cannot be
 * removed by any of the three routes.
 *
 * With the rule that nobody may change or withdraw their own account, this is
 * currently unreachable: the acting administrator is themselves an active
 * administrator, so removing a different one always leaves at least one. It
 * stays because that rule is the only thing making it unreachable, and a
 * later change that relaxes it should not silently take the floor out too.
 */
async function lastAdminGuard(
  target: AccountRow, nextRole: Role, nextActive: boolean,
): Promise<string | null> {
  const wasAdmin = target.role === 'admin' && target.active;
  const staysAdmin = nextRole === 'admin' && nextActive;
  if (!wasAdmin || staysAdmin) return null;
  const remaining = await activeAdminCount() - 1;
  return remaining > 0 ? null
    : 'this is the last administrator; issue another one first or the system cannot be administered';
}

/** A path segment, or null when it is not valid percent-encoding. */
const decodeSegment = (raw: string): string | null => {
  try { return decodeURIComponent(raw); } catch { return null; }
};

/**
 * The developments this person may READ, or null for all of them.
 *
 * A project manager and a PMC user see their own developments and nothing
 * else: the dashboard, the reports, the registers, the change log and the
 * review queue all cover their assignments alone. Absence of an assignment is
 * absence of permission for reading exactly as it is for writing.
 *
 * Enforced here rather than in the screens. A filter applied in the browser
 * hides a figure from the eye and hands it to anyone who opens the network
 * tab, which is not access control.
 *
 * The PMO lead, the PMO manager, a Director and the admin see everything.
 */
async function visibleTo(who: Principal): Promise<Set<string> | null> {
  if (who.role !== 'contributor') return null;
  return new Set(await assignmentsFor(who.sub));
}

/** The development a log entry is about. */
function projectOf(m: Mutation): string {
  return m.kind === 'project:create' ? m.project.id : m.projectId;
}

/** True when a line of text names no development outside the visible set. */
function nameless(text: string, visible: Set<string>): boolean {
  const named = /\b[A-Z]{3}-\d{2}\b/g;
  const ids = text.match(named) ?? [];
  return ids.every((id) => visible.has(id));
}

/**
 * May this person make THIS change?
 *
 * Capability says which kinds of act a role performs. This is the finer
 * question — whether this act, on this development, is theirs — and it is
 * answered per kind:
 *
 *   period:submit      never here; a period goes through /api/periods so that
 *                      three people sign it. Accepting it on this route was a
 *                      way to file a period for any development with one
 *                      request, and no review, approval, assignment or
 *                      separation of duties.
 *   ipc                a contributor for an assigned development, or an admin.
 *   claim:record       an approver or an admin. The claim carries an approval.
 *   variation:approve  an approver or an admin. Approving is the approver's act.
 *   project:create     an admin. Adding a development to the portfolio is not
 *                      a project-level input.
 */
async function mayMutate(who: Principal, m: Mutation, q?: Queryable): Promise<string | null> {
  const c = can(who);

  // ---- a closed development is frozen, whoever is asking -----------------
  //
  // Checked before the seat, and before anything else, because it is not a
  // permission question: no role may file a figure against a development that
  // has been closed out. That is the entire meaning of closing one — the
  // figures on it are final rather than current, and a system that let a
  // certificate land on a settled final account would be one where "closed"
  // was decoration.
  //
  // The list of reporting kinds is shared with the browser (REPORTING_KINDS)
  // so the two cannot drift into disagreeing about what is frozen. Reopening
  // is the way back, and it is deliberately not on this list.
  if (REPORTING_KINDS.includes(m.kind)) {
    const projectId = projectOf(m);
    if (projectId) {
      const [seed, log] = await Promise.all([seedProjects(q), mutationLog(q)]);
      const target = replayProjects(seed, log).find((p) => p.id === projectId);
      if (target?.closedAt) {
        return `${projectId} was closed out on ${target.closedAt.slice(0, 10)} and no longer `
          + 'accepts figures. Reopen it first if this is genuinely still to be recorded.';
      }
    }
  }

  if (m.kind === 'period:submit') {
    return 'reporting periods are filed through /api/periods, where they are validated and approved';
  }
  if (m.kind === 'ipc') {
    if (c.administer) return null;
    if (!c.input) return `role ${who.role} may not record certificates`;
    const mine = await assignmentsFor(who.sub, q);
    return mine.includes(m.projectId) ? null : `${who.sub} is not assigned to ${m.projectId}`;
  }
  // A claim carries an APPROVAL. A certificate may be recorded by the
  // contributor assigned to the development; approving what a contractor is
  // owed is the approver's act, and this route is stricter than `ipc` for
  // exactly that reason.
  if (m.kind === 'claim:record') {
    return c.approve || c.administer ? null : `role ${who.role} may not approve payment claims`;
  }

  // CONFIRMING THAT MONEY LEFT THE ACCOUNT is the PMO manager's act and
  // nobody else's, on the owner's instruction. Approving a claim says what a
  // contractor is owed; this says the owner has actually paid it, and the two
  // are deliberately separate people-decisions rather than one write that
  // assumes the second follows the first.
  if (m.kind === 'claim:pay') {
    return c.approve || c.administer
      ? null
      : `role ${who.role} may not confirm that a payment has been made`;
  }

  if (m.kind === 'variation:approve') {
    return c.approve || c.administer ? null : `role ${who.role} may not approve variations`;
  }
  // AWARDING A CONTRACT IS A COMMERCIAL ACT — it promises the owner's money
  // to a counterparty — so it sits with the seats that register a development
  // and approve its claims, never with the seat that reports on it. The
  // soundness checks (a number already awarded, an award past the budget) are
  // shared with the browser repository via `awardProblem`, so the offline
  // demonstration refuses exactly what this route refuses.
  if (m.kind === 'contract:award') {
    if (!c.approve && !c.administer) {
      return `role ${who.role} may not record or award contract packages`;
    }
    const [seed, log] = await Promise.all([seedProjects(q), mutationLog(q)]);
    return awardProblem(m, DB, replayProjects(seed, log), log);
  }
  // Registering and retiring a development are the PMO manager's acts, and
  // the administrator's. They are portfolio decisions, not project-level
  // input, so a project manager never has them however they are assigned.
  if (m.kind === 'project:create') {
    return c.approve || c.administer ? null : 'only the PMO manager or an administrator may add a development';
  }
  // ---- THE LIFECYCLE ACTS ------------------------------------------------
  //
  // Amending, deleting, restoring, closing out, reopening and permanently
  // removing. Each has a capability the caller must hold; the SOUNDNESS half
  // — a budget below the control budget, a retention window that has closed,
  // a development closed twice — is one shared function, `lifecycleProblem`
  // in src/data/project-state.ts, which the browser repository calls as well.
  //
  // The split is what stops the two drifting. The soundness rules used to
  // live inline here and nowhere else, so the offline demonstration accepted
  // a restore months past its retention window and the platform answered 403
  // — a gesture learned in the demo that fails in the product.
  if (m.kind === 'project:update' || m.kind === 'project:archive'
    || m.kind === 'project:restore' || m.kind === 'project:close'
    || m.kind === 'project:reopen' || m.kind === 'project:delete') {
    // WHO. Correcting a development's details, closing it out and reopening
    // it belong to the seat that registers one — the PMO manager and the
    // administrator. They are portfolio decisions, not project-level input,
    // so a project manager never has them however they are assigned: they
    // report on a development, they do not decide what it is called, what its
    // authorised budget is, or that the job is over.
    //
    // Deleting and restoring add the Director, because taking a development
    // out of the portfolio and putting it back is exactly what that seat
    // authorises.
    const capable = m.kind === 'project:archive' || m.kind === 'project:restore'
      ? c.approve || c.authorise || c.administer
      : c.approve || c.administer;
    if (!capable) {
      const act = {
        'project:update': 'amend a development',
        'project:archive': 'delete a development',
        'project:restore': 'restore a development',
        'project:close': 'close or reopen a development',
        'project:reopen': 'close or reopen a development',
        'project:delete': 'remove a development',
      }[m.kind];
      return m.kind === 'project:archive' || m.kind === 'project:restore'
        ? `only the PMO manager, the Director or an administrator may ${act}`
        : `only the PMO manager or an administrator may ${act}`;
    }

    // PERMANENT REMOVAL IS THE ADMINISTRATOR'S ALONE once a development has
    // reported anything. `lifecycleProblem` establishes below that the only
    // way past that point is an expired retention window; erasing a record
    // that reached the dashboards is the one act here nobody can undo, so it
    // does not sit with the seat that filed it.
    const [seed, log] = await Promise.all([seedProjects(q), mutationLog(q)]);
    const projects = replayProjects(seed, log);
    if (m.kind === 'project:delete' && !c.administer) {
      const target = projects.find((p) => p.id === m.projectId);
      if (target && !isUntouched(target, log)) {
        return 'only an administrator may permanently remove a development whose retention has expired';
      }
    }
    return lifecycleProblem(m, projects, log, Date.now());
  }
  return 'not a recognised mutation';
}

export async function route(req: IncomingMessage, url: URL, who: Principal | null): Promise<Json> {
  const path = url.pathname;

  if (path === '/api/health') return ok({ ok: true });

  // Sign-in is necessarily unauthenticated. It is also the one route an
  // attacker will hammer, so it says as little as possible on failure: a wrong
  // password and an unknown address give the same answer, because telling them
  // apart tells an attacker which addresses are real.
  if (path === '/api/auth/login' && req.method === 'POST') {
    const raw = await readBody(req, 4096);
    let creds: { email?: unknown; password?: unknown };
    try {
      creds = JSON.parse(raw) as typeof creds;
    } catch {
      return fail(400, 'malformed request');
    }
    const { email, password } = creds;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return fail(400, 'email and password are required');
    }

    const user = await userByEmail(email);
    // Verified either way: an unknown address costs the same scrypt as a
    // wrong password, so the uniform message is not undone by the timing.
    const good = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    // A withdrawn account gives the same answer as a wrong password. Saying
    // "that account was withdrawn" would confirm the address to whoever is
    // guessing, and the person it belongs to already knows.
    if (!user || !good || !user.active) {
      return fail(401, 'email or password is incorrect');
    }

    await touchUser(user.id);
    // The CAPABILITIES travel with the account, not just the role name.
    // Seats are rows an administrator edits (migration 015), so a shell that
    // decided what to offer by comparing `role === 'approver'` would show a
    // newly defined seat nothing at all and would keep offering an old one
    // buttons its flags no longer carry. The server is still the enforcement;
    // this is what the sidebar and the forms read.
    const seat = await currentSeat(user.id);
    return ok({
      token: signer.sign({ sub: user.id, role: user.role }, TOKEN_TTL_SECONDS),
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        can: seat?.caps ?? NO_CAPABILITIES,
      },
    });
  }

  // Everything else is behind identity. A public deployment of this API would
  // otherwise be a public deployment of the owner's cost position.
  if (!who) return fail(401, 'authentication required');

  // The token proves who; the table says what they may do NOW. A role
  // changed or an account removed takes effect on the next request, not
  // when the token happens to expire.
  // The seat, not just its name: `role_capabilities` is what the routes ask,
  // and an administrator changing what a seat may do takes effect on the very
  // next click rather than when a token expires. One query, joined onto the
  // role read that was already happening.
  const seatNow = await currentSeat(who.sub);
  if (!seatNow || !isRoleName(seatNow.role)) return fail(401, 'this account is no longer active');
  who = { ...who, role: seatNow.role, caps: seatNow.caps };

  // Who the bearer of this token is, what they may do, and which developments
  // they may input for. The app calls it on load to decide whether a stored
  // token is still good without showing a sign-in flash, and to shape the UI
  // to the role — which is a convenience, never the enforcement.
  if (path === '/api/me') {
    const me = await accountById(who.sub);
    if (!me) return fail(404, 'no such account');
    return ok({
      ...who,
      can: can(who),
      projects: me.projects,
      profile: publicAccount(me),
    });
  }

  // ---- the submission lifecycle ----
  //
  // A submitted period is NOT part of the reported position. It becomes so at
  // approval, and only then is the mutation appended to the log. That is what
  // makes review and approval real rather than decorative: until someone signs
  // it off, nothing downstream has moved.
  // =====================================================================
  // THE MODEL
  //
  // Two things use it: the assistant, and document extraction. Both live
  // here, behind the token, because `GEMINI_API_KEY` is a server-side secret
  // and a `VITE_`-prefixed one would ship inside dist/index.html.
  //
  // NEITHER OF THEM CAN WRITE ANYTHING. The assistant answers from a brief
  // this server computed and returns prose. Extraction returns fields for a
  // FORM, which a person then reviews and submits through the ordinary route,
  // where the twenty reconciliation controls run before the write. A model may
  // fill a form; it may never file a figure.
  // =====================================================================

  // Whether this deployment has a model at all, so the screens can say so
  // rather than offering a button that fails.
  if (path === '/api/ai/status' && req.method === 'GET') {
    return ok({ configured: aiConfigured(), model: aiConfigured() ? GEMINI_MODEL : null });
  }

  if (path === '/api/ai/assistant' && req.method === 'POST') {
    if (!aiConfigured()) return fail(503, 'No model is configured on this deployment.');
    const rate = spend(who.sub);
    if (rate) return fail(429, rate);

    const body = await readJson(req, 8_192);
    if (!body) return fail(400, 'expected a JSON body');
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return fail(400, 'ask a question');
    if (question.length > 1000) return fail(400, 'that question is too long');

    // The brief is built from what THIS PERSON may see. A project manager's
    // assistant cannot answer about a development they were never assigned,
    // because the model is never shown one.
    const visible = await visibleTo(who);
    const [seed, log] = await Promise.all([seedProjects(), mutationLog()]);
    const all = replayProjects(seed, log)
      .filter((p) => !p.archived && (!visible || visible.has(p.id)));

    const level = typeof body.level === 'string' ? body.level : 'Corporate';
    const portfolio = typeof body.portfolio === 'string' ? body.portfolio : undefined;
    const project = typeof body.project === 'string' ? body.project : undefined;
    // THE SAME RULE THE SCREENS FOLLOW, and it has to be the same rule.
    //
    // The brief TOTALS what it is given, so a closed development left in it
    // would have the assistant quoting a portfolio budget that no screen
    // agrees with — the one failure mode this whole design exists to avoid.
    // At Project level the answer is that development whether it is closed or
    // not, because the person asked about it by name; ScopeProvider draws the
    // line in exactly the same place.
    const inScope = level === 'Project' ? all.filter((p) => p.id === project)
      : level === 'Portfolio' ? active(all).filter((p) => p.portfolio === portfolio)
        : active(all);

    const registers: Record<string, ProjectRegisters> = {};
    for (const p of inScope) registers[p.id] = registersFor(p.id, DB, all, log);

    try {
      const answer = await generate({
        system: ASSISTANT_IDENTITY,
        temperature: 0,
        maxOutputTokens: 700,
        parts: [{
          text: `Here is the current position. Every figure you state must appear below.\n\n`
            + `${buildBrief(inScope, registers, { level, portfolio, project })}\n\n`
            + `QUESTION FROM ${who.role.toUpperCase()}: ${question}`,
        }],
      });
      return ok({ answer });
    } catch (e: unknown) {
      if (e instanceof ModelError) return fail(e.status, e.message);
      throw e;
    }
  }

  // Read a document and hand back what it says. NOTHING IS WRITTEN.
  //
  // The result fills the certificate form, where the person sees each field
  // and the model's confidence in it before anything is submitted. The write
  // itself goes through /api/mutations like every other, and is refused if it
  // would break a control.
  if (path === '/api/ai/extract' && req.method === 'POST') {
    if (!aiConfigured()) return fail(503, 'No model is configured on this deployment.');
    // Extraction is an input act: the seat that may record a certificate.
    // The approver was admitted here and then refused on /api/mutations —
    // the condition and its own message disagreed — so the gate now matches
    // the write it feeds.
    if (!can(who).input && !can(who).administer) {
      return fail(403, `role ${who.role} may not record certificates`);
    }
    const rate = spend(who.sub);
    if (rate) return fail(429, rate);

    const body = await readJson(req, 12_000_000);
    if (!body) return fail(400, 'expected a JSON body');
    const file = typeof body.file === 'string' ? body.file : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
    if (!file) return fail(400, 'no document was sent');
    if (!EXTRACTABLE.has(mimeType)) {
      return fail(400, `that file type cannot be read — send a PDF or an image (${[...EXTRACTABLE].join(', ')})`);
    }
    // Base64 is 4 characters per 3 bytes; this is the ~8MB the model accepts
    // inline, checked before the bytes are sent rather than after.
    if (file.length > 11_000_000) return fail(413, 'that document is too large to read');

    const visible = await visibleTo(who);
    const [seed, log] = await Promise.all([seedProjects(), mutationLog()]);
    const known = replayProjects(seed, log)
      .filter((p) => !p.archived && (!visible || visible.has(p.id)));

    try {
      const raw = await generate({
        system: EXTRACTION_IDENTITY,
        temperature: 0,
        json: true,
        maxOutputTokens: 1200,
        parts: [
          { inlineData: { mimeType, data: file } },
          {
            text: 'Read this document and return the fields as JSON.\n\n'
              + `The developments this person may file against are:\n${known
                .map((p) => `  ${p.id} — ${p.name} (contractor of record: ${p.pmc})`).join('\n')}\n\n`
              + 'Set projectId to one of those ids only if the document plainly names that '
              + 'development or its contractor. If it does not, set projectId to null and say '
              + 'so in notes. Do not guess which development this belongs to.',
          },
        ],
      });
      const got = asJson<ExtractedDocument>(raw);

      // The model is not trusted to have obeyed the shape, and it is
      // certainly not trusted to have picked a development the caller may
      // not see. Both are checked here, not in the browser.
      const projectId = typeof got.projectId === 'string'
        && known.some((p) => p.id === got.projectId) ? got.projectId : null;
      const num = (v: unknown): number | null =>
        (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
      const str = (v: unknown, max: number): string | null =>
        (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const conf = (v: unknown): number =>
        (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0);

      return ok({
        documentType: str(got.documentType, 80),
        projectId,
        reference: str(got.reference, 40),
        period: str(got.period, 40),
        contractor: str(got.contractor, 200),
        certified: num(got.certified),
        retention: num(got.retention),
        netPayable: num(got.netPayable),
        notes: str(got.notes, 600),
        confidence: {
          documentType: conf(got.confidence?.documentType),
          projectId: conf(got.confidence?.projectId),
          reference: conf(got.confidence?.reference),
          period: conf(got.confidence?.period),
          contractor: conf(got.confidence?.contractor),
          certified: conf(got.confidence?.certified),
          retention: conf(got.confidence?.retention),
        },
      });
    } catch (e: unknown) {
      if (e instanceof ModelError) return fail(e.status, e.message);
      throw e;
    }
  }

  // =====================================================================
  // MESSAGES
  //
  // Every seat, including the executive viewer. A person who may only read
  // the figures is exactly the person most likely to need to ask somebody a
  // question about them, and a message moves nothing — so there is no reason
  // to take the ability away.
  //
  // These routes are NOT /api/mutations. A message is not a change to the
  // reported position: it is not appended to the change log, not replayed,
  // and not put through the reconciliation controls, because it moves no
  // figure. Keeping the two apart is deliberate — a conversation that could
  // change the position would be a way around the whole workflow.
  // =====================================================================

  // The inbox: everyone this person can write to, the last thing said either
  // way, and how many are unread. One query, one round trip; on a serverless
  // host a screen that polls must cost one invocation, not one per person.
  if (path === '/api/messages' && req.method === 'GET') {
    const people = await correspondentsFor(who.sub);
    return ok({
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        active: p.active,
        avatar: p.avatar,
        unread: p.unread,
        lastAt: p.last_at,
        lastBody: p.last_body,
        lastFromMe: p.last_from_me,
      })),
      unread: people.reduce((a, p) => a + p.unread, 0),
    });
  }

  if (path === '/api/messages' && req.method === 'POST') {
    const body = await readJson(req, 16_384);
    if (!body) return fail(400, 'expected a JSON body');

    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    // A reference to a development, not a foreign key: a message about one
    // that is later removed is still a true record of what was said.
    const projectId = typeof body.projectId === 'string' && body.projectId !== ''
      ? body.projectId
      : null;

    if (!to) return fail(400, 'a recipient is required');
    if (to === who.sub) return fail(400, 'a message needs somebody else to read it');
    if (!text) return fail(400, 'the message is empty');
    if (text.length > 4000) return fail(400, 'a message may be at most 4000 characters');
    if (projectId !== null && !/^[A-Z]{3}-\d{2}$/.test(projectId)) {
      return fail(400, 'the development reference must look like RES-01');
    }
    // Withdrawn accounts keep their history and are shown in a conversation
    // that already exists, but nothing new can be sent to somebody who can no
    // longer sign in to read it.
    if (!await isWritableAccount(to)) return fail(404, 'no such active account');

    const sent = await sendMessage(who.sub, to, text, projectId);
    return ok({
      id: sent.id,
      from: sent.sender_id,
      to: sent.recipient_id,
      body: sent.body,
      projectId: sent.project_id,
      at: sent.sent_at,
      read: sent.read_at !== null,
    });
  }

  // One conversation. `with` is the other person; there is no way to ask for
  // a conversation you are not in, because both halves of the query are
  // anchored to the caller.
  const threadPath = /^\/api\/messages\/thread$/.exec(path);
  if (threadPath && req.method === 'GET') {
    const other = url.searchParams.get('with');
    if (!other) return fail(400, 'which conversation? pass ?with=<account id>');
    if (other === who.sub) return fail(400, 'that conversation has only one person in it');

    const rows = await conversation(who.sub, other);
    // Opening a conversation reads it; POLLING it does not. `mark=1` is sent
    // when a person actually opens the thread, and omitted by the poll that
    // keeps it fresh — otherwise this route would write to the database every
    // interval, for every open conversation, to record a fact it recorded the
    // first time. The SENDER is never told either way: a read receipt is a
    // surveillance feature dressed as a convenience, so this count exists
    // only to refresh the reader's own badge.
    const read = url.searchParams.get('mark') === '1'
      ? await markConversationRead(who.sub, other)
      : 0;
    return ok({
      messages: rows.map((m) => ({
        id: m.id,
        from: m.sender_id,
        to: m.recipient_id,
        body: m.body,
        projectId: m.project_id,
        at: m.sent_at,
        read: m.read_at !== null,
      })),
      justRead: read,
    });
  }

  // =====================================================================
  // A PERSON'S OWN PROFILE
  //
  // Name, picture and password. Never a role and never an assignment: what
  // somebody may do is issued to them, not chosen by them, and a screen that
  // let a person set their own role would be the whole access model undone
  // by one dropdown.
  // =====================================================================
  if (path === '/api/me/profile' && req.method === 'POST') {
    const body = await readJson(req, 262_144);
    if (!body) return fail(400, 'expected a JSON body');

    const patch: { name?: string; avatar?: string | null } = {};
    if (body.name !== undefined) {
      const bad = checkPersonName(body.name);
      if (bad) return fail(400, bad);
      patch.name = (body.name as string).trim();
    }
    if (body.avatar !== undefined) {
      const bad = checkAvatar(body.avatar);
      if (bad) return fail(400, bad);
      patch.avatar = body.avatar as string | null;
    }
    if (patch.name === undefined && patch.avatar === undefined) {
      return fail(400, 'nothing to change');
    }

    const updated = await updateProfile(who.sub, patch);
    return updated ? ok(publicAccount(updated)) : fail(404, 'no such account');
  }

  if (path === '/api/me/password' && req.method === 'POST') {
    const body = await readJson(req, 4096);
    if (!body) return fail(400, 'expected a JSON body');

    const bad = checkPassword(body.next);
    if (bad) return fail(400, bad);

    // The current password is required even though the token already proves
    // who this is. A token is a session; a session left open on somebody
    // else's screen should not be enough to take the account over.
    const me = await userByEmail(who.sub);
    const good = await verifyPassword(
      typeof body.current === 'string' ? body.current : '',
      me?.password_hash ?? DUMMY_HASH,
    );
    if (!me || !good) return fail(403, 'the current password is incorrect');
    if (body.current === body.next) return fail(400, 'the new password must differ from the current one');

    await setAccountPassword(who.sub, hashPassword(body.next as string));
    return ok({ ok: true });
  }

  // =====================================================================
  // ACCOUNTS — THE ADMINISTRATOR'S
  // =====================================================================
  const accountPath = /^\/api\/users(?:\/([^/]+))?(?:\/(assignments))?$/.exec(path);
  if (accountPath) {
    if (!can(who).administer) return fail(403, `role ${who.role} may not manage accounts`);

    const targetId = accountPath[1] ? decodeSegment(accountPath[1]) : null;
    if (accountPath[1] && targetId === null) return fail(400, 'malformed account id');

    if (!targetId && req.method === 'GET') {
      return ok((await listAccounts()).map(publicAccount));
    }

    if (!targetId && req.method === 'POST') {
      const body = await readJson(req, 262_144);
      if (!body) return fail(400, 'expected a JSON body');

      const bad = firstProblem([
        checkEmail(body.email), checkPersonName(body.name), checkPassword(body.password),
        isRoleName(body.role) ? null : `role must be one of ${ROLES.join(', ')}`,
      ]);
      if (bad) return fail(400, bad);

      const email = (body.email as string).trim().toLowerCase();
      if (await accountById(email)) return fail(409, `${email} already has an account`);

      const created = await createAccount({
        email,
        name: (body.name as string).trim(),
        role: body.role as Role,
        passwordHash: hashPassword(body.password as string),
      });
      return created ? ok(publicAccount(created)) : fail(500, 'the account was not created');
    }

    if (targetId) {
      const target = await accountById(targetId);
      if (!target) return fail(404, 'no such account');
      const isMe = target.id === who.sub;

      if (req.method === 'GET') return ok(publicAccount(target));

      if (accountPath[2] === 'assignments' && req.method === 'POST') {
        const body = await readJson(req, 65_536);
        if (!body) return fail(400, 'expected a JSON body');
        const ids = body.projects;
        if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'string')) {
          return fail(400, 'expected {"projects": ["RES-01", …]}');
        }
        // Assignment is what a contributor may input for. Giving it to anyone
        // else would be a row nothing reads, which is worse than a refusal.
        if (target.role !== 'contributor' && ids.length > 0) {
          return fail(409, `only a project manager holds development assignments; ${target.name} is a ${target.role}`);
        }
        const [seed, log] = await Promise.all([seedProjects(), mutationLog()]);
        const known = new Set(replayProjects(seed, log).map((p) => p.id));
        const unknown = (ids as string[]).filter((id) => !known.has(id));
        if (unknown.length) return fail(400, `no such development: ${unknown.join(', ')}`);

        await setAssignments(target.id, ids as string[]);
        const after = await accountById(target.id);
        return after ? ok(publicAccount(after)) : fail(404, 'no such account');
      }

      if (req.method === 'POST') {
        const body = await readJson(req, 262_144);
        if (!body) return fail(400, 'expected a JSON body');

        if (body.role !== undefined) {
          if (!isRoleName(body.role)) return fail(400, `role must be one of ${ROLES.join(', ')}`);
          // An administrator changing their own role, or demoting the last
          // one, locks the system out of its own administration.
          if (isMe) return fail(409, 'you cannot change your own role; ask another administrator');
          const nextRole = body.role;
          const guard = await lastAdminGuard(target, nextRole, target.active);
          if (guard) return fail(409, guard);
          const updated = await setAccountRole(target.id, nextRole);
          // A role that is no longer a contributor holds no assignments.
          if (body.role !== 'contributor') await setAssignments(target.id, []);
          const after = updated ? await accountById(target.id) : null;
          return after ? ok(publicAccount(after)) : fail(404, 'no such account');
        }

        if (body.active !== undefined) {
          if (typeof body.active !== 'boolean') return fail(400, 'active must be true or false');
          if (isMe && !body.active) return fail(409, 'you cannot withdraw your own account');
          const guard = await lastAdminGuard(target, target.role, body.active);
          if (guard) return fail(409, guard);
          const updated = await setAccountActive(target.id, body.active);
          return updated ? ok(publicAccount(updated)) : fail(404, 'no such account');
        }

        if (body.password !== undefined) {
          const bad = checkPassword(body.password);
          if (bad) return fail(400, bad);
          // An administrator resetting somebody else's password does not know
          // the old one, and should not have to. Their own goes through
          // /api/me/password, which does require it.
          if (isMe) return fail(409, 'change your own password under your profile, where the current one is required');
          await setAccountPassword(target.id, hashPassword(body.password as string));
          return ok({ ok: true });
        }

        return fail(400, 'expected one of role, active or password');
      }

      if (req.method === 'DELETE') {
        if (isMe) return fail(409, 'you cannot remove your own account');
        // An account that has filed, validated, approved or recorded anything
        // is named all over the audit trail. Erasing it would leave that trail
        // pointing at nobody, so it is withdrawn instead and says so.
        if (target.has_acted) {
          return fail(409, `${target.name} has filed or approved work and cannot be erased; withdraw the account instead`);
        }
        const guard = await lastAdminGuard(target, target.role, false);
        if (guard) return fail(409, guard);
        await deleteAccount(target.id);
        return ok({ ok: true });
      }
    }
  }

  if (path === '/api/periods') {
    if (req.method === 'GET') {
      const visible = await visibleTo(who);
      const all = await listSubmissions();
      const mine = visible ? all.filter((s) => visible.has(s.projectId)) : all;

      // A Director sees that a period is filed and who is holding it. The
      // figures inside it are not yet fact, and approval is what publishes
      // them, so an unapproved payload never leaves the server for a reader.
      // Stripped here rather than hidden by the screen: a filter applied in
      // the browser still ships the numbers to it.
      if (who.role !== 'reader') return ok(mine);
      return ok(mine.map((s) => (s.state === 'approved' ? s : { ...s, payload: null })));
    }

    if (req.method === 'POST') {
      if (!can(who).input) return fail(403, `role ${who.role} may not submit periods`);

      const parsed = await parseMutation(await readBody(req));
      if ('error' in parsed) return fail(400, parsed.error);
      const { mutation } = parsed;
      if (mutation.kind !== 'period:submit') return fail(400, 'not a reporting period');

      // Assignment is refused before the figures are looked at, so a person
      // who may not submit for a development learns that, and nothing about
      // its position. The database enforces the same rule on insert; this is
      // the early, useful message, never the control.
      if (!can(who).administer) {
        const mine = await assignmentsFor(who.sub);
        if (!mine.includes(mutation.projectId)) return fail(403, `${who.sub} is not assigned to ${mutation.projectId}`);
      }

      // A closed development is frozen for a PERIOD exactly as it is for a
      // certificate. The freeze in mayMutate never sees a period — this
      // route exists so that three people sign one — so without this check
      // the strongest freeze in the system did not cover the kind that
      // moves the most figures. An archived development is out of the
      // portfolio entirely and accepts nothing.
      {
        const [seed, log] = await Promise.all([seedProjects(), mutationLog()]);
        const target = replayProjects(seed, log).find((p) => p.id === mutation.projectId);
        if (target?.closedAt) {
          return fail(403, `${mutation.projectId} was closed out on `
            + `${target.closedAt.slice(0, 10)} and no longer accepts periods. `
            + 'Reopen it first if this is genuinely still to be reported.');
        }
        if (target?.archived) {
          return fail(403, `${mutation.projectId} is archived and accepts nothing`);
        }
      }

      // Refused here as well as at approval. Catching it at entry is what
      // lets the person fix it while they still have the figures in front of
      // them; catching it again at approval is what stops a stale submission
      // becoming fact after the position beneath it has moved.
      const broken = await wouldBreakIntegrity(mutation);
      if (broken) return fail(422, broken);

      try {
        return ok(await insertSubmission(mutation, who.sub));
      } catch (err) {
        // The database enforces assignment and role. Its message names the
        // reason precisely, and it is the authority here, not this route.
        return refusal(err);
      }
    }
  }

  // The blank workbook itself, so that the person collecting a period fills
  // the sheet this importer reads rather than a copy from an old email whose
  // rows have since moved. Base64 in a JSON body: every other response on
  // this API is JSON, and Vercel's function runtime is happiest that way.
  if (path === '/api/periods/template' && req.method === 'GET') {
    // The same capability as the importer it pairs with. A blank form is
    // harmless, but a download nobody on this role can then upload is a
    // button that leads nowhere.
    if (!can(who).input) return fail(403, `role ${who.role} may not enter periods`);
    return ok({
      filename: PT_TEMPLATE_FILENAME,
      sha256: PT_TEMPLATE_SHA256,
      base64: PT_TEMPLATE_BASE64,
    });
  }

  // Read a filled PT_TEMPLATE and hand back what it says. Nothing is written
  // and nothing is filed: the result goes to the entry form, where the live
  // reconciliation panel shows whether it agrees and the person decides. An
  // import that filed straight into the workflow would be a way to enter data
  // without looking at it.
  if (path === '/api/periods/parse' && req.method === 'POST') {
    if (!can(who).input) return fail(403, `role ${who.role} may not enter periods`);

    const projectId = url.searchParams.get('project') ?? '';
    if (!projectId) return fail(400, 'which development is this period for?');

    // Base64 rather than raw bytes: it survives every proxy and serverless
    // runtime without depending on how each handles a binary body. Wrapped
    // as {"file": "..."} by the app, because the JSON content type has to
    // carry JSON on a host that parses it first; a bare base64 body is still
    // accepted for older callers. The ceiling is under the 4.5 MB a
    // serverless request may carry, so a large workbook is refused with a
    // reason here rather than a platform 413 the app cannot read.
    const body = await readBody(req, 4_000_000);
    let encoded = body;
    if (body.trimStart().startsWith('{')) {
      try {
        const v = JSON.parse(body) as { file?: unknown };
        if (typeof v.file !== 'string') return fail(400, 'expected {"file": "<base64>"}');
        encoded = v.file;
      } catch {
        return fail(400, 'the request body is not JSON');
      }
    }
    let file: Buffer;
    try {
      file = Buffer.from(encoded, 'base64');
    } catch {
      return fail(400, 'the upload could not be read');
    }
    if (file.length === 0) return fail(400, 'the file is empty');

    try {
      return ok(parsePeriod(file, projectId));
    } catch (err) {
      // A TemplateError says exactly what is wrong with the sheet and is meant
      // to be read by the person who filled it in.
      if (err instanceof TemplateError) return fail(422, err.message);
      return fail(400, 'this does not look like an .xlsx workbook');
    }
  }

  // The blank new-development workbook. Paired with the importer beneath it
  // and gated on the same capability: a template nobody on this role can then
  // upload is a button that leads nowhere.
  if (path === '/api/projects/template' && req.method === 'GET') {
    if (!can(who).approve && !can(who).administer) {
      return fail(403, `role ${who.role} may not register developments`);
    }
    const file = buildProjectTemplate();
    return ok({
      filename: PROJECT_TEMPLATE_FILENAME,
      sha256: createHash('sha256').update(file).digest('hex'),
      base64: file.toString('base64'),
    });
  }

  // Read a filled new-development workbook and hand back what it says.
  //
  // Nothing is written and nothing is registered: the result goes to the Add
  // Project form, where the person sees what was read and what it implies —
  // the control budget the packages come to, the commitment the awarded ones
  // carry — and decides. An import that registered a development straight from
  // a file would be a way to put one on the dashboard without looking at it.
  if (path === '/api/projects/parse' && req.method === 'POST') {
    if (!can(who).approve && !can(who).administer) {
      return fail(403, `role ${who.role} may not register developments`);
    }

    const body = await readBody(req, 4_000_000);
    let encoded = body;
    if (body.trimStart().startsWith('{')) {
      try {
        const v = JSON.parse(body) as { file?: unknown };
        if (typeof v.file !== 'string') return fail(400, 'expected {"file": "<base64>"}');
        encoded = v.file;
      } catch {
        return fail(400, 'the request body is not JSON');
      }
    }
    let file: Buffer;
    try {
      file = Buffer.from(encoded, 'base64');
    } catch {
      return fail(400, 'the upload could not be read');
    }
    if (file.length === 0) return fail(400, 'the file is empty');

    // The structure guard runs first. A workbook that opens but whose columns
    // have moved is the dangerous case: read confidently, it would put a
    // contractor's name in the award-value column. Guarded: a crafted archive
    // that opens as a zip and then throws inside the sheet reader (a local
    // header offset past the buffer, an unsupported compression method) is a
    // bad upload, not an internal error — the periods route already says so
    // and this one answered 500.
    let wrong: string | null;
    try {
      wrong = verifyProjectStructure(file);
    } catch {
      return fail(400, 'this does not look like an .xlsx workbook');
    }
    if (wrong) return fail(422, wrong);

    try {
      // Matched against the portfolios this deployment holds, not four names
      // written into the reader: an administrator who added a fifth expects a
      // workbook naming it to be read, not corrected.
      const knownPortfolios = (await listPortfolioRows()).map((r) => r.name);
      return ok(readProject(file, knownPortfolios));
    } catch {
      return fail(400, 'this does not look like an .xlsx workbook');
    }
  }

  const stage = /^\/api\/periods\/(\d{1,9})\/(review|approve|return)$/.exec(path);
  if (stage && req.method === 'POST') {
    const id = Number(stage[1]);
    const action = stage[2];

    const existing = await getSubmission(id);
    if (!existing) return fail(404, 'no such submission');

    try {
      if (action === 'review') {
        if (!can(who).review) return fail(403, `role ${who.role} may not validate periods`);
        const done = await reviewSubmission(id, who.sub);
        return done ? ok(done) : fail(409, `submission is ${existing.state}, not awaiting validation`);
      }

      if (action === 'approve') {
        if (!can(who).approve) return fail(403, `role ${who.role} may not approve periods`);

        // Approval is the moment the period becomes part of the reported
        // position, and it is ONE act: the state change and the log entry
        // commit together or not at all. Under the write lock, so the
        // reconciliation check sees every write that came before it and no
        // other write can slip in between the check and the append.
        // The stored payload is nullable only in what a reader is served; a
        // row without one is a corrupt submission, not an approvable period.
        const filed = existing.payload;
        if (!filed) return fail(500, `submission ${id} has no figures recorded`);

        return await withWriteLock(async (client) => {
          // A development closed between submission and approval — the
          // legitimate order of those two acts — must refuse the approval:
          // the closing figures are final, and a stale submission becoming
          // fact afterwards is exactly what final cannot mean. Checked on
          // the lock's client, like everything in here.
          const [seedNow, logNow] = await Promise.all([seedProjects(client), mutationLog(client)]);
          const targetNow = replayProjects(seedNow, logNow).find((p) => p.id === filed.projectId);
          if (targetNow?.closedAt) {
            return fail(403, `${filed.projectId} was closed out on `
              + `${targetNow.closedAt.slice(0, 10)} and no longer accepts periods`);
          }
          if (targetNow?.archived) {
            return fail(403, `${filed.projectId} is archived and accepts nothing`);
          }

          // Re-checked against the position as it stands now, not as it
          // stood when the period was submitted — on the lock's own client,
          // which is both what makes "now" mean inside this transaction and
          // what keeps the check off a pool that has no second connection.
          const broken = await wouldBreakIntegrity(filed, client);
          if (broken) return fail(422, broken);

          const done = await approveAndRecord(client, id, who.sub);
          return done ? ok(done) : fail(409, `submission is ${existing.state}, not awaiting approval`);
        });
      }

      // Returning is a reviewer's or an approver's act — sending a period
      // back to the person who entered it. It used to check nothing beyond
      // identity, so a reader could return any period, and the submitter
      // could return their own after it had been validated.
      if (!can(who).review && !can(who).approve) {
        return fail(403, `role ${who.role} may not return periods`);
      }
      // An admin is exempt from separation of duties by the owner's
      // decision, and the database says so too; refusing them here would be
      // the odd case of a person who may approve their own period but not
      // send it back for correction.
      if (existing.submittedBy === who.sub && !can(who).administer) {
        return fail(409, 'the person who entered a period cannot return it');
      }
      const body = await readJson(req, 4096);
      if (!body) return fail(400, 'expected {"note": "..."}');
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
      if (!note) return fail(400, 'a return needs a note saying why');
      const done = await returnSubmission(id, note, who.sub);
      return done ? ok(done) : fail(409, `submission is ${existing.state} and cannot be returned`);
    } catch (err) {
      return refusal(err);
    }
  }

  if (req.method === 'GET') {
    const visible = await visibleTo(who);

    if (path === '/api/projects') {
      const [seed, log] = await Promise.all([seedProjects(), mutationLog()]);
      // Replayed over the WHOLE log and filtered afterwards. Filtering the
      // log first would compute each development's position from a fraction
      // of its own history.
      const all = replayProjects(seed, log).filter((p) => !visible || visible.has(p.id));

      // Deleted developments are out of the portfolio and out of every view,
      // unless a seat that may act on one asks for them. THE DIRECTOR IS ONE:
      // deleting and restoring are the acts that seat authorises, and an
      // authoriser who cannot see the archive would be deciding a restoration
      // of something they cannot read.
      const wantsArchived = url.searchParams.get('archived') === '1';
      if (!wantsArchived) return ok(all.filter((p) => !p.archived));
      if (!can(who).approve && !can(who).authorise && !can(who).administer) {
        return fail(403, `role ${who.role} may not see archived developments`);
      }
      return ok(all.filter((p) => p.archived === true));
    }

    // A percent-encoding that does not decode ("%E0") threw URIError and
    // became a 500; it is a bad request.
    const segment = (s: string): string | null => {
      try { return decodeURIComponent(s); } catch { return null; }
    };

    const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(path);
    if (projectMatch) {
      const id = segment(projectMatch[1]);
      if (id === null) return fail(400, 'malformed development id');
      const [seed, log] = await Promise.all([seedProjects(), mutationLog()]);
      const found = replayProjects(seed, log).find((p) => p.id === id);
      // 404 rather than 403 for a development this person may not see: a
      // refusal that distinguishes "not yours" from "does not exist" is a
      // way to enumerate the portfolio one id at a time.
      if (!found || (visible && !visible.has(found.id))) return fail(404, 'no such development');
      // Archived developments left every screen; they must leave every read
      // too. The list route already refuses them to seats below the PMO
      // manager, and serving one here by id was a way around that refusal.
      // 404, not 403, for the same reason as above.
      if (found.archived && !can(who).approve && !can(who).authorise && !can(who).administer) {
        return fail(404, 'no such development');
      }
      return ok(found);
    }

    // Everything the app needs to render, in ONE request.
    //
    // The app used to build this itself: /api/projects, /api/corporate, and
    // then one /api/registers/:id PER DEVELOPMENT — eleven requests for eight
    // developments, on first load and again after every single change. On a
    // serverless host each of those is its own invocation, with its own cold
    // start and its own database connection, and the fan-out is what made
    // registering a development look as though the application had hung.
    //
    // The replay runs once here and every register is derived from it, so this
    // is also less work than the fan-out was: the log was being read, and the
    // whole position replayed, once per development.
    if (path === '/api/snapshot') {
      const [seed, log, corp] = await Promise.all([seedProjects(), mutationLog(), corporate()]);
      const projects = replayProjects(seed, log)
        .filter((p) => !p.archived && (!visible || visible.has(p.id)));

      const registers: Record<string, unknown> = {};
      for (const p of projects) registers[p.id] = registersFor(p.id, DB, projects, log);

      return ok({
        projects,
        registers,
        corporate: visible
          ? { ...corp, activities: corp.activities.filter((a) => nameless(`${a.title} ${a.sub}`, visible)) }
          : corp,
      });
    }

    const registersMatch = /^\/api\/registers\/([^/]+)$/.exec(path);
    if (registersMatch) {
      const id = segment(registersMatch[1]);
      if (id === null) return fail(400, 'malformed development id');
      const [seed, log] = await Promise.all([seedProjects(), mutationLog()]);
      const projects = replayProjects(seed, log);
      if (!projects.some((p) => p.id === id)) return fail(404, 'no such development');
      if (visible && !visible.has(id)) return fail(404, 'no such development');
      const target = projects.find((p) => p.id === id);
      if (target?.archived && !can(who).approve && !can(who).authorise && !can(who).administer) {
        return fail(404, 'no such development');
      }
      return ok(registersFor(id, DB, projects, log));
    }

    if (path === '/api/corporate') {
      const data = await corporate();
      if (!visible) return ok(data);
      // The activity feed names developments in its text, so it is cut to
      // the ones this person may see. The rest of the payload is reference
      // data: portfolio names, the month labels and the curve shape the
      // forecast is drawn against, none of which is a figure.
      return ok({ ...data, activities: data.activities.filter((a) => nameless(`${a.title} ${a.sub}`, visible)) });
    }
    if (path === '/api/mutations') {
      const log = await mutationLog();
      return ok(visible ? log.filter((m) => visible.has(projectOf(m))) : log);
    }

    // The proposal queue. Readable by everyone signed in, deliberately: a
    // change waiting on the Director is a fact about the portfolio, and the
    // people whose developments it concerns should be able to see that it is
    // coming. It carries no figure that is not already on a screen.
    if (path === '/api/changes') {
      return ok(await listChangeRequests());
    }

    // The seats, and what each may do. Readable by everyone for the same
    // reason the sidebar is shaped by role: a person who cannot press a
    // button is owed an explanation of who can.
    if (path === '/api/roles') {
      return ok(await listSeats());
    }

    // THE PORTFOLIOS AND THE DELIVERY ROUTES, with how many developments are
    // in each. Readable by everyone signed in — they are already on every
    // screen — and the count is what the Administration panel shows beside a
    // Remove button that will refuse.
    if (path === '/api/reference') {
      const [portfolioRows, routeRows, seed, log] = await Promise.all([
        listPortfolioRows(), listRouteRows(), seedProjects(), mutationLog(),
      ]);
      // COUNTED FROM THE REPLAY, never from a foreign key: a development
      // registered through the application exists only in the change log.
      const live = replayProjects(seed, log);
      const inPortfolio = (name: string) => live.filter((p) => p.portfolio === name).length;
      const onRoute = (name: string) => live.filter((p) => p.route === name).length;
      return ok({
        portfolios: portfolioRows.map((r) => ({ ...r, developments: inPortfolio(r.name) })),
        routes: routeRows.map((r) => ({ ...r, developments: onRoute(r.name) })),
      });
    }
  }

  // ---- the vocabulary: portfolios and delivery routes --------------------
  //
  // The administrator's, for the reason seats are: this is configuration of
  // what the system IS, not a change to a development's reported position, so
  // it does not go through the propose-then-authorise queue. What protects
  // the data is not who presses it but the refusal below — a portfolio a
  // development is in is never removed.
  //
  // A rename is deliberately not offered. Every development carries the
  // portfolio's NAME as its own value, in `projects` and inside payloads in
  // the change log, so a rename here would orphan all of them silently. Add
  // the right one, move the developments, remove the wrong one — three acts
  // somebody can see, instead of one that looks free.
  {
    const ref = /^\/api\/reference\/(portfolios|routes)\/(.+)$/.exec(path);
    if (ref && (req.method === 'PATCH' || req.method === 'DELETE')) {
      if (!can(who).administer) {
        return fail(403, 'only an administrator may define portfolios and delivery routes');
      }
      const kind = ref[1];
      const name = decodeURIComponent(ref[2]);
      const existing = kind === 'portfolios'
        ? await portfolioByName(name)
        : await routeByName(name);
      if (!existing) return fail(404, `no such ${kind === 'portfolios' ? 'portfolio' : 'delivery route'}`);

      if (req.method === 'DELETE') {
        const what = kind === 'portfolios' ? 'portfolio' : 'delivery route';
        if (existing.built_in) {
          return fail(403, `${name} is a ${what} the product defines and cannot be removed`);
        }
        const [seed, log] = await Promise.all([seedProjects(), mutationLog()]);
        const live = replayProjects(seed, log);
        const used = live.filter(
          (p) => (kind === 'portfolios' ? p.portfolio : p.route) === name,
        ).length;
        if (used > 0) {
          return fail(409, `${used} development${used === 1 ? ' is' : 's are'} `
            + `${kind === 'portfolios' ? 'in' : 'on'} ${name}. `
            + `Move ${used === 1 ? 'it' : 'them'} first — a development whose ${what} `
            + 'no longer exists has nothing to roll up into.');
        }
        if (kind === 'portfolios') await deletePortfolio(name);
        else await deleteRoute(name);
        return ok({ ok: true });
      }

      const body = await readJson(req, 8_192);
      if (!body) return fail(400, 'malformed request');
      if (kind === 'portfolios') {
        if (body.tone !== undefined && !isPortfolioTone(body.tone)) {
          return fail(400, `a portfolio is drawn in one of: ${PORTFOLIO_TONES.join(', ')}`);
        }
        const patch: { tone?: string; sort?: number } = {};
        if (isPortfolioTone(body.tone)) patch.tone = body.tone;
        if (typeof body.sort === 'number' && Number.isInteger(body.sort)) patch.sort = body.sort;
        const updated = await updatePortfolio(name, patch);
        return updated ? ok(updated) : fail(404, 'no such portfolio');
      }
      const patch: { describes?: string; sort?: number } = {};
      if (typeof body.describes === 'string') patch.describes = body.describes.trim();
      if (typeof body.sort === 'number' && Number.isInteger(body.sort)) patch.sort = body.sort;
      const updated = await updateRoute(name, patch);
      return updated ? ok(updated) : fail(404, 'no such delivery route');
    }
  }

  // ---- seats: change one, or remove one nobody holds ---------------------
  {
    const seat = /^\/api\/roles\/([a-z][a-z0-9_-]{2,31})$/.exec(path);
    if (seat && (req.method === 'PATCH' || req.method === 'DELETE')) {
      if (!can(who).administer) return fail(403, 'only an administrator may define seats');
      const role = seat[1];
      const existing = await seatByName(role);
      if (!existing) return fail(404, 'no such seat');

      if (req.method === 'DELETE') {
        // A seat the code names cannot go — routes, gates and the seeded
        // accounts refer to the six by name — and neither can one somebody
        // holds, or their next request would find their role missing and log
        // them out with no way back.
        if (existing.built_in) return fail(403, `${role} is a seat the product defines and cannot be removed`);
        const holders = await seatHolders(role);
        if (holders > 0) {
          return fail(409, `${holders} account${holders === 1 ? '' : 's'} hold ${role}. `
            + 'Move them to another seat first.');
        }
        await deleteSeat(role);
        return ok({ ok: true });
      }

      const body = await readJson(req, 8_192);
      if (!body) return fail(400, 'malformed request');
      // The administrator's own seat is not editable from here. Removing
      // `administer` from it is the one click that could lock every
      // administrator out of the system, and it would do so silently.
      if (role === 'admin') return fail(403, 'the administrator seat is fixed');

      const patch: { title?: string; describes?: string; caps?: Capabilities } = {};
      if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
      if (typeof body.describes === 'string' && body.describes.trim()) patch.describes = body.describes.trim();
      if (body.can !== undefined) patch.caps = capsFrom(body.can);

      // THE LAST AUTHORISER. A change waiting on the Director with nobody
      // able to authorise it is a queue that never empties, so the seat that
      // can authorise cannot have that capability taken away while it is the
      // only one — the same shape as the last-administrator guard.
      if (patch.caps && existing.may_authorise && !patch.caps.authorise) {
        const holders = await seatHolders(role);
        const authorisers = await authoriserCount();
        if (holders > 0 && authorisers - holders <= 0) {
          return fail(409, 'that would leave nobody able to authorise a change to a development');
        }
      }
      const updated = await updateSeat(role, patch);
      return updated ? ok(updated) : fail(404, 'no such seat');
    }
  }

  if (req.method === 'POST') {
    if (!mayWrite(who)) return fail(403, `role ${who.role} may not write`);

    if (path === '/api/mutations') {
      const parsed = await parseMutation(await readBody(req));
      if ('error' in parsed) return fail(400, parsed.error);
      const { mutation, sent } = parsed;
      const c = can(who);

      const denied = await mayMutate(who, mutation);
      if (denied) return fail(403, denied);

      // ---- PROPOSED, NOT APPLIED ----------------------------------------
      //
      // The acts that decide what a development IS now take two people, on
      // the owner's instruction: the PMO Controls Manager proposes and the
      // Director authorises. One sentence decides which side of the line a
      // caller is on — a seat that can authorise or administer acts directly,
      // a seat that can only approve proposes — so there is no second list of
      // roles to keep in step with the first.
      //
      // It is refused ABOVE first, deliberately. A proposal that would be
      // refused on its merits is refused now, while the person still has the
      // figures in front of them, rather than in a queue a day later.
      if (AUTHORISED_KINDS.includes(mutation.kind) && !c.authorise && !c.administer) {
        const projectId = projectOf(mutation);
        if (projectId) {
          const waiting = await pendingChangeFor(projectId);
          if (waiting) {
            return fail(409, `${projectId} already has a change waiting for authorisation `
              + `(#${waiting.id}: ${waiting.summary}). One at a time, or the second would be `
              + 'authorised against a development the first had already moved.');
          }
        }
        const reason = typeof sent.reason === 'string' ? sent.reason.trim() : '';
        if (!reason) return fail(400, 'say why this change is being asked for');
        const request = await insertChangeRequest({
          kind: mutation.kind,
          projectId,
          payload: mutation,
          summary: summarise(mutation),
          reason,
          requestedBy: who.sub,
        });
        // 202: understood, valid, and deliberately not applied.
        return { status: 202, body: { queued: true, request } };
      }

      // Checked and written under the one write lock, so two writes in
      // flight cannot each pass against a log that lacks the other.
      //
      // EVERY QUERY IN HERE IS ON `client`. The check must read inside this
      // transaction to be a check of what is about to be committed, and the
      // log read afterwards must see the row just appended — which is only
      // true on the same connection. On the deployment there is also nothing
      // else to read on: the pool holds one client and this has it.
      return await withWriteLock(async (client) => {
        // Re-checked INSIDE the lock, on its client. The check above ran on
        // the pool, outside the lock, so two requests in flight could each
        // pass it against a log that lacked the other — a certificate racing
        // a closeout landed on a closed development, and two closeouts of
        // one development could both be appended. The outer check stays for
        // the fast, useful refusal; this one is the authority.
        const deniedNow = await mayMutate(who, mutation, client);
        if (deniedNow) return fail(403, deniedNow);

        const broken = await wouldBreakIntegrity(mutation, client);
        // 422: the request was understood and refused on its merits. This is
        // the control the whole system is sold on, so it says which failed.
        if (broken) return fail(422, broken);

        await appendMutation(mutation, who.sub, client);
        return ok(await mutationLog(client));
      });
    }

    // ================= AUTHORISING A PROPOSED CHANGE =====================
    //
    // The Director's act. Approving APPLIES the payload — inside the write
    // lock, through `mayMutate` and the twenty reconciliation controls, on
    // the lock's own client — and marks the row in the same transaction, so a
    // refused mutation cannot leave a proposal marked authorised. Rejecting
    // writes the decision and nothing else.
    //
    // Re-validated at authorisation, never trusted from proposal time: the
    // position moves between the two, and a budget amendment that was sound
    // on Monday can be below the control budget by Thursday. That is the same
    // reason a period is re-checked at approval.
    {
      const decide = /^\/api\/changes\/(\d+)\/(approve|reject|withdraw)$/.exec(path);
      if (decide) {
        const id = Number(decide[1]);
        const action = decide[2] as 'approve' | 'reject' | 'withdraw';
        const body = await readJson(req, 8_192);
        if (!body) return fail(400, 'malformed request');
        const note = typeof body.note === 'string' ? body.note.trim() : '';
        if (!note) return fail(400, 'say why, in a sentence — this is the record of the decision');

        const request = await changeRequestById(id);
        if (!request) return fail(404, 'no such change request');
        if (request.state !== 'pending') {
          return fail(409, `change #${id} was already ${request.state}`);
        }

        // Withdrawing is the PROPOSER taking their own proposal back, which
        // needs no authority beyond having made it. Everything else is the
        // authorising seat's.
        if (action === 'withdraw') {
          if (request.requested_by !== who.sub && !can(who).administer) {
            return fail(403, 'only the person who proposed a change may withdraw it');
          }
          const done = await decideChangeRequest(id, 'withdrawn', who.sub, note);
          return done ? ok(done) : fail(409, 'that change was decided while you were deciding it');
        }

        if (!can(who).authorise && !can(who).administer) {
          return fail(403, `role ${who.role} may not authorise changes to a development`);
        }
        // The database refuses this too (migration 016). Said here so the
        // person gets a sentence rather than a constraint name.
        if (request.requested_by === who.sub && !can(who).administer) {
          return fail(403, 'you proposed this change and may not authorise it');
        }

        if (action === 'reject') {
          const done = await decideChangeRequest(id, 'rejected', who.sub, note);
          return done ? ok(done) : fail(409, 'that change was decided while you were deciding it');
        }

        const mutation = request.payload;

        // ---- WHOSE CAPABILITY IS RE-CHECKED, AND WHY IT IS THE PROPOSER'S --
        //
        // The act belongs to the person who proposed it. The Director's
        // authority is to LET IT THROUGH — `authorise` — not to perform it,
        // and a Director who files nothing, validates nothing and registers
        // nothing is exactly the seat the owner asked for.
        //
        // Re-checking against the authoriser instead made every proposal
        // un-authorisable unless the Director happened to hold the proposer's
        // capability as well, which is the opposite of a two-person control:
        // it would mean the second signature could only come from somebody
        // able to have done it alone.
        //
        // It is re-read NOW rather than trusted from proposal time, for the
        // same reason the reconciliation controls are: a proposer who has
        // since been withdrawn, or moved to a seat that may not do this, no
        // longer has a proposal worth authorising.
        const proposerSeat = await currentSeat(request.requested_by);
        if (!proposerSeat) {
          return fail(403, `${request.requested_by} proposed this change and no longer holds `
            + 'an active account. It cannot be authorised; propose it again.');
        }
        const proposer: Principal = {
          sub: request.requested_by, role: proposerSeat.role, caps: proposerSeat.caps,
        };

        return await withWriteLock(async (client) => {
          // Everything inside the lock, on the lock's client, including the
          // row update: two directors pressing Authorise at the same instant
          // produce one applied mutation and one 409, never two.
          const stillPending = await changeRequestById(id, client);
          if (!stillPending || stillPending.state !== 'pending') {
            return fail(409, 'that change was decided while you were deciding it');
          }
          const deniedNow = await mayMutate(proposer, mutation, client);
          if (deniedNow) {
            return fail(403, `${request.requested_by} may no longer make this change: ${deniedNow}`);
          }
          const broken = await wouldBreakIntegrity(mutation, client);
          if (broken) return fail(422, broken);

          // THE LOG NAMES THE AUTHORISER, the same rule `approveAndRecord`
          // follows for a reporting period: the entry records the moment a
          // figure entered the system and whose signature let it in. Who
          // PROPOSED it is not lost — `project_change_requests` carries the
          // proposer, the reason, the authoriser and the decision note, which
          // is the whole trail and more than the log alone could hold.
          await appendMutation(mutation, who.sub, client);
          const done = await decideChangeRequest(id, 'approved', who.sub, note, client);
          if (!done) return fail(409, 'that change was decided while you were deciding it');
          return ok({ request: done, log: await mutationLog(client) });
        });
      }
    }

    // ================= SEATS =============================================
    //
    // Defining what a role may do, from the Administration screen. The
    // administrator's act alone. `sod_exempt` is deliberately not settable
    // here — see `updateSeat` in db.ts.
    if (path === '/api/roles') {
      if (!can(who).administer) return fail(403, 'only an administrator may define seats');
      const body = await readJson(req, 8_192);
      if (!body) return fail(400, 'malformed request');
      const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
      if (!isRoleName(role)) {
        return fail(400, 'a seat name is 3 to 32 characters, lower case, starting with a letter');
      }
      if (await seatByName(role)) return fail(409, `the seat ${role} already exists`);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const describes = typeof body.describes === 'string' ? body.describes.trim() : '';
      if (!title || !describes) {
        return fail(400, 'a seat needs a name people will recognise and a line saying what it is for');
      }
      const caps = capsFrom(body.can);
      return ok(await createSeat({ role, title, describes, caps }));
    }

    // Define a portfolio, or a delivery route. The administrator's act.
    if (path === '/api/reference') {
      if (!can(who).administer) {
        return fail(403, 'only an administrator may define portfolios and delivery routes');
      }
      const body = await readJson(req, 8_192);
      if (!body) return fail(400, 'malformed request');
      const kind = body.kind === 'routes' ? 'routes' : 'portfolios';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const what = kind === 'portfolios' ? 'portfolio' : 'delivery route';
      if (name.length < 2 || name.length > 60) {
        return fail(400, `a ${what} name is 2 to 60 characters`);
      }
      const clash = kind === 'portfolios' ? await portfolioByName(name) : await routeByName(name);
      if (clash) return fail(409, `${name} already exists`);
      if (kind === 'portfolios') {
        const tone = isPortfolioTone(body.tone) ? body.tone : 'grey';
        return ok(await createPortfolio(name, tone));
      }
      const describes = typeof body.describes === 'string' ? body.describes.trim() : '';
      return ok(await createRoute(name, describes));
    }

    if (path === '/api/reset') {
      if (!can(who).administer) return fail(403, 'only an administrator may reset');
      if (!ALLOW_RESET) return fail(403, 'reset is disabled on this deployment');
      await clearMutations();
      return ok({ ok: true });
    }
  }

  return fail(404, 'no such route');
}

