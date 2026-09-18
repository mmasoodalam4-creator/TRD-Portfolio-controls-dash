# Tazayud Owner PMO — Launch Readiness Report

**Integrated Portfolio & Project Controls System · pre-launch review**

Date: 4 September 2026 · Scope: platform (Vercel + Supabase) and self-contained demonstration

Revision 2 adds the access model the owner specified on 4 September: see section 10.
Revision 3 adds profiles, account management and the reporting workbook: see section 11.

---

## 1. Verdict

**Ready for the dummy-data phase.** Every automated gate is green, all 78 user-acceptance cases pass against PostgreSQL in a real browser, and every defect found by the review is fixed except the items in section 7, each of which is a documented limitation, a product gap or an owner's decision rather than an error.

**Not yet ready for real data**, for reasons outside the code: the production database vendor is pending IT and legal, the database password shown in a screenshot during setup must be rotated, and `AUTH_SECRET` must change when the dummy data is replaced. Section 8 is the go-live list.

| Area | State |
| --- | --- |
| Formulas and links (EV, PV, SPI, CPI, AFC, variance, forecast, 20 controls) | Verified: 160 control checks, 80 reconciliation identities, 56 forecast checks, all green |
| Backend security and workflow | 20 findings fixed; 156 API checks, 20 workflow checks, 21 separation-of-duties checks green |
| Screens (quality, formatting, honesty) | 17 modules reviewed and corrected; layout proven at 3 widths; no fabricated figures remain |
| Access model | The owner's specification of 4 September built and gated: see section 10 |
| Accounts, profiles and the workbook | Built and gated on 5 September: see section 11 |
| UAT | 78 of 78 cases, six real accounts, five roles |
| Documentation | User manual (Markdown + Word), API contract, go-live runbook, this report |

---

## 2. How the review was run

Three independent review passes, each with its own brief, followed by a fix cycle and a full re-run of every gate:

1. **Technical** — server, authentication, database, routes, mutation handling, deployment seams. Adversarial: what can a signed-in person do that they should not; what breaks under bad input.
2. **Formula and data** — every derived figure traced from its inputs: earned value, indices, forecast methods, the reconciliation controls, register derivation, fixture coherence.
3. **Quality and formatting** — every screen for dead controls, placeholder content, hard-coded figures, wrong colours, spelling, overflow, keyboard and accessibility.

Each finding was logged with a severity and a location, fixed, and then guarded by a check so the fix cannot silently regress. Where a fix changed a figure or a pixel, the corresponding baseline was re-frozen deliberately and the reason recorded in the check itself.

**Findings logged: 86. Distinct after merging duplicates: 79. Fixed: 74. Documented limitations: 5** (section 7).

| Source | Critical | High | Medium | Low / Info |
| --- | --- | --- | --- | --- |
| Own pass (MY) | 1 | 3 | 3 | 2 |
| Technical (T) | 2 | 6 | 8 | 4 |
| Formula (F) | 1 | 8 | 8 | 6 |
| Quality (Q) | 2 | 10 | 13 | 9 |

---

## 3. What was wrong, and what was done

### 3.1 Backend security and workflow (all fixed)

