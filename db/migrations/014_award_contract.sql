-- ==========================================================================
-- RECORDING A CONTRACT PACKAGE AFTER REGISTRATION
--
-- `contract:award` — a package recorded, or awarded, after a development was
-- registered. Registration used to be the only door contracts had: the moment
-- a real development awarded its second package there was no way to record
-- it, and the register could only carry the money as "not yet packaged". This
-- was §6.1(2) of the MVP review — the next dead end a real user hits.
--
-- One shape, two acts, decided by the package number: a new id appends a
-- procurement row (out to tender when the award date is null, committing
-- nobody), and an existing tendered id is AWARDED — the row is replaced, so
-- the award carries the real value and counterparty rather than the tender
-- estimate. A package already awarded is refused by the server: an award is a
-- promise, and correcting one is an audit-trail story, not an overwrite.
--
-- Only an award moves committed cost, exactly as at registration, and the
-- write passes the same twenty reconciliation controls as every other change.
-- The act is the approver's and the administrator's — a commercial act, like
-- registering and amending a development — and a closed development refuses
-- it (`contract:award` is a reporting kind).
--
-- No column changes. The award lives in the change log like every other act,
-- so the position stays a pure function of the log and every existing kind
-- stays valid. History is not rewritten to match a newer shape.
-- ==========================================================================

alter table mutations drop constraint if exists mutations_kind_known;

alter table mutations add constraint mutations_kind_known check (
  kind in (
    'ipc', 'variation:approve', 'project:create', 'period:submit',
    'project:archive', 'project:restore', 'project:delete',
    'claim:record', 'claim:pay', 'project:update',
    'project:close', 'project:reopen', 'contract:award'
  )
);
