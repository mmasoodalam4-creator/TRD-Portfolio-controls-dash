// ==========================================================================
// MUTATION VALIDATION
//
// Every mutation reaches the log through one of two routes, and until now
// both checked only that `kind` was known and `at` was a string. Everything
// else was `value as Mutation`, which meant:
//
//   - numeric fields sent as strings CONCATENATED inside the replay
//     (0 + "5" + "6" is "056"), and the project record left the server
//     carrying strings;
//   - `packages: null` reached positionFromPackages and became a 500;
//   - a mutation naming a development that does not exist was a no-op that
//     was nevertheless appended to the audit log;
//   - a negative certificate passed every reconciliation control, because for
//     a touched development the registers are re-derived FROM the project.
//
// The controls check that figures agree with each other. They cannot check
// that a figure is a number, or a riyal amount is not negative, or a
// portfolio is one of the four. That is this file's job, and it runs before
// the controls do. It is hand-written because the codebase carries no
// validation dependency and the shapes are few and fixed.
// ==========================================================================
import { retentionProblem } from '../src/domain/retention.js';
import type { Mutation } from '../src/data/mutations.js';
import type { CategoryInput, PackageInput } from '../src/domain/types.js';
import { parseDate } from '../src/domain/calendar.js';

/**
 * WHAT THE DEPLOYMENT ACTUALLY HOLDS, passed in.
 *
 * These were two constants here — four portfolio names and two route names —
 * and they were the last copy of a list that also lived in a union type, a
 * colour map on two screens and a JSON array in the corporate table. Since
 * migration 017 they are rows an administrator edits, so this file cannot
 * know them: it is handed them, exactly as it is handed the developments the
 * position currently holds.
 *
 * A validator with its own idea of the four would refuse a portfolio somebody
 * added this morning, from a form that offered it.
 */
export interface Vocabulary {
  portfolios: ReadonlySet<string>;
  routes: ReadonlySet<string>;
}

/**
 * A value as a short label, for a refusal that names what was actually sent.
 *
 * Guarded rather than `String(v)`: an object interpolated into a sentence
 * reads "[object Object] is not a portfolio this system holds", which tells
 * the person nothing and puts their payload's shape in a log line.
 */
const shown = (v: unknown): string =>
  (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60)
    : typeof v === 'number' ? String(v) : 'that value');

/** Whole riyals, and never more than the Postgres bigint the column holds. */
const MAX_SAR = 9_000_000_000_000;
const PROJECT_ID = /^[A-Z]{3}-\d{2}$/;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const money = (v: unknown, field: string): string | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${field} must be a number`;
  if (v < 0) return `${field} cannot be negative`;
  if (v > MAX_SAR) return `${field} is beyond any plausible amount`;
  return null;
};

const fraction = (v: unknown, field: string): string | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${field} must be a number`;
  if (v < 0 || v > 1) return `${field} must be between 0% and 100%`;
  return null;
};

const text = (v: unknown, field: string, max = 200): string | null => {
  if (typeof v !== 'string') return `${field} must be text`;
  if (v.length > max) return `${field} is too long`;
  return null;
};

/**
 * Text that must actually say something.
 *
 * `text` accepts "" — every id and name it guards is non-empty in practice, so
 * nothing had shown it up. The notes are different: a note is the ONLY part of
 * archiving, closing out or reopening that a reader a year later cannot
 * reconstruct, and an empty one is an audit entry that records the act and
 * loses the reason. The screens have always required it; the server was
 * accepting it, which meant anything posting straight at the API could file a
 * closure that explained nothing. Found by the gate written for `project:close`
 * and fixed for all three.
 */
const reason = (v: unknown, field: string, max = 2000): string | null =>
  text(v, field, max) ?? (String(v).trim() ? null : `${field} is required`);

const first = (...checks: (string | null)[]): string | null => checks.find((c) => c !== null) ?? null;

/**
 * A reference that must actually name something.
 *
 * The same rule as `reason`, applied to identifiers. `text` accepts "", so a
 * variation approval naming no variation, a transfer settling claim "", or a
 * claim verified by nobody was accepted and appended — a permanent audit
 * entry that changed nothing, which is exactly the kind of log entry the
 * `project:update` "nothing to change" refusal exists to keep out.
 */
