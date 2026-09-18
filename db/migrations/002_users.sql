-- ==========================================================================
-- People
--
-- Phase 5 enforced roles but had no one to hold them: tokens were minted by
-- hand for the test suite. This is the table the sign-in flow authenticates
-- against.
--
-- Plain PostgreSQL, like everything else here. If identity later moves to a
-- corporate provider, this table stops being the source of truth and the
-- TokenVerifier in api/auth.ts is pointed at that provider instead — the
-- routes do not change. It is deliberately not entangled with the rest of the
-- schema for exactly that reason.
--
-- Passwords are stored as scrypt hashes with a per-user salt. Never plaintext,
-- never a fast hash: this system holds the owner's cost position.
-- ==========================================================================

create table if not exists users (
  id            text        primary key,
  email         text        not null unique,
  name          text        not null,
  -- Constrained here as well as in the server, so a bad row cannot be written
  -- by hand. Migration 004 widens this to the five roles Tazayud defines;
  -- this one keeps the original three because a migration must remain a true
  -- record of what the schema was at the time.
  role          text        not null,
  -- scrypt:<salt-hex>:<derived-key-hex>. The format carries its own algorithm
  -- so a future migration to a different one can be done per-row.
  password_hash text        not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,

  constraint users_role_known check (role in ('reader', 'contributor', 'admin')),
  constraint users_email_shape check (position('@' in email) > 1)
);

create index if not exists users_email_idx on users (lower(email));
