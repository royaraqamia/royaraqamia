-- A sync window closes only when a run reaches its last registry page. Until
-- then the baseline must stand still and the cursor must be readable, or the
-- next incremental run opens a new window and silently skips the rows the short
-- run never read (#1672). The two columns below make that state visible without
-- reading the service. Existing rows start incomplete: an old run left no
-- evidence that it closed its window, so the next run resumes it.

alter table public.mcp_catalog_sync_state
  add column if not exists last_run_completed boolean not null default false,
  add column if not exists last_run_pages integer;

comment on column public.mcp_catalog_sync_state.last_run_completed is
  'True only when the last run reached the end of its window; false leaves the baseline and cursor in place for the next run.';

comment on column public.mcp_catalog_sync_state.last_run_pages is
  'Pages read in the current window, carried across runs that resume it.';