const ref = (v: unknown, field: string, max = 200): string | null =>
  text(v, field, max) ?? (String(v).trim() ? null : `${field} is required`);

function packageInput(k: unknown, i: number): string | null {
  if (!isObj(k)) return `package ${i + 1} is not an object`;
  const at = `package ${i + 1}`;
  return first(
    text(k.code, `${at} code`, 20),
    text(k.name, `${at} name`),
    text(k.phase, `${at} phase`),
    money(k.budget, `${at} budget`),
    fraction(k.plannedPct, `${at} planned %`),
    fraction(k.actualPct, `${at} actual %`),
    money(k.cost, `${at} cost`),
    money(k.committed, `${at} committed`),
  );
}

function categoryInput(c: unknown, i: number): string | null {
  if (!isObj(c)) return `category ${i + 1} is not an object`;
  const at = `category ${i + 1}`;
  return first(
    text(c.cat, `${at} name`),
    money(c.budget, `${at} budget`),
    money(c.committed, `${at} committed`),
    money(c.actual, `${at} actual`),
    money(c.afc, `${at} AFC`),
  );
}

const ROLES = [
  'Main Contractor', 'Trade Contractor', 'Supplier',
  'PMC', 'Design Consultant', 'Verification Consultant',
];

/**
 * One contract row — the shape registration accepts, and the shape a recorded
 * package or an award carries. One spelling, so the two doors cannot drift
 * into accepting different contracts.
 */
function contractInput(row: unknown): string | null {
  if (!isObj(row)) return 'each contract must be an object';
  const rate = row.retention;
  return first(
    ref(row.id, 'package number', 40),
    ref(row.name, 'contract scope', 200),
    text(row.wbs, 'WBS code', 20),
    ref(row.contractor, 'contractor', 200),
    ROLES.includes(row.role as string) ? null : `role must be one of: ${ROLES.join(', ')}`,
    money(row.value, 'award value'),
    typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100
      ? 'retention must be a percentage between 0 and 100' : null,
    row.awarded === null || (typeof row.awarded === 'string' && row.awarded.length <= 40)
      ? null : 'award date must be a date or null',
  );
}

/**
 * The work breakdown a development is registered with.
 *
 * Package budgets become the control budget, so they may not exceed the
 * approved budget — control 13 would refuse the development the moment it
 * existed, and refusing it here says why instead.
 */
function checkCreatePackages(value: unknown, budget: number): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return 'packages must be a list';
  if (value.length > 400) return 'at most 400 work packages';
  let total = 0;
  for (const row of value) {
    if (!isObj(row)) return 'each package must be an object';
    const err = first(
      text(row.code, 'package code', 20),
      text(row.name, 'package name', 200),
      money(row.budget, 'package budget'),
    );
    if (err) return err;
    total += row.budget as number;
  }
  return total > budget
    ? `work packages total ${total} against an approved budget of ${budget}`
    : null;
}

/**
 * What has been awarded. Only awarded rows commit the owner, so only those are
 * measured against the budget: a package out to tender carries an estimate and
 * promises nobody anything.
 */
function checkCreateContracts(value: unknown, budget: number): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return 'contracts must be a list';
  if (value.length > 400) return 'at most 400 contract packages';
  let awarded = 0;
  for (const row of value) {
    const err = contractInput(row);
    if (err) return err;
    const r = row as Obj;
    if (r.awarded !== null) awarded += r.value as number;
  }
  return awarded > budget
    ? `awarded packages total ${awarded} against an approved budget of ${budget}`
    : null;
}

/**
 * The reason this is not a valid mutation, or null if it is.
 *
 * `knownProjects` is the set of developments the position currently holds;
 * a mutation naming any other is refused rather than recorded as a no-op.
 * `project:create` is the one kind that introduces an id, and it must be new.
 */
