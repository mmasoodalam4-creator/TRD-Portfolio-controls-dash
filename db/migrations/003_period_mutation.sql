-- Reporting-period entry.
--
-- The mutations table constrains `kind` to a closed set, which is what stops a
-- typo becoming a silently ignored change. Entering a period is a new kind, so
-- the constraint has to admit it.
alter table mutations drop constraint if exists mutations_kind_known;

alter table mutations add constraint mutations_kind_known check (
  kind in ('ipc', 'variation:approve', 'project:create', 'period:submit')
);
