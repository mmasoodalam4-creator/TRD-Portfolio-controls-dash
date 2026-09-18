# API contract

This document, not the code, is what keeps the database vendor an open decision.

The application talks to an origin that implements the endpoints below over plain
HTTP and JSON. It does not know or care what is behind them. Anything that
implements this contract — the Node handler in `server/` against Supabase, the
same handler against a cluster on our own tenant, or an entirely different
implementation — can serve the application without a single change to `src/`.

`eslint.config.js` enforces the other half: no database, cloud-vendor or model
SDK may be imported anywhere in `src/`. If that rule ever has to be relaxed, the
vendor has stopped being a deployment decision.

---

## Selecting a backend

One build-time variable, read in exactly one place (`src/data/repository.ts`):

| `VITE_API_URL` | Repository | Result |
| --- | --- | --- |
| unset | `MockRepository` | The portable `dist/index.html`. Fixtures, browser-local changes, **zero network requests**, no sign-in. |
| `/` | `HttpRepository` | The platform build, against the same origin the page is served from. **The value to use on Vercel.** |
| `https://host` | `HttpRepository` | The platform build against a separate API host. CORS applies; set `ALLOWED_ORIGIN`. |

The offline deliverable is therefore not a separate codebase or a stripped
build — it is this contract not being used.

## Authentication

Every endpoint except `/api/health` and `POST /api/auth/login` requires:

```
Authorization: Bearer <token>
```

The reference implementation issues and verifies an HS256 JWT with claims `sub`
(the account id), `role` and `exp` (default eight hours, `TOKEN_TTL_SECONDS`).
**The role in the token is not trusted for its lifetime**: every authenticated
request reads the account's current role from the `users` table, so a demoted
or removed person loses the capability on their next request, not when the
token expires. A token for an account that no longer exists is `401`.

Passwords are stored as scrypt hashes with a per-account salt. An unknown
address and a wrong password produce the same `401` and cost the same scrypt
derivation, so neither the message nor the timing reveals which addresses exist.

### Seats and capabilities

**A seat is a row, not a name in the code.** `role_capabilities`
(`db/migrations/015`) holds every seat and the five things it may carry, and
an administrator edits it through `/api/roles`. The capabilities are read on
every authenticated request, so a change takes effect on the next call rather
than when a token expires — the token proves WHO, the table says what they may
do NOW.

| Capability | What it admits |
| --- | --- |
| `input` | Enter periods and record certificates, **assigned developments only** |
| `review` | Validate a filed period, or return it |
| `approve` | Approve a validated period, a claim and a variation; confirm a payment; and **propose** a change to a development |
| `authorise` | **Authorise** a proposed change to a development |
| `administer` | Issue accounts, define seats, reset; and act without a second person |

The six seats the product ships with:

| Seat | `input` | `review` | `approve` | `authorise` | `administer` |
| --- | --- | --- | --- | --- | --- |
| `contributor` | yes | — | — | — | — |
| `reviewer` | — | yes | — | — | — |
| `approver` | — | — | yes | — | — |
| `director` | — | — | — | yes | — |
| `reader` | — | — | — | — | — |
| `admin` | yes | yes | yes | yes | yes |

Missing or malformed token → `401`. Valid token, insufficient capability →
`403`.

**Separation of duties is enforced in the database, not here.** Whatever the
seat — admin included — the person who entered a period can never validate or
approve it, the person who validated it can never approve it, and the person
who proposed a change to a development can never authorise it. Those are
triggers on `period_submissions` and `project_change_requests`
(`db/migrations/015` and `016`) reading the same capability flags, and they
surface through this API as `409` with the rule named. `server/auth.ts` mirrors
the capabilities so routes can refuse early with a useful message; that mirror
is a convenience, never the enforcement.

Exemption from separation of duties (`sod_exempt`) is the `admin` seat's and
nobody else's, and it is **never settable through this API** — not by
`POST /api/roles` and not by `PATCH`. Changing it is a migration.

## Endpoints

### Public

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ "ok": true }`. Touches nothing. |
| POST | `/api/auth/login` | `{ token, user: { id, email, name, role } }` for `{ email, password }`; `401` otherwise. Body limit 4 KB. |

### Reading the position

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/me` | The principal, its capabilities, and the developments it is assigned. |
| GET | `/api/projects` | `Project[]`, **in the shipped order**, with the mutation log replayed. |
| GET | `/api/projects/:id` | `Project`, or `404`. |
| GET | `/api/registers/:projectId` | `ProjectRegisters`, or `404` for an unknown development. |
| GET | `/api/corporate` | `CorporateData`. `500` if the seed is incomplete — the gap is named in the server log. |
| GET | `/api/mutations` | `Mutation[]`, oldest first. The audit trail. |

