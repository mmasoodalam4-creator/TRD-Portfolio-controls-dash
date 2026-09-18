-- ==========================================================================
-- FIVE ROLES, PROJECT SCOPING, AND SEPARATION OF DUTIES
--
-- The controls system's own control. Input, review and approval are three
-- stages performed by three different people, and that separation is enforced
-- HERE — in the database — not in the server and not in the UI.
--
-- The distinction matters. A rule enforced only in application code holds
-- until someone writes a script, runs a migration, fixes data by hand, or
-- introduces a second service. A CHECK constraint holds against all of them,
-- including against this project's own code. If the API is ever wrong, the
-- database still refuses.
-- ==========================================================================

-- -------------------------------------------------------------- the roles
--
-- contributor  inputs data, for assigned developments only
-- reviewer     reviews and validates submitted data; cannot input or approve
-- approver     final sign-off on validated data; never on their own input
-- reader       full view of everything, edits nothing
-- admin        superuser: input, review, approve, configure, manage users
--
-- SUPERSEDED BY MIGRATION 015, and this is where that has to be said, because
-- every migration in this directory is replayed in name order on every reset.
-- 015 makes seats rows in `role_capabilities` and DROPS this constraint, so a
-- replay over a database that already holds a `director` account — or any seat
-- an administrator has since defined — would fail HERE, adding a constraint
-- the rows no longer satisfy, before 015 ever ran to drop it again. That is
-- not hypothetical: it is what `npm run db:users` hit the day the Director
-- seat was issued.
--
-- So the check is added only while it is still the rule. Once
-- `role_capabilities` exists, the foreign key 015 installs is the rule and
-- this does nothing.
alter table users drop constraint if exists users_role_known;

do $$
begin
  if to_regclass('public.role_capabilities') is null then
    alter table users add constraint users_role_known check (
      role in ('contributor', 'reviewer', 'approver', 'reader', 'admin')
    );
  end if;
end $$;

-- ------------------------------------------------- which projects are mine
--
-- A contributor inputs for their own developments only. Absence of a row is
-- absence of permission: there is no wildcard, and an unassigned contributor
-- can submit nothing. Admins are not listed here — their authority does not
-- come from assignment.
create table if not exists project_assignments (
  user_id     text        not null references users (id) on delete cascade,
  project_id  text        not null references projects (id) on delete cascade,
  assigned_at timestamptz not null default now(),

  primary key (user_id, project_id)
);

create index if not exists project_assignments_user_idx on project_assignments (user_id);

-- ------------------------------------------------ the period, and its stages
--
-- A submitted period is not yet part of the reported position. It becomes so
-- only once reviewed and approved, and the mutation log records it at that
-- point. Until then it is a submission: visible, auditable, and not yet fact.
create table if not exists period_submissions (
  id            bigserial   primary key,
  project_id    text        not null references projects (id) on delete cascade,
  period        integer     not null,
  data_date     text        not null default '',

  state         text        not null default 'submitted',

  submitted_by  text        not null references users (id),
  submitted_at  timestamptz not null default now(),
  reviewed_by   text        references users (id),
  reviewed_at   timestamptz,
  approved_by   text        references users (id),
  approved_at   timestamptz,
  /** Why a submission was sent back. Null unless it was. */
  returned_note text,

  -- The entered figures, exactly as the form produced them.
  payload       jsonb       not null,

  constraint period_state_known check (
    state in ('submitted', 'reviewed', 'approved', 'returned')
  ),

  -- ==== THE HARD RULE ====
  --
  -- The person who inputs a period is never the person who approves it, and
  -- never the person who validates it. Both are single-row conditions, so
  -- both are plain CHECK constraints: the cheapest possible enforcement and
  -- the hardest to circumvent.
  --
  -- An admin is a superuser over WHAT may be done, not over this. Separation
  -- of duties that a superuser can waive is not separation of duties, and the
  -- constraint deliberately does not read the role at all.
  constraint sod_reviewer_is_not_submitter check (
    reviewed_by is null or reviewed_by <> submitted_by
  ),
  constraint sod_approver_is_not_submitter check (
    approved_by is null or approved_by <> submitted_by
  ),
  constraint sod_approver_is_not_reviewer check (
    approved_by is null or reviewed_by is null or approved_by <> reviewed_by
  ),

  -- A stage cannot be recorded without the person who performed it, and a
  -- person cannot be recorded without the time. Half-written provenance is
  -- worse than none: it looks like an audit trail and is not one.
  constraint reviewed_is_complete check (
    (reviewed_by is null) = (reviewed_at is null)
  ),
  constraint approved_is_complete check (
    (approved_by is null) = (approved_at is null)
  ),

  -- Approval cannot precede review. The states are a sequence, not a set.
  constraint approval_follows_review check (
    approved_by is null or reviewed_by is not null
  ),

  -- One live submission per development per period. A resubmission after a
  -- return replaces it rather than accumulating rival versions of the truth.
  unique (project_id, period)
);

create index if not exists period_submissions_state_idx on period_submissions (state);
create index if not exists period_submissions_project_idx on period_submissions (project_id);

-- ------------------------------------------------------------------ scoping
--
-- Assignment is checked in the database too, for the same reason as the rule
-- above: a contributor submitting for a development that is not theirs must
-- fail even if it never went through the API.
--
-- A trigger rather than a CHECK because it reads two other tables, which a
-- CHECK constraint may not do.
create or replace function assert_may_submit() returns trigger as $$
declare
  submitter_role text;
begin
  select role into submitter_role from users where id = new.submitted_by;

  if submitter_role is null then
    raise exception 'unknown submitter %', new.submitted_by;
  end if;

  -- Admins submit for any development. Everyone else must be assigned.
  if submitter_role = 'admin' then
    return new;
  end if;

  if submitter_role <> 'contributor' then
    raise exception 'role % may not submit periods', submitter_role;
  end if;

  if not exists (
    select 1 from project_assignments
    where user_id = new.submitted_by and project_id = new.project_id
  ) then
    raise exception '% is not assigned to %', new.submitted_by, new.project_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists period_submissions_scope on period_submissions;

create trigger period_submissions_scope
  before insert or update of submitted_by, project_id on period_submissions
  for each row execute function assert_may_submit();
