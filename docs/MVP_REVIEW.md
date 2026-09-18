# Tazayud Owner PMO — Adversarial MVP Review

**Full-platform review against the brief of 7 September 2026 · main @ e8ad446 → this branch**

---

## 1. Verdict

**Ready for the dummy-data phase, after this branch merges — and not before.** The review
found ten defects a paying customer's team would have hit in their first hours, three of
them serious: a development registered through the app could never be assigned or reported
on (both answered 500), the closed-development freeze never covered reporting periods (the
kind that moves the most figures), and a development registered through the app was handed
RES-01's contractors, non-conformances, risks and fleet the moment its first period was
filed. All three sat squarely on the owner's stated concern — a new development, end to
end — and all three are fixed on this branch with gates that fail on the defect. **The
owner tests the deployed platform: none of these fixes reaches it until this branch is
merged and deployed, and migration 013 is applied.**

Two parts of the product are **not ready** and are stated as such below: forecast entry
for future months does not exist (a data-model decision the owner must make, §6.2), and
the trend charts run on a modelled history that is honest but thin (§6.3). Neither blocks
the dummy-data phase; both will be asked about in the first hour of a real pilot.

Every gate is green at the head of this branch: `npm run verify` (now including the new
`check:newdev` and the widened `check:scope` and `check:recon`), `check:api` (241),
`check:qa`, `check:platform`, `check:duties`, `check:uat`.

---

## 2. What was tested

- **Formulas** — EV, PV, SPI, CPI, AFC, variance, progress, retention, TRIR/LTIFR,
  productivity, first-time-right, evaluation scores, apportionment and rounding, each
  traced to its own inputs in `src/domain/` and the fixtures.
- **A new development, end to end** — registered by form and by workbook, assigned,
  reported, certified, claimed, paid, amended, closed, reopened, archived — at the model
  level (`check:newdev`), against Postgres through the API (`check:api` §11), and on the
  screens.
- **Roll-up correctness** — every fold and concatenation in `domain/rollup.ts` against the
  sum over the developments beneath it (`check:recon`, +60 identities), the assistant's
  brief, closed/archived membership of every roll-up.
- **Every route at every scope** — `check:scope` now discovers the routes from `App.tsx`
  rather than enumerating thirteen, and fails if discovery goes blind.
- **The server** — the full role × kind × route matrix, validation of every field
  (negatives, `1e999`, string numbers, empty strings, `__proto__`, oversized bodies,
  crafted zip archives), the write lock, TOCTOU races, error shapes, the AI routes, the
  workbook importers, messages, accounts.
- **The gates themselves** — every `scripts/check-*.mjs` read for what it does NOT look
  at; four gates were found passing while looking at nothing and are fixed (§4).
- **Determinism** — every `new Date()` at runtime hunted; one screen ran on the wall clock.

## 3. Defects found and fixed (each with the gate that now holds it)

Ranked by what they would have cost in front of the customer's team.

