-- ==========================================================================
-- THE PORTFOLIOS AND THE DELIVERY ROUTES BECOME DATA
--
-- The last two lists in this system that needed a developer to extend. A
-- portfolio was a union type in `src/domain/types.ts`, a constant in
-- `server/validate.ts`, a colour map in two screens and a JSON array in the
-- `corporate` key/value table — five copies of the same four words, and
-- adding a fifth portfolio meant editing all five, running a migration and
-- deploying.
--
-- On the owner's instruction they move here, beside `role_capabilities`
-- (migration 015) and for the same reason: the shape of the organisation is
-- the owner's to state, not something they have to ask for.
--
-- ---- WHY THESE ARE NOT FOREIGN KEYS ON `projects` -----------------------
--
-- Tempting, and wrong here. A development registered through the application
-- exists ONLY in the mutation log — that is the whole design of the replay,
-- and migration 013 removed two foreign keys for exactly this reason. A
-- constraint on `projects` would bind the eight seeded developments and none
-- of the ones people actually add, and no constraint can reach a portfolio
-- name inside a JSON payload in `mutations`.
--
-- So the guard that matters — a portfolio that a development is in cannot be
-- removed — is computed over the REPLAYED list, in the route that removes
-- one. That is the same shape as "a seat somebody holds cannot be removed",
-- and it is honest about where the answer lives.
--
-- What these tables DO carry is the definition: what exists, what it is
-- called, what colour it is drawn in, and what order it reads in.
-- ==========================================================================

-- ---------------------------------------------------------------- portfolios
--
-- `tone` is ONE colour decision, not two. Before this, a portfolio was drawn
-- in one colour as a pill on the Projects register and a different one in the
-- Dashboard's chart — Residential was blue in a table and navy in a graph —
-- which is two colour languages for one thing. The client maps a tone to both
-- the pill and the chart, so a portfolio added tomorrow is the same colour
-- wherever it appears.
create table if not exists portfolios (
  name       text        primary key,
  tone       text        not null default 'grey',
  /** Reading order on every screen that lists them. */
  sort       integer     not null default 0,
  /** A portfolio the product shipped with. Editable; never removable. */
  built_in   boolean     not null default false,
  created_at timestamptz not null default now(),

  -- Long enough for "Land Development", short enough to sit in a pill.
  constraint portfolio_name_shape check (length(btrim(name)) between 2 and 60),
  -- The tones the client knows how to draw. A name it did not recognise would
  -- render as an unstyled pill, which reads as a rendering fault rather than
  -- as a choice somebody made.
  constraint portfolio_tone_known check (
    tone in ('navy', 'blue', 'teal', 'green', 'amber', 'red', 'plum', 'grey')
  )
);

-- The tones the Dashboard's portfolio charts have always drawn with, which
-- is the surface that needs four well-separated hues: a chart with a grey
-- segment reads as "other", and the pills on the Projects register carried
-- grey for Commercial before this. Colour resolves in favour of the chart,
-- and the pill follows — one key everywhere, chosen where it matters most.
insert into portfolios (name, tone, sort, built_in) values
  ('Residential',       'navy',  1, true),
  ('Commercial',        'blue',  2, true),
  ('Mixed Use',         'green', 3, true),
  ('Land Development',  'amber', 4, true)
on conflict (name) do nothing;

-- ------------------------------------------------------------ delivery routes
--
-- How the owner delivers the work. No colour: a route is a fact about who
-- runs the job, and nothing draws it.
create table if not exists delivery_routes (
  name       text        primary key,
  /** One line saying what it means, shown beside it when it is chosen. */
  describes  text        not null default '',
  sort       integer     not null default 0,
  built_in   boolean     not null default false,
  created_at timestamptz not null default now(),

  constraint route_name_shape check (length(btrim(name)) between 2 and 60)
);

-- THE SEED HERE AND `SHIPPED_PORTFOLIOS` / `SHIPPED_ROUTES` IN
-- `src/domain/portfolios.ts` ARE THE SAME FOUR AND THE SAME TWO, and they have
-- to be: this is what a database holds and that is what the offline build
-- ships with, and the two builds must show a reader the same portfolios.
--
-- Two places is one more than this codebase likes, and it is unavoidable — a
-- migration cannot import TypeScript and the fixtures build has no database.
-- So `check:api` compares them, row for row: it caught the first drift
-- between them within a minute, which was one apostrophe.
insert into delivery_routes (name, describes, sort, built_in) values
  ('PMC-Delivered',
   'A project management consultant runs delivery on the owner’s behalf', 1, true),
  ('Self-Execution',
   'Tazayud runs delivery with its own team', 2, true)
on conflict (name) do nothing;