| Finding | Risk | Fix |
| --- | --- | --- |
| A period could be posted straight to `/api/mutations` as fact, bypassing review, approval, assignment and separation of duties (T-01) | Critical | Refused with a message naming `/api/periods`; the gate that used to assert the bypass now asserts the refusal |
| Any non-reader could truncate the whole audit log via `/api/reset` (T-02) | Critical | Admin only, and only when `ALLOW_RESET=1` is set on the deployment |
| Approval was two statements with no transaction: a failure between them left a period approved but unreported (T-04) | High | One transaction under an advisory write lock; integrity re-checked inside it |
| `return` had no capability check — a reader could return a period; a submitter could return their own (T-03) | High | Role and separation-of-duties checks; a return needs a note and records who and when (migration 005) |
| Re-submitting an approved period silently reset it to submitted and erased the approval (T-11) | High | Upsert only replaces `submitted` or `returned` rows; anything else is refused with a message |
| No schema validation on mutations: strings into numbers, nulls into 500s, negative certificates (T-05, T-06) | High | `server/validate.ts` validates every kind, every field, with bounds |
| Unassigned contributors could record certificates; assignment was only checked on periods (T-05) | High | Per-kind role and assignment rules before any write; unassigned period filing now refused before the figures are looked at |
| Decompression bomb and quadratic regex in the Excel reader (T-07) | High | Output cap (16 MB), entry cap (2000), linear parsing |
| A malformed `Host` header crashed the self-hosted process (T-08) | High | URL parsed against a constant inside a try/catch → 400 |
| Login timing leak; password hashing blocked the event loop (T-09) | Medium | Async scrypt; a dummy hash is compared for unknown emails |
| Raw database error text returned to clients (T-10) | Medium | Only separation-of-duties constraint names are mapped to 409; everything else is a generic 500 and logged |
| Role trusted from the token for eight hours (T-15) | Medium | Role re-read from the database on every request |
| Vercel pre-parses JSON bodies; the Excel upload and return note used non-JSON bodies and would have failed only in production (T-14) | Medium | Both are JSON; body reading is event-based with a size limit → 413 |
| No pool error handler; pool size wrong for serverless (T-13, T-20) | Medium | `pool.on('error')`; `PGPOOL_MAX` defaults to 1 on Vercel |
| Approval timestamp was the submitter's client clock (T-12) | Medium | Server `now()` on every log entry |

### 3.2 Formulas and data (all fixed unless noted)

| Finding | Fix |
| --- | --- |
| Forecast: three of five methods were the same formula (BAC ÷ CPI) under different names, carrying 70% of the composite (F-02) | Three distinct methods — optimistic, cost-based, pessimistic — weighted 0.2 / 0.5 / 0.3; the composite is compared to the adopted AFC with a two-sided 2% tolerance |
| No invariant controls: certified exceeded actual cost on six of eight shipped developments and nothing said so (F-05) | Seven invariant controls added (11–17): EV ≤ BAC, PV ≤ BAC, control ≤ approved, paid ≤ certified, certified ≤ actual, actual ≤ committed, committed ≤ AFC. The seven certified-to-date figures were corrected and the parity snapshot re-taken with the reason recorded |
| Period Entry seeded level-1 and level-2 packages together, double-counting, and opened already failing a control (F-03) | Seeds leaf packages; filing rebuilds the hierarchy from the codes |
| WBS totals disagreed with their own rows for PV, EV and AC on every development; a package could show more earned than its budget (F-04, F-21) | Apportioned from the root at every level, capped at each package's budget, remainder to the largest share; status derived from the row's own figures |
| Dashboard S-curve was the corporate fixture whatever the scope (F-06); Overview curve scaled by a hard-coded constant (F-07) | Both are the sum of each in-scope development's own monthly curve, so they land on the KPI row beside them |
| A certificate added its gross value to actual cost **and** earned value (F-15) | A certificate moves certified and paid only; earned value and actual cost come from the period |
| Variation approval said "added to committed cost" but moved no figure (F-08) | The message says what happens: status changes; committed cost follows the next period |
| A new development was handed RES-01's registers — risks, contractors, a fleet — with nothing spent (F-09) | A new development has an explicit **Unallocated** package and cost line carrying its whole budget, and otherwise empty registers; it reconciles on day one |
| Category earned value off by one riyal from per-row rounding (F-14) | Largest-remainder apportionment |
| Risk EMV multiplied exposure by probability when exposure already was the EMV (F-17) | Exposure shown as EMV; matrix and category donut counted from the register |
| Favourable/unfavourable colour and wording hard-coded green on twelve screens (F-11) | One `varianceTone` / `varianceWord` pair, applied everywhere |
| Divide-by-zero printed `NaN%` on eight screens (F-19); `mn()` mishandled negatives and non-finite values (F-18) | Guarded helpers; symmetric abbreviation |
| "Average SPI" label on a figure that is the ratio of sums (F-20) | Renamed Portfolio SPI / CPI |
| Fixture prose contradicted fixture numbers — the assistant quoted an SPI of 0.78 that no longer existed (F-22) | Every assistant answer is computed from the developments and registers in scope |
| Manpower showed a productivity rate in SAR per manhour (F-23) | Removed; the screen carries headcount, hours and a productivity index only |
| Seven of eight planned finish dates precede the data date while PV is 49–68% (F-13) | **Data, not code.** Flagged for the real-data migration; the fixtures are dummy |
| Registers of a development that has been changed are re-derived from its position, so controls 1–10 cannot fail for it (F-01) | **Architectural limitation, mitigated.** Registers of untouched developments are stored data and stay independent — the API gate proves a figure edited directly in the database is caught. The seven invariant controls hold in every case. Roadmap: persist registers per period so every control compares stored data with stored data |

