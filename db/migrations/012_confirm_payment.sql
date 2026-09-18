-- ==========================================================================
-- CONFIRMING THAT A PAYMENT WAS MADE
--
-- `claim:pay` — the one act that says money actually left the account.
--
-- WHY IT HAD TO EXIST
--
-- A payment claim runs claimed -> verified -> approved -> paid. Approving it
-- is a decision about what a contractor is OWED; paying it is a fact about
-- what the owner has DONE, and until now the system had no way to record the
-- second without repeating the first. A claim sitting at Approved could only
-- be moved by recording another claim, which would certify the same milestone
-- twice — so in practice the cash position went stale and the difference
-- between "we agreed to pay this" and "we have paid this" was invisible on
-- every screen that showed it.
--
-- On the owner's instruction, PAID IS CONFIRMED AND NEVER INFERRED, and the
-- confirmation is the PMO MANAGER'S alone. Refused in `mayMutate` for every
-- other seat, including the project manager assigned to the development: a
-- certificate they may record, a transfer they may not.
--
-- WHAT IT MOVES, AND WHAT IT DELIBERATELY DOES NOT
--
--   * It moves `paid`, by the net amount transferred, and nothing else.
--   * It does NOT move certified. The work was certified when the claim was
--     approved; moving it again here would count one milestone twice against
--     one budget.
--   * It does NOT touch earned value or actual cost. Those come from the
--     reporting period, as they do for every other cash event.
--
-- Control 14 bounds it — paid may never exceed certified — so a transfer
-- larger than what has been certified is refused before the write, with that
-- sentence, rather than accepted and reported.
--
-- The claim id travels with the record as a REFERENCE, for the audit trail.
-- The claims register is derived from the development's own position and
-- applies money to the oldest unpaid claim first, which is what a payment run
-- does; storing a per-claim paid figure instead would let a claim be paid an
-- amount its own arithmetic does not produce.
--
-- No column changes. Payment lives in the change log like every other act, so
-- the position stays a pure function of the log and every existing kind stays
-- valid. History is not rewritten to match a newer shape.
-- ==========================================================================

alter table mutations drop constraint if exists mutations_kind_known;

alter table mutations add constraint mutations_kind_known check (
  kind in (
    'ipc', 'variation:approve', 'project:create', 'period:submit',
    'project:archive', 'project:restore', 'project:delete',
    'claim:record', 'claim:pay', 'project:update',
    'project:close', 'project:reopen'
  )
);
