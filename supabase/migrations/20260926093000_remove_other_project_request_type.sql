-- Narrow the project_requests.project_type check constraint to the two types
-- still offered on /request-project: a website or an app. "Other" was dropped
-- from the form, so the contract no longer models it.
--
-- Any pre-existing 'other' rows must be reclassified before this runs; the new
-- constraint validates them and the migration fails loudly if they remain.

alter table public.project_requests
  drop constraint if exists project_requests_project_type_check;

alter table public.project_requests
  add constraint project_requests_project_type_check
  check (project_type in ('website', 'app'));