### 3.3 Screens (all fixed)

| Finding | Fix |
| --- | --- |
| Thirty filter controls across eight registers that filtered nothing (Q-08) | Controlled filter bar with one shared `applyFilters`; every register filters and searches, with a Clear button and an honest empty state |
| Dead tabs on ten screens ("Risk Assessment", "Mitigation Plans", "Resource Plan", …) and placeholder drawer tabs reading "Content for X" (Q-13, Q-14) | Removed. Every remaining tab and button does something |
| Hard-coded panels presented as measurement: HSE TRIR/LTIFR and incident charts, manpower trend lines, Analytics "94% accuracy", a risk matrix of 28 risks over a register of 8, six fixed documents (Q-17) | Derived from the registers where a source exists; where none exists the screen says so (HSE, Documents) instead of inventing one |
| A CSS class collision made the reconciliation rows on Period Entry unreadable (Q-01) | Renamed |
| Top bar overflowed at laptop width; Dashboard cards pushed past the viewport; grids used bare `1fr` tracks that refuse to shrink (Q-03, Q-11) | `minmax(0,1fr)` tracks; the layout gate now asserts real overflow at three widths |
| Errors surfaced as success toasts; buttons stayed enabled during a request (Q-04, Q-05) | `toastError`; busy states on every committing button |
| The role, name and sign-out on the platform came from the demo switcher (Q-07) | The shell reads the signed-in account; the switcher exists only in the demonstration |
| Notification badge fixed at 4; "History" tabs showed a static list (Q-10, Q-12) | Unread count from state; History reads the real audit log |
| Unknown scope in the URL rendered zeros and NaN (Q-09) | Scope validated and repaired |
| American spellings mixed with British; "Utilization", "Labor", "Favorable" (Q-22) | British English throughout, including the fixture trade names |
| Keyboard: navigation were not buttons, drawers did not close on Escape, dialogs had no role (Q-24) | Buttons, `useEscape` on every overlay, `role="dialog"` and labels |
| Add Project accepted an empty budget or a duplicate id with only a toast (Q-20) | Inline validation of id format, name and amount before the button acts; server refusals surface as errors |
| Integrity "Re-run" did nothing (the report recomputes on every render) and "Export" was a toast (Q-27) | Re-run removed and the text says the controls are live; Export writes a real CSV in the browser |
| The platform had no way to record a certificate: AI Extract is (correctly) disabled there | **Record certificate** form on the Cash Flow tab for contributors and admins, through the same validation and controls |

---

## 4. Formulas and links — what was verified

Every figure a screen shows was traced to its definition and checked by an automated gate:

