# Tazayud Owner PMO — engineering notes

The reasoning behind the code: what each rule is, why it exists, and in most cases
the defect that produced it. Read `README.md` first for what the system is and how
to run it; read this before changing anything, because most of what looks like an
odd decision here is a defect that already happened once.

## One-paragraph summary
**Tazayud Owner PMO — Integrated Portfolio & Project Controls System.** A React 18 +
TypeScript application built with Vite. Source in `src/` as real modules with JSX and ES
imports. `npm run build` emits a single portable `dist/index.html` — React inlined, zero
network requests, opens with a double-click. That single-file deliverable is the live pitch
demo and is not negotiable.

## Hard domain rules (never violate)
- Tazayud is a real-estate **developer/owner, NOT a contractor**.
- **Every contract value is a COST, never revenue.** No Gross Profit / Margin / Revenue / Headroom.
- Portfolios and delivery routes are **rows an administrator edits** (migration 017), not a
  union type. The product ships with Residential, Commercial, Mixed Use and Land Development,
  and with PMC-Delivered and Self-Execution; a deployment may hold more. 8 seeded projects
  (RES/COM/MXU/LND-01/02). See **Portfolios and delivery routes are data** below.
- Manpower & Equipment = availability/utilisation only, no rates.
- All screens read from `src/data/` — keep numbers consistent.

`npm run check:domain` enforces the terminology rules and fails the build on a violation.
If a change would break any rule above, stop and flag it.

## Architecture
```
api/         [...path].ts — the serverless entry point. Vercel treats api/ as
             functions; the SPA rewrite in vercel.json excludes /api/ so these
             are reached rather than swallowed.
server/      routes.ts (the HTTP contract), handler.ts (host-independent),
             server.ts (node:http, for self-hosting), db.ts, auth.ts.
             Node only — never imported by the app.
db/          migrations/*.sql (plain Postgres), seed.ts (fixtures -> database)
src/
  domain/      types.ts (the model), calc.ts (scope/roll-up), forecast.ts (AFC +
               monthly curve), integrity.ts (the reconciliation controls), format.ts,
               glossary.ts (every term, its formula and what it feeds)
  data/        repository.ts (THE BOUNDARY), mutations.ts + persistence.ts (the
               change log), mock/ fixtures and per-project derivation
  state/       DataProvider (loads and commits via the repository), ScopeProvider,
               AuthProvider, MessagesProvider (its own poll — not the snapshot)
  components/  icons, ui/ (KPI, Badge, Prog, Toast, Filters, Drawer), charts/ (hand-built SVG)
  screens/     one file per module (18) + Overview; cost/ is a directory (6 tabs)
  features/    ai-extract/, integrity/, assistant/, notifications/, add-project/,
               edit-project/, auth/
  app/         App.tsx shell + routes, nav.ts (NAV + TITLES), types.ts (PageId)
  styles/      global.css
  assets/      self-hosted Inter (inlined by the build)
```

## Editing rules
- Real JSX and ES imports. Path alias `@/` → `src/`. TypeScript strict.
- **Screens never import `@/data` directly.** Read through `useProjects()`,
  `useCorporate()` and `useRegisters(projectId)` from `@/state/DataProvider`, and
  scope through `useScope()`. A `grep DB.` outside `src/data/` should return nothing —
  that is what makes the mock swappable for an API.
- **Registers are per-project and must reconcile.** A screen that shows a register total
  beside a project figure has to agree with it; `npm run check:recon` enforces it.
- **SPI and CPI are derived, never read** from the stored fields — they are EV/PV and EV/AC,
  and 7 of 8 records store one that contradicts its own inputs. Use `spiOf` / `cpiOf`.
- **Anything that changes data goes through `useMutations().commit`**, never around it, and
  must leave every integrity control passing. `npm run check:actions` drives the lifecycle.
- **`.kpi` means a KPI tile** and every one must carry a value; a card that only wants the
  box uses `.cta-card`.
- Shared UI is exported from `@/components`; screens import from there.
- Charts are hand-built SVG in `components/charts/` — extend them, don't add a chart library.
- Adding a module means: a file in `screens/`, an entry in `app/nav.ts` (NAV + TITLES), a
  `PageId` in `app/types.ts`, and a `<Route>` in `App.tsx`.
- Nothing may fetch from the network at runtime **in the self-contained build** —
  it breaks the offline deliverable. `VITE_API_URL` unset selects `MockRepository`
  and that build must stay request-free; the pixel and headless gates prove it.
- **No database or cloud-vendor SDK anywhere in `src/`** — not in a screen, not in
  the data layer. The app speaks the HTTP contract in `docs/api-contract.md`; the
  server owns the database. `npm run lint` fails the build on a violation. This is
  what keeps the provider a deployment decision. The intended database is Supabase,
  which is Postgres and needs no code change — see `docs/GOING_LIVE.md` for the
  four things that are specific to it, the important one being that PostgREST must
  not reach these tables.
- **No model SDK in `src/`, and never a `VITE_`-prefixed API key.** Vite inlines
  every `VITE_*` variable into `dist/index.html`, so such a key ships inside a
  public file. The model is reached through the API (`GEMINI_API_KEY`, server-side),
  the same way the database and the .xlsx reader are. `npm run lint` enforces it.
- **A model may fill a form; it may never file a figure.** Extraction reaches the
  position by the same road as a typed entry — submit, review, approve, and the twenty
  reconciliation controls before the write. `src/domain/forecast.ts` stays
  deterministic. `aiIsSimulated` in `src/data/repository.ts` keeps the demo's
  scripted AI flows out of any build that has a database behind it. See
  **The model** below.
- **Reconciliation is enforced server-side, before the write.** `POST /api/mutations`
  applies the mutation to a candidate state, runs all ten controls, and returns 422
  if any fail. The browser runs the same controls to *show* the user; it is not what
  stands between a bad figure and the database. Never move that check into the app.
- After changes: `npm run verify` must pass in full. Backend changes also need
  `npm run check:api`, which needs a `DATABASE_URL` (`scripts/local-postgres.sh start`).

## Commands
- Dev:    `npm run dev`
- Build:  `npm run build`   → `dist/index.html`
- Lint:   `npm run lint`    → ESLint, type-aware
- Verify: `npm run verify`  → lint, server typecheck, build, headless, pixel diffs,
                                scope integrity, layout, real actions, domain guard,
                                data parity, reconciliation (project + roll-up),
                                coherence (stored + touched), new-development
                                lifecycle, forecast, integrity engine
- Backend: `scripts/local-postgres.sh start` → prints a DATABASE_URL
           `npm run db:reset` → schema + fixtures
           `npm run db:users` → the six Tazayud accounts, Fawwad on `director`
           `npm run db:user -- <email> <name> <role>` → one account
           `npm run api` → the server on :4000
           `npm run check:api` → both repositories compared field by field
           `npm run check:platform` → the served build, signed in, against Postgres
           `npm run check:duties` → separation of duties, raw SQL, API bypassed
           `npm run check:charts` → every plotted figure against what the
                                chart claims: axis labels, clipping, negatives,
                                and every trend reproducing itself from the
                                counts it publishes (in `verify`)
           `npm run check:qa` → every option pressed: the workbook end to end,
                                amendment, the refusals, the exports, every
                                module for every seat, in a real browser
           `npm run check:e2e` → the owner's acceptance run: Hayat Garden Walk
                                Residence (RES-03) taken through a full YEAR —
                                registered from the workbook, programme stated,
                                thirteen periods filed/validated/approved by the
                                real seats, a package awarded mid-year, eight
                                claims, retention released, then every screen
                                and export checked. Slow (~10 min); not in
                                `verify`
           `node scripts/seed-hgw-remote.mjs --api <url> --admin email:pw`
                              → seeds the SAME year into a DEPLOYED platform,
                                through its own API and controls — nothing
                                touches the database directly. The figures live
                                in `scripts/hgw-scenario.mjs`, shared with the
                                acceptance run so the two cannot drift. Admin
                                alone suffices (the admin exemption); pass
                                --momin/--muqtida/--raza for the faithful trail.
                                Refuses a target that already carries RES-03.
- Brand:  `npm run brand` → re-cut the blocks mark and the tab icon from the lockup
- Re-baseline (only with an intended visual change): `npm run baseline`

## Known defects
None outstanding. The September 2026 MVP review (`docs/MVP_REVIEW.md`) lists
what was found, what was fixed, and the ranked recommendations — including
the two structural IOUs: persisting registers per approved period (F-01) and
a `contract:award` mutation so packages can be recorded after registration.

The Dashboard's Portfolio Summary card used to sit inside the three-column chart grid as a
fourth child, wrapping to an implicit row: that resized the first track to 726px, squeezed
Recent Activities to 187px and left the Risk Exposure card hanging outside the card meant to
contain it. It was preserved through the port because Phase 1 was a faithful one. **The owner
asked for it to be fixed**, and it is now a full-width sibling — which is what it always
should have been.

The owner has also said the build no longer has to match the demo pixel for pixel:
refinements are welcome. `npm run baseline` after an intended visual change, and say in the
commit which pixels moved and why.

## Earned value is derived, and the reason matters
EV was authored independently of the rest of each project's position, so the performance
indices and every forecast built on them were incoherent — standard forecasting predicted an
AFC about 893M above the adopted position across the portfolio.

On the owner's instruction, EV is now **AC x BAC / AFC**: the value at which the realistic
forecast lands on the adopted AFC. Progress, SPI and CPI follow from it. Approved budgets,
AFCs, commitments and payments were **not** touched, so the reported favourable budget
variance of 592M is unchanged; the portfolio forecast divergence fell from 893M to 39M
(0.5%, inside the 2% tolerance in `domain/forecast.ts`).

The forecast methods are not tuned to agree with the adopted AFC — the inputs were made
coherent. Feed the model an incoherent project and it will still say so.

## A count is the length of its register, and a date is cut against the data date

Two things the twenty reconciliation controls never covered, because neither is
money — and both are what a reader checks first.

**The counts.** `Project` carries `risks`, `highRisks`, `openNcr` and
`openIssues`, and the database carries the same four columns. They were
authored beside the registers rather than counted from them, and they
disagreed on all eight developments: RES-01 stored 28 risks against a register
of 8, 18 open non-conformances against 8, 6 rated high against 4. So the
Dashboard said "6 high-rated risks across 28 registered" above a table of
eight, and the assistant summed the same stored fields.

`src/domain/counts.ts` counts them from the rows and **nothing reads the stored
fields** — the SPI/CPI rule and the risk-level rule, applied to counts. The
fixtures, the database and the parity check are untouched, so there is no
migration and no re-seed. `Aggregate` no longer carries the three count fields
at all: money rolls up from the project record because that is where money is
reported, and a count does not roll up, it is taken from the list. Deriving is
also the only correct answer, because a touched development's registers are
re-derived at its new position — a count typed into the project record would go
stale the first time somebody filed a period.

`isOpenNcr`, `isOpenIssue` and `isHighRisk` live there for the same reason:
"open" had been written out three times, in the integrity engine, the
evaluation scorecard and the assistant's brief, and the three did not agree.

