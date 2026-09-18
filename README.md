# Tazayud Owner PMO

**Integrated Portfolio & Project Controls System** — the owner-side controls platform for
Tazayud Real Estate Development: budget, commitment, earned value, forecast, procurement,
payment, quality, safety and risk across the development portfolio.

---

## 1. What you have here

One codebase that builds **two different products**, decided by a single environment
variable.

| | `VITE_API_URL` **unset** | `VITE_API_URL` **set** |
| --- | --- | --- |
| Output | `dist/index.html` — one file | A served website |
| Data | Fixtures compiled into the file | PostgreSQL, behind an HTTP API |
| Accounts | None; nothing is hidden | Sign-in required; six seats |
| Network | **Zero requests.** Opens offline, by double-click | Normal web application |
| Used for | Showing the system without infrastructure | The real platform |

The single-file build is not a mock-up of the platform — it is the same application code
over the same domain layer, with the fixtures standing in for the database. Every figure it
shows is computed by the same functions the platform uses.

**Scale:** 23 modules in the sidebar plus Messages from the top bar; 8 seeded developments
across 4 portfolios; 17 database migrations; ~58,000 lines.

---

## 2. Quick start

```bash
npm install
npm run dev            # http://localhost:5173, fixtures, no database needed
npm run build          # -> dist/index.html, open it directly in a browser
npm run lint           # ESLint, type-aware
npm run verify         # the full gate suite (see §7)
```

To run the **platform** rather than the offline build you need PostgreSQL:

```bash
scripts/local-postgres.sh start     # prints a DATABASE_URL
export DATABASE_URL=...             # the value it printed
npm run db:reset                    # schema + the 8 seeded developments
npm run db:users                    # the six Tazayud accounts
npm run api                         # the API on :4000
VITE_API_URL=http://localhost:4000 npm run dev
```

---

## 3. Domain rules — these are not style preferences

Tazayud is a real-estate **developer, owner and operator — not a contractor.** It delivers
through PMC-Delivered or Self-Execution routes; contractors do the physical work.

> **Every contract value in this system is a COST or a commitment. Never revenue.**

- **Use:** Approved Development Budget, Control Budget, Committed Cost, Actual Cost, Earned
  Value, Planned Value, Anticipated Final Cost, Budget Variance, Payments Made to Date,
  IPC Submitted / Certified, SPI, CPI, EMV.
- **Never introduce:** Gross Profit, Gross Margin, Revenue, Budget Headroom. There is
  nothing in this business for those words to describe.
- **Manpower and equipment carry availability and utilisation only** — no rates and no
  labour cost. What labour and plant cost arrives through the packages that bought them, so
  no figure has two sources.
- **Portfolios and delivery routes are rows an administrator edits** (migration 017), not a
  fixed list. The product ships with Residential, Commercial, Mixed Use and Land
  Development, and with PMC-Delivered and Self-Execution; any deployment may hold more.
- **Every screen reads from one data layer**, so the numbers cannot disagree between them.

`npm run check:domain` fails the build on a terminology violation.

---

## 4. Folder structure

```
api/          [...path].ts — the serverless entry point (Vercel)
server/       routes.ts (the HTTP contract), handler.ts (host-independent),
              server.ts (node:http, for self-hosting), db.ts, auth.ts.
              Node only — never imported by the browser application.
db/           migrations/*.sql — plain PostgreSQL, no vendor extensions
              seed.ts — fixtures into the database
src/
  domain/     the model, the calculations, the forecast, the reconciliation
              controls, the glossary. Pure functions, no I/O.
  data/       repository.ts is THE BOUNDARY between the app and its data;
              the append-only change log and the replay that reads it
  state/      providers — data, scope, auth, messages
  components/ shared UI, and hand-built SVG charts
  screens/    one file per module
  features/   the flows: document extraction, the assistant, add / edit
              project, notifications, sign-in
  app/        the shell, the routes, the navigation
docs/         the written record — see §8
scripts/      every gate (§7) and the operational tooling
excel/        the source Excel controls system this was built from — a separate
              deliverable, kept for reference
tests/        the pixel baseline the visual gates compare against
```

---

## 5. How the system holds itself together

Three properties do most of the work. They are documented at length in `docs/ENGINEERING_NOTES.md`,
which is the engineering record for this codebase — the reasoning behind each decision, including
the defects that produced each rule.

**Separation of duties lives in the database, not the server.** A reporting period is
entered by one person, validated by a second and approved by a third. A change to what a
development *is* — register, amend, close out, delete, award a package — is proposed by the
PMO Controls Manager and authorised by the Director. Both rules are enforced by PostgreSQL
triggers, so a script, a migration or a hand-edited row is bound exactly as the API is. The
administrator seat is exempt by design, so the portfolio can still be reported when the PMO
seats are away; the exemption is never silent.

