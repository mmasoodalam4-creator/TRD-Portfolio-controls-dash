-- ==========================================================================
-- Tazayud Owner PMO — initial schema
--
-- Plain PostgreSQL 15+. No provider extensions, no vendor-specific types, no
-- hosted-platform assumptions: this file runs with psql against a managed
-- Postgres, a self-hosted cluster on our own tenant, or a local instance. That
-- is what keeps the database vendor a deployment decision rather than an
-- application one.
--
-- Money is bigint (whole SAR). Every figure in the system is a whole riyal and
-- the reconciliation controls compare exact equality — a float would introduce
-- drift in precisely the place the product promises there is none.
-- ==========================================================================

create table if not exists projects (
  id              text primary key,
  -- The shipped order. The portfolio roll-ups and the project list render in
  -- it, and "order by id" is not the same order, so it is stored rather than
  -- inferred.
  seq             integer     not null,
  name            text        not null,
  portfolio       text        not null,
  route           text        not null,
  pmc             text        not null,
  -- Owner-side cost control. Every one of these is a COST to the developer;
  -- there is no revenue column and there must never be one.
  budget          bigint      not null,   -- Approved Development Budget (BAC)
  control         bigint      not null,   -- Control Budget
  afc             bigint      not null,   -- Anticipated Final Cost
  committed       bigint      not null,
  actual          bigint      not null,   -- Cost Incurred (AC)
  ev              bigint      not null,
  pv              bigint      not null,
  -- Stored for reference only. The application derives SPI and CPI from
  -- EV/PV and EV/AC and never reads these; see docs/ENGINEERING_NOTES.md.
  spi             double precision not null,
  cpi             double precision not null,
  progress        integer     not null,
  status          text        not null,
  start_label     text        not null,
  finish_label    text        not null,
  duration_label  text        not null,
  paid            bigint      not null,
  ipc_submitted   bigint      not null,
  risks           integer     not null,
  high_risks      integer     not null,
  open_ncr        integer     not null,
  open_issues     integer     not null,
  emv             bigint      not null,

  constraint projects_portfolio_known check (
    portfolio in ('Residential', 'Commercial', 'Mixed Use', 'Land Development')
  ),
  constraint projects_non_negative check (
    budget >= 0 and control >= 0 and afc >= 0 and committed >= 0
    and actual >= 0 and ev >= 0 and pv >= 0 and paid >= 0
  )
);

-- --------------------------------------------------------------------------
-- The change log.
--
-- Append-only. Current state is the seed replayed through this table, which is
-- why it is the audit trail rather than a side-effect of one: there is no way
-- to reach a position that the log does not explain. Nothing updates or
-- deletes a row here; `reset` truncates the whole table and returns the system
-- to its seeded position.
-- --------------------------------------------------------------------------
create table if not exists mutations (
  seq        bigserial primary key,
  kind       text        not null,
  at         timestamptz not null default now(),
  actor      text        not null,
  payload    jsonb       not null,

  constraint mutations_kind_known check (
    kind in ('ipc', 'variation:approve', 'project:create')
  )
);

create index if not exists mutations_seq_idx on mutations (seq);

-- --------------------------------------------------------------------------
-- Corporate reference data that does not vary by project: the portfolio list,
-- the month labels, the S-curve, report definitions and roles.
--
-- Held as documents because it is read whole and never queried by field. The
-- registers are NOT here — they are derived from each project's position, so
-- storing them would create a second copy that could disagree with the first.
-- --------------------------------------------------------------------------
create table if not exists corporate (
  key    text  primary key,
  value  jsonb not null
);
