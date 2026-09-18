-- ==========================================================================
-- THE ADMIN EXEMPTION FROM SEPARATION OF DUTIES
--
-- On the owner's instruction, recorded 4 September 2026.
--
-- Migration 004 enforced the three-stage rule with plain CHECK constraints
-- that deliberately never read the role, on the reasoning that a rule a
-- superuser can waive is not a control. The owner has decided that the Super
-- User / Admin seat may enter, validate and approve the same reporting
-- period, so that one account can carry a period through when the PMO seats
-- are unavailable.
--
-- What that costs, stated here so it is never a surprise: an admin can put a
-- figure on the dashboard with nobody else involved. Every other role remains
-- bound exactly as before, and the exemption is not silent — the same name
-- appears in two stages of the approval trail, and the screens say so.
--
-- A CHECK constraint may not read another table, so the three constraints
-- become one trigger that looks the actor up. The constraint NAMES are kept
-- verbatim in the exception messages: server/routes.ts maps them to the
-- refusals a person reads, and scripts/check-duties.mjs matches on them to
-- prove the rule still holds for everyone else.
-- ==========================================================================

alter table period_submissions drop constraint if exists sod_reviewer_is_not_submitter;
alter table period_submissions drop constraint if exists sod_approver_is_not_submitter;
alter table period_submissions drop constraint if exists sod_approver_is_not_reviewer;

-- The role of one account, or null if there is no such account. A stage
-- recorded against an unknown user is refused outright: provenance naming
-- nobody is worse than none, because it looks like an audit trail.
create or replace function role_of(account text) returns text as $$
  select role from users where id = account;
$$ language sql stable;

-- ==== THE HARD RULE, AND ITS ONE EXEMPTION ====
--
-- The person who enters a period is never the person who validates it, and
-- never the person who approves it; the person who validates it never
-- approves it. Unless that person is an admin.
--
-- Only one identity can ever be in question: the rule fires when the same
-- account id occupies two stages, so the role to test is unambiguous.
create or replace function assert_separation_of_duties() returns trigger as $$
declare
  actor_role text;
begin
  if new.reviewed_by is not null and new.reviewed_by = new.submitted_by then
    actor_role := role_of(new.reviewed_by);
    if actor_role is null then
      raise exception 'unknown reviewer %', new.reviewed_by;
    end if;
    if actor_role <> 'admin' then
      raise exception 'sod_reviewer_is_not_submitter: % entered this period and may not validate it', new.reviewed_by;
    end if;
  end if;

  if new.approved_by is not null and new.approved_by = new.submitted_by then
    actor_role := role_of(new.approved_by);
    if actor_role is null then
      raise exception 'unknown approver %', new.approved_by;
    end if;
    if actor_role <> 'admin' then
      raise exception 'sod_approver_is_not_submitter: % entered this period and may not approve it', new.approved_by;
    end if;
  end if;

  if new.approved_by is not null and new.reviewed_by is not null
     and new.approved_by = new.reviewed_by then
    actor_role := role_of(new.approved_by);
    if actor_role is null then
      raise exception 'unknown approver %', new.approved_by;
    end if;
    if actor_role <> 'admin' then
      raise exception 'sod_approver_is_not_reviewer: % validated this period and may not approve it', new.approved_by;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists period_submissions_duties on period_submissions;

create trigger period_submissions_duties
  before insert or update of submitted_by, reviewed_by, approved_by on period_submissions
  for each row execute function assert_separation_of_duties();

-- ------------------------------------------------ retiring a development
--
-- Archiving takes a development out of the portfolio and keeps everything it
-- did; restoring puts it back; deleting erases one that never reported
-- anything. All three are entries in the change log like any other act, so
-- who retired what, when and why is on the record.
alter table mutations drop constraint if exists mutations_kind_known;

alter table mutations add constraint mutations_kind_known check (
  kind in (
    'ipc', 'variation:approve', 'project:create', 'period:submit',
    'project:archive', 'project:restore', 'project:delete'
  )
);