| Figure | Definition | Where enforced |
| --- | --- | --- |
| Earned value (fixtures) | AC × BAC ÷ AFC, on the owner's instruction, so the adopted AFC is coherent with performance | `check:parity` snapshot |
| Earned value (entered period) | Σ package budget × actual % | `check:api` §6 |
| Planned value | Σ package budget × planned % | `check:api` §6 |
| SPI, CPI | EV ÷ PV, EV ÷ AC — derived, never stored | `spiOf` / `cpiOf`; lint forbids reading the stored fields |
| Budget variance | Approved − AFC; positive favourable | `varianceTone` on every screen |
| Forecast | Optimistic AC + (BAC − EV); cost-based BAC ÷ CPI; pessimistic AC + (BAC − EV) ÷ (CPI × SPI); composite 0.2/0.5/0.3 | `check:forecast` (56 checks) |
| TCPI to adopted | (BAC − EV) ÷ (AFC − AC), dash when nothing remains | `check:forecast` |
| Monthly curves | Per development, summed for a scope; pinned to the position at the data date | `check:forecast` both ends |
| Reconciliation controls 1–10 | WBS ↔ control budget, WBS AC ↔ cost register, curves ↔ WBS, categories ↔ AFC, procurement ↔ committed, manpower totals, quality counts, risk exposure ↔ EMV | `check:recon` (80 identities), `check:integrity` (140 checks) |
| Invariant controls 11–17 | EV ≤ BAC, PV ≤ BAC, control ≤ BAC, paid ≤ certified, certified ≤ AC, AC ≤ committed, committed ≤ AFC | `check:integrity`, and server-side before every write |
| WBS roll-up | Every parent equals the sum of its children; packages sum to the control budget; PV and EV never exceed a package's budget | `check:recon`, screen review |
| Category earned value | Apportioned by budget share, exact to the riyal | `check:recon` |

Both the browser and the server compute state through one shared replay (`src/data/project-state.ts`), and `check:api` compares them field by field across every development and register.

---

## 5. Gate results

All results are from the final run on this branch, after every fix.

| Gate | Proves | Result |
| --- | --- | --- |
| `npm run verify` | lint, server typecheck, single-file build, serverless bundle, Vercel ESM layout, API origin handling, headless render of 19 screens, pixel parity on 19 screens and 21 states, scope integrity (74), layout at 3 widths (204), real actions (12), domain rules, data parity, reconciliation (80), forecast (56), integrity engine (140) | Green |
| `npm run check:api` | Both repositories identical field by field; the server refuses a write when a figure edited directly in the database breaks a control, and accepts the identical write once it is removed; the full submit → validate → approve road; every shortcut refused; validation and role rules; project-manager visibility; archive, restore and remove; the admin exemption; the workbook served and read back; profiles; account issuance and withdrawal | 156 checks, green |
| `npm run check:workflow` | Three people, three stages, every shortcut refused | 20 checks, green |
| `npm run check:duties` | Separation of duties with raw SQL, the API bypassed; the admin let through and the same account refused once demoted; the change-request trigger driven the same way; proven to fail if either trigger is dropped | 31 checks, green |
| `npm run check:platform` | The served platform build, gated, signed in, rendering figures from Postgres and following a change made directly in the database | 11 checks, green |
| `npm run check:uat` | Seven real accounts through Chromium against PostgreSQL, including the manager proposing and the Director authorising | 99 of 99 cases |
| `npm run check:qa` | Every option pressed in a real browser: the workbook end to end, amendment, the delete dialog and its retention window, the archive countdown, restore, the authorisations queue, defining a seat and taking a capability away from it, the refusals, the exports, every module for every seat | 193 checks, green |

---

## 6. UAT

Full results with expected and actual values: `docs/UAT_RESULTS.md`. Screenshots: `tests/output/uat/`.

| Role | Account | What was proven |
| --- | --- | --- |
| Every role | all six | Sign-in gate; wrong password refused with no data shown; name and role in the shell; sign-out returns to the gate |
| Reader | Fawwad Hussain | Opens all 20 modules; no Add Project, AI Extract or certificate form; the Project Workspace opens without Monthly Reporting; the server refuses a write whatever the screen shows |
| Contributor | Muhammad | The workspace's Monthly Reporting tab opens reconciling; files RES-01 period 9; sees it awaiting validation with no Validate or Approve on their own period; refused for LND-02 (not assigned); cannot validate via the API; records a certificate from the Cash Flow tab; a certificate above cost incurred is refused by the server |
| Contributor | Muhammad Momin | Files LND-02 |
| Reviewer | Muqtida Sajjad | Sees Validate, not Approve; validates RES-01; returns LND-02 with a note that is shown with their name; cannot approve via the API |
| Approver | Raza Adil | Sees Approve, not Validate; approves RES-01; the approval is what moves the reported position; cannot validate via the API |
| Director | Fawwad Hussain | Authorises what the PMO manager proposes, from the Authorisations queue; declines with a note; never authorises their own |
| Admin | Masood | Sees the seats the database holds and no switcher; may change what a seat carries, and may not dismantle their own; may file for any development; **cannot** validate their own filing (409 naming the rule); reset refused on the platform |
| Cross-cutting | — | An unknown scope in the URL is repaired; Escape closes drawers; keyboard focus reaches the navigation; zero JavaScript errors across every session |