| # | Defect | Fix / gate |
|---|--------|-----------|
| 1 | **A created development was handed RES-01's registers the moment its first period was filed.** `registersFor` fell back to the RES-01 templates for any id the fixtures did not know: the one real awarded contract vanished, replaced by 13 template packages under other organisations' names, 3 NCRs dated before the development existed, 8 risks, a fleet, and 13 zero-value "Approved" payment claims. F-09 fixed at creation, resurrected by the first period. | An app-registered development now holds only what was recorded against it (its period's WBS/categories, its registered contracts + one explicit "not yet packaged" row, claims synthesised from the actual certificates and claims in the log). `check:newdev` drives the whole lifecycle and fails with 45 named leaks on the old code. |
| 2 | **A created development could never be assigned or reported on.** Two foreign keys pointed at the `projects` seed table; a created development exists only in the mutation log, so assignment and period filing both answered 500 — for everybody, the admin included. | Migration 013 makes both references what `messages.project_id` already is: a reference, not a foreign key. `check:api` §11 registers, assigns, files, validates and approves. **The owner must apply migration 013 at deploy.** |
| 3 | **The closed-development freeze never covered `period:submit`.** `/api/periods` never consults `mayMutate`, so a period could be filed, validated and approved against a settled final account; the gate that "covered" this asserted `status >= 400` on a malformed body and passed on the validator's 400. | The route refuses closed and archived developments at entry; approval re-checks inside the write lock (a close between submission and approval refuses the approval); the client's `submitPeriod` carries the same guard. The gate now posts a valid body and requires the closed-out sentence. |
| 4 | **Cash Flow manufactured a red exception out of a constant.** The tab assumed retention at a flat 10% of certified; the claims register has carried the real figure since payment claims landed. On 5 of 8 developments the assumption exceeded certified-less-paid, so the flagship module showed "Paid above certified" in red — including at Corporate — while control 14 passed beside it. | The tab reads withheld-less-released from the claims register, as Payment Claims does. RES-01 now reads "Fully settled", which is what the register says. |
| 5 | **Two "Composite Forecast" figures for one scope.** Analytics summed per-development forecasts; the Cost module forecast the summed position. BAC ÷ CPI is not linear: 44M apart at Corporate, both inside tolerance so nothing flagged it. | `forecastScope` (per development, summed) is the one implementation; both screens read it. `check:scope` now compares the two screens' figures at Corporate and fails if they part. |
| 6 | **The scripted AI Extract filed against a development nobody chose.** The review pane names RES-01 (the fixed sample); the commit used the scope's hidden drill-in project — approve RES-01's certificate, move COM-01's position. | It files against the development the review pane shows. |
| 7 | **The Project Workspace ran on the wall clock** — `new Date()` in the screen whose own calendar module says "a constant, never `new Date()`". It opened on September ("Nothing filed") over a position as at 31 August, moved silently every month, and broke build determinism. Hand-typed dates were parsed with bare `Date.parse`, which reads the two date shapes in different timezones. | The workspace's "now" is the data date; filed periods are what move the strip. Dates go through `parseDate`; the implied data date is written from a constant table, not `toLocaleDateString`. |
| 8 | **The trend charts contradicted the tiles above them.** First-time-right's last point was modelled from the NCR count (≈90% on RES-01) while the tile computes passed-over-inspections (45%) — under a caption asserting they are the same figure. Productivity divided by `manhours × (i+1)`, which is not the sum of a ramping series. The NCR line was drawn at a fixed ×10 and painted over the card header at Corporate (11 × 10 on a 0–100 axis, with SVG overflow visible). | The history takes the register's own fraction at the data date, unrounded, weighted by inspections at roll-up so the combined endpoint equals the tile's own arithmetic at every scope; productivity divides by the running sum of the series' own months; the NCR multiplier is computed from the series and stated in the caption. |
| 9 | **A budget amendment left every register restating the old budget.** `project:update` never marked a development touched, so the WBS root and the category table went on printing the amended-away figure under a band showing the new one. | Budget-carrying amendments re-derive the registers; name-only amendments leave the pristine fixture rows alone. Held by `check:newdev`. |
| 10 | **"Open" still had four definitions.** The unification recorded in the engineering notes missed the evaluation scorecard and integrity control 9's side B (`!== 'Closed'`), both of which counted a Completed non-conformance — answered and signed off — as open: the scorecard docked the counterparty for finished work, and control 9 was primed to report MISMATCH on a reconciled register. | `isOpenNcr` everywhere (evaluation, control 9, derive, history, Quality's closed count). `check:newdev` asserts a Completed NCR scores as closed. |

Smaller, same classes: archived developments leaked by id to every seat
(`/api/projects/:id`, `/api/registers/:id` → 404 now); `mayMutate` re-checked inside the
write lock (two racing writes could double-close a development, or land a certificate on
one in the instant it was being closed); references validated non-empty (a variation approval naming no
variation, a transfer settling claim `""`, a zero-value claim were all accepted as
permanent no-op audit entries); unknown fields stripped before a mutation is stored (any
writing seat could append a megabyte of junk per call into a log that is replayed for
ever); a crafted zip answered 500 on `/api/projects/parse`; `/api/ai/extract` admitted the
approver it then refused; `DELETE` missing from CORS; the client toasted the raw
`{"error":…}` envelope instead of the sentence inside it; Documents offered AI Extract to
seats the server refuses; Evaluation's closing sentence named the smallest commitment as
the lowest score (`worst` vs `weakest`); Cost → Commitments at a roll-up had colliding
React keys and no Development column; the Drawer could hold a selected tab that no longer
existed and render an unlabelled panel; Record Claim held the previous development's
package selection across a scope change; `Prog` painted a package drawn beyond its
commitment the same green as one settled exactly (now red); `HBars`/`Donut` emitted
`NaN` geometry on all-zero registers (the empty-register case a new development exposes);
stored `progress` was still read in three places (now `progressOf`); a cost category's
status had three rules (now `costCategoryStatus`); Glossary re-implemented the roll-up by
hand; the standalone `#/period` route rendered the hidden drill-in development's entry
form at Corporate scope (now asks, like the workspace and Overview); Projects' KPI row
and Review & Approve now say plainly that they show the whole register/queue; the
integrity badge recomputed 8 × 20 controls on every keystroke (memoised).