Order matters on `/api/projects`: the roll-ups and the project list render in
the shipped order, which is not alphabetical by id. The reference schema stores
it in a `seq` column rather than inferring it.

### The reporting-period workflow

A period is entered by one person, validated by a second, approved by a third.
It is **not** part of the reported position until approval.

| Method | Path | Who | Effect |
| --- | --- | --- | --- |
| GET | `/api/periods` | anyone signed in | Every submission with its state and provenance. |
| POST | `/api/periods` | contributor (assigned), admin | Files a `period:submit` mutation as a submission. Refused `400` if malformed, `422` if it would not reconcile, `403` if not assigned, `409` if a validated or approved submission for that period already exists (a returned or awaiting one is replaced). |
| POST | `/api/periods/:id/review` | reviewer, admin — never the submitter | `submitted → reviewed`. |
| POST | `/api/periods/:id/approve` | approver, admin — never the submitter or the reviewer | `reviewed → approved`, **and** the period is appended to the mutation log, in one transaction. Re-checked against the position as it stands now, `422` if it no longer reconciles. |
| POST | `/api/periods/:id/return` | reviewer, approver, admin — never the submitter | `submitted/reviewed → returned`, with `{ "note": "why" }` (required) and who returned it. |
| POST | `/api/periods/parse?project=ID` | contributor, admin | Reads a filled PT_TEMPLATE `.xlsx`/`.xlsm` sent as `{ "file": "<base64>" }` (≤ 4 MB) and returns the period it describes. **Files nothing.** `422` names the row that moved if the sheet's structure has drifted. |

`409` from the workflow routes carries the separation-of-duties rule that
refused, in plain words. `422` names the reconciliation controls that would
fail.

### Other writes

| Method | Path | Who | Effect |
| --- | --- | --- | --- |
| POST | `/api/mutations` | see per kind | Appends one mutation; returns the whole log. |
| POST | `/api/reset` | admin, and only when `ALLOW_RESET=1` | Truncates the log. Off by default on any real deployment. |

Per kind on `/api/mutations`:

| Kind | Who | Validation |
| --- | --- | --- |
| `ipc` | contributor for an assigned development; admin | `certified ≥ retention ≥ 0`, known development, reference ≤ 40 chars. Moves certified and paid only. |
| `variation:approve` | approve or administer | Known development, variation number. Changes the variation's status; committed cost follows the next period. |
| `project:create` | approve or administer | Id like `RES-01` and new; a portfolio and a delivery route THIS DEPLOYMENT HOLDS (`/api/reference`), named in the refusal if not; budget > 0. Package budgets become the control budget and may not exceed the approved budget; only awarded contracts reach committed cost. |
| `project:update` | approve or administer | Known development; a `note`; at least one of `name`, `portfolio`, `route`, `pmc`, `budget`, `start`, `finish`, and **nothing else** — no reported figure is accepted through this route. A budget below the development's control budget is `403` with that sentence; a programme date must parse as a date, and the finish must come after the start. |
| `contract:award` | approve or administer | Known development; one `contract` row (the registration shape: id, name, wbs, contractor, role, value > 0, retention 0–100, awarded date or null). A new id appends a package — tendered when `awarded` is null; an existing tendered id is awarded, replacing the estimate. Refused with a sentence when the id names a stored row, is already awarded, or the award would take committed cost past the approved budget. Only an award moves committed. |
| `project:archive` | approve, authorise or administer | Known development that is not already deleted; a `note`; and `retainDays` — a whole number of days, **at least 30** and at most 730 (`src/domain/retention.ts`, which the browser reads too). The development leaves every read; it carries `archivedAt` and `retainUntil`. |
| `project:restore` | approve, authorise or administer | A deleted development still inside its retention window; an optional `note`. Past the window it is `403` naming the date. Restoring DELETES `archived`, `archivedAt` and `retainUntil` rather than setting them false, so a restored development is indistinguishable from one never deleted. |
| `project:delete` | approve or administer; **administer alone** once it has reported anything | Permanent. Allowed on a development that never reported anything, and on one whose retention window has CLOSED — the second only for `administer`. Inside the window it is `403` naming the retention period. Carries a `note`: it is the only thing a reader will have left. |
| `claim:record` | approve or administer | Approved ≤ verified ≤ claimed; `retentionRate` 0–100 and the retention AMOUNT never accepted from the caller. |
| `period:submit` | **nobody** | Refused `403`. Periods go through `/api/periods`. |