export function validateMutation(
  value: unknown, knownProjects: ReadonlySet<string>, vocabulary: Vocabulary,
): string | null {
  const { portfolios: PORTFOLIOS, routes: ROUTES } = vocabulary;
  if (!isObj(value)) return 'not an object';
  const { kind, at } = value;

  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return 'at must be an ISO date';

  if (kind === 'ipc') {
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      money(value.certified, 'certified'),
      (value.certified as number) <= 0 ? 'a certificate must certify more than nothing' : null,
      money(value.retention, 'retention'),
      (value.retention as number) > (value.certified as number) ? 'retention cannot exceed the certified value' : null,
      ref(value.reference, 'reference', 40),
    );
  }

  if (kind === 'claim:record') {
    // The retention AMOUNT is never accepted from the caller: it is the rate
    // applied to the approved figure, so the two cannot be typed
    // inconsistently with each other.
    const rate = value.retentionRate;
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      ref(value.packageId, 'packageId', 20),
      ref(value.milestone, 'milestone', 200),
      money(value.claimed, 'claimed'),
      (value.claimed as number) <= 0 ? 'a claim must be for more than nothing' : null,
      money(value.verified, 'verified'),
      money(value.approved, 'approved'),
      ref(value.verifiedBy, 'verifiedBy', 120),
      ref(value.verifiedOn, 'verifiedOn', 10),
      ref(value.verifiedRef, 'verifiedRef', 40),
      ref(value.reference, 'reference', 40),
      typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100
        ? 'retentionRate must be a percentage between 0 and 100' : null,
      (value.verified as number) > (value.claimed as number)
        ? 'a consultant cannot verify more than was claimed' : null,
      (value.approved as number) > (value.verified as number)
        ? 'an approval cannot exceed what the consultant verified' : null,
    );
  }

  // A CONFIRMED TRANSFER. Only the amount, the date and the reference — the
  // claim id travels as a reference for the audit trail, and nothing about the
  // claim's own arithmetic is accepted here, because the register derives it.
  if (kind === 'claim:pay') {
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      ref(value.claimId, 'claimId', 40),
      money(value.amount, 'amount'),
      (value.amount as number) <= 0 ? 'a confirmed payment must be for more than nothing' : null,
      ref(value.valueDate, 'valueDate', 40),
      ref(value.reference, 'reference', 40),
    );
  }

  // RECORDING OR AWARDING A CONTRACT PACKAGE after registration. The row is
  // the same shape registration accepts; whether it is sound against the
  // development's current contracts (a number already awarded, an award past
  // the budget) is checked at the route, where the position is to hand.
  if (kind === 'contract:award') {
    const c = isObj(value.contract) ? value.contract : null;
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      contractInput(value.contract),
      c !== null && typeof c.value === 'number' && c.value > 0
        ? null : 'a contract package must carry a value greater than nothing',
    );
  }

  if (kind === 'variation:approve') {
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      ref(value.no, 'variation number', 20),
    );
  }

  // Archiving, closing out and reopening all carry a required note. It is the
  // only part of any of them that a reader a year later actually needs: the
  // date and the actor are recorded by the log itself, and what nobody can
  // reconstruct is WHY.
  if (kind === 'project:close' || kind === 'project:reopen') {
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      reason(value.note, 'note'),
    );
  }

  // DELETING carries its retention window. Optional in the SHAPE because the
  // change log holds archives filed before retention existed and a replay
  // must still read them; required by the route, which is where a new act is
  // refused without one. Bounds are `domain/retention.ts`, so the browser and
  // the server cannot disagree about what thirty days means.
  if (kind === 'project:archive') {
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      reason(value.note, 'note'),
      value.retainDays === undefined ? null : retentionProblem(value.retainDays),
    );
  }

  // An amendment to a development's DESCRIPTION. Every field is optional
  // because correcting a spelling should not require restating the budget —
  // but at least one must be present, or the change log would carry an entry
  // that changed nothing and the audit trail would be noise.
  //
  // No field here is a reported figure. Actual cost, earned value, certified
  // and paid are the product of periods and certificates that were entered,
  // reviewed and approved; a form that could overwrite them would be a way
  // around the workflow, so this route simply does not accept them.
  if (kind === 'project:update') {
    const err = first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      reason(value.note, 'note'),
      value.name === undefined ? null : text(value.name, 'project name'),
      value.pmc === undefined ? null : text(value.pmc, 'delivery partner', 200),
      value.portfolio === undefined || PORTFOLIOS.has(value.portfolio as string)
        ? null : `${shown(value.portfolio)} is not a portfolio this system holds`,
      value.route === undefined || ROUTES.has(value.route as string)
        ? null : `${shown(value.route)} is not a delivery route this system holds`,
      value.budget === undefined ? null : money(value.budget, 'budget'),
      value.budget === undefined || (value.budget as number) > 0
        ? null : 'budget must be greater than zero',
      // The programme dates must be dates the calendar can actually cut
      // against — a start the year strip cannot parse is a start that
      // silently never happened.
      value.start === undefined ? null : first(
        text(value.start, 'start', 40),
        parseDate(value.start as string) !== null ? null : 'start must be a date, e.g. 2025-08-01',
      ),
      value.finish === undefined ? null : first(
        text(value.finish, 'planned finish', 40),
        parseDate(value.finish as string) !== null ? null : 'planned finish must be a date, e.g. 2026-08-01',
      ),
      value.start !== undefined && value.finish !== undefined
        && (parseDate(value.finish as string) ?? 0) <= (parseDate(value.start as string) ?? 0)
        ? 'the planned finish must come after the start' : null,
    );
    if (err) return err;
    const touched = ['name', 'portfolio', 'route', 'pmc', 'budget', 'start', 'finish']
      .some((k) => value[k] !== undefined);
    return touched
      ? null
      : 'nothing to change: name, portfolio, route, delivery partner, budget or programme dates';
  }

  if (kind === 'project:restore') {
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      value.note === undefined ? null : reason(value.note, 'note'),
    );
  }

  // A permanent removal takes a development out of the replay. The note is
  // the only thing a reader will have left, so it is required — the same rule
  // archiving, closing and amending follow.
  if (kind === 'project:delete') {
    return first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      value.note === undefined ? null : reason(value.note, 'note'),
    );
  }

  if (kind === 'project:create') {
    const p = value.project;
    if (!isObj(p)) return 'project is required';
    return first(
      text(p.id, 'project id', 10),
      PROJECT_ID.test(p.id as string) ? null : 'project id must look like RES-01',
      knownProjects.has(p.id as string) ? `development ${String(p.id)} already exists` : null,
      text(p.name, 'project name'),
      PORTFOLIOS.has(p.portfolio as string)
        ? null : `${shown(p.portfolio)} is not a portfolio this system holds`,
      ROUTES.has(p.route as string)
        ? null : `${shown(p.route)} is not a delivery route this system holds`,
      money(p.budget, 'budget'),
      (p.budget as number) > 0 ? null : 'budget must be greater than zero',
      checkCreatePackages(value.packages, p.budget as number),
      checkCreateContracts(value.contracts, p.budget as number),
    );
  }

  if (kind === 'period:submit') {
    const err = first(
      text(value.projectId, 'projectId', 10),
      knownProjects.has(value.projectId as string) ? null : `no such development ${String(value.projectId)}`,
      Number.isInteger(value.period) && (value.period as number) >= 1 && (value.period as number) <= 999
        ? null : 'period must be a whole number from 1 to 999',
      text(value.dataDate, 'data date', 40),
      money(value.budget, 'budget'),
      money(value.control, 'control budget'),
      money(value.afc, 'AFC'),
      Array.isArray(value.packages) && value.packages.length > 0 ? null : 'at least one work package is required',
      Array.isArray(value.categories) && value.categories.length > 0 ? null : 'at least one cost category is required',
    );
    if (err) return err;
    const packages = value.packages as unknown[];
    const categories = value.categories as unknown[];
    if (packages.length > 500) return 'too many work packages';
    if (categories.length > 200) return 'too many cost categories';
    for (let i = 0; i < packages.length; i++) {
      const e = packageInput(packages[i], i);
      if (e) return e;
    }
    for (let i = 0; i < categories.length; i++) {
      const e = categoryInput(categories[i], i);
      if (e) return e;
    }
    return null;
  }

  return 'not a recognised mutation';
}

