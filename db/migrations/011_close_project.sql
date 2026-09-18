-- ==========================================================================
-- CLOSING A DEVELOPMENT OUT
--
-- The portfolio had two states and needed three. A development was either
-- live or ARCHIVED, and archiving means cancelled: it leaves every screen and
-- has to be hunted for by the one seat that put it away. There was nowhere to
-- put a development that was DELIVERED — finished, final account agreed — and
-- the owner had to leave those in the live portfolio, where they went on being
-- counted in the budget, the forecast and the on-track figures as though the
-- PMO were still steering them.
--
-- `project:close` is that third state, and `project:reopen` is the way back.
--
-- WHAT CLOSING DOES, AND WHAT IT DELIBERATELY DOES NOT DO
--
--   * It FREEZES the development. No period, no certificate, no claim, no
--     variation and no amendment is accepted against it afterwards — refused
--     in `mayMutate` before the seat is even considered, because it is not a
--     permission question. That is what makes the closing figures FINAL
--     rather than merely current.
--   * It takes the development out of the CONTROL ARITHMETIC: the portfolio
--     KPIs, the roll-ups, the forecast. Forecasting a building that is
--     finished, or counting it as "on track", answers no question anybody has.
--   * It does NOT hide it. Every screen still shows it, still scopes to it,
--     with its registers, its documents and its whole audit trail, marked
--     closed and read-only. That is the difference from archiving, and it is
--     the reason this state had to exist separately rather than be a second
--     use of the same flag.
--
-- The reconciliation controls keep running over closed developments on
-- purpose. A frozen development whose registers stopped agreeing with its
-- position would mean the record of a finished job had rotted — which is
-- exactly the kind of thing this system exists to notice.
--
-- Both acts carry a required note. The date and the actor are recorded by the
-- log itself; what nobody can reconstruct a year later is why.
--
-- Only the PMO manager (approver) and the administrator may file either.
-- A project manager reports progress on a development; they do not decide
-- that the job is over.
--
-- No column changes: closure lives in the change log like every other act, so
-- the position is still a pure function of the log, and every existing kind
-- stays valid. History is not rewritten to match a newer shape.
-- ==========================================================================

alter table mutations drop constraint if exists mutations_kind_known;

alter table mutations add constraint mutations_kind_known check (
  kind in (
    'ipc', 'variation:approve', 'project:create', 'period:submit',
    'project:archive', 'project:restore', 'project:delete',
    'claim:record', 'project:update', 'project:close', 'project:reopen'
  )
);