---

## 7. Open items and known limitations

None of these is an error in a figure or a hole in a control. Each is stated so nobody is surprised by it.

| # | Item | Why it is open | What to do |
| --- | --- | --- | --- |
| 0 | The Owner Admin can carry a period through every stage alone | The owner's decision of 4 September 2026, not a defect | Nothing to fix. Keep the admin seat to as few people as possible, and read the approval trail: one name at two stages is visible there |
| 1 | **F-01** Registers of a development that has been changed are derived from its position, so controls 1–10 cannot catch a bad register on it | Registers are not yet stored per period; only the position is | Untouched developments keep stored registers (proven independent). The seven invariant controls hold everywhere. Roadmap: persist registers with each approved period |
| 2 | **F-13** Fixture dates and the corporate curve are not realistic | Dummy data | Replace at migration; the controls will report on the real data |
| 3 | **T-09** No rate limiting on sign-in | Not implementable in the function without shared state | Enable Vercel's WAF rate-limit rule on `/api/auth/login` before real accounts are issued |
| 4 | **T-19** No Content-Security-Policy header | The single-file build inlines all scripts, which CSP forbids without a nonce per build | HSTS and Permissions-Policy are set. Revisit if the platform build stops being single-file |
| 5 | Product gaps that the screens now state honestly: no HSE incident register; no document store; retention assumed at 10%; report export not connected; document extraction not connected (see 8.6) | Not in this release | Each is a register or integration to add; none affects the reported position |
| 6 | **Forecast entry for a future month is not built.** The workspace shows future months and says they have not started; it does not yet accept planned progress and expected cost against one | A forecast needs somewhere to live. The position holds one adopted AFC per development, not a figure per future month, so this is a data-model addition rather than a form — and a forecast that silently moved earned value or the indices would be worse than none | Next: a `period:forecast` kind holding month, planned progress, expected cost and the basis, excluded from earned value and the indices until the month is reported, and drawn dashed on the S-curve |
| 7 | **The operating history behind the five trend charts is modelled, not reported** | The system holds one current position per development and the periods that have been filed, which on a new deployment is none. Every series is scaled so its LAST POINT is the reported position exactly, and every trend card says the months before it are modelled | It replaces itself: as periods are filed, the modelled months become reported ones. Nothing else reads the history — no control, no roll-up, no forecast |
| 8 | **The counterparty roles a contract package can name are still a type in the code** | A short closed list — Main Contractor, Trade Contractor, PMC, Consultant, Supplier — that the evaluation scorecard reads by name. Portfolios and delivery routes moved to tables in migration 017; this one did not, because nothing has asked for a sixth | Nothing is blocked. If one is ever wanted, it moves the same way portfolios did: a table beside them, the validator handed the list, and the same "in use is never removed" refusal |
| 9 | **Four operational registers are authored fixtures**: incidents, observations, HSE inspections, material approvals | They record events, which nothing in the system implies, so they cannot be derived. Scaled per development by exposure hours or package count. Dummy-phase data of the same kind as the rest of the fixtures | Replaced by what people actually record. The other five operational registers — training, permits, quality inspections, the resource plan and maintenance — are derived from registers that already exist and cannot disagree with them |

---

## 8. Go-live list

The full runbook is `docs/GOING_LIVE.md`. The items that this review adds or emphasises:

1. **Rotate the database password** that appeared in a screenshot during setup, and store `DATABASE_URL` in Vercel as a *Secret* type variable.
2. **Apply the certified-to-date correction to the existing dummy database**, since it was seeded before this review. Run in the Supabase SQL editor:

