// ==========================================================================
// WHAT A SEAT MAY DO
//
// Until migration 015 the roles were a CHECK constraint on `users.role` and a
// constant table in server/auth.ts, and what each may do was written into the
// separation-of-duties trigger BY NAME. Adding a seat, or changing what one
// may do, meant a migration and a deploy — which put the owner's own access
// model behind a developer, exactly as replacing the placeholder development
// names once did.
//
// Seats are now rows in a table an administrator edits, and this is the shape
// those rows carry. It lives in `domain/` rather than `data/` because it is
// part of the model: the database holds it, the server enforces it, the API
// serves it and the sidebar reads it, and all four must mean the same thing.
//
// FIVE FLAGS, NOT ONE "MAY WRITE". A reviewer writes — a review — and must
// never input; an approver writes an approval and must never input either. A
// single flag would lose exactly the distinction this system exists to
// enforce.
//
// None of this is the enforcement. The server refuses on its own, and the
// DATABASE refuses behind it: `assert_separation_of_duties` reads these same
// flags, so a rule holds against a script, a migration or a hand-edited row,
// not only against the API. What these types decide is which controls are
// worth showing a person.
// ==========================================================================

export interface SeatCapabilities {
  /** Files reporting periods and records certificates, for assigned developments. */
  input: boolean;
  /** Validates a filed period, or returns it. Never its own input. */
  review: boolean;
  /** Approves a validated period and a claim, and PROPOSES changes to a development. */
  approve: boolean;
  /** Authorises a proposed change to a development before it takes effect. */
  authorise: boolean;
  /** Issues accounts, defines seats, and acts without a second person. */
  administer: boolean;
}

/** Every capability, in the order a person works through them. */
export const CAPABILITY_KEYS: readonly (keyof SeatCapabilities)[] = [
  'input', 'review', 'approve', 'authorise', 'administer',
];

/**
 * A seat with nothing on it.
 *
 * The default whenever capabilities are ABSENT — an unrecognised seat, a
 * deployment that has not been updated, a response missing the field. Offering
 * nothing is the safe direction: the alternative is a screen full of buttons
 * the server will refuse.
 */
export const NO_CAPABILITIES: SeatCapabilities = {
  input: false, review: false, approve: false, authorise: false, administer: false,
};

/**
 * Everything, which is what the self-contained build believes it may do.
 *
 * There is no sign-in there and there must never be, so there is nobody to
 * refuse — the pixel gates see every module and every button, exactly as they
 * always have.
 */
export const ALL_CAPABILITIES: SeatCapabilities = {
  input: true, review: true, approve: true, authorise: true, administer: true,
};
