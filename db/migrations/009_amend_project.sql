-- ==========================================================================
-- AMENDING A DEVELOPMENT'S DETAILS
--
-- The system was seeded with placeholder developments so it could be shown
-- before the real portfolio existed. Turning those into the real thing had
-- meant a migration written by a developer for every corrected name, which
-- puts the owner's own register out of the owner's reach.
--
-- `project:update` is the act that fixes that: the name a development is
-- known by, the portfolio it belongs to, how it is delivered, who manages
-- delivery, and the Approved Development Budget.
--
-- What it deliberately CANNOT carry is a reported figure. Actual cost, earned
-- value, certified and paid are the product of periods and certificates that
-- were entered, reviewed and approved by different people; a form able to
-- overwrite them would be a way around the whole workflow, so the route does
-- not accept them and this constraint does not need to know about them.
--
-- Two rules the server enforces above this line, recorded here because they
-- are the reason an amendment is safe:
--
--   * Only the PMO manager (approver) and the administrator may file one. A
--     project manager reports ON a development; they do not decide what it is
--     called or what its authorised budget is.
--   * The approved budget may not be cut below the CONTROL budget, which is
--     the part of it already broken into work packages. Cutting it would not
--     shrink the packages, it would only make the two disagree — and control 1
--     compares exactly those two figures.
--
-- Every existing kind stays valid. The change log is history, and history is
-- not rewritten to match a newer shape.
-- ==========================================================================

alter table mutations drop constraint if exists mutations_kind_known;

alter table mutations add constraint mutations_kind_known check (
  kind in (
    'ipc', 'variation:approve', 'project:create', 'period:submit',
    'project:archive', 'project:restore', 'project:delete',
    'claim:record', 'project:update'
  )
);