```sql
update projects set ipc_submitted = 671500000 where id = 'RES-01';
update projects set ipc_submitted = 410000000 where id = 'RES-02';
update projects set ipc_submitted = 830000000 where id = 'COM-01';
update projects set ipc_submitted = 750000000 where id = 'MXU-01';
update projects set ipc_submitted = 470000000 where id = 'MXU-02';
update projects set ipc_submitted = 300000000 where id = 'LND-01';
update projects set ipc_submitted = 132000000 where id = 'LND-02';
```

   Without it, control 15 still passes (certified equals actual cost) but no certificate can be recorded on those developments until a period raises actual cost.
3. **Apply the migrations** in `db/migrations/` that the database has not yet had. 005 adds who returned a period and when; 006 carries the admin exemption and the change-log kinds, and without it archiving a development fails; 011 admits `project:close` and `project:reopen`, and without it closing a development out is refused by the database's own constraint; **013 drops the two foreign keys to the seed table, and without it a development registered through the app can never be assigned or reported on — both answer 500** (found by the September 2026 MVP review, `docs/MVP_REVIEW.md`).
4. **`ALLOW_RESET`**: set to `1` only while the database holds dummy data. Remove it before real data is loaded.
5. **`AUTH_SECRET`**: change it when the dummy data is replaced, so no token from the dummy phase stays valid.
6. **The model**: `GEMINI_API_KEY` is read server-side only, by `server/gemini.ts` and nowhere else, and drives both the assistant and document extraction. Neither can write: the assistant answers from a brief the API computes from the live position and is instructed never to state a figure that is not in it, and extraction fills a form whose entry goes through the twenty reconciliation controls like any other. The brief holds only the developments the asker may see. Leaving the key unset is a valid deployment — the assistant falls back to fixed rules and extraction says it is not configured. Never prefix a key with `VITE_`.
7. **Accounts and assignments**: issue accounts with `npm run db:user`; every development must have a contributor assigned or `db:users` refuses. The current split (seven to Muhammad, LND-02 to Momin) is a testing assumption.
8. **Sign-in rate limit**: enable it in Vercel (item 3 above).
9. **Deployment Protection** was waived for the public site on the owner's instruction; the API refuses every unauthenticated read regardless.

---

## 10. The access model, revision 2

Specified by the owner on 4 September 2026 and built in the same session. Every
item below is covered by a gate.

| Decision | Built as |
| --- | --- |
| The Owner Admin may enter, validate and approve the same period | Migration 006 replaces the three separation-of-duties CHECK constraints with a trigger that reads the actor's role. Every other role is bound as before, and the exemption is visible on the approval trail |
| A project manager or PMC sees only their assigned developments | Filtered on the server for every read: the portfolio list, a single development, its registers, the review queue, the change log and the activity feed. A development that is not theirs answers 404, so ids cannot be probed |
| The PMO lead validates, the PMO manager approves | Unchanged. These are the existing reviewer and approver seats |
| The PMO manager may register and retire a development | `project:create`, `project:archive`, `project:restore` and `project:delete` are permitted to the approver and the admin, and to nobody else |
| Archive always, remove only while empty | Archiving takes a development out of every screen, roll-up and control and keeps its history, reversibly. Removing outright is refused for anything that has certified, incurred or reported a figure |
| A delivered development is closed out, not archived | `project:close` and `project:reopen` (migration 011), the approver's and the admin's act. A closed development leaves the portfolio arithmetic and stays fully readable, with its registers, documents and audit trail; it accepts no period, certificate, claim, variation or amendment, refused before the seat is considered so no role is exempt. The Completed tab lists what has been delivered and totals it separately. Reversible, and both acts are in the change log |
| A Director sees pending status, never unapproved figures | The payload of an unapproved period is stripped from the response for the reader role. The card shows the state, who filed it and what it waits for |
| Delivery thresholds are policy, not behaviour | Written into the user manual, section 1. The application does not act on them |
| Role labels unchanged for this stage | The screens still read Project Manager, Portfolio Manager, PMO Director, Executive Viewer and Owner Admin |
| One PMC account for now | A PMC user is a contributor with several assignments. Further PMC accounts carry the same role and differ only in what they are assigned |
| Four real portfolios, dummy developments | Unchanged in code; the portfolio names are real and the developments under them are replaced at migration |

