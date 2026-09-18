-- ==========================================================================
-- ROLES BECOME DATA, AND A SIXTH SEAT
--
-- Until now the five roles were a CHECK constraint on `users.role` and a
-- constant table in server/auth.ts, and what each may do was written into the
-- separation-of-duties trigger by NAME (`if actor_role <> 'admin'`). Adding a
-- seat, or changing what one may do, meant a migration and a deploy — which
-- puts the owner's own access model behind a developer, exactly as replacing
-- the placeholder project names once did.
--
-- So the roles move into a table the administrator can edit from the
-- Administration screen, and the trigger reads CAPABILITY FLAGS rather than
-- role names.
--
-- THE RULE STILL LIVES IN THE DATABASE. That is the point, and it survives:
-- the flags are rows in this database, the trigger reads them here, and a
-- script, a migration or a hand-edited row is bound by them exactly as the
-- API is. What changed is that the rule is now stated as "a seat exempt from
-- separation of duties" instead of "the seat called admin" — one indirection,
-- no loosening. `npm run check:duties` proves it with the API bypassed, and is
-- still proven to fail when the trigger is dropped.
--
-- The sixth seat is `director`: reads everything, files nothing, and
-- AUTHORISES project-administration changes (migration 016). The owner asked
-- for the PMO Controls Manager to propose a change to a development and the
-- Director to approve it before it takes effect; `reader` means "edits
-- nothing", which is worth keeping, so the authority is a seat of its own
-- rather than a power bolted onto that one.
-- ==========================================================================

