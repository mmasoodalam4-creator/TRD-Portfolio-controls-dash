// ==========================================================================
// IDENTITY — a seam, not an implementation
//
// The API only needs to answer two questions: who is this, and may they write.
// `TokenVerifier` is that question. The HS256 verifier below answers it for
// development and for the test suite; a managed auth service or a corporate
// identity provider answers it in production by implementing the same
// interface, with no route changing.
//
// Written against node:crypto rather than a JWT library on purpose. Verifying
// a signed HS256 token is thirty lines, and a dependency that parses tokens
// from the network is the kind of thing worth not having.
//
// NOTE ON ROLES: the application's role switcher previews permissions; this is
// where they start being enforced. A reader cannot write, whatever the UI
// offers them.
// ==========================================================================
import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
// Relative, never '@/domain/seats': the serverless bundler does not resolve
// the path alias, and check-bundle.mjs fails the build on one that needs it.
import { NO_CAPABILITIES, type SeatCapabilities } from '../src/domain/seats.js';

export interface Principal {
  /** Stable identifier recorded against every change. */
  sub: string;
  role: Role;
  /**
   * What this seat may do, read from `role_capabilities` on THIS request.
   *
   * Absent on a principal that has only been through the token verifier — a
   * token proves who, never what they may do, so the capabilities are looked
   * up beside the role on every authenticated request and attached here. A
   * route that finds them absent gets the built-in fallback below, which is
   * the shipped answer for the six seats the product defines.
   */
  caps?: Capabilities;
}

/**
 * A role is a NAME now, not a closed union.
 *
 * The six seats the product ships are below and the code refers to some of
 * them by name, but the administrator may define more from the Administration
 * screen (migration 015) — so the type cannot be a union without a deploy
 * standing between the owner and their own access model. What a seat may do
 * is `Capabilities`, read from the database, and that is what every route
 * asks; the name is for the audit trail and the screens.
 */
export type Role = string;

/** The seats the product defines. They may be edited; they may not be deleted. */
export const ROLES: readonly Role[] = [
  'contributor', 'reviewer', 'approver', 'director', 'reader', 'admin',
];

/**
 * A syntactically valid role name.
 *
 * It cannot be a membership test any more — a custom seat is a real role — so
 * it is the shape the database constrains (`role_name_shape` in migration
 * 015). Whether a name EXISTS is answered by the per-request lookup, which
 * refuses an account whose seat has gone.
 */
export const isRoleName = (v: unknown): v is Role =>
  typeof v === 'string' && /^[a-z][a-z0-9_-]{2,31}$/.test(v);

/**
 * What a role may do.
 *
 * ONE SHAPE, defined in `src/domain/seats.ts` and imported here as a type.
 * The browser reads the same interface off `/api/me`, the database holds the
 * same five columns, and `capsOf` in db.ts maps one onto the other — so the
 * sidebar, the route and the trigger cannot mean different things by
 * "approve". A second declaration on this side would have been a copy free to
 * drift the first time a sixth capability was added.
 *
 * Capabilities rather than a single write flag, because "may write" is the
 * question that loses the distinction this system exists to enforce: a
 * reviewer writes (a review) but must never input, and an approver writes (an
 * approval) but must never input either.
 *
 * NOTE what is NOT here. Nothing in this table says an approver may not
 * approve their own submission. That rule is not a capability — it depends on
 * who submitted the row — and it lives in the database as a trigger, where no
 * role, admin included, can waive it.
 */
export type Capabilities = SeatCapabilities;

/** No capability at all — what an unknown seat is worth. */
export { NO_CAPABILITIES };

/**
 * The shipped answer for the six built-in seats.
 *
 * A FALLBACK, not the enforcement: `role_capabilities` in the database is,
 * and the per-request lookup attaches it to the principal. This table is what
 * answers before that lookup has run (the offline build, a unit test, a
 * principal minted by hand) and what a deployment falls back to if the seat
 * has somehow lost its row. It matches the rows migration 015 inserts, and
 * `check:duties` proves the database agrees with it.
 */
const BUILT_IN: Record<string, Capabilities> = {
  contributor: { ...NO_CAPABILITIES, input: true },
  reviewer: { ...NO_CAPABILITIES, review: true },
  approver: { ...NO_CAPABILITIES, approve: true },
  director: { ...NO_CAPABILITIES, authorise: true },
  reader: { ...NO_CAPABILITIES },
  admin: { input: true, review: true, approve: true, authorise: true, administer: true },
};

export const can = (p: Principal): Capabilities =>
  p.caps ?? BUILT_IN[p.role] ?? NO_CAPABILITIES;

/**
 * Whether this principal may change data at all.
 *
 * Retained because several routes only need the coarse question. Anything
 * that distinguishes the stages must ask `can()` instead.
 */
export const mayWrite = (p: Principal): boolean => {
  const c = can(p);
  return c.input || c.review || c.approve || c.authorise || c.administer;
};

export interface TokenVerifier {
  /** The principal, or null if the token is absent, malformed or expired. */
  verify(token: string): Principal | null;
}

const b64url = (b: Buffer): string => b.toString('base64url');

const isRole = isRoleName;

/**
 * Symmetric-key verifier.
 *
 * Adequate for a single API that both mints and checks its own tokens. A
 * provider issuing asymmetric tokens would supply a verifier checking RS256
 * against a published key set — same interface, different constructor.
 */
export class Hs256Verifier implements TokenVerifier {
  constructor(private readonly secret: string) {
    if (!secret) throw new Error('AUTH_SECRET is required');
  }

  sign(principal: Principal, ttlSeconds = 3600): string {
    const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const body = b64url(Buffer.from(JSON.stringify({
      ...principal,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    })));
    return `${header}.${body}.${this.mac(`${header}.${body}`)}`;
  }

  verify(token: string): Principal | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts as [string, string, string];

    const expected = Buffer.from(this.mac(`${header}.${body}`));
    const given = Buffer.from(signature);
    // Constant-time, and length-checked first because timingSafeEqual throws
    // on a length mismatch rather than returning false.
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    try {
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as unknown;
      if (typeof claims !== 'object' || claims === null) return null;
      const { sub, role, exp } = claims as Record<string, unknown>;
      if (typeof sub !== 'string' || !isRole(role)) return null;
      if (typeof exp !== 'number' || exp * 1000 < Date.now()) return null;
      return { sub, role };
    } catch {
      return null;
    }
  }

  private mac(input: string): string {
    return createHmac('sha256', this.secret).update(input).digest('base64url');
  }
}

/** Pull the bearer token out of an Authorization header. */
export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

// -------------------------------------------------------------- passwords
//
// scrypt, from node:crypto. Deliberately slow and memory-hard, so a stolen
// table is not a list of passwords. The salt is per user and stored beside the
// hash; the format names its own algorithm so a later migration can be done
// row by row rather than all at once.

const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

/**
 * Constant-time verification.
 *
 * Returns false rather than throwing for a malformed stored value: a corrupt
 * row must not become a way to crash the login route.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, keyHex] = parts as [string, string, string];

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    // Asynchronous: the synchronous form holds the event loop for the whole
    // derivation, so a burst of sign-in attempts stalls every other request
    // on the self-hosted server.
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, expected.length, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * A hash to verify against when the account does not exist.
 *
 * The login route returns the same message for an unknown address and a
 * wrong password. But if it only ran scrypt for known addresses, a known one
 * would answer tens of milliseconds slower than an unknown one, and the
 * message would be uniform while the timing told the truth. So an unknown
 * address is verified against this — same cost, same answer.
 */
export const DUMMY_HASH: string = hashPassword('not-a-real-password');
