-- ==========================================================================
-- ACCOUNTS AN ADMINISTRATOR CAN MANAGE, AND A PROFILE EACH PERSON OWNS
--
-- Until now accounts existed only as rows put there by `npm run db:user` from
-- somebody's terminal. The owner asked for the administrator to issue and
-- withdraw them from inside the system, and for every person to keep their own
-- name, picture and password.
--
-- Two columns carry it.
--
-- `active` is how an account is withdrawn. A person who has filed, validated
-- or approved anything is referenced by `period_submissions` and by the
-- change log, and deleting that row would leave an audit trail pointing at
-- somebody who no longer exists — the same reasoning that made archiving,
-- not deleting, the rule for a development. Deactivating keeps every
-- reference intact and refuses the sign-in. An account that has never acted
-- can still be deleted outright, and the server checks which case it is.
--
-- `avatar` holds a small square image as a data URI, resized in the browser
-- before it is sent. It is a name badge beside a person's own name, not a
-- media library: a few kilobytes in the row it belongs to costs less than an
-- object store, a second set of credentials and a second thing to back up.
-- The column is capped so it cannot quietly become one.
-- ==========================================================================

alter table users
  add column if not exists active     boolean     not null default true,
  add column if not exists avatar     text,
  add column if not exists created_at timestamptz not null default now();

do $$ begin
  alter table users add constraint avatar_is_a_small_data_uri check (
    avatar is null or (avatar like 'data:image/%' and length(avatar) <= 262144)
  );
exception when duplicate_object then null; end $$;

-- A name is what every screen shows beside what a person did. Blank
-- provenance reads as an audit trail and is not one.
do $$ begin
  alter table users add constraint name_is_present check (length(btrim(name)) > 0);
exception when duplicate_object then null; end $$;

create index if not exists users_active_idx on users (active);