Two things the owner deferred to a later phase, and the code is ready for both:
the internal layers of the PMO department beyond lead and manager, and the
chain of approval for retiring a development. An archive currently takes effect
when the PMO manager confirms it.

> **Both are now closed — see section 12.** The chain of approval was built in
> September 2026 as the Authorisations queue, and the internal layers of the
> department no longer need a release at all: seats are rows an administrator
> edits.

**What the admin exemption costs, stated plainly.** The strongest claim this
system made was that no single person can put a figure on the dashboard alone.
After this change an Owner Admin can. The exemption is deliberate, it is the
owner's decision, and it is recorded here, in `ENGINEERING_NOTES.md` and in the user
manual so that nobody discovers it by accident. It is also the narrowest form
of the change available: it reads the role at the moment of the write, so
demoting that account restores the full rule immediately, which
`check:duties` proves on the same statement.

---

## 11. Profiles, accounts and the reporting workbook, revision 3

Asked for on 5 September 2026 and built the same day. Migration 007 carries the
two columns it needs.

### Every user owns their account

**My Profile**, reached by clicking your name at the bottom left. Change your
display name, set or remove a profile picture, change your password, see your
role and your assignments, and sign out.

| Decision | Why |
| --- | --- |
| The current password is required to set a new one | The token proves who you are; it does not prove somebody has not sat down at your open session |
| At least twelve characters, and no composition rule | Length is what costs an attacker. Character-class rules push people towards a short puzzle they cannot remember |
| Pictures are cropped and shrunk in the browser, then stored as a small data URI in the person's own row | A name badge, not a media library. It needs no object store, no second set of credentials and no second thing to back up. The column and the API both cap the size |
| Role and assignments are shown and not editable | A screen that let a person set their own role would undo the access model with one dropdown. The profile route reads only name and picture, and refuses a body carrying anything else |

### The administrator issues and withdraws accounts

**Administration → Users**, for the admin seat alone. Add a user with a role
and a password shown once; change a role; assign developments to a Project
Manager; reset a password; withdraw access; restore it; and remove an account
outright where that is safe.

| Rule | Enforced how |
| --- | --- |
| An account that has filed, validated or approved anything is withdrawn, never erased | The route checks the submissions table and the change log first, and says so. Erasing it would leave the audit trail naming somebody who does not exist |
| Withdrawal takes effect on the next request, not when the token expires | `active` is read on every authenticated request alongside the role, and sign-in refuses a withdrawn account with the same message as a wrong password, so an address cannot be probed |
| Nobody may change their own role, withdraw themselves or reset their own password here | Three separate refusals, each naming the reason. Together they also guarantee an administrator always remains, because the acting one is always counted |
| A role that is not Project Manager holds no assignments | Changing the role clears them, and assigning to another role is refused |
| Passwords are shown once and never stored | Only a scrypt hash is kept. The gate asserts no hash ever appears in a response |

### The reporting workbook, both ways

**Download PT_TEMPLATE** beside **Import PT_TEMPLATE** on Period Entry. The
file served is the owner's own workbook, byte for byte, carried in the
serverless function as a base64 module because a file beside the source is not
part of that bundle.

The gate proves the round trip rather than asserting it: `check:api` fetches
the bytes the API serves, checks the digest, and hands them straight back to
the import route, which must read the sheet rather than refuse it. `check:uat`
does the same through a real browser — clicks the button, catches the download,
and imports the file that landed on disk.

It is deliberately absent from `dist/index.html`. The offline demonstration has
no importer, so a template it could not upload would be dead weight inside the
portable file; a check asserts the workbook's bytes never reach the browser
bundle.

### One defect found and fixed while building this

Sign-in did not check whether an account had been withdrawn. Until this
revision there was no way to withdraw one, so nothing was exposed; the gate now
covers it, and a withdrawn account is refused at the gate and mid-session.

---

## 12. Everything from the platform, revision 4

Asked for on 8 September 2026: *"all the things including but not limited to
above can be done through the system without coding or backend or asking you."*
Migrations 015 and 016 carry what it needs. Three features, and each closes an
item that was previously open.

