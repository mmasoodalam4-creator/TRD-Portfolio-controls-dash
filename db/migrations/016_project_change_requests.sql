-- ==========================================================================
-- A CHANGE TO A DEVELOPMENT IS PROPOSED, THEN AUTHORISED
--
-- Registering, amending, deleting, restoring, closing, reopening and awarding
-- a package all took effect the moment the PMO Controls Manager pressed the
-- button. Monthly reporting has had three people on it since Phase 5 —
-- entered by one, validated by a second, approved by a third — while the acts
-- that decide what a development IS had one.
--
-- On the owner's instruction they now have two: the PMO Controls Manager
-- PROPOSES, the Director AUTHORISES, and nothing moves in between. This table
-- is where a proposal waits.
--
-- IT IS NOT THE CHANGE LOG, and the distinction is the whole design. A row
-- here has moved nothing: the mutation is appended to `mutations` at the
-- moment of authorisation, through the same route, the same write lock and
-- the same twenty reconciliation controls as a direct act. A pending proposal
-- that could be read as fact would be exactly the trap `period_submissions`
-- was built to avoid — which is why that table works the same way.
--
-- Monthly data entry is deliberately NOT here. It has its own three-stage
-- workflow already, and putting a second queue in front of it would mean a
-- period waiting on four people.
-- ==========================================================================

create table if not exists project_change_requests (
  id            bigserial   primary key,

  /** The mutation kind being proposed. */
  kind          text        not null,
  /** The development it concerns. Null only for a registration. */
  project_id    text,
  /** The mutation exactly as it would be filed, validated when proposed. */
  payload       jsonb       not null,
  /** One line a director can decide from without opening the payload. */
  summary       text        not null,
  /** Why the change is being asked for. Required at proposal. */
  reason        text        not null,

  state         text        not null default 'pending',

  requested_by  text        not null references users (id),
  requested_at  timestamptz not null default now(),

  decided_by    text        references users (id),
  decided_at    timestamptz,
  /** Why it was authorised or declined. Required at decision. */
  decision_note text,

  constraint pcr_state_known check (state in ('pending', 'approved', 'rejected', 'withdrawn')),
  constraint pcr_kind_known check (kind in (
    'project:create', 'project:update', 'project:archive', 'project:restore',
    'project:close', 'project:reopen', 'project:delete', 'contract:award'
  )),
  -- A decided row names who decided it and when, and an undecided one names
  -- neither. Half a decision in the audit trail is worse than none.
  constraint pcr_decision_complete check (
    (state = 'pending' and decided_by is null and decided_at is null)
    or (state <> 'pending' and decided_by is not null and decided_at is not null)
  ),
  constraint pcr_reason_said_something check (length(btrim(reason)) > 0)
);

create index if not exists pcr_pending_idx on project_change_requests (state, requested_at desc);
create index if not exists pcr_project_idx on project_change_requests (project_id);

-- ==== SEPARATION OF DUTIES, THE SAME RULE IN THE SAME PLACE ====
--
-- The person who proposes a change never authorises it — unless their seat is
-- exempt, which is the administrator's standing exemption from migration 006
-- read from the capability flags (migration 015). In the database rather than
-- the server, for the reason every rule here is: a rule the API enforces holds
-- until somebody writes a script.
create or replace function assert_change_request_duties() returns trigger as $$
begin
  -- WITHDRAWING IS NOT A DECISION, and this is the one distinction the rule
  -- turns on. Taking your own proposal back needs no authority beyond having
  -- made it — nothing is applied, nothing moves, and the row simply stops
  -- waiting. Without this branch the rules below fired on a withdrawal (the
  -- proposer IS the requester, and their seat is exactly the one that cannot
  -- authorise), so the proposer could not cancel their own request and the
  -- route answered 500.
  if new.state = 'withdrawn' then
    return new;
  end if;

  if new.decided_by is not null and new.decided_by = new.requested_by then
    if role_of(new.decided_by) is null then
      raise exception 'unknown authoriser %', new.decided_by;
    end if;
    if not sod_exempt_of(new.decided_by) then
      raise exception 'sod_authoriser_is_not_requester: % proposed this change and may not authorise it', new.decided_by;
    end if;
  end if;

  -- Authorising is a capability, not a job title. A seat without it cannot
  -- decide even if a route were to let it through.
  if new.decided_by is not null
     and not role_may(new.decided_by, 'authorise')
     and not role_may(new.decided_by, 'administer') then
    raise exception 'role % may not authorise changes to a development', role_of(new.decided_by);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists project_change_requests_duties on project_change_requests;
create trigger project_change_requests_duties
  -- `state` is in the list because the withdrawal branch above reads it: a
  -- trigger that only fired on the two id columns would never see a row move
  -- to `withdrawn` on its own.
  before insert or update of requested_by, decided_by, state on project_change_requests
  for each row execute function assert_change_request_duties();
