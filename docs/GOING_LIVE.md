# Going live — the interim dev instance

Standing up the platform on **dummy data only**, on the fastest provider, as a
throwaway. This is not the production database: the vendor for real Tazayud
financial data is still with IT and legal pending the data-residency answer,
and the data is reset and replaced at that point.

Everything below happens in **your** Vercel dashboard. Nothing here needs a
code change — the repository is already arranged so that deploying is
configuration.

---

## Why Vercel for this

Not because it is the best long-term home for the API, but because it is the
fastest one **you already have**: the repository is connected, the app already
deploys from it, and adding a database is a marketplace click rather than a new
vendor, a new account and a new invoice. For a throwaway dev instance that is
the right trade.

Nothing about this choice is load-bearing. The API is a plain Node handler
(`server/handler.ts`) with two entry points — `api/[...path].ts` for serverless
and `server/server.ts` for a long-lived process. Moving to a KSA-hosted cluster
later means changing `DATABASE_URL` and running the migrations, not rewriting
anything.

---

## 1. Add a Postgres database (2 minutes)

Vercel dashboard → your `tazayud-pmo` project → **Storage** → **Create
Database** → any Postgres option (Neon is the default marketplace one).

It sets connection-string variables on the project automatically. Note the
exact name it uses — usually `POSTGRES_URL` or `DATABASE_URL`.

### If the database is Supabase

Supabase is Postgres, so nothing in this repository changes — the server
already speaks `pg` over a connection string, which is the entire reason the
repository boundary exists. Four things are specific to it:

1. **Take the pooler connection string, not the direct one.** Project
   Settings → Database → Connection string → **Transaction pooler** (port
   6543), and set `PGPOOL_MAX=1`. A serverless function opens a connection per
   invocation; direct Postgres runs out. Keep `?sslmode=require`.

2. **Deny PostgREST access to these tables.** This is the one that matters.
   Supabase automatically exposes every table in `public` as a REST API
   reachable with the anon key. Reconciliation is enforced *in the server,
   before the write* — `POST /api/mutations` applies the change to a candidate
   state, runs all ten controls, and returns 422 if any fail. A REST route
   straight to `period_submissions` and `mutations` goes around that check
   entirely, and lets a figure into the position that never reconciled.
   Turn RLS on with a deny-all policy on every table, or keep the schema out
   of the exposed list. The separation-of-duties constraints in migration 004
   still hold either way — they are in the database — but the reconciliation
   controls are not, and they are the ones at risk.

3. **Do not use Supabase Auth.** Identity, the five roles and the
   separation-of-duties constraints are keyed to `users.id` in our own schema.
   A second identity system means the CHECK constraints are comparing IDs that
   no longer mean what they were written to mean.

4. **Keep the schema in `db/migrations/*.sql`.** Editing tables in the
   dashboard drifts the database away from the migrations, and then
   `npm run db:reset` builds a different shape than production runs on.

Choose the region at project creation — it cannot be changed afterwards, so
settle the data-residency question first.

## 2. Set two environment variables (1 minute)

Project → **Settings** → **Environment Variables**:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the connection string from step 1, if it was not already set under that name |
| `AUTH_SECRET` | a long random string — `openssl rand -base64 32` |
| `VITE_API_URL` | `/` — see below |
| `PGPOOL_MAX` | `1` behind a Supabase transaction pooler |

`AUTH_SECRET` signs session tokens. Changing it signs everyone out, which is
also how you revoke every session at once.

`VITE_API_URL` is what switches the build from the fixtures to the API. **Leave
it unset and the deployment stays the offline demo** — which is the correct
behaviour, not a bug.

**Set it to `/`, not to the site's own URL.** On Vercel the SPA and
`api/[...path].ts` are one project on one host, so `/` means "the API is here"
and the browser sends a plain same-origin request.

Naming the site's URL instead is the single easiest way to break this, and it
breaks it invisibly. Vercel gives a project several hostnames — the short
production alias, the long team alias, a preview per branch. Point the app at
one while your browser is on another and every call becomes cross-origin: the
browser preflights, Deployment Protection answers the preflight with a login
challenge that carries no CORS headers, and the app can only show **"Failed to
fetch"**, with no status, because no response ever arrived. The server log
stays empty too — the request never reached it.

If you see "Failed to fetch" on the sign-in screen, that is what to check
first. Open DevTools → Network, attempt the sign-in, and look at the failing
request's URL: it should be `/api/auth/login` on the same host as the page.

A genuinely separate API host is the other supported shape — use the full
origin including the scheme, and set `ALLOWED_ORIGIN` to the site's origin,
because CORS then really does apply.

`.env.example` in the repository root lists every variable the code reads, with
its default. Optional ones worth knowing: `PGPOOL_MAX` (set it to 1 behind a
Supabase transaction pooler), `TOKEN_TTL_SECONDS`, `ALLOWED_ORIGIN`.

### When the model is connected