/** A validated value, typed. Call only after validateMutation returned null. */
/** The fields each kind is allowed to carry into the log. */
const MUTATION_FIELDS: Record<string, readonly string[]> = {
  'ipc': ['kind', 'at', 'projectId', 'certified', 'retention', 'reference'],
  'claim:record': ['kind', 'at', 'projectId', 'packageId', 'milestone', 'claimed',
    'verifiedBy', 'verifiedOn', 'verifiedRef', 'verified', 'approved', 'retentionRate', 'reference'],
  'claim:pay': ['kind', 'at', 'projectId', 'claimId', 'amount', 'valueDate', 'reference'],
  'contract:award': ['kind', 'at', 'projectId', 'contract'],
  'variation:approve': ['kind', 'at', 'projectId', 'no'],
  'project:create': ['kind', 'at', 'project', 'packages', 'contracts'],
  'project:update': ['kind', 'at', 'projectId', 'name', 'portfolio', 'route', 'pmc', 'budget',
    'start', 'finish', 'note'],
  'project:archive': ['kind', 'at', 'projectId', 'note', 'retainDays'],
  'project:restore': ['kind', 'at', 'projectId', 'note'],
  'project:close': ['kind', 'at', 'projectId', 'note'],
  'project:reopen': ['kind', 'at', 'projectId', 'note'],
  'project:delete': ['kind', 'at', 'projectId', 'note'],
  'period:submit': ['kind', 'at', 'projectId', 'period', 'dataDate', 'budget', 'control',
    'afc', 'packages', 'categories'],
};