## 4. The gates that were looking at nothing

Four instances of the house's own fifth defect class, in the harness itself:

- `check:scope` **enumerated thirteen modules while its own comment claimed every route** —
  the exact failure that let the Overview survive the first fix, re-created in the gate
  written to prevent it. It now discovers routes from `App.tsx` and fails if discovery
  finds fewer than twenty.
- Its money comparisons turned `undefined` into `0`, so a missing KPI row or TOTAL row
  made every check `0 === 0`. The rows must now exist and be non-zero before they may agree.
- The "period against a closed development" check posted a **malformed** body and accepted
  any 4xx — the validator's 400 kept it green while a valid period sailed through.
- `check:coherence` only ever ran with an empty mutation log, so the re-derived (touched)
  register branch was never coherence-checked. It now runs every development both ways.
- `domain/rollup.ts` had **no arithmetic gate at all**; `check:recon` now holds 60 fold
  identities at Corporate and per portfolio, proven to fail (35 failures on a sabotaged fold).

## 5. Found, judged, and deliberately not fixed

| Item | Why not |
|---|---|
| **F-01** (touched registers re-derive from the position, so controls 1–10 cannot fail for them) | **Acceptable for the MVP.** The seven invariant controls and the per-package/claims controls (11–20) hold regardless; `check:api` proves a figure edited under an untouched register is refused. The honest fix — persist registers with each approved period — is the single most valuable engineering item on the roadmap (§6.1) and is not a dummy-phase blocker. |
| The assistant quotes `agg`'s stored-EMV sum beside register-derived counts | Bound by control 10 to be equal; unifying would touch the brief for no observable change. |
| No rate limit on `/api/mutations` or messages | Real, but the accounts are six and issued by the owner; the WAF item already on the go-live list covers the internet-facing risk. Recommend a per-account limit when accounts grow. |
| Password reset does not evict live sessions; `/api/me/password` works only because `id = email` | Recorded for the identity-provider phase; not reachable harm in the dummy phase. |
| Mutation `at` timestamps are client-asserted | The log row's own server `now()` makes drift detectable; bounding `at` to a window is a small server change best made when the owner decides how back-dated closeouts should behave. |
| WBS collapse/expand is dead at a roll-up (codes carry no dots) | Cosmetic; the tree is two levels there by design. |
| `check:qa`/`check:uat` wrap ~200 checks in one `try`; export checks verify shape, not figures | Harness debt, not product. Listed in §6 as the next gate to write (export-vs-screen equality). |
| Fixture first-time-right at Corporate is ≈50% (derived passes cap at 12/development) | Consistent everywhere now, but unflattering; a data-shape choice the owner may want raised before demos. |

## 6. Ranked recommendations

### 6.1 Bugs / engineering debt (do without asking)

1. **Persist registers with each approved period** (retires F-01). Everything else in the
   controls story is now gated; this is the one structural IOU.
2. **A door for contracts after registration.** ~~Packages and counterparties can only
   enter at `project:create`.~~ **Done (September 2026):** `contract:award` records a new
   package (tendered or awarded) or awards a registered tendered one — the approver's
   act, through the same controls, from the Record package form on Procurement.
   `check:newdev` drives it at the model level and `check:e2e` awards a package mid-year
   through the browser. The same batch added a **Release retention** arm to the claims
   drawer (a paid claim holding security had no door to return it), programme dates on
   `project:update`, and a derived status on reported positions — a created development
   can now read At Risk or Delayed.
3. **Export-content gate**: assert the Report Centre CSV's figures equal the screen's at a
   non-default scope (the current checks prove a BOM and four strings at Corporate).
4. **Run the DB-backed gates in CI.** `npm run verify` covers the offline build only;
   `check:api/qa/platform/duties/uat` run when a human remembers. A GitHub Action with a
   Postgres service would have caught #2 and #3 of §3 the day they were written.
5. Split `check:qa`'s single `try` so one throw cannot silently skip ~200 checks.

### 6.2 Gaps for the owner to decide