### `202` — proposed, not applied

Eight of those kinds decide what a development IS: `project:create`,
`project:update`, `project:archive`, `project:restore`, `project:close`,
`project:reopen`, `project:delete` and `contract:award`. **One sentence
decides whether a caller performs one or proposes it: a seat that can
`authorise` or `administer` acts directly; a seat that can only `approve`
proposes.**

A proposal answers `202` with `{queued: true, request}` and requires a
non-empty `reason` alongside the mutation (the field is stripped before the
mutation is stored, so it never travels into the change log as part of the
act). A proposal that would be refused ON ITS MERITS is refused at once — a
`403` or `422` now, while the person still has the figures in front of them,
rather than in a queue a day later. One development holds one pending proposal
at a time; a second is `409`.

**A `202` has moved nothing.** No figure changes, no roll-up changes, and the
change log does not carry it. The mutation is appended at the moment of
authorisation, under the same write lock and through the same twenty
reconciliation controls — so a proposal sound on Monday can be `422` on
Thursday, and says which control it would break.

| Route | Method | Who | What |
| --- | --- | --- | --- |
| `/api/changes` | GET | any signed-in seat | The queue, pending first. Readable by everyone: a change waiting on the Director is a fact about the portfolio, and it carries no figure that is not already on a screen. |
| `/api/changes/:id/approve` | POST | `authorise` or `administer` | `{note}` — required. APPLIES the payload and marks the row in one transaction. The **proposer's** capability is re-checked, not the authoriser's, and re-read now rather than trusted from proposal time. The proposer may not authorise their own unless their seat is `sod_exempt`; the database refuses it too. Answers `{request, log}`. |
| `/api/changes/:id/reject` | POST | `authorise` or `administer` | `{note}` — required. Writes the decision and nothing else. |
| `/api/changes/:id/withdraw` | POST | the proposer, or `administer` | `{note}` — required. Withdrawing is not a decision: it needs no authority beyond having made the proposal. |

A decision on a row that is no longer pending is `409`.

### Portfolios and delivery routes

Rows since `db/migrations/017`, not a union in the code. They travel with the
corporate payload every snapshot already carries; this route adds the
DEVELOPMENT COUNT, which only the Administration panel reads.

| Route | Method | Who | What |
| --- | --- | --- | --- |
| `/api/reference` | GET | any signed-in seat | Both lists, each row with `developments` — counted from the REPLAYED position, never a foreign key, because a development registered through the app lives only in the change log. |
| `/api/reference` | POST | `administer` | `{kind: 'portfolios' \| 'routes', name, tone?, describes?}`. The name is 2–60 characters; a tone must be one this application can draw. |
| `/api/reference/:kind/:name` | PATCH | `administer` | `{tone?, sort?}` for a portfolio, `{describes?, sort?}` for a route. **A name is never changed** — every development carries it as its own value, so a rename would orphan them silently. |
| `/api/reference/:kind/:name` | DELETE | `administer` | `403` on one the product defines; `409` naming how many developments are in it. |

A `project:create` or `project:update` naming a portfolio or route the
deployment does not hold is `400`, and the refusal NAMES it — `validateMutation`
takes the vocabulary as an argument for exactly that reason, the same way it
takes the developments the position holds.

### Seats

| Route | Method | Who | What |
| --- | --- | --- | --- |
| `/api/roles` | GET | any signed-in seat | Every seat, its five flags, whether it is exempt or built in, and how many active accounts hold it. Readable by everyone: a person who cannot press a button is owed an explanation of who can. |
| `/api/roles` | POST | `administer` | `{role, title, describes, can}`. The name is 3–32 characters, lower case, starting with a letter — it appears in URLs and in refusal messages. A new seat is never `sod_exempt` and never `built_in`. |
| `/api/roles/:role` | PATCH | `administer` | `{title?, describes?, can?}`. `403` on the `admin` seat, which is fixed. `409` if it would leave nobody able to authorise a change. |
| `/api/roles/:role` | DELETE | `administer` | `403` on a seat the product defines; `409` on a seat any account holds. |

**The model is not on this list either.** `/api/ai/*` is separate, and neither
route can write. The assistant returns prose grounded on a brief the server
computed from the live position; extraction returns fields for a form. What
comes out of extraction reaches the register only when a person submits it
through `/api/mutations`, where the controls run as they do for a typed entry.

