-- Punctual, external trigger for the autonomous issue automation.
--
-- GitHub's `schedule` trigger is best-effort: it is routinely delivered hours late
-- and is silently dropped on a bad day, which is exactly the failure mode ADR 0026's
-- "the daily schedule is load-bearing" depends on. Supabase pg_cron — which already
-- drives the habit reminders and hygiene sweeps — fires on the minute, so the
-- primary trigger hangs off it: a SECURITY DEFINER function (revoke-locked from the
-- public roles, mirroring `send_daily_habit_reminders`) reads a fine-grained GitHub
-- PAT from the Vault and asks the Actions dispatch API to run
-- `.github/workflows/issue-planner.yml`. The planner then chains the implementer via
-- its own `workflow_run` trigger, so one external call starts the whole pipeline.
-- The GitHub `schedule` triggers stay as no-config backstops and the
-- `issue-automation-health` workflow catches a fully missed day; a per-workflow
-- day-guard keeps the redundant triggers from double-filing. See ADR 0032.
--
-- The PAT and repo slug live in the Supabase Vault (names
-- `github_dispatch_token` / `github_dispatch_repo`). If they are not provisioned the
-- function silently no-ops and the pipeline falls back to GitHub's own (late)
-- schedule plus the health monitor. Provision once, with a fine-grained token that
-- carries only `Actions: write` on this single repository:
--   select vault.create_secret('royaraqamia/royaraqamia', 'github_dispatch_repo');
--   select vault.create_secret('<fine-grained-pat>', 'github_dispatch_token');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_github_workflow(
  p_workflow text,
  p_ref text default 'main'
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_repo text;
  v_token text;
begin
  select decrypted_secret into v_repo
  from vault.decrypted_secrets
  where name = 'github_dispatch_repo'
  limit 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'github_dispatch_token'
  limit 1;

  if v_repo is null or v_token is null or v_repo = '' or v_token = '' then
    return;
  end if;

  -- async POST; the returned request_id is intentionally discarded
  perform net.http_post(
    url := 'https://api.github.com/repos/' || v_repo || '/actions/workflows/' || p_workflow || '/dispatches',
    body := jsonb_build_object('ref', p_ref),
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || v_token,
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );
end;
$fn$;

revoke execute on function public.dispatch_github_workflow(text, text)
  from public, anon, authenticated;

-- 03:00 UTC = 06:00 Damascus — the same window the planner documents. Idempotent:
-- re-running the migration leaves the existing job untouched.
do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'dispatch-issue-planner') then
    perform cron.schedule(
      'dispatch-issue-planner',
      '0 3 * * *',
      $$select public.dispatch_github_workflow('issue-planner.yml', 'main')$$
    );
  end if;
end;
$do$;