1. **Forecast entry for future months** (open item 6 in LAUNCH_READINESS). The position
   holds one adopted AFC per development. Decision needed: a `period:forecast` kind
   (month, planned progress, expected cost, basis), excluded from EV and the indices,
   drawn dashed on the S-curve. Until decided, the workspace's future months say "not
   started" and a director will ask why they cannot plan in a planning tool.
2. **Seeded approved periods for the demo.** The trend charts model history from the
   progress curve and say so on every card. Honest — but "the months before are modelled"
   on eight of eight developments will be read as "the trends are fake". Filing three
   or four real periods per development before the pitch turns the caption into "modelled
   before March" and the objection disappears. **The mechanism is now proven at scale:**
   `check:e2e` files, validates and approves THIRTEEN monthly periods on RES-03 through
   the three real seats — so this is a data-entry exercise, not a build.
3. **The admin exemption** stands as specified (one account can carry a period through
   every stage); restated here only because every new reader of the audit trail will ask.
4. **Assignment model**: `db:users` requires every seeded development assigned, but
   created developments carry no such requirement — decide who chases assignment when a
   real development is registered.

### 6.3 Polish (high value, low risk)

1. Empty states for every table and chart (a new development now reads honestly empty —
   several registers show a bare "no rows" line where a designed empty state should say
   what would fill it).
2. Consistent number alignment (tabular figures) in register tables.
3. The messages poll's 300-row conversation cap needs a "showing the latest 300" line.
4. Density/dark-mode: see §7 — do not start it before the design direction is agreed.

## 7. The aesthetics workstream, and the 3D question

**On 3D charts: no — and here is the argument to give the owner once, plainly.** A
perspective bar or tilted pie is the one chart family that makes a figure harder to read:
occlusion hides the back of the series, foreshortening makes near bars read larger than
far ones of the same value, and a reader can no longer compare two bars by eye. This
product's entire pitch is that its numbers can be trusted — twenty reconciliation
controls run before every write. A chart that systematically flatters whichever number
stands in front is that pitch's opposite, wearing a costume. Every serious dashboard
vendor has walked away from 3D for exactly this reason.

**What to build instead — the "feels expensive" that costs nothing in truthfulness:**

- **Depth through elevation, not perspective.** A two-tier shadow scale on cards, a
  slightly warm neutral ground, 1px hairline borders, and the band/KPI/table hierarchy
  made explicit. Spend the depth on the container; keep the data flat.
- **Motion with intent.** Draw-in on chart mount, one count-up per tile per load, hover
  states that lift and reveal the exact figure, and `prefers-reduced-motion` respected.
  Nothing may animate on re-render (the pixel gates will hold this honest).
- **Better chart types, not fancier ones** — each drawable in the existing hand-built SVG:
  a **waterfall** for Budget → Variations → AFC on Cost; **bullet bars** on the KPI row
  (actual against target against range); **sparklines** in the Projects table rows; a
  **gauge pair** for SPI/CPI against their thresholds; a **claimed → verified → approved →
  paid flow** on Payment Claims; a **heatmap calendar** for the reporting months at
  portfolio level; **small multiples** so eight developments compare at a glance on
  Analytics.
- **Typography and rhythm**: one type scale, tabular figures wherever numbers align, a
  spacing scale used everywhere. Most "looks cheap" is eleven font sizes.
- **Palette discipline**: RAG strictly for status, categorical colours strictly for
  categories (already the rule in `CATEGORY_COLOURS` — extend it to every screen), one
  accent used sparingly.
- **Designed empty/loading/error states** — the new-development flow now exposes real
  empty registers; they are the first thing a new customer sees.

**Process**: render the direction on two screens first — Dashboard and Cost — get the
owner's yes, then apply to the other twenty. Constraints that hold throughout: hand-built
SVG only (no chart library inside the single-file deliverable), zero runtime fetches,
deterministic rendering, `npm run baseline` once per agreed change, `npm run check:layout`
after every visual change.

## 8. What is on the owner, stated plainly

1. **Merge this PR.** Nothing here reaches the deployed platform until then.
2. **Apply migration 013** to the dummy database (`db/migrations/013_created_developments.sql`)
   — without it, registering a development still works and assigning or reporting on it
   still fails with a 500.
3. The go-live list in LAUNCH_READINESS §8 stands (password rotation, `AUTH_SECRET`,
   `ALLOW_RESET`, migrations 005/006/011 — now 013 too).
4. Decisions requested: §6.2 items 1, 2 and 4.
