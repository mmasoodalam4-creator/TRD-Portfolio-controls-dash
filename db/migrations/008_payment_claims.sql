-- ==========================================================================
-- RECORDING A PAYMENT CLAIM
--
-- Payment is milestone-based: a contractor delivers a milestone and claims for
-- it, the consultant verifies what was delivered, and Tazayud approves an
-- amount and withholds a percentage of it as security.
--
-- `claim:record` is that whole act as one recorded change. It carries the
-- package, the milestone, who verified it and when, against what reference and
-- for how much, the amount approved, and the retention rate applied to THIS
-- claim. It moves certified by the approved amount and paid by the net.
--
-- It is deliberately stricter than `ipc`, the certificate kind it supersedes:
-- a certificate may be recorded by the contributor assigned to the
-- development, but a claim carries an APPROVAL, and approving is the
-- approver's act. The server refuses it for any other seat.
--
-- Nothing here changes what is already recorded. `ipc` stays valid, because
-- the change log is history and history is not rewritten to match a newer
-- shape.
-- ==========================================================================

alter table mutations drop constraint if exists mutations_kind_known;

alter table mutations add constraint mutations_kind_known check (
  kind in (
    'ipc', 'variation:approve', 'project:create', 'period:submit',
    'project:archive', 'project:restore', 'project:delete',
    'claim:record'
  )
);