| Route | Method | Who | What |
| --- | --- | --- | --- |
| `/api/ai/status` | GET | any signed-in seat | `{configured, model}` — whether a model is connected at all, so a screen can say so rather than offering a button that fails. |
| `/api/ai/assistant` | POST | any signed-in seat | `{question, level, portfolio?, project?}`. The server builds a brief from the developments **this person may see** and instructs the model that every figure it states must appear in it. Rate-limited per account. |
| `/api/ai/extract` | POST | contributor, approver, admin | `{file, mimeType}` — a PDF or image, base64. Returns the fields with a confidence each, and `null` for anything the reader could not make out. **Writes nothing.** |

**Messages are not on this list, and that is the point.** `/api/messages` is a
separate route: a message moves no figure, so it is not appended to the change
log, not replayed, and not put through the reconciliation controls. A
conversation able to change the reported position would be a way around the
whole review-and-approve workflow.

| Route | Method | Who | What |
| --- | --- | --- | --- |
| `/api/messages` | GET | any signed-in seat | The inbox: everyone who can be written to, the last thing said either way, and unread counts. One query. |
| `/api/messages` | POST | any signed-in seat | `{to, body, projectId?}`. Refuses an empty body, a body over 4000 characters, a message to yourself, an account that does not exist or has been withdrawn, and a `projectId` that does not look like `RES-01`. |
| `/api/messages/thread?with=<id>` | GET | any signed-in seat | One conversation, oldest first. Both halves of the query are anchored to the caller, so there is no way to ask for a conversation you are not in. Reading it marks what the other person sent as read; the sender is never told. |

Every body is validated for shape, sign and range (`server/validate.ts`)
**before** the reconciliation controls run: a number sent as text, a negative
amount, a development that does not exist, or a timestamp that is not a date
is `400` with the field named. A body over the route's limit is `413`.

## Writes

State is the seeded position with the mutation log replayed over it. The log is
append-only: nothing updates or deletes a row, which is what makes it the audit
trail rather than a by-product of one. There is no reachable position the log
does not explain. The log records the actor and the **server's** time for every
entry; the client's timestamp travels inside the payload.

Every write — a mutation, an approval — runs under one advisory lock in one
transaction: the reconciliation check reads a log that includes every earlier
write, and nothing can slip in between the check and the append.

### `422` is the important response

Before a mutation is written, the server applies it to a **candidate** state,
runs all twenty controls over every development in scope, and refuses the
write if any control fails. The body names the failing controls.

Ten controls reconcile one module against another (WBS against control budget,
cost categories against AFC, procurement against committed, and so on). Seven
are invariants of the position itself — earned value within budget, paid within
certified, certified within actual cost, committed within forecast — which hold
however the registers were produced and are what gives the engine teeth on a
development that has already been moved by a mutation.

This is not defensive coding, it is the product:

> Reconciliation cannot be enforced in the browser. A client that writes
> straight to a database can record a position the controls reject, and the
> engine would then report the disagreement *after the fact* — which is the
> exact failure this system exists to prevent.

The browser still runs the same controls, from the same module in
`src/domain/`, for the reason it always did: to show the user. It is no longer
the thing standing between a bad figure and the database.

An implementation of this contract that skips the pre-write check is not an
implementation of this contract.

## What the reference implementation is

- `server/` — Node, one handler shared by `api/[...path].ts` (serverless) and
  `server/server.ts` (a long-lived process). Imports `src/domain/integrity.ts`
  so the server and the app cannot disagree about what reconciling means.
- `db/migrations/*.sql` — plain PostgreSQL 15+. No extensions, no vendor types.
  Runs with `psql` against any cluster. Migration 004 carries the
  separation-of-duties constraints; 005 records who returned a period.
- `pg` is the only database dependency, and it speaks the wire protocol.

## Proving a backend

`npm run check:api` runs both repositories side by side and compares them field
by field, drives a period through submit → validate → approve with three
different accounts, proves the shortcut is refused, plants a defect and proves
the server refuses to write on top of it, and refuses malformed, mis-signed and
mis-roled mutations. `check:duties` proves the database refuses what the rules
forbid with the API bypassed entirely. `check:workflow` and `check:uat` drive
the same workflow through the API and through a real browser.

```bash
export DATABASE_URL=$(scripts/local-postgres.sh start)
npm run check:api
npm run check:duties
npm run check:workflow
npm run check:uat
```

Point `DATABASE_URL` at a different cluster and run them again. That is the
portability drill: if they pass against two providers, the claim holds.
