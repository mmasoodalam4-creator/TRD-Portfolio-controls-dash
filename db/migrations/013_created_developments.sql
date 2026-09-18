-- ==========================================================================
-- A DEVELOPMENT REGISTERED THROUGH THE APP CAN BE ASSIGNED AND REPORTED ON
--
-- WHAT WAS WRONG
--
-- `project:create` records a development in the mutation log — the log is the
-- source of truth for what the portfolio contains, and `replayProjects` is
-- how every reader learns it. Nothing inserts into `projects`, which holds
-- the SEED the log replays over.
--
-- But `project_assignments.project_id` and `period_submissions.project_id`
-- both carried foreign keys to `projects`. So for any development registered
-- through the app — the owner's day-one act — assigning a project manager
-- violated the first constraint and filing a period violated the second,
-- each surfacing as a 500 the route could not explain. No period could ever
-- be filed for a workbook-registered development, by anybody, the admin
-- included. The gates missed it because check:api created a development and
-- then only ever assigned and reported on seeded ones.
--
-- THE FIX
--
-- The references become what messages.project_id already is: a REFERENCE,
-- NOT A FOREIGN KEY. The routes validate every project id against the
-- replayed portfolio before writing — the set that actually says what
-- exists — and an assignment or a submission naming a development that is
-- later removed is still a true record of what was assigned and filed.
-- The seed table cannot carry created developments without becoming a second
-- source of truth beside the log, which is the disagreement this system
-- exists to prevent.
--
-- The separation-of-duties trigger is untouched: it reads users and
-- project_assignments, never projects.
-- ==========================================================================

alter table project_assignments
  drop constraint if exists project_assignments_project_id_fkey;

alter table period_submissions
  drop constraint if exists period_submissions_project_id_fkey;