**The calendar.** `src/domain/calendar.ts` states the data date ONCE —
`DATA_DATE_INDEX` stays the authority on which month, and this attaches the
year and the day, so the two can never name different months. Before it, the
report header printed the bare word "Aug" and the registers were dated
wherever each was written: non-conformances raised in April 2025 still showing
Open sixteen months later, incidents and observations dated into October 2026
(after the position, some after today), equipment Operating three months past
its next service, and an issue age counted to the 22nd of a month that runs to
the 31st. Every authored event now sits behind the data date, an Overdue NCR is
past due and an Open one is not, and an issue's age is COUNTED from the date on
its own row rather than stored beside it.

It is deterministic — a constant, never `new Date()`. An age that moved with
the wall clock would fail the pixel gates on a schedule and would quietly
report a different position next month.

`npm run check:coherence` holds all of it: 748 cross-register checks over the
eight developments — every count against its register, every corrective action
against an NCR that exists, every mitigation against a risk that exists, every
date against the data date. It is in `verify`.

## A development the fixtures never described never borrows a template

`registersFor` used to fall back to the RES-01 templates for any id the
fixtures did not know, so a development registered through the app was honest
exactly until its first period was filed — and then its one real awarded
contract vanished under thirteen scaled template packages with other
organisations' names, non-conformances dated before it existed, risks, a
fleet and zero-value claims. F-09 fixed at creation, resurrected by the
first period; no gate filed a period on a created development, so none saw it.

The rule is absolute: an app-registered development (`!known` in
`registersFor`) holds ONLY what was recorded against it. WBS and cost
categories from the filed period (or the creation workbook), procurement from
the registered contracts — committed cost beyond them is ONE explicit
"not yet packaged" row (`UNPACKAGED_COMMITMENTS`, skipped by the evaluation
scorecard), never spread invisibly across contracts whose values are known —
claims synthesised from the actual `ipc` and `claim:record` mutations with
the same payment waterfall `deriveClaims` runs, and everything else EMPTY,
because empty is the truth. `npm run check:newdev` drives the whole lifecycle
(register → period → certificate → claim → payment → amendment) and is in
`verify`; it is proven to fail against the template fallback.

Related rules established at the same time:

- **A budget-carrying `project:update` marks a development touched**, so the
  WBS root and the category table follow the amended budget rather than
  restating the old one. A name-only amendment re-derives nothing.
- **The closed-development freeze covers `/api/periods`** at entry AND at
  approval (inside the write lock — a close between submission and approval
  refuses the approval), and `DataProvider.submitPeriod` carries the same
  guard; `submitPeriod` does not go through `commit`, so commit's check never
  saw it.
- **`project_assignments.project_id` and `period_submissions.project_id` are
  references, not foreign keys** (migration 013). A created development
  exists only in the mutation log; FKs to the seed table made assignment and
  period filing a 500 for every created development. Do not "restore" them.
- **`mayMutate` is re-checked inside the write lock, on the lock's client** —
  its preconditions used to be read on the pool outside it, so two racing
  writes could double-close a development. Anything it calls must take the
  Queryable (`assignmentsFor` does); a pool read inside the lock is the
  self-deadlock described below.
- **`forecastScope`, never `forecast(agg(list))`.** BAC ÷ CPI is not linear;
  forecasting the summed position and summing per-development forecasts
  differ by 44M across the shipped portfolio, and Analytics did one while
  Cost did the other. Every scope-level forecast reads `forecastScope`;
  `check:scope` compares the two screens at Corporate.
- **`isOpenNcr` / `isOpenIssue` / `isHighRisk` / `progressOf` /
  `costCategoryStatus` are the only spellings** of those rules. "Open" had
  grown a fourth definition inside integrity control 9 and a fifth in the
  evaluation scorecard, and both counted a Completed NCR as open. Write the
  closed side as `!isOpenNcr(n)`, never by re-listing statuses.
- **The workspace's "now" is the data date** (`new Date(DATA_DATE_MS)`),
  never `new Date()`; hand-typed dates go through `parseDate`. The one
  legitimate runtime clock read is the `at` on a user's own mutation and the
  timestamp inside a user-triggered export.
- **`check:scope` discovers routes from `App.tsx`** and fails if discovery
  finds fewer than twenty; the one-development screens that must ASK are
  `overview`, `workspace` AND `period`. Never turn its discovery back into a
  list, and never let a comparison of `undefined` pass as `0 === 0` — both
  happened once.

## Registers are stored data, not a projection of the project