`GEMINI_API_KEY` goes here too, and **its name must never start with `VITE_`**.
Vite inlines every `VITE_*` variable into the bundle at build time, so a key
named that way is a literal string inside `dist/index.html` — a file that gets
downloaded, emailed and served from a public URL. That is a leaked key on the
first deploy, and the only fix is rotating it.

The browser never calls the model. It calls the API and the API calls the
model, for the same reason `server/xlsx.ts` parses the spreadsheet rather than
the browser: a key and a parser both belong on the side of the system that has
somewhere to hide them. `eslint.config.js` refuses a model SDK inside `src/`.

Setting the key turns on **both** AI features at once:

- **The PMO assistant** answers questions about the portfolio. It never does
  arithmetic — the API computes every figure from the live position and tells
  the model that every figure it states must appear in that brief. The brief
  holds only the developments the person asking may see, so a project manager's
  assistant cannot answer about a development they were never assigned.
- **Document extraction** reads a payment certificate and fills the form.
  Nothing is filed until a person checks each field and presses Create, and the
  entry then goes through the same twenty reconciliation controls as a typed
  one. A field the reader could not make out comes back marked *not read*.

`GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`. It is a
variable so that moving to a newer model — or rolling back from one — is an
environment change and a redeploy, not a code change.

**Leaving the key unset is a valid deployment.** The assistant falls back to
the fixed rules that compute from the position, and AI Extract says it is not
configured rather than offering a button that fails.

A note on quota: this model's published limits are of the order of 15 requests
a minute for the whole key, so the API also holds a per-person ceiling — eight
a minute, sixty an hour — to stop one person spending everybody's.

Until a model is connected, `AIExtract`'s scripted extraction stays off on the
platform. It ends in a real `commit` — harmless against fixtures, and an
invented certificate in a real payment register otherwise — so `aiIsSimulated`
turns that flow off whenever `VITE_API_URL` is set. The offline demo is
unchanged.

## 3. Seed the database (2 minutes, from your machine)

```bash
git clone https://github.com/mmasoodalam4-creator/Tazayud-PMO
cd Tazayud-PMO && npm install

export DATABASE_URL="<the connection string from step 1>"

npm run db:reset     # schema + the dummy data from the Excel workbook
npm run db:users     # the six accounts — prints each password ONCE
```

`.env.example` in the repository root documents every variable the code reads,
with defaults. `cp .env.example .env` and fill it in rather than exporting by
hand; `.env` is gitignored so the connection string and the secret cannot be
committed.

`db:users` prints a table of names, roles and generated passwords. They are
stored only as scrypt hashes and cannot be read back. Send each person their
own line over something private — not a group chat.

To change one later:

```bash
npm run db:user -- someone@bmi-plus.com "Their Name" contributor
```

## 4. Redeploy

Vercel → **Deployments** → **Redeploy** on the latest. Environment variables
are read at build time, so the deployment that existed before step 2 is still
the offline build.

---

## When a deployment says "Blocked"

Vercel refuses to build a commit whose **Git author is not a member of the
Vercel account**. On the Hobby plan that means only the owner's commits deploy.
The row shows `Blocked` with the other person's name beside it, sits there
indefinitely, and production silently stays on the previous commit — so the
site looks fine and is simply out of date.

It happened on 4 September 2026: pull request 16 was merged by a second GitHub
account and the deployment for it never ran.

Two ways out, in order of preference:

1. **Redeploy from the dashboard.** Deployments → the blocked entry → the
   three-dot menu → Redeploy, with the build cache off. A manual redeploy is
   attributed to whoever is signed in to Vercel, so the author block does not
   apply. Nothing in the repository changes.
2. **Merge something from the owner's account.** Any later merge commit
   authored by a member builds `main` as it stands, which carries the blocked
   commit with it. Do not revert and re-merge the original pull request; the
   change is already in `main`, and reverting to re-apply it is churn that buys
   nothing.

To stop it recurring, add the other person to the Vercel project, or keep
merges to the account that owns the deployment.

## The order to apply a release

Database first, then code. Migrations in this project are written to be
backward compatible, so applying them while the old build is still serving is
safe, and the moment the new build lands everything it needs is already there.
The reverse order leaves a window where the new code asks the database for
something that is not there yet — after the access-model release, for example,
archiving a development fails until migration 006 has run.

Every migration here is idempotent. Running one twice does nothing the second
time.

**Migration 012 (`012_confirm_payment.sql`) is the one this release needs.** It
admits `claim:pay` — the PMO manager confirming that money has left the account
— to the change log. Until it has run, the server accepts the mutation and
PostgreSQL refuses the insert, so confirming a payment fails while everything
else works normally.

**Seeding the demonstration year.** Once migrations are applied, the Hayat
Garden Walk Residence scenario — thirteen approved periods, the mid-year
award, eight claims, a retention release — can be put onto any deployment
with one command, through the deployment's own API and controls:

```bash
node scripts/seed-hgw-remote.mjs --api https://your-deployment --admin email:password
```