| Decision | Built as |
| --- | --- |
| **"if in future we want to add portfolio or delete some portfolio it should be through system"** | `db/migrations/017` makes the portfolios and the delivery routes rows an administrator edits from Administration → Portfolios & Routes. A portfolio added there is offered on the Add Project form, in the scope selector, in the Projects tabs and in the Dashboard charts with no deploy and no reload; one a development is IN is never removed, and the row says how many. Renaming is deliberately not offered — every development carries the name as its own value |
| Deleting a development removes it from every live dashboard and report, and the system **asks how many days** it is kept — minimum thirty | `project:archive` carries `retainDays`; `Project` gains `archivedAt` and `retainUntil`. `src/domain/retention.ts` states the floor, the default and the ceiling once, and the dialog, the validator and the route all read it — so the form cannot offer a period the API refuses |
| Inside that window it can be put back, without a developer | **Restore** on the Projects screen's Archive tab, which lists what went, why, and how many days are left. A restored development is indistinguishable in its data from one never deleted |
| Past the window, only an administrator may erase it | `project:delete` is refused inside the window with the retention period named, and past it for every seat but `administer`. **Nothing expires on a timer** — there is no process on a serverless host to run one, and a cron that silently erased the owner's data would be the one act here with no entry in the change log |
| Changes to a development are made by the PMO Controls Manager and **approved by the PMO Director** before they reflect | `db/migrations/016` is the queue. One sentence decides the road: a seat that can `authorise` or `administer` acts directly, a seat that can only `approve` proposes. A proposal moves no figure and is not in the change log; the mutation is appended at authorisation, through the same write lock and the same twenty controls |
| Adding users, changing roles and authorisations, deleting users, adding roles — all from the admin account | `db/migrations/015` makes seats rows in `role_capabilities`, edited from Administration → Roles & Permissions with capability toggles, Add a seat and Remove. The database's separation-of-duties trigger reads the same flags, so the rule is unchanged and still enforced below the API |
| Monthly data entry stays as it was | Deliberately NOT in the queue. It has its own three-stage workflow, and a second queue in front of it would mean a period waiting on four people |

**What this costs, stated plainly.** Every seat's authority is now data an
administrator can change, which is the point — and it means an administrator
can widen what a seat may do without a developer. Three things they still
cannot do, and each is a refusal the server makes rather than a screen
convention: grant exemption from separation of duties (that is a migration),
dismantle the `admin` seat, or leave nobody able to authorise a change.
`check:duties` proves the database still refuses what the rules forbid with
the API bypassed entirely, and is proven to fail six ways when the new trigger
is dropped.

**Six defects were found by the gates written for this and fixed here**, each
of which would have been live: an ambiguous column in the per-request seat
lookup that made every authenticated request answer 500; authorisation
re-checking the AUTHORISER's capability instead of the proposer's, so a
Director could only authorise what they could have done alone; a trigger that
refused a proposer withdrawing their own request; `db:users` applying two
migrations by name and putting back a constraint a later one drops; a reset
that left the proposal queue standing; and a Director able to delete and
restore a development but not to list the archive.

---

## 9. Deliverables

| Deliverable | Where |
| --- | --- |
| Self-contained demonstration | `dist/index.html` from `npm run build` (no network, no sign-in) |
| Platform | Vercel deployment with `VITE_API_URL=/`, Supabase PostgreSQL; `npm run check:platform` proves the served build |
| User manual, all roles | `docs/USER_MANUAL.md` and `docs/USER_MANUAL.docx` (regenerate with `npm run docs`) |
| Launch readiness report | `docs/LAUNCH_READINESS.md` and `docs/LAUNCH_READINESS.docx` |
| UAT results and screenshots | `docs/UAT_RESULTS.md`, `tests/output/uat/` (`npm run check:uat` re-runs and rewrites them) |
| API contract | `docs/api-contract.md` |
| Go-live runbook | `docs/GOING_LIVE.md` |
| Gates | `npm run verify`, `check:api`, `check:workflow`, `check:duties`, `check:platform`, `check:uat` |