For a development that has not been changed by a mutation, `registersFor`
returns the register rows **exactly as stored** (`DB.wbs[id]` and the rest).
That independence is what makes the controls controls: `npm run check:api`
edits a project's earned value directly in the database and requires the
server to refuse the next write, which only works because the register did
not follow the edit. Never re-derive a stored register from the project on
read. The stored rows are normalised once, at load, in `data/mock/index.ts`
(RES-01's authored packages are apportioned against RES-01 itself), which is
why they reconcile at every level.

A development that has been touched by a mutation is re-derived from its own
rows at its new position — a known limitation (F-01 in
`docs/LAUNCH_READINESS.md`), mitigated by the seven invariant controls
(11–17), which do not depend on derivation. The roadmap is to persist
registers with each approved period.

A certificate (`ipc`) moves certified and paid only. Earned value and actual
cost come from the period. Control 15 (certified ≤ actual cost) is what
bounds a certificate, so a period covering the work is filed before the
certificate for it. On the platform certificates are recorded through the
form on the Cash Flow tab; AI Extract is scripted and disabled there.

## Accounts, profiles and the reporting workbook

`db/migrations/007` adds `users.active` and `users.avatar`.

An account that has acted is **withdrawn, never deleted** — it is referenced by
`period_submissions` and by the change log, and erasing it would leave the
audit trail naming somebody who does not exist. `active` is read on every
authenticated request alongside the role, so a withdrawal takes effect on the
next click rather than when the token expires, and sign-in refuses a withdrawn
account with the same message as a wrong password.

Nobody may change their own role, withdraw themselves, or reset their own
password through `/api/users`. Those three refusals are also what guarantees an
administrator always remains: the acting one is always counted, so removing any
other still leaves them. `lastAdminGuard` is defence behind that and is
currently unreachable; keep it.

`/api/me/profile` reads **name and avatar only**. It refuses a body carrying
nothing it recognises rather than ignoring the extra fields, which is what
stops `{"role":"admin"}` looking like a partial success.

`server/pt-template-file.ts` is the owner's workbook byte for byte, as base64,
served by `GET /api/periods/template`. A module rather than a file on disk
because the serverless function is bundled and a sibling file is not part of
that bundle. It must never reach the browser bundle — the offline build has no
importer — and `check:api` proves the served bytes are ones `verifyStructure`
accepts by feeding them back to the import route.

## Documents

`docs/USER_MANUAL.md` and `docs/LAUNCH_READINESS.md` are the sources;
`npm run docs` regenerates the `.docx` copies with `scripts/md-to-docx.py`
(standard library only — LibreOffice is not available in every environment).
`npm run check:uat` rewrites `docs/UAT_RESULTS.md`.

## Packages carry their counterparty

`ProcurementPackage` is a contract package: one slice of scope, **one**
counterparty. A development has several, which is the point — the owner
contracts the work out in packages. Two packages may sit under the same WBS
node (substructure bought as excavation and as concrete) and that is normal;
two counterparties on **one** package is what must never happen, because then
no figure on the row belongs to anybody in particular.

`awarded` is null while a package is out to tender. Such a package carries a
`value` estimate and a place in the AFC but contributes **nothing** to
committed cost — nobody has been promised anything — and control 7 sums
`committed`, so it cannot inflate the obligation.

`retention` is the rate in that package's payment terms. It is the **default a
claim starts from**, never the rate a claim must use: on the owner's
instruction, terms differ between claims, so the claim decides. There is no
percentage-of-contract ceiling.

The PMC's name is read from `p.pmc` in `deriveProcurement` rather than stored
twice. A development managed by XYZ PMC with an ABC PMC contract row is the
kind of defect nobody notices until somebody is paid.

**Control 18 is per package, not per development.** The seven bounds hold at
the level of the whole position, and a development can satisfy every one of
them while a single package has been paid more than was committed to it. That
is a real defect — money left the account against a promise that was never that
large — and the control found exactly that in three consultancy packages the
moment it was written.

## Payment claims, and why the register carries a release figure

Payment is milestone-based. A contractor delivers a milestone and claims for
it; the consultant verifies what was delivered; Tazayud approves an amount and
withholds a percentage as security. `PaymentClaim` carries all four figures —
claimed, verified, approved, paid — because the differences between them are
the point: approved over claimed is what the evaluation scorecard reads as
claim accuracy.

**The consultant does not hold an account.** Verification is recorded as a fact
— name, date, reference, amount — by the person who received it. That is a
deliberate limit of the access model, not an oversight.

`retentionRate` is a percentage of THAT CLAIM. It starts from the package's
payment terms and is set on every claim; there is no percentage-of-contract
ceiling. Retention is released at handover and closeout.

**`released` exists because the shipped figures require it.** Controls 19 and
20 compare the register against the position it produced: approvals must sum to
certified and transfers to paid. On RES-01 certified less paid is only 3.20% of
certified, which is less than the retention a 5% rate withholds — so with
retention alone the two totals cannot both hold. `deriveClaims` therefore reads
the development's own paid figure and lets it decide which way the difference
goes: above the net total, retention has been RELEASED, oldest claims first,
each capped at what was withheld from it; below it, approvals are AWAITING
PAYMENT and the claim at the boundary is PART PAID. Both are real states, and
seven of the eight developments take the second branch.

**Recording a claim is `claim:record` (migration 008).** The whole act as one
change: package, milestone, who verified it and for how much, what Tazayud
approved, and the rate withheld from THAT claim. It moves certified by the
approved amount and paid by the net, exactly as `ipc` does — a claim is a cash
event; earned value and actual cost come from the period.

It is **stricter than `ipc`**: a certificate may be recorded by the contributor
assigned to the development, but a claim carries an approval, and approving is
the approver's act. `mayMutate` refuses it for every other seat.

The retention AMOUNT is never accepted from the caller — the rate is, and the
amount is arithmetic (`retentionOf` in `domain/calc.ts`). A form that took both
would let them disagree invisibly.

A development with a recorded claim counts as **touched**, so `registersFor`
re-derives it. The seeded claims are then apportioned to the position MINUS
what the recorded ones account for, and the recorded ones are appended. Without
that residual both sets would scale to the whole of certified and paid, and
controls 19 and 20 would each read double.

Do not "fix" this by inventing a paid figure per claim. A transfer is not an
independent number — it is the approved amount less the retention withheld from
it — and apportioning it separately would let a claim be paid an amount its own
arithmetic does not produce.

## Counterparty evaluation scores what it can evidence

`src/domain/evaluation.ts` is pure and reads only registers. Eighty marks are
measured; the twenty for PMO judgement are **not computed** — until an
assessment is recorded, a counterparty stands at what was measured, out of
eighty, and the screen says so. Scaling the measured marks up to look complete
would present an absence of opinion as an opinion.

**Cost is scored as variation discipline, not as CPI.** Earned value is derived
as AC x BAC / AFC, so CPI collapses to BAC / AFC — identical for every package
of a development. A criterion that awards every counterparty the same mark
discriminates nothing while appearing to, which is worse than leaving cost out.
Approved variations against a counterparty's own packages answer the question
an owner actually has. Do not "restore" CPI here without first changing how EV
is derived.

`Ncr` and `Variation` carry a `packageId` for the same reason: without it a
non-conformance names a person and a variation names a category, and neither
can be attributed to the counterparty whose work it was. Attribution is what
separates a measured score from an asserted one.

A counterparty with no decided claim is marked **too little data** rather than
scored badly. Being unmeasured is not a finding.

The module is **restricted to reviewer, approver and admin**. `NAV` carries a
`restricted` flag that removes it from the sidebar, and the screen refuses on
its own as well, so a typed URL gets nowhere. In the self-contained build
nothing is hidden — there are no accounts, so there is nobody to hide it from.

## Registering a development from a workbook

`server/xlsx-write.ts` writes a workbook; `xlsx.ts` already read one. Entries
are deflated only where that saves space, and the CRC is not optional. It lives
on the server for the same reason the reader does: a spreadsheet writer has no
business inside a file somebody double-clicks.

`server/project-template.ts` builds the three-sheet new-development workbook
and reads a filled one. **Importing fills the form; it registers nothing** —
the same rule PT_TEMPLATE follows. `verifyProjectStructure` refuses a workbook
whose columns have moved, because a workbook that opens but is misread is far
more dangerous than one that will not open: a contractor's name would arrive in
the award-value column.

`project:create` carries `packages` and `contracts`. **Package budgets become
the control budget** — the control budget is exactly the part of the approved
budget that has been broken into packages, and what is left over is the
contingency. That is the definition, not an assumption, and it is why a
development registered from a workbook satisfies control 1 on the day it is
registered. **Only awarded contracts reach committed cost**, so control 7 holds
too; a package out to tender carries an estimate and promises nobody anything.

## A module a seat may not use is not in its sidebar

`NAV` entries carry `roles`. Absent means everyone; otherwise only those seats
see the module. `period` is contributor and admin, `submissions` excludes the
reader, `evaluation` is reviewer and above.

This is **not** the enforcement — the server has always refused these writes,
and `Capabilities` in `server/auth.ts` is the mirror. It is a correctness
matter of a different kind: the owner found an executive viewer being offered
Period Entry. Nothing was at risk, but a form whose every action is rejected
teaches a person that the system does not know who they are. Each screen also
refuses on its own (`NotYourSeat`), so a typed URL gives the reason rather than
the form. `check:platform` and `check:uat` both drive it.

## One request, not eleven

`GET /api/snapshot` returns the projects, every readable register and the
corporate reference data together. `loadSnapshot` uses it when the repository
offers it, which the HTTP one does and the fixtures one does not need.

Before it, the app built the snapshot itself: `/api/projects`, `/api/corporate`
and then **one `/api/registers/:id` per development** — eleven requests for
eight developments, on first load and again after every single change. On a
serverless host each is its own invocation with its own cold start and its own
database connection, and that fan-out is what made registering a development
look as though the application had hung. `check:platform` counts the register
requests a single click costs and fails if it is more than one.

It is also less work server-side: the replay ran once per development and now
runs once.

**A failed refresh is not a failed write.** `commit` awaits the write and then
refreshes; if only the refresh fails the change is already recorded, so it
resolves and says the screen is behind. Rejecting there told a person their
change had not been made when it had — and they would do it again.

## Brand marks are files, and never redrawn

`src/assets/brand/index.ts` names every mark and **everything that shows one
imports it from there**. Three files, and the reason there are three:

- `tazayud-lockup.svg` — the official artwork exactly as supplied: the dotted
  blocks in `#66B3C9` with the Arabic and Latin wordmarks in `#0E223A`. Shown
  on the sign-in card, which is the one light ground in the application.
- `tazayud-blocks.svg` — the same lockup cropped to the blocks alone, produced
  from it by `npm run brand` (`scripts/brand-crop.mjs`): the same path data
  byte for byte, with a tightened viewBox. Shown on the navy rail, where the
  wordmark half would be very nearly invisible and where a collapsed sidebar
  has no room for it.
- `tazayud-favicon.svg` — the same blocks path again, centred on a navy tile,
  for the browser tab. Also produced by `npm run brand`.
- `BMI-Final-Logo.png` — the builder's mark, on a small white plate because it
  is blue and orange on white.

The crop exists so that nothing is ever **redrawn or recoloured**. Re-run
`npm run brand` after replacing the lockup; it refuses a file whose shape is
not the one the crop was measured against, rather than emitting a mark half out
of frame.

`assetsInlineLimit` inlines every one as a data URI, which keeps
`dist/index.html` a single portable file — and makes the format free: the PNG
travels exactly as the vectors do.

Fills are literal rather than `currentColor`: an image is an isolated document
and inherits neither the page's colours nor its fonts. That is why the sidebar
wordmark stays HTML text, and why a **light plate, not a CSS filter**, is what
puts dark artwork on a dark ground.

`.logo-mark` is a fixed 34×34 **box** with `object-fit: contain`, not a fixed
width. The aspect ratio is a property of whichever file is in the directory, so
letting it set the height meant replacing the artwork silently moved the whole
sidebar down and every navigation item with it.

### Sign out is in the top bar; the user manual is on the Glossary screen

The top bar's trailing buttons are messages, notifications, the assistant and
**sign out**. Sign out replaced a link to the user manual, which now sits at the
foot of the Glossary screen's "How to use this tool" tab: a manual is something
a person goes and reads, not something they need one click from every screen,
and signing out is the opposite. There is a second sign out beside the account
name in the sidebar; both are places people look.

`scripts/diff-overlays.mjs` addresses top-bar buttons **by aria-label**, not by
position from the end. It used to do the latter, and removing one button
silently made "second from the end" a different button — the overlay state it
was meant to capture never opened, and the gate failed with a timeout rather
than a diff.

### The tab icon is set from a module, never from a `<link>`

`applyFavicon()` in `src/assets/brand/index.ts`, called once from `main.tsx`.
Not a `<link rel="icon">` in `index.html`, and that is not a preference:
**vite-plugin-singlefile inlines scripts and stylesheets but not a link icon**,
so one written there is emitted as a sibling `.svg` and referenced by path. The
deliverable is opened by double-clicking it, usually with no sibling beside it
— so the one asset in the whole build would 404, silently, leaving a blank icon
nobody investigates and a failed request in a file that must make none.
Imported from a module, Vite inlines it as a data URI into the bundle that is
already inlined into the page.

`verify.mjs` asserts the icon's href starts with `data:image/svg+xml`, so the
day somebody "tidies" it into the head, the build says so.

It carries a navy tile because a favicon needs a ground: the mark is `#66B3C9`,
which has very little to hold on to against a browser's own light tab strip.
The tile is square because every place a favicon appears is square. The cost is
about 70 kB in `dist/index.html` — a second inlined copy of the same path data
— and it is worth it: the alternative is either a redrawn mark or an icon that
is a grey smudge at 16px.

## A module shows the scope it is in, never one development inside it

The owner opened Cost, Variations and Packages with the selector on Corporate
and found a band across the top describing RES-02 — its portfolio, its delivery
partner, its budget — and tables of RES-02's rows underneath. Every register
module read `useScope().project`, which exists at every level as the
development a drill-in would open, and `useRegisters(that.id)`. Thirteen
modules, all three levels.

**The band describes a POSITION, not a development.** `domain/position.ts` —
one development at Project level, `agg`'s roll-up above it. It is deliberately
NOT a `Project`: a portfolio has no delivery route and no PMC, and inventing
them would put a false statement into the type the mutation layer uses. Its
`project` field is present at Project level and ABSENT above it, so anything
that needs a real development — an audit trail, a write, a closeout note — has
to ask for it and gets nothing when there is no single answer. `bandMetrics`
carries the identity slots: portfolio, route and partner for a development;
developments, scope and control budget for a roll-up.

**The registers roll up, and how depends on what they are** (`domain/rollup.ts`):

- **Things that happened** — a variation, a claim, a non-conformance, an
  incident, a machine — are CONCATENATED, and every row is tagged with the
  development it came from. The tables gain a Development column, `rowKey`
  keys them by development and id (RISK-013 exists on all eight; keying on the
  id alone highlighted two rows at once and opened the drawer on the wrong
  one), and a write files against the ROW's development rather than the
  selector's.
- **Things that describe a position** — a cost category, a trade, a week of
  attendance, a counterparty's workforce — are FOLDED onto their own key and
  summed, because "Civil Works" is one line of a portfolio as much as of a
  development. Concatenating them would print the same category eight times.
- **The work breakdown is neither.** A portfolio is not made of work packages,
  it is made of developments, so at a roll-up the WBS is one row per
  development — its own level-0 position — under a root that sums them.
  Folding eight developments' packages by code would assert that RES-01's
  "1.2" and LND-02's "1.2" are the same scope, true today only because the
  fixtures share one template.

Nothing is invented: every rolled-up figure is a sum of figures that already
reconcile, so the band and the table beneath it cannot disagree. `forecast` and
`monthlyCost` take `CostPosition` — the five figures they actually read —
rather than a `Project`, which is what lets the Cost module forecast a
portfolio without a fabricated development being invented to carry them.

**A write needs a development, and says so when there is none.** Recording a
claim and recording a certificate are offered at Project level and replaced by
the sentence that says where to file them at a roll-up — the disabled-control
rule. Confirming a payment and approving a variation stay available, because
the row names its own development.

**Two screens are one development BY DEFINITION** — the Project Workspace and
the Project Overview drill-in — and neither may help itself to one, because
scope travels with every navigation and switching it on arrival would filter
twenty other screens for the rest of the session. They ASK, in one click, and
`PickDevelopment` in `screens/shared.tsx` is the single card both use. The
Overview was missed in the first pass: routed but not in the sidebar, it went
on rendering RES-01's name, budget, curve and risks under a Corporate selector
after the thirteen modules were rolled up. An Overview of a portfolio is the
Dashboard, which already exists.

`npm run check:scope` drives all thirteen modules at Corporate and at a
portfolio and asserts the band names the scope and carries the summed budget,
and then drives the two one-development screens and asserts they ask rather
than naming one. It covers EVERY route rather than the list of screens the
defect was found on — a gate written from known defects only ever catches the
defects on the list, which is exactly how the Overview survived the first fix.
Both halves are proven to fail: putting a module's band back produces four
failures naming RES-01, and so does disabling the Overview's guard.

## The Project Workspace is one development, and it hosts the modules

`src/screens/workspace/` — the screen the owner asked for after calling Period
Entry "very basic": module tab row along the top, the reporting calendar under
it, then the module. It replaced Period Entry in the sidebar (the `period`
route still exists, so every link to it still works) because entering a period
is ONE TAB of it, and a sidebar offering both taught people the two were
different things.

**It renders the existing screens.** Cost, Quality, Claims and the other twelve
are the same components the sidebar routes to, shown inside a development.
There is still one implementation of every figure, one set of reconciliation
controls and one set of gates over them. What the sidebar keeps is the
ROLL-UP — the same modules at portfolio and corporate level, where a figure is
the sum of the developments under it and there is nothing to enter. That is the
consolidation the owner asked about: one screen per development, and no other
place a figure is entered.

**The band is portalled, not redefined.** Each hosted module already draws its
own `ProjBand` with metrics that belong to it — AFC and variance on Cost,
certified and paid on Claims. The workspace publishes a slot above its tab row
and `ProjBand` renders into it (`workspace/host.ts`), so the order is band,
tabs, months, module WITHOUT defining twelve metric sets a second time. A
module that draws no band of its own gets the workspace's default one, and
`hosted` is the count that decides which. Never "fix" this by copying the band
metrics into `tabs.ts`: two places that can disagree about the same figure is
the defect this codebase exists to catch.

**It does not help itself to a development.** Switching scope on arrival was
tried and the pixel gate caught it: scope lives in the URL and travels with
every navigation, so opening the workspace once quietly filtered Payment
Claims, Analytics and everything else to one development for the rest of the
session — twenty screens moved, none of them touched. So at Corporate or
Portfolio level the screen ASKS, in one click, and the top bar then says which
development is open. Projects and a message link now drill straight into it.

**The month strip never invents a history.** `workspace/periods.ts` reads the
submissions and nothing else: approved, awaiting, returned, nothing filed, not
reported, future. Eight developments carry one current position and mostly no
periods behind it, so painting January to August green because the money is
spent would be a strip reporting its own assumptions. A period is placed on the
month its DATA DATE falls in, parsed leniently with the filing timestamp as the
fallback — that field is typed by hand, and dropping an unparseable one off the
strip hides it, where placing it a month late shows it.

Selecting a month sets the period number and data date Monthly Reporting
starts from. Both stay editable: the period number is the project manager's to
state and the workbook is where it comes from.

`npm run check:layout` drives the workspace's own tab row and then every hosted
module's tabs underneath it — otherwise fifteen modules would sit behind one
audited view, which is the hole this gate was extended to close for Cost.

## The charts are dimensional, and the depth is light, never geometry

The owner asked for "3D charts, shapes and visualization", and the September
2026 visual pass delivers it under one rule: **depth is constant and the
projection is parallel.** Perspective 3D — where a near bar looks taller than
a far bar of the same value — misstates figures, and this product's pitch is
that figures prove themselves. So what moves is light:

- `BarChart` extrudes every bar by the SAME 4px offset — a lit top face and a
  shaded side face; the front face is exactly the rectangle the flat chart
  drew, on the same baseline and scale.
- `Donut`/`DonutCenter` slices carry a 2.5px surface gap, a uniform sheen
  overlay (every slice lit alike) and a soft ambient shadow. Angles untouched.
- `LineChart` lines glow softly; every marker wears a white surface ring so
  crossing series stay separable; the LAST point — the reported position — is
  drawn larger.
- `HBars` and `Prog` are recessed tracks with glossed fills; `Prog` sets
  `backgroundColor`, never the `background` shorthand, or the CSS gloss
  layered over it is reset.
- `charts/fx.ts` (`shade`) is the one place a series colour becomes its lit
  faces; a colour it cannot parse degrades to flat, never to black.
- The elevation tokens live in `:root` — `--shadow` (three layers),
  `--surface`, `--edge` — and every raised surface wears the same physics.

Never "upgrade" any of this to perspective, per-bar depths, or slices pulled
out of the ring: those change what the figures appear to say.

## The charts the owner approved, over the registers that exist

The approved design carries a chart on almost every module. Most of them are
now on the platform, and the rule that decided which is worth stating, because
it is the same rule a review of this system applied once already and it removed
work rather than adding it:

**A chart is drawn from a register, or it is not drawn.** Hardcoded HSE incident
charts, manpower trend lines and a risk matrix over a register of eight were
found presenting invented numbers as measurement, and were taken out (Q-17).
Putting the design's charts back as literals would have re-introduced exactly
that on all eight developments, so each one is fed from the rows beneath it:

- `components/charts/breakdown.ts` is the one place a breakdown is counted.
  `countBy` and `sumBy` back every donut, so a category cannot be counted one
  way on Quality and another on HSE. `CATEGORY_COLOURS` is CATEGORICAL and
  deliberately excludes the RAG greens, ambers and reds — those belong to
  status, and a category that happens to land third in a list has not earned
  red.
- Quality: NCRs by discipline and by root cause, from the NCR register.
- Equipment: utilisation by category WEIGHTED BY THE UNITS IN IT, and the fleet
  by status. A flat average across categories lets one idle generator count for
  as much as forty pieces of access equipment.
- Manpower: workforce composition, and manhours by trade — hours rather than
  headcount, because a trade of six on double shifts is a bigger share of the
  exposure than a trade of twelve who are not.
- WBS: earned value against each package's own budget.
- Procurement: drawn down against commitment, awarded packages only — a
  package out to tender has nothing to draw down against. Over its own
  commitment paints red rather than clipping to 100, because that is the defect
  control 18 exists to find.

The charts that are NOT there are the five TIME SERIES — manpower trend,
productivity, incidents, first-time-right, risk exposure. The platform holds
one current position per development and no month-by-month history, so those
have nothing to plot. They arrive when periods accumulate; drawing them now
would mean inventing the history.

## A chart draws its own key, and the names are not in the source

The owner opened Quality and found a red line and a blue line with nothing on
the page saying which was which — and the same on the incident trend, the
workforce trend, the cost trend and two of the s-curves. `LineSeries` had
carried a `name` since the first chart was written and **no chart ever
rendered it**, so every series name existed only in the source. Four screens
had noticed the hole and filled it by hand, and once the names were finally
drawn the four copies disagreed in front of a reader: the Dashboard said
"Planned Value (PV)", Analytics and the Overview said "PV", Cost Summary said
nothing at all.

So the key is **not something a screen remembers to add**. `LineChart`,
`BarChart` and `DonutCenter` draw it themselves from the series they were
handed (`components/charts/Legend.tsx`), which means a chart cannot be put on
a screen without one. The six hand-rolled copies are gone.

- **`EV_SERIES` names the s-curve once** (`components/charts/series.ts`). Five
  screens draw planned, earned and actual as the same three lines; the
  abbreviation is kept beside the full term because the tiles above these
  charts are labelled PV, EV and AC and the glossary defines them under those
  letters.
- **The swatch is the mark.** A line series gets a line, DASHED where the
  series is dashed, so planned value is identifiable in the key without
  relying on its blue; a bar or a slice gets a block. Identity is never colour
  alone.
- **The text is text.** Names are set in the page's ink, never the series
  colour — the swatch beside them already carries that, and coloured text on a
  white card is the pair most likely to fail contrast.
- **One series gets no key.** The card heading names it. What a single-series
  chart needed was its UNIT, which is what `yLabel` is for: an axis running to
  4,399 says nothing until it says "SAR / manhour".
- **`MONTH_AXIS` is the x-axis title** (`domain/calendar.ts`), built from
  `REPORTING_YEAR`. The ticks read "Jan Feb Mar …" and never said which year.
  Fourteen charts carry it, so they cannot come to disagree about the year the
  position is reported in.
- **`BarChart` takes `series`** — the names of the bars WITHIN a group, by
  position. A `BarGroup` carries colours and no names, which is why a grouped
  chart could ship as a red bar beside a green one.
- **A scale factor belongs in the key.** First Time Right draws
  non-conformances at N times their count to share a percentage axis; the key
  says `Non-conformances raised (×8)` rather than leaving that to the note
  underneath. Two quantities on one axis is a thing the mark itself has to
  admit to.

`check:layout` enforces it, and it counts the series **from the paint rather
than from a prop** — a prop is what the developer believed, the paint is what
the reader sees. Distinct stroked paths, gradient-filled rects and stroked
circles are the count; the grey ring track, the white marker rings and the
sheen overlay are chrome and are excluded by name, without which a one-slice
donut reads as three series. Proven to fail before it was trusted: suppressing
the line key produces 45 failures naming fifteen charts, suppressing the bar
key produces fifteen more.

The one thing it cannot see is two charts in one card where only one is keyed
— it falls back to looking anywhere in the card. No card holds two today.

## A chart is a claim, and the claim has to be true

`npm run check:charts` (in `verify`, 856 checks). The other gates hold the
layout and the arithmetic behind the screens; this one holds the step between
them — what a chart, drawn from correct data, ends up ASSERTING. A claim can
be false while every number behind it is right.

**The axis says where its lines are** (`components/charts/scale.ts`). The
scale was `peak x 1.1` cut in quarters with each label rounded for display, so
an incident register of eight drew gridlines at 0, 2.2, 4.4, 6.6, 8.8 labelled
**0, 2, 4, 7, 9**, and a peak of 2.65 gave two different lines both labelled
"1". `niceScale` picks the STEP first, from 1 / 2 / 2.5 / 5 and their powers of
ten, and the axis is as many of those as it takes — so the label is the step's
own arithmetic and cannot disagree with the line. `integer` is passed for a
count axis: half an incident does not exist, and an axis that offers one
invites a reader to take it.

**Nothing is clipped.** `HBars` clamped its width to the stated `max`, so a
package paid 112% of its commitment drew exactly as long as one paid 100% —
and that is the defect control 18 exists to find, on the chart meant to show
it. `max` is now a REFERENCE the scale grows past, never a ceiling.

**A negative is drawn, not zeroed.** `BarChart` skipped any bar of
non-positive height while the cost screens clamped the value with
`Math.max(0, …)` first, so "nothing happened" and "money came back" drew as
the same empty column. The axis now opens below zero when the data need it.

**A percentage never shares an axis with a count.** First Time Right drew
non-conformances multiplied by whatever factor made them fit a 0-100 axis —
x8 at Corporate, x30 on a development — so every gridline meant two things and
a reader taking the red line off the axis read sixty non-conformances where
the register held two. It is two cards now. No footnote fixes a dual axis; the
axis has to mean one thing.

**A ring is parts of a whole.** The Dashboard's variance donut sizes arcs by
MAGNITUDE around a centre carrying the NET, which sums correctly only while
every portfolio is favourable. Mixed, it would draw a 300M saving and a 300M
overrun as two equal arcs around a centre reading zero. Where the signs are
mixed the totals are listed and the ring is not drawn.

**A series is reproducible from the numbers beside it.** First-time-right
plotted a modelled figure for every month and the register's cumulative
fraction at the last — two definitions in one line — and a reader dividing the
chart's own inspections by its own non-conformances got 60% where it plotted
45%, on all eight developments. It is now passed-to-date over carried-out-to-
date from the two counts the same row publishes, so the last point equals the
register BECAUSE the parts sum to the whole, not because it is special-cased.
`inspectionsPassed` is on `OperatingMonth` for exactly that reason.

## Nothing recorded is not the same as nothing happened

Incidents, non-conformances and inspections all carry their own date, and
`operatingHistory` used to ignore all three and SPREAD each register's total
across the year on the progress curve. The shape was then the allocation
rule's rather than the register's, and every rule left its own fingerprint:
largest remainder pushed small counts to the heaviest months (four incidents
became `0 0 0 0 1 1 1 1` on a curve whose lightest month is 35% of its
heaviest), and quantile placement combed them into alternating spikes because
eight developments share one curve. Summed to Corporate it produced an
incident trend that ran along zero until June and tripled in July.

**The rows say when.** `countByMonth` in `domain/history.ts` counts them off
`Incident.date`, `Ncr.raised` and `QualityInspection.date`, so these series are
MEASURED and the cards no longer say "modelled". Two rules make it honest:

- **A month before the register's first row is `null`, never 0.** The shipped
  registers are dated July and August — they cover two months, not eight — and
  reporting January as zero states that this portfolio had no incidents in
  January. It means nobody recorded January. The charts cover the months the
  register covers, and a genuine zero INSIDE that window is still drawn.
- **A nested subset shares its parent's window** (`alignTo`), so recordable
  cases are known for exactly the months incidents are known for and neither
  line gaps under the other. In a roll-up a month is unrecorded only where
  every development in it is — one development's register starting in July
  does not erase another's June.

What is still modelled is what nothing dates: workforce, productivity,
exposure and utilisation come from the progress curve, and those cards keep
saying so. `apportionCount` survives for the one series nothing can date — an
NCR records when it was raised and not when it was closed — and it is not
plotted.

## The operating history, and the one rule that makes it safe

`src/domain/history.ts`. Every trend chart in the approved design needs the
position MONTH BY MONTH, and the system holds one figure per development plus
whatever periods have been filed — on a new deployment, none. So the history is
MODELLED from the development's own progress curve, on the owner's instruction
that the dummy data should cover history too, and the modelling obeys one rule:

**THE LAST POINT IS THE REPORTED POSITION, EXACTLY.** Not approximately, and
not a separate figure that happens to look similar. Every series is scaled so
its value at the data date is the value the register carries, so a trend chart
and the tile above it can never disagree about where the development stands
today. What is modelled is the SHAPE of how it got there, and every trend card
says so in a line beneath it.

**Counts come from the register, never from a formula.** Incidents were
computed from manhours and produced about twenty on a development whose
register holds five — two counts of the same thing, with TRIR built on the
wrong one reporting 6.20 where the rows say 1.55. The register decides how many
there were; the curve only decides which months they fell in. Same for
non-conformances.

`apportionCount` spreads a whole count across weighted months by LARGEST
REMAINDER. Naive rounding with the leftover dumped on the last month is what
made the incident trend spike vertically at its right-hand edge: five incidents
over eight months round to nought or one each and everything left over landed
on August. A chart that draws an artefact of its own arithmetic is worse than
no chart.

**TRIR and LTIFR are computed and were literals** — the same 0.45 and 0.31 on
every development whatever its workforce, which is a rate that describes
nothing. Both are now events per 200,000 exposure hours from the incident
register and the manpower register's hours. `RECORDABLE` and `LOST_TIME` hold
the standard definitions: a near miss and a first-aid case are recorded and are
NOT recordable, and a restricted-work case is recordable but is not a lost-time
injury. Getting that wrong in the generous direction makes a safety record look
worse than it is, which is how reporting quietly stops.

## The operational registers, and what is authored versus derived

Nine more registers on `ProjectRegisters`, and the split is the point.

**Authored** (`data/mock/operations.ts`) — four, because they record EVENTS
rather than restate a position and nothing in the system implies them:
incidents, observations, HSE inspections, material approvals. Scaled to each
development by exposure hours or by package count.

**Derived** — everything else, from a register that already exists:

- `training` and `permits` from the trades on site, so a course is required
  only where somebody needs it; a fixed training matrix measures a development
  against requirements it does not have;
- `qualityInspections` from the non-conformances — every FAILURE carries the
  NCR it raised, so first-time-right traces back to named defects rather than
  to a figure nobody can follow;
- `resourcePlan` from the workforce and the progress: past the peak trades come
  off, before it they go on, so the plan is a property of where the development
  is rather than a number typed once;
- `maintenance` from the equipment register's own service dates.

`EquipmentItem` gained `lastService` and `nextService`, both OPTIONAL: a
development registered from the workbook has no equipment at all, and a machine
somebody just added has no history. Absent reads as "not recorded" rather than
as a date.

**None of these carries money**, and the tender pipeline is simply the packages
whose `awarded` is null — no new register, because the answer was already
there.

## The sub-registers are derived, and that is what makes them agree

`correctiveActions`, `mitigations`, `attendance` and `workforce` on
`ProjectRegisters`. They are built by `subRegisters` in `project-state.ts`,
called from BOTH branches — the stored one and the re-derived one — so a
development whose rows come back exactly as stored and one that has been
touched get them the same way, from whatever rows that development has.

None of them is stored and none of them is authored:

- a **corrective action** answers a real NCR by its number, so the two counts
  cannot disagree and no action can name a non-conformance that does not exist;
- a **mitigation** answers a real risk by its id, and only where the score is 8
  or above — writing one for every entry is how a risk process becomes
  paperwork nobody reads. Its residual is the band below, a TARGET, and the
  register's score does not follow it;
- **attendance** is the manpower register's own manhours apportioned across the
  weeks, so the weekly view and the monthly figure cannot disagree and no
  control is needed to say so;
- **workforce by counterparty** attributes each trade to the package that
  bought it, so headcount and hours tie exactly. A trade with no matching
  package goes to the delivery partner rather than being dropped: somebody on
  site belongs to somebody.

**None of them carries money.** Every riyal reaches the position through one
road — packages, certificates, claims and the period — and a second road
through an operational register would be a way to move a figure without the
review it exists to pass. A corrective action costs something; what it costs
arrives as a variation.

`screens/subtabs.tsx` is the sub-tab row they surface through, with the active
tab in the URL beside scope, the way Cost has always done it. The parameter is
deleted when the first tab is selected — a URL saying `?tab=register` when
register is simply what you get is noise in a link somebody is about to paste.

## Paid is confirmed, never inferred

`claim:pay` (migration 012), the PMO manager's act and nobody else's — refused
in `mayMutate` for every other seat, including the project manager assigned to
the development. A certificate they may record; a transfer they may not.

Approving a claim says what a contractor is OWED. Nothing said the money had
left. A claim sitting at Approved could only be moved by recording another
claim, which would certify the same milestone twice — so the cash position went
stale and the difference between "we agreed to pay this" and "we have paid
this" was invisible on every screen that showed it.

**It moves `paid` and nothing else.** Not certified: the work was certified
when the claim was approved. Not earned value, not actual cost — those come
from the period, as they do for every cash event. Control 14 bounds it (paid
may never exceed certified), so a transfer larger than what is certified comes
back 422 with that sentence rather than being accepted and reported.

**`claimId` is a reference, not a key.** The claims register is derived from
the development's own position and applies money to the oldest unpaid claim
first, which is what a payment run does. Storing a per-claim paid figure here
would let a claim be paid an amount its own arithmetic does not produce —
exactly what `deriveClaims` exists to prevent.

**Releasing retention is the same act, through the same form.** A claim paid
its full net still holds what was withheld from it as security, and until the
release arm existed there was no door to return it: `ConfirmPayment` only ever
showed on a claim awaiting transfer, so a development whose every claim was
settled could never release what it held. The claims drawer now offers
**Release retention** on a Paid claim whose withheld security has not been
returned — same seats, same `claim:pay` mutation, and the register applies a
transfer above the net total as released retention, oldest claims first, which
is what a real release run does. Do not invent a separate mutation for it: a
release IS money leaving the account.

## A contract can be recorded after registration — `contract:award`

Registration used to be the only door contracts had, so a development that
later bought another slice of scope had no way to say so — the next dead end a
real user hits (§6.2c of the MVP review, now closed). `contract:award` is one
shape for two acts, decided by the package number:

- a **new id appends** a procurement row — out to tender (`awarded: null`, an
  estimate, committing nobody) or awarded;
- an **existing tendered id is awarded**: the row is replaced by this one, so
  the award carries the real value and the real counterparty rather than the
  tender estimate. A package already awarded is refused — an award is a
  promise, and correcting one is an audit-trail story, not a silent overwrite.

Only an award moves committed cost, exactly as at registration. The seat is
the approver's and the administrator's (a commercial act, like registering and
amending), it is in `REPORTING_KINDS` so a closed development refuses it, and
the soundness checks live in ONE place — `awardProblem` in
`data/project-state.ts` — called by the server route AND the mock repository,
so the demo refuses what the platform refuses. `contractsFromLog` is the one
fold that replays registration plus awards into the current contract list.

On a SEEDED development the recorded package is appended beside the stored
register with the stored rows apportioned to the residual (the recorded-claims
rule applied to procurement) — without the residual, control 7 would read the
award twice. The UI is the **Record package** form on Procurement at Project
level (`screens/AwardContract.tsx`), which also offers awarding each tendered
row. `check:newdev` drives both paths and the refusals, and is proven to fail
against a neutered `applyAward` and against the touched-list omission.

## The programme dates, and the status a reported position implies

`project:update` carries `start` and `finish` (description, not measurement —
validated as parseable dates, `duration` derived from the pair). Until it did,
a created development could never state its programme: the workspace's year
strip could not reach the year the job started, and nothing could say a period
was reported past the planned completion, because no screen knew when that was.

`applyPeriod` now derives `status` from the period itself — `reportedStatus`
in `domain/calc.ts`, the one spelling: SPI or CPI below 0.95 is **At Risk**,
below 0.90 is **Delayed**, and a period whose data date is past the stated
planned finish with EV still short of PV is **Delayed** whatever SPI
compression near completion says. "Not complete" is EV < PV, never the
progress percentage — progress is EV over the APPROVED budget, which a
finished job never reaches while contingency exists, and testing it would
call a complete development Delayed for ever. The eight seeded developments
keep their authored status: it is the owner's narrative, and only a reported
period earns a derived one.

## Reopening an approved period is a message, not a mutation

An approved period is the record of what the owner has spent, so the month
strip locks it, and the way back depends on who is asking (`workspace/Reopen.tsx`):

- The **PMO manager returns it** — the same act as returning from Review &
  Approve, through the same route, with the same audit trail. What was missing
  was reaching it from the month you are looking at rather than from a queue.
- **Everybody else asks**, and the request is a MESSAGE to the approvers. That
  is the right shape, not a shortcut: it moves no figure, it is append-only,
  and "I asked for October to be reopened on the 4th" is precisely the claim
  the message table exists to settle. A request that changes nothing has no
  business in the log of things that did.

A reason is required either way, and the button says so while it is missing.

## Risk levels are derived from the score, on the owner's confirmed bands

`src/domain/risk.ts` — 1–3 low, 4–6 low-medium, 8–12 medium, 15–25 high,
confirmed by the owner. One place, and `RISK_BAND_TEXT` writes the legend from
the same array so a screen cannot describe a policy the code does not apply.

**The level is derived, never read from the row** — the SPI and CPI rule, for
the same reason. The register carries a stored `level` authored beside the
score and on several rows the two disagree: RISK-013 on RES-01 is stored Medium
against a score of 16, which is High. The stored field stays, so the fixtures,
the database and the parity check are untouched, and nothing reads it.

The matrix is a heat map on ONE scale. Its axis weights are 5, 3 and 1 rather
than 3, 2 and 1: they used to top out at 9 while the register beside them
scored the same risk 25, so the coloured square and the number disagreed about
which band a risk was in. Colouring cells by their contents instead was tried
and is worse — it empties the chart, and a matrix exists to say what a zone
means before anything is plotted in it.

## Closed is not archived, and the difference is the whole feature

Three lifecycle states, not two. `archived` says a development should never
have counted — cancelled — so it leaves every screen and only the seat that
put it away can find it. `closedAt` says the opposite: it counted, it is
finished, and its figures are now the record of what the owner actually spent.

`project:close` and `project:reopen` (migration 011), the approver's and the
administrator's act. A project manager reports progress; they do not decide
that the job is over. Closing does exactly two things:

- **It freezes the development.** `mayMutate` refuses every kind in
  `REPORTING_KINDS` against it — period, certificate, claim, variation,
  amendment — **before the seat is considered**, so no role is exempt, the
  administrator included. That is what makes the closing figures final rather
  than merely the last ones anybody entered. `DataProvider.commit` checks the
  same list from the same constant, so the offline build behaves like the
  platform and the two cannot drift.
- **It takes it out of the CONTROL arithmetic.** `agg` drops closed
  developments by default — at the function, not at each call site, because
  every existing caller means "the portfolio I am steering" and a roll-up that
  quietly included a finished development would just be a little large, which
  nobody would spot. A caller that wants everything it was handed asks by name:
  `agg(list, 'as-given')`.

**The assistant's brief follows the same rule**, and it has to. `buildBrief`
TOTALS what it is given, so a closed development left in it would have the
assistant quoting a portfolio budget that no screen on the system agrees with —
the exact failure this design exists to prevent. `/api/ai/assistant` filters
with `active()` at Corporate and Portfolio level and not at Project level, the
same line ScopeProvider draws. `check:qa` closes a development, asks at
Corporate, and requires the brief not to name it.

It does **not** hide it. `useProjects()` still returns closed developments, so
the scope picker reaches them and every register screen renders them exactly as
before; `ProjBand` marks them on every screen; the Projects screen's Completed
tab lists them and totals them separately. ScopeProvider holds the one rule
that makes this coherent: at Corporate and Portfolio level the list is
`active()`, at **Project** level it is the development you asked for, closed or
not — otherwise opening a finished job would show a screen of zeros.

The reconciliation controls keep running over closed developments deliberately.
A frozen development whose registers stopped agreeing with its position would
mean the record of a finished job had rotted.

`project:reopen` **deletes** `closedAt` and `closeNote` rather than setting them
to undefined: a reopened development must be indistinguishable in its data from
one that never closed, or the key travels through JSON and the parity check
sees a development the fixtures do not have.

## A required note is required on the server too

`text()` in `server/validate.ts` accepts `""`. Every id and name it guards is
non-empty in practice, so nothing had shown it up — but a NOTE is different: it
is the only part of archiving, closing out, reopening or amending that a reader
a year later cannot reconstruct. The screens had always required one; the
server was accepting an empty string, so anything posting straight at the API
could file a closure that explained nothing. `reason()` is `text()` plus "and
it must say something", and the four kinds that carry a note use it. Found by
the gate written for `project:close`.

## A disabled button must say why

The owner reported the archive button as "not working at all". It was working:
it was disabled until a reason was typed, and nothing on screen said so. From
the outside those are the same thing, and the second one costs more, because
the person concludes the system is broken.

So every control that refuses in advance now says why beside it (`.form-hint`):
the archive, close and reopen dialogs, returning a period on Submissions, and
Record Claim where a development has no awarded package. `check:qa` and
`check:uat` both assert the disabled state AND the sentence — a gate that only
checked the button would pass on the defect that was reported.

## Amending a development is how the register becomes real

`project:update` (migration 009) corrects a development's **description**: the
name, the portfolio, the delivery route, the delivery partner and the Approved
Development Budget. It is the act that turns the placeholder developments the
system was demonstrated with into the owner's real portfolio — from the tool,
without a migration and without a developer.

**No field on it is a reported figure.** Actual cost, earned value, certified
and paid are the product of periods and certificates entered by one person,
validated by a second and approved by a third; a form able to overwrite them
would be a way around the entire workflow, so the route does not accept them
and `check:qa` proves an amendment carrying one is refused.

A field left undefined is left alone, and an amendment that changes nothing is
refused — an audit trail full of no-op entries is one nobody reads. The `note`
is required for the same reason.

Two rules the server holds:

- **Only the approver and the administrator.** A project manager reports on a
  development; they do not decide what it is called or what its budget is.
- **The approved budget may not go below the control budget**, which is the
  part already broken into packages. Refused in `routes.ts` with that sentence,
  rather than letting it come back as "WBS Budget vs Control Budget" — control
  1 would catch it, and tell the person nothing about what they typed.

`applyProjectUpdate` clamps the control budget and moves the AFC **only while
it still tracks the budget** (`afc === budget`). Once a period has forecast
something, that figure is somebody's forecast and this form has no business
overwriting it.

## The control budget follows the packages, or there are no packages

`projectFromInput` tests `packages.length`, **never `planned > 0`**. Packages
supplied become the WBS register, so a set of them summing to zero took the
"no packages" fallback of 95% of the authorised budget and left the register at
nought against it — control 1 then refused the write with a 422 and the Add
Project dialog sat open. The shipped template has example package rows, so
importing it walked straight into this: that is what made Add Project look like
a button that did nothing.

Deriving both figures from the same list is what makes them unable to disagree.
`check:qa` posts packages summing to zero and requires a 200.

The other half of the fix is at the boundary: `readProject` **skips a package
row with no budget and a contract row with no counterparty**, and reports the
counts in `skipped` so the review panel can say so. A row with no budget is an
example somebody left alone, not a package — but dropping it silently would
mean a person who typed six rows and registered four never learns which
arithmetic they are looking at.

The template's Delivery Route note said "Self-Delivered" and the system has
only ever accepted "Self-Execution". The note is corrected, and
`normaliseRoute` keeps every workbook already sent out working.

## Handing the browser a file

`src/components/ui/download.ts` is the one place an anchor is clicked. Three
screens produce files and each had grown its own, which had drifted. Two
details matter and only one is obvious: the anchor must be **in** the document
(a detached `click()` is ignored by Firefox and WebKit), and the object URL
must **not** be revoked in the same tick (the click only schedules the
download). That is the shape of "the export button does nothing".

The Report Centre's PDF and Excel buttons were wired to a toast saying export
was not connected. Excel is now `saveCsv` — CSV rather than `.xlsx` because a
workbook **writer** has no business inside `dist/index.html`, and every
spreadsheet application opens a CSV. PDF is `window.print()` against the
`@media print` block, which hides the application around `.report-sheet` using
`visibility` rather than `display`, because the sheet is a descendant of what
is being hidden.

## The model

`gemini-3.5-flash-lite`, reached from `server/gemini.ts` and **nowhere else**.
`GEMINI_MODEL` overrides the identifier so a newer one — or a rollback — is an
environment change rather than a deploy. `GEMINI_BASE_URL` exists so a test can
stand a stub in front of it; it is never a user input.

**The REST API called with `fetch`, no SDK.** Same reason as `xlsx.ts`: a
generative-AI SDK adds a dependency tree to a function that is bundled on every
deploy, in exchange for a `generateContent` method that is forty lines here.

### Two uses, and neither of them can write

- **The assistant** (`POST /api/ai/assistant`). `server/ai-brief.ts` computes
  every figure from the same position and the same functions the screens read.
  The model gets that brief and the question, and is instructed that **every
  figure it states must appear in the brief**. It is doing the job it is good
  at — reading a question asked in a hurry — and none of the job it is worst
  at, which is arithmetic about money. Where no model is configured, or the
  call fails, the deterministic rules in `AIAssistant.tsx` answer instead and
  the screen says which the person is reading.
- **Document extraction** (`POST /api/ai/extract`). Returns fields for a FORM,
  with a confidence per field. The person edits them and presses Create, which
  files an ordinary `ipc` mutation through `commit` — the twenty controls run
  before the write, exactly as for a typed one. A field the reader could not
  make out comes back **null**, and the row says "not read" rather than showing
  a plausible number in a box.

### The brief is the access boundary

It is built from the developments **this person may see**, so a project
manager's assistant cannot answer about a development they were never assigned:
the model is never shown one. `check:qa` asserts that a project manager's brief
names exactly `RES-01` and nothing else.

### It answers as this system, not as the model behind it

`ASSISTANT_IDENTITY` makes it the Tazayud PMO assistant and tells it not to
name, hint at or speculate about what is behind it — ordinary white-labelling,
the same way the workbook reader does not announce which zip library it uses.
It is also told **never to claim to be a person**: pretending to be a colleague
would be a real problem the first time somebody relied on it. It carries the
hard domain rules too — owner not contractor, every contract value a cost,
never the words revenue, profit or margin.

### The rate limit is per person, in memory

Published limits for this model are of the order of 15 requests a minute for
the whole KEY, so one person holding Enter can spend everybody's quota. Eight a
minute and sixty an hour per account, held in a `Map` on the instance. On a
serverless host each instance counts separately, so the real ceiling is that
times the warm instances — still far under the key's, and it costs no table and
nothing to operate. Move it to Postgres only if a bill says otherwise.

### Proven without spending a request

`check:qa` stands up a stub that speaks the same wire format and asserts what
this system owns: the key travels as a header and never to the browser, the
brief carries the live position, a project manager's brief carries only their
own developments, the system instruction says what it should, temperature is
zero, reading a document files nothing, an executive viewer is refused, an
unauthenticated call is refused, and the rate limit bites.

## Messages are a record, and they are not mutations

`db/migrations/010` adds `messages`. Everyone signed in may write to everyone
else, **including the executive viewer** — the person who may only read the
figures is exactly the one most likely to need to ask somebody about them, and
a message moves nothing.

**A message is not a mutation.** It is not appended to the change log, not
replayed by `replayProjects`, and not put through the reconciliation controls,
because it moves no figure. `/api/messages` is a different route from
`/api/mutations` for that reason: a conversation able to change the reported
position would be a way around the whole review-and-approve workflow, and
`check:qa` asserts no message ever reaches the change log.

They are **append-only**. Never edited, never deleted — the same reason an
account that has acted is withdrawn rather than erased. "I told you about that
in March" is the claim this table exists to settle, and a record somebody can
quietly rewrite is worth less than none.

`project_id` is a **reference, not a foreign key**. A message about a
development that is later removed is still a true record of what was said; the
screen shows the id and links through only while that development is still in
the portfolio.

`read_at` drives the recipient's own unread badge and **nothing else**. The
sender is never shown a read receipt: that is a surveillance feature dressed as
a convenience.

**Not in the snapshot, and not a socket.** `MessagesProvider` holds its own
state and its own poll, because the snapshot is the reported position and
carrying a conversation alongside it would mean every new message invalidated
the position. There is no long-lived process to hold a WebSocket open on a
serverless host, and `correspondentsFor` answers the inbox in ONE query rather
than a directory query plus one thread query per person.

**The intervals are 60s for the inbox and 20s for an open conversation, and a
POLL NEVER WRITES.** They were 25s and 8s, and on the deployment that produced
`FUNCTION_INVOCATION_TIMEOUT` in front of somebody trying to type. Three causes,
all fixed together:

- an invocation arriving with no warm instance pays a cold start AND a fresh
  pooled Postgres connect before doing any work; at eight-second intervals a
  share of those do not finish inside the function's limit;
- every poll issued an `UPDATE` marking the thread read — writing constantly to
  record a fact recorded the first time. `mark=1` is now sent only when a
  person actually opens a conversation;
- `openConversation` depended on `people`, which is a new array after every
  inbox poll, so it changed identity every minute, re-fired the screen's effect
  and re-fetched the thread. It uses a functional state update instead.

`vercel.json` also sets `maxDuration: 30` on the function, and the model
timeout in `gemini.ts` is 25s so a slow model produces its own sentence rather
than a platform timeout.

**A failed poll is not an error.** `Messages.tsx` toasts only when a person
OPENED the conversation or SENT something. A poll that fails leaves the last
thread on screen and says so quietly at its foot — the same principle as
`commit`, where a failed refresh is not a failed write.

**Messages is routed but not in `NAV`.** It is reached from the speech-bubble
button in the top bar, which carries the unread count and is visible from every
screen; the sidebar lists what the portfolio is made of, and a conversation is
not one of those. `verify.mjs` asserts 23 sidebar modules.

In the self-contained build `authRequired` is false, the poll never starts, and
the screen says plainly that messaging needs the hosted platform. A scripted
conversation between people who do not exist would be the one thing on that
screen a person could not tell from the real product.

## The glossary is one list, read twice

`src/domain/glossary.ts` holds every term the system shows a user, with the
formula the code actually computes. Two things read it: the `Glossary` screen,
and the `Info` marker that sits beside a term where a screen **first** uses it —
a tile label or a column heading, never every cell. Never retype a definition
into a tooltip; a definition that disagrees with the code is worse than none,
because it is believed.

The marker links to `#/glossary?term=<id>`, which highlights that term. An
unknown id renders nothing rather than an empty marker onto a blank panel.

The Dashboard's sixth tile is **Paid to Date**, not the old Financial Position
tile, which restated the Budget Variance tile beside it in words. Its sub-line
carries the share of committed cost and the certified figure, both small, and
the tile links through to the cash position. Certified is summed from
`ipcSubmitted` in the screen rather than added to `Aggregate`, because only
that tile reads it.

## Routing
Hash-based, because the deliverable opens off the filesystem. Scope lives in the query, so a
view is a link: `#/cost?level=Project&portfolio=Commercial&project=COM-01`. Changing scope
and navigating in one handler must be a **single** navigation — doing it in two steps races,
because both build their target from the URL as it was before the handler ran.


## The backend seam (Phase 5)

`src/data/repository.ts` chooses between two implementations at build time on
`VITE_API_URL`. Both compute state the same way, because both call
`src/data/project-state.ts` — one replay, shared. If they computed it separately
the app would show one position and the server would enforce another, which is
the class of disagreement this system exists to detect.

`npm run check:api` runs both and compares them field by field, then perturbs a
development's earned value directly in the database and proves the server refuses
to write on top of a system that no longer reconciles — and that the identical
request succeeds once the defect is removed.

The database vendor is **not chosen**. Keep it that way: plain SQL migrations, no
provider extensions, `pg` confined to `api/`.

## Inside the write lock, everything uses the lock's client

`withWriteLock` checks one client out of the pool and hands it to the callback.
**Every query the callback makes goes through that client** — `wouldBreakIntegrity`
and `mutationLog` take a `Queryable` for exactly this reason, the way
`appendMutation` always has. Two things break otherwise:

- A read on the pool is **outside** the transaction, so it cannot see what the
  transaction has done and is not covered by the lock it holds. The
  reconciliation check would then be run against a position that is not the one
  about to be committed, which is the disagreement this product exists to
  detect.
- On the deployment the pool holds a **few** connections, and one invocation
  asking for a second while holding the first is a **self-deadlock**: nothing
  releases the client the callback is waiting for, because the callback is what
  holds it. There is no error and no outgoing request — the invocation simply
  runs until Vercel ends it at 30s and the browser is told
  `FUNCTION_INVOCATION_TIMEOUT`.

That is what stopped Add Project working: `POST /api/mutations` took the lock
and then read the seed, the log and the corporate data on the pool. It never
reproduced locally, where the pool holds ten. `npm run check:api` therefore runs
the server with **`PGPOOL_MAX=1`** — the deployment's pool shape — so every
write it drives crosses the one connection the platform gives it. Two nets under
that: `connectionTimeoutMillis` (`PGPOOL_TIMEOUT_MS`, 6s) makes exhaustion an
error instead of a hang, and the handler answers it 503 in words rather than a
generic 500.

Never "fix" a deadlock here by raising `PGPOOL_MAX`. That only moves the hang to
the next concurrent write.

## Roles and separation of duties

Six seats, and they are ROWS an administrator edits rather than a list in the
code — see **Seats are data** below. What the product ships with:
`contributor` (inputs, assigned developments only), `reviewer` (validates,
cannot input or approve), `approver` (signs off periods and claims, and
PROPOSES changes to a development), `director` (reads everything, files
nothing, and AUTHORISES those changes), `reader` (sees everything, edits
nothing), `admin` (superuser).

**The hard rule lives in the database, not the server.** `db/migrations/004`
carries CHECK constraints: the submitter can never be the reviewer or the
approver, and the reviewer can never be the approver. A trigger enforces that a
contributor may only submit for an assigned development, and that no other
non-admin role may submit at all.

**The admin is exempt, on the owner's instruction (migration 006).** An admin
may enter, validate and approve the same period, so one account can report
when the PMO seats are away. Every other role stays bound. Because a CHECK
constraint may not read another table, the three `sod_` constraints became one
trigger that looks the actor's role up; the constraint NAMES live on inside its
exception messages, which is what `refusal()` in `server/routes.ts` and
`check-duties.mjs` both match on. The exemption is never silent: the same name
appears in two stages of the approval trail and the screens say so.

The cost is stated plainly in `docs/LAUNCH_READINESS.md`: an admin can put a
figure on the dashboard with nobody else involved. Do not widen it further, and
do not extend it to any other role without the owner saying so.

Never move these into application code "for a better error message". A rule
enforced only in the server holds until someone writes a script, runs a
migration, or fixes data by hand. `npm run check:duties` proves all of it with
raw SQL and the API bypassed entirely — both halves, the admin let through and
the same account refused once demoted — and is proven to fail: dropping the
trigger produces `THE DATABASE ALLOWED IT` seven times.

`server/auth.ts` mirrors the roles as capabilities (`can(principal)`) so routes
can refuse early with a useful message. That mirror is a convenience, never the
enforcement.

## Identity (Phase 6)

**There is no sign-in in the self-contained build, and there must never be.**
`AuthProvider` sets `authRequired` from `apiUrl`, so with `VITE_API_URL` unset the
`AuthGate` is a pass-through and `dist/index.html` renders exactly as it always has —
no login wall in front of the pitch demo. The pixel gates prove it at 0.000%.

With `VITE_API_URL` set the app is gated: no token, no data, because the API refuses
unauthenticated reads. `AuthGate` sits OUTSIDE `DataProvider` for that reason — loading
data before there is a token would fail every request behind the login form.

The platform build is a **website, not a file**. It must be served over HTTP: a
`file://` page has an opaque origin and Chromium blocks its requests to the API. Only
the self-contained build is meant to be double-clicked.

`npm run check:platform` builds it, serves it, and drives a real browser through
gate → wrong password → sign-in → data, then changes a value directly in Postgres and
requires the screen to follow. That last step is what proves the app is not quietly
still on the fixtures.


## Excel import

`server/xlsx.ts` is a minimal .xlsx reader — a zip of XML, read against
node:zlib in about a hundred lines rather than pulled in as a dependency that
would parse attacker-supplied archives with far more surface than the job
needs. `server/pt-template.ts` maps a filled sheet onto the same payload the
entry form produces.

**It lives on the server on purpose.** Parsing in the browser would put a
spreadsheet reader into `dist/index.html`, and the portable deliverable has no
use for one.

**Importing fills the form; it does not file the period.** The reconciliation
panel then shows whether the sheet agrees with itself and the person decides.
An import that filed straight into the workflow would be a way to enter data
without looking at it.

Cell references are FIXED (the workbook itself says to keep the rows fixed)
and were read off the real file. Section 1 and 2 are merged three-column
blocks: label in A, G or M, value in D, J or P. `verifyStructure` refuses a
sheet whose section headers have moved, rather than reading figures from the
wrong rows — and that guard is covered by a check that feeds it a valid but
wrong workbook, because rubbish bytes only exercise the zip reader and left
the guard untested.

## Project assignment

Absence of an assignment is absence of permission: a contributor with no
assigned development can submit nothing. `npm run db:users` therefore **fails**
if any development in the database has no contributor assigned, and names them —
checked against the projects actually present rather than against the seat list,
because the two drifting apart is how a development gets missed.

The current split (7 to Muhammad, LND-02 to Momin) is a **dummy-phase
assumption for testing**, not ownership. Real assignment follows the migration.

## Every module, every TAB, at three widths

`npm run check:layout` drives the sidebar it finds in the DOM — not a
hard-coded list — and then **every tab of every module**, 123 views in all. It
used to check the default view of each module and stop, which is why six of the
cost module's seven views, the portfolio filters and the glossary's tabs were
never looked at by anything. That is exactly where the owner found a donut
drawn through its own legend and a bar chart clipping every label longer than
eight characters.

Two detectors were added with it, and both are written the way they are because
the obvious version passes on the bug:

- **Text wider than its box** is caught by measuring a `Range` over the
  element's own text, NOT by `scrollWidth`. With overflow left at its default
  `visible` there is no scrollable area, so Chrome reports `scrollWidth ===
  clientWidth` while the words are painted straight across the next column —
  which is the defect this exists for.
- **Two siblings drawn on top of each other**, by rect intersection, between
  children of one parent only. Positioned elements are excluded because a
  drawer, a tooltip and a modal are meant to cover the page.

A third was added with the chart keys and is written the same way: **a chart
drawing more than one series must name them on the page.** It counts the
series from the paint, not from a prop, and it was proven to fail — 45 failures
across fifteen charts — before it was believed. See **A chart draws its own
key** above.

The first two skip anything inside an `<svg>`: a donut's segments are one circle
drawn many times. The filter is `closest('svg')`, not `ownerSVGElement`, because that
property is **undefined** on an HTML element — `!== null` was true for every
div on the page, and the gate went green while looking at nothing. Whenever a
new detector is added here, re-introduce the defect and watch it fail first.

The two defects it found live in the shared primitives, so they were on more
screens than the two the owner reported: `Donut` carried a spacer with
`marginLeft: -size + 22` that dragged the legend back across the ring, and
`HBars` gave every label a fixed 52px box (Commitments, Forecast, Manpower,
HSE). Both are grids now, and the label track is `max-content`, so bars still
align while no label is ever cut.

## Deleting a development is an archive that expires

The owner asked to be able to delete a development — gone from every
dashboard, every report and every roll-up — and to be able to change their
mind. Not for ever: for a stated number of days, "and the system should ask
how many, minimum thirty".

So a deletion IS `project:archive`, carrying `retainDays`. The development
leaves every live screen at once, and `Project` gains `archivedAt` and
`retainUntil`. Inside the window the same seats put it back in one click;
outside it, restoring is refused with the date and an administrator may purge
it. `src/domain/retention.ts` holds the floor (30), the default (30), the
ceiling (730) and every predicate, and the form, the API and the validator all
read it — so a screen cannot offer a period the server refuses.

Three things it deliberately does NOT do:

- **It erases nothing at the moment of deletion.** A development that reported
  figures is referenced by the change log, by period submissions and by
  messages; erasing it there and then would leave an audit trail naming
  something that never existed.
- **It does not expire on a timer.** There is no long-lived process on a
  serverless host to run one, and a cron that silently erased the owner's data
  would be the one act in this system with no entry in the log. Expiry is
  READ: past the date the Archive tab says so and offers removal instead of
  restoration, and the purge appends `project:delete` like any other act.
- **It does not use the reporting data date.** Retention is wall-clock, so
  `now` is always PASSED IN and every function in that file is pure.

`Projects` shows it on its own table under the **Archive** tab — when it went,
why (read from the act in the change log, never stored twice), and how many
days remain — because a reader there wants the countdown, not a budget
variance. Absent is not zero: a development archived before retention existed
carries no window, so nothing about it has expired and it stays restorable.

## Proposed, then authorised

The second two-person control, and it is the same shape as the first. A
reporting period is entered by one person, validated by a second and approved
by a third. The acts that decide what a development IS — register, amend,
delete, restore, close, reopen, award a package — took effect the moment the
PMO Controls Manager pressed the button. On the owner's instruction they now
take two: the manager PROPOSES and the Director AUTHORISES.

**One sentence decides which side a caller is on**: a seat that can
`authorise` or `administer` acts directly; a seat that can only `approve`
proposes. There is no second list of roles to keep in step with the first, and
every existing administrator-driven gate keeps passing unchanged.

`AUTHORISED_KINDS` in `src/data/mutations.ts` is the list, shared with the
browser so a screen can say "this will be sent for authorisation" BEFORE the
button is pressed. `useProposes()` is the one place that question is asked.
Monthly data entry is deliberately NOT in it: it has its own three-stage
workflow, and a second queue in front of it would mean a period waiting on
four people.

`db/migrations/016` is the queue. **It is not the change log**, and that is
the whole design: a row there has moved nothing, appears in no roll-up, and is
not replayed. The mutation is appended at the moment of authorisation, through
the same write lock and the same twenty reconciliation controls as a direct
act — so a proposal that was sound on Monday can be refused on Thursday, and
`check:api` proves exactly that.

Four rules the design turns on:

- **The PROPOSER's capability is re-checked at authorisation, not the
  authoriser's.** The Director's authority is to let a change through, not to
  perform it; re-checking against the authoriser would mean the second
  signature could only come from somebody able to have done it alone. It is
  re-read at that moment rather than trusted from proposal time, so a proposer
  since withdrawn or moved to another seat no longer has a proposal worth
  authorising.
- **The change log names the AUTHORISER**, the rule `approveAndRecord`
  already follows for a period: the entry records when a figure entered and
  whose signature let it in. Who proposed it is in the queue, with the reason
  and the decision note — the whole trail, and more than the log could hold.
- **Withdrawing is not a decision.** Taking your own proposal back needs no
  authority beyond having made it, so the trigger returns early on
  `state = 'withdrawn'`; without that branch the proposer could not cancel
  their own request and the route answered 500.
- **One development holds one pending proposal.** A second would be
  authorised against a development the first had already moved.

A reset clears the queue with the log, in one statement. Left standing, a
proposal from a previous run made the next attempt at the same act come back
"already has a change waiting for authorisation", naming a proposal nobody in
the room had made.

## Seats are data, and the app reads flags rather than names

`db/migrations/015` moves the roles into `role_capabilities` — a table the
administrator edits from **Administration → Roles & Permissions** — and adds
the sixth seat, `director`. Five flags, not one "may write": a reviewer writes
a review and must never input, an approver writes an approval and must never
input either.

**The rule still lives in the database.** `assert_separation_of_duties` and
`assert_may_submit` read these flags, so a script, a migration or a
hand-edited row is bound exactly as the API is. What changed is that the rule
is stated as "a seat exempt from separation of duties" instead of "the seat
called admin" — one indirection, no loosening. THE EXCEPTION NAMES ARE
UNCHANGED, because `refusal()` and `check-duties.mjs` both match on them.

`src/domain/seats.ts` is the one shape: the database holds it, `server/auth.ts`
imports the type rather than declaring a second copy, `/api/me` and the
sign-in response carry it with the account, and the shell asks `can.approve`.
Every `account.role === 'approver'` in the app is gone — NAV and the workspace
tab row take a `needs` PREDICATE, not a list of seat names, because a list
would hide every module from a seat defined this morning and go on offering
them to one whose flags were taken away this afternoon.

What the screen will not do:

- **`sod_exempt` is never settable.** A screen that could hand it to a new seat
  could dissolve separation of duties in two clicks. Changing it is a
  migration, which is the friction it should have.
- **The `admin` seat is fixed.** Removing `administer` from it is the one click
  that could lock every administrator out, silently.
- **A seat somebody holds is not removed** — their next request would find
  their role missing — and a seat the product names in code never is.
- **The last authorising seat cannot lose `authorise`** while it is the only
  one, or the queue would never empty.

Two things that follow, and are easy to get wrong:

- **Apply the WHOLE migrations directory, in name order — never a named
  subset.** `db/seed-users.ts` applied 002 and 004 by name, so 004 put back the
  CHECK constraint 015 drops, and issuing the Director account failed on a
  schema that was correct a moment earlier. 004 now adds that constraint only
  while `role_capabilities` does not exist.
- **`currentSeat` joins users onto role_capabilities, so every column is
  qualified.** Unqualified, `role` is ambiguous, Postgres answers 42702, and
  because that lookup runs on every authenticated request the whole platform
  answers 500 while every query a gate reaches directly still passes.

## Portfolios and delivery routes are data

`db/migrations/017`. The last two lists that needed a developer, and there
were FIVE copies of the four portfolio names: a union type in
`domain/types.ts`, a constant in `server/validate.ts`, a colour map in
`Dashboard.tsx`, another in `Projects.tsx`, and a JSON array in the
`corporate` key/value row. Adding a fifth meant editing all five and
deploying.

`Portfolio` and `DeliveryRoute` are now `string`. The names are kept as
aliases rather than replaced everywhere, because they still say what a field
MEANS at every use, which is most of what the union was doing.

**They are NOT foreign keys on `projects`, and that is deliberate.** A
development registered through the application exists only in the mutation
log — the whole design of the replay, and the reason migration 013 removed two
FKs — so a constraint would bind the eight seeded developments and none of the
ones people add, and no constraint reaches a portfolio name inside a JSON
payload. The guard that matters, "a portfolio a development is in cannot be
removed", is therefore computed over the REPLAYED position in the route that
removes one. Same shape as "a seat somebody holds".

**A portfolio carries ONE tone** (`domain/portfolios.ts`), and everything that
draws one asks there. Before this, Residential was navy in the Dashboard chart
and blue in the Projects pill: two colour keys for one thing, and neither had
an answer for a portfolio added tomorrow. The tie was resolved in favour of
the CHART — four saturated, well-separated hues, where the pills had a grey —
so the Dashboard is pixel-identical and the pills moved to match it.

**Renaming is not offered, at any level.** Every development carries its
portfolio's NAME as its own value, in `projects` and inside payloads in the
change log, so a rename would orphan all of them silently and nothing would
look wrong until a roll-up came back empty. `updatePortfolio` in `db.ts`
accepts tone and reading order and nothing else. Add the right one, move the
developments, remove the empty one — three acts somebody can see.

Two consequences worth knowing:

- **`validateMutation` takes a `Vocabulary`.** It cannot know the portfolios
  any more than it knows the developments, so it is handed both. A validator
  with its own idea of the four would refuse a portfolio somebody added this
  morning, from a form that offered it.
- **`corporate()` serves the portfolio ROWS, not the seeded name list.** The
  `corporate` key/value row is a snapshot of what the product shipped with and
  is left in place, ignored; the tables are what a deployment holds now.
  `/api/reference` is the same two lists PLUS the development count, which
  only the Administration panel reads — counting the replay per portfolio on
  every snapshot would be work nobody looks at.

The seed in migration 017 and `SHIPPED_PORTFOLIOS` / `SHIPPED_ROUTES` in
`domain/portfolios.ts` are the same four and the same two, and they have to
be: one is what a database holds, the other what the offline build ships with.
A migration cannot import TypeScript and the fixtures build has no database,
so two places is unavoidable — and `check:api` compares them row for row. It
caught the first drift within a minute, which was one apostrophe.

## The soundness of a lifecycle act lives in one place

`lifecycleProblem` in `src/data/project-state.ts` — a budget below the control
budget, a retention window that has closed, a development closed twice, a
delete of something that still reports. `mayMutate` holds the CAPABILITY half,
because only the server knows what seat a caller holds; this holds the half
that is about the development, so the browser repository calls it too.

That split is the point. The server used to hold both and the offline
demonstration held neither, so restoring a development eleven months past its
window worked in the demo and came back 403 on the platform. A gesture that
works in the demonstration and fails in the product is worse than one that
fails in both, because it is learned first.

## Deployment

`docs/GOING_LIVE.md` is the runbook. Two facts that are easy to get wrong:

- **`VITE_API_URL` unset means the offline demo.** A deployment without it is
  the fixtures build, correctly. Setting it is what makes a deployment a
  platform.
- **The API has two entry points and one handler.** `server/handler.ts` is
  shared by `api/[...path].ts` (serverless) and `server/server.ts` (a
  long-lived process). Add behaviour to the handler or the routes, never to
  one entry point — they must not drift.
- **Never add a VALUE import through `@/` to anything the server imports**
  (`src/domain/*`, `src/data/*` except the browser-only files). Type-only
  imports are fine — TypeScript erases them. A value import passes every local
  check, because Vite and tsx both resolve the alias, and then fails only in
  the serverless deployment, whose bundler does not. `npm run check:bundle`
  bundles the function with tsconfig deliberately blanked and fails the build
  if the alias is ever needed at runtime.

The current dev instance holds **dummy data only** and is throwaway. The
production vendor is pending IT and legal, and `AUTH_SECRET` must be changed
when the data is replaced so no token from the throwaway instance stays valid.