Admin alone suffices (the admin exemption); pass `--momin/--muqtida/--raza`
as `email:password` too for the faithful three-person approval trail. It
refuses a target that already carries RES-03.

**Migration 014 (`014_award_contract.sql`) is needed by the September 2026
release.** It admits `contract:award` — recording or awarding a contract
package after registration — to the change log. The failure mode without it is
the same shape as 012's: everything works until somebody presses Award
package, and that one act comes back as an internal error because PostgreSQL
refuses the insert. (Migration 013, from the MVP review, must already be in
place for created developments to be assignable at all.)

**Migrations 015 and 016 are what the "everything from the platform" release
needs, and they must be applied together.**

`015_roles_are_data.sql` moves the roles out of a CHECK constraint and a
constant in the code into `role_capabilities`, a table an administrator edits
from the Administration screen, and adds the sixth seat, `director`. It
rewrites the separation-of-duties trigger to read capability FLAGS rather than
role names — identical in effect, and the exception names are unchanged
because `refusal()` and `check-duties.mjs` both match on them.

`016_project_change_requests.sql` is the queue where a proposed change to a
development waits for the Director. It is not the change log: a row there has
moved nothing, and the mutation is appended at the moment of authorisation.

Without them, the failure is not subtle: `currentSeat` joins `users` onto
`role_capabilities` on every authenticated request, so **every request answers
500** until 015 has run. Apply the database first, as always.

**After 015, move Fawwad Hussain from `reader` to `director`.** One click in
Administration → Users, or `npm run db:users`. Until that is done the
Authorisations queue has nobody to empty it, and every change the PMO Controls
Manager proposes waits.

**Migration 017 (`017_portfolios_and_routes.sql`) is the one after those.**
It moves the four portfolios and the two delivery routes out of the code and
into two tables an administrator edits from Administration → Portfolios &
Routes. It is additive and seeds exactly what the product already had, so
nothing changes on the day it runs — but until it has, `/api/corporate`
answers 500, because the payload every screen loads reads those tables.

**Apply the whole `db/migrations` directory, in name order, never a subset.**
`db:reset`, `db:users` and `db/user.ts` all do. Applying a named subset is what
put migration 004's constraint back over the top of 015 and made issuing the
Director account fail on a schema that was correct a moment earlier.

---

## The accounts

| Person | Title | Role | Developments |
| --- | --- | --- | --- |
| Masood | PMO Senior Lead & Expert | `admin` | all |
| Fawwad Hussain | Head of PRGC / Director | `director` | — |
| Raza Adil | PMO Controls Manager | `approver` | — |
| Muqtida Sajjad | PMO Team Leader | `reviewer` | — |
| Muhammad | PMC Manager | `contributor` | RES-01, RES-02, COM-01, COM-02, MXU-01, MXU-02, LND-01 |
| Muhammad Momin | Project Manager | `contributor` | LND-02 |

**This split is a dummy-phase assumption, not project ownership.** Seven of the
eight sit with Muhammad so one account exercises almost the whole portfolio;
LND-02 sits with Momin purely so his account is testable — a contributor with
no assignment can submit nothing, so an unassigned account cannot be tested at
all. Real ownership is assigned after the migration.

`npm run db:users` **refuses to finish if any development has no contributor
assigned**, and names the ones that do not. An unassigned development is one
nobody can file a period for, silently, until somebody tries.

## Separation of duties

Input, review and approval are three stages performed by three different
people, and that is enforced **in the database**:

- The submitter of a period can never be its reviewer or its approver.
- The reviewer can never be the approver.
- Approval cannot precede review.
- A contributor can only submit for a development assigned to them; an
  unassigned contributor can submit nothing.
- **An admin is not exempt.** A rule a superuser can waive is not a control.

These are CHECK constraints and a trigger, not server code, so they hold
against a repair script, a migration, a second service, or a mistake in our
own API. `npm run check:duties` proves every one of them with raw SQL and the
API bypassed — and is itself proven to fail: drop the constraint and it
reports `THE DATABASE ALLOWED IT`.

---

## Checking it worked

1. Open the URL in a private window. You should see **sign-in**, not the
   dashboard. If you see the dashboard, `VITE_API_URL` did not take.
2. Sign in as yourself. The dashboard loads, badge reads **10 / 10**.
3. Sign in as a contributor in another browser. Both see the same data — that
   is the thing the demo could never do.

---

## Before real numbers go in

This instance holds dummy figures from the Excel workbook and is throwaway. The
migration to the approved provider is:

```bash
export DATABASE_URL="<the approved cluster>"
npm run db:reset      # migrations + seed, from scratch
npm run db:users      # new passwords; the old ones do not travel
```

Then point `DATABASE_URL` at it in Vercel and redeploy. Nothing in `src/`,
`server/` or `db/migrations/` changes — that is what the vendor-neutral build
was for.

Set a **new** `AUTH_SECRET` at the same time, so no token issued against the
throwaway instance is valid against the real one.
