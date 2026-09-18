-- ==========================================================================
-- 005 — who returned a submission, and when.
--
-- A return is the rejection step of the workflow, and it was the one step
-- that recorded no actor: the note was kept, the person was not. An audit
-- trail with a hole exactly where a submission was refused is not an audit
-- trail. The pair is constrained the same way review and approval are: both
-- present or both absent.
-- ==========================================================================

alter table period_submissions
  add column if not exists returned_by text references users (id),
  add column if not exists returned_at timestamptz;

do $$ begin
  alter table period_submissions
    add constraint returned_is_complete check (
      (returned_by is null) = (returned_at is null)
    );
exception when duplicate_object then null; end $$;