/**
 * The validated body, with everything the kind does not define DROPPED.
 *
 * The log is permanent and replayed for ever. A bare cast stored the whole
 * request body, so any writing seat could append a megabyte of arbitrary JSON
 * per call — junk the audit trail carries to every future reader, and weight
 * every future write pays for inside the lock. Validation has already
 * checked the fields that matter; this keeps the record to exactly them.
 */
export const asMutation = (value: unknown): Mutation => {
  const v = value as Record<string, unknown>;
  const allowed = MUTATION_FIELDS[String(v.kind)];
  if (!allowed) return value as Mutation;
  const kept: Record<string, unknown> = {};
  for (const k of allowed) if (v[k] !== undefined) kept[k] = v[k];
  return kept as unknown as Mutation;
};

export type { PackageInput, CategoryInput };


// ------------------------------------------------------------- accounts

/**
 * A password long enough to be worth hashing.
 *
 * Length, not a character-class rule. Composition rules push people towards
 * "Passw0rd!" and a pattern a person can remember; length is what actually
 * costs an attacker, and it is the one requirement somebody can satisfy with
 * a phrase rather than a puzzle.
 */
export function checkPassword(value: unknown): string | null {
  if (typeof value !== 'string') return 'a password is required';
  if (value.length < 12) return 'a password must be at least 12 characters';
  if (value.length > 200) return 'a password may be at most 200 characters';
  if (value.trim().length === 0) return 'a password cannot be only spaces';
  return null;
}

/** A person's display name, which every screen shows beside what they did. */
export function checkPersonName(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return 'a name is required';
  if (value.trim().length > 80) return 'a name may be at most 80 characters';
  return null;
}

/** An email that can serve as an identity. Deliberately permissive on shape. */
export function checkEmail(value: unknown): string | null {
  if (typeof value !== 'string') return 'an email address is required';
  const email = value.trim();
  if (email.length < 6 || email.length > 160) return 'an email address is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'that does not look like an email address';
  return null;
}

/**
 * A profile picture, as a small square data URI.
 *
 * The browser resizes before it sends; this is the boundary refusing anything
 * that arrives anyway. 192 kB of base64 is roughly a 256 pixel JPEG with room
 * to spare, and the column carries the same limit so neither side is the only
 * thing standing between a photograph and the users table.
 */
export function checkAvatar(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return 'a picture must be a data URI or null';
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    return 'a picture must be a PNG, JPEG or WebP data URI';
  }
  if (value.length > 196_608) return 'that picture is too large; it should be under 140 kB';
  return null;
}