create table if not exists role_capabilities (
  role           text        primary key,
  /** What the seat is called on screen. */
  title          text        not null,
  /** One sentence saying what the seat is for, shown beside it. */
  describes      text        not null,

  -- The five things a seat may do. Deliberately five flags rather than one
  -- "may write": a reviewer writes (a review) and must never input, and an
  -- approver writes (an approval) and must never input either. A single flag
  -- loses the distinction this system exists to enforce.
  may_input      boolean     not null default false,
  may_review     boolean     not null default false,
  may_approve    boolean     not null default false,
  may_authorise  boolean     not null default false,
  may_administer boolean     not null default false,

  -- Exempt from separation of duties: may occupy two stages of the same
  -- approval trail. The owner's instruction, and it is never silent — the
  -- same name appears twice in the trail and the screens say so.
  sod_exempt     boolean     not null default false,

  -- A seat the product defines. Its flags may be changed (except admin's);
  -- it may never be deleted, because the code refers to it by name.
  built_in       boolean     not null default false,

  created_at     timestamptz not null default now(),

  -- A role name is used in URLs, tokens and exception messages. Keep it to
  -- what all three read the same way.
  constraint role_name_shape check (role ~ '^[a-z][a-z0-9_-]{2,31}$')
);

insert into role_capabilities
  (role, title, describes, may_input, may_review, may_approve, may_authorise,
   may_administer, sod_exempt, built_in)
values
  ('contributor', 'Project Manager / PMC',
   'Files periods and records certificates, for assigned developments only',
   true,  false, false, false, false, false, true),
  ('reviewer', 'PMO Team Leader',
   'Validates what was filed; cannot input and cannot approve',
   false, true,  false, false, false, false, true),
  ('approver', 'PMO Controls Manager',
   'Signs off periods and claims, registers developments and proposes changes to them',
   false, false, true,  false, false, false, true),
  ('director', 'PMO Director / Executive',
   'Reads everything and authorises changes to a development before they take effect',
   false, false, false, true,  false, false, true),
  ('reader', 'Executive Viewer',
   'Sees every figure and changes none of them',
   false, false, false, false, false, false, true),
  ('admin', 'Owner Admin',
   'Every capability, and exempt from separation of duties',
   true,  true,  true,  true,  true,  true,  true)
on conflict (role) do nothing;

-- `users.role` now points at a row rather than at a list written into a
-- constraint, which is what makes adding a seat an insert instead of a
-- migration. The old CHECK goes, or a new role would satisfy the foreign key
-- and fail the constraint beside it.
alter table users drop constraint if exists users_role_known;
alter table users drop constraint if exists users_role_defined;
alter table users add constraint users_role_defined
  foreign key (role) references role_capabilities (role);

-- ---------------------------------------------------------------- helpers
--
-- One row read, by primary key. Both are `stable`, so a statement reads them
-- once however many rows the trigger fires for.

create or replace function role_of(account text) returns text as $$
  select role from users where id = account;
$$ language sql stable;

/** Whether this account's seat is exempt from separation of duties. */
create or replace function sod_exempt_of(account text) returns boolean as $$
  select coalesce(c.sod_exempt, false)
    from users u join role_capabilities c on c.role = u.role
   where u.id = account;
$$ language sql stable;

/** Whether this account's seat carries one named capability. */
create or replace function role_may(account text, capability text) returns boolean as $$
  select case capability
           when 'input'      then c.may_input
           when 'review'     then c.may_review
           when 'approve'    then c.may_approve
           when 'authorise'  then c.may_authorise
           when 'administer' then c.may_administer
           else false
         end
    from users u join role_capabilities c on c.role = u.role
   where u.id = account;
$$ language sql stable;

-- ==== THE HARD RULE, READ FROM THE FLAGS ====
--
-- Identical in effect to migration 006, with `<> 'admin'` replaced by "is not
-- exempt". THE EXCEPTION NAMES ARE UNCHANGED — `refusal()` in
-- server/routes.ts and scripts/check-duties.mjs both match on them, and a
-- rule whose wording moves is a rule whose tests stop testing it.
create or replace function assert_separation_of_duties() returns trigger as $$
begin
  if new.reviewed_by is not null and new.reviewed_by = new.submitted_by then
    if role_of(new.reviewed_by) is null then
      raise exception 'unknown reviewer %', new.reviewed_by;
    end if;
    if not sod_exempt_of(new.reviewed_by) then
      raise exception 'sod_reviewer_is_not_submitter: % entered this period and may not validate it', new.reviewed_by;
    end if;
  end if;

  if new.approved_by is not null and new.approved_by = new.submitted_by then
    if role_of(new.approved_by) is null then
      raise exception 'unknown approver %', new.approved_by;
    end if;
    if not sod_exempt_of(new.approved_by) then
      raise exception 'sod_approver_is_not_submitter: % entered this period and may not approve it', new.approved_by;
    end if;
  end if;

  if new.approved_by is not null and new.reviewed_by is not null
     and new.approved_by = new.reviewed_by then
    if role_of(new.approved_by) is null then
      raise exception 'unknown approver %', new.approved_by;
    end if;
    if not sod_exempt_of(new.approved_by) then
      raise exception 'sod_approver_is_not_reviewer: % validated this period and may not approve it', new.approved_by;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

-- Assignment, on the same footing: "may administer" files for anything, "may
-- input" files for what it is assigned, anything else is refused. The refusal
-- text is unchanged for the same reason as above.
create or replace function assert_may_submit() returns trigger as $$
declare
  submitter_role text;
begin
  submitter_role := role_of(new.submitted_by);

  if submitter_role is null then
    raise exception 'unknown submitter %', new.submitted_by;
  end if;

  if role_may(new.submitted_by, 'administer') then
    return new;
  end if;

  if not role_may(new.submitted_by, 'input') then
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

drop trigger if exists period_submissions_duties on period_submissions;
create trigger period_submissions_duties
  before insert or update of submitted_by, reviewed_by, approved_by on period_submissions
  for each row execute function assert_separation_of_duties();

drop trigger if exists period_submissions_scope on period_submissions;
create trigger period_submissions_scope
  before insert or update of submitted_by, project_id on period_submissions
  for each row execute function assert_may_submit();