**Reconciliation happens before the write.** `POST /api/mutations` applies the change to a
candidate state, runs twenty reconciliation controls over it, and returns 422 with the
failing control named if any do not hold. The browser runs the same controls to *show* the
user; it is not what stands between a bad figure and the database.

**Nothing is asserted that cannot be traced.** Counts are the length of their registers.
SPI and CPI are derived from their inputs, never read from a stored field. Risk levels come
from the score. Every chart states only what its own numbers support — axis labels name the
value their gridline is at, a bar is never clipped, and a month with no record is drawn as
absent rather than as zero.

---

## 6. The six seats

Seven job titles, six seats: a Project Manager and a PMC hold the same `contributor` seat
and differ only in how many developments are assigned to them.

| Seat | System name | Can do |
| --- | --- | --- |
| Project Manager | `contributor` | Files periods and records certificates, for assigned developments only |
| PMC | `contributor` | The same, usually across several developments |
| PMO Team Leader | `reviewer` | Validates a filed period, or returns it with a note |
| PMO Controls Manager | `approver` | Approves periods, variations and claims; confirms payments; **proposes** changes to a development |
| PMO Director | `director` | **Authorises** a proposed change, or declines it |
| Executive Viewer | `reader` | Reads everything approved; changes nothing |
| Owner Admin | `admin` | All of the above, plus accounts, seats and reference data |

Seats are rows in a table an administrator edits, not a list in the code — what a seat may
do can be changed, and a seventh can be added, from the Administration screen.

---

## 7. Verifying a change

`npm run verify` is the gate that must pass before anything ships. It runs lint, both
typechecks, the build, the serverless bundle checks, a headless render of every screen, the
pixel diffs against `tests/baseline/`, and then:

| Gate | What it holds |
| --- | --- |
| `check:scope` | Every module shows the scope it is in, never one development inside it |
| `check:layout` | Every module and every tab, at three widths — nothing clipped, nothing overlapping, every multi-series chart named |
| `check:actions` | Every action changes data, persists, and leaves the system reconciling |
| `check:domain` | The terminology rules in §3 |
| `check:recon` | Every register agrees with the development it belongs to |
| `check:coherence` | Cross-register linkage and every date against the data date |
| `check:charts` | Every plotted figure against what the chart claims |
| `check:integrity` | All twenty reconciliation controls on live data |

Backend changes additionally need a `DATABASE_URL` and:

| Gate | What it holds |
| --- | --- |
| `check:api` | Both repositories compared field by field; a write that cannot reconcile is refused |
| `check:duties` | Separation of duties, in raw SQL with the API bypassed entirely |
| `check:platform` | The served build, signed in, reading from PostgreSQL |
| `check:qa` | Every option pressed, in a real browser, for every seat |
| `check:e2e` | A full reporting year end to end. Slow (~10 min); not in `verify` |

Each gate was written against a defect that reached a screen, and each is proven to fail
when its defect is put back. A gate that has never failed has not been tested.

---

## 8. The written record

| Document | What it is for |
| --- | --- |
| `docs/USER_MANUAL.md` | For the people who use it — every seat, every screen, every refusal. Also as `.docx`. |
| `docs/GOING_LIVE.md` | The deployment runbook |
| `docs/LAUNCH_READINESS.md` | What is ready, what is not, and the accepted limitations. Also as `.docx`. |
| `docs/MVP_REVIEW.md` | The review that produced the current backlog |
| `docs/api-contract.md` | The HTTP contract between the application and the server |
| `docs/UAT_RESULTS.md` | The acceptance run, regenerated by `npm run check:uat` |
| `docs/ENGINEERING_NOTES.md` | The engineering record — why the code is shaped the way it is |

`npm run docs` regenerates the Word copies from the Markdown sources.

---

## 9. Status and honest caveats

- **The data is dummy.** Eight developments, one reporting position as at 31 August 2026,
  and registers that mostly cover July and August. It is meant to be replaced, and the
  system is built so that replacing it needs no code change.
- **`AUTH_SECRET` must be changed** when real data replaces the fixtures, so that no token
  issued against the throwaway instance stays valid.
- **No document store is connected.** Documents are listed by reference; Open, Download and
  Upload say so rather than pretending.
- **Registers are re-derived for a development a mutation has touched**, rather than being
  persisted per approved period. The seven invariant controls do not depend on that
  derivation, so the position stays sound; persisting them is the main structural item on
  the roadmap. It is recorded as F-01 in `docs/LAUNCH_READINESS.md`.
- **Counterparty roles are the one list still compiled into the code.** Portfolios, routes,
  seats and accounts all became editable data; nothing has yet asked for a sixth
  counterparty role.

---

## 10. Licence and ownership

Proprietary. © Tazayud Real Estate Development. Not for redistribution.
