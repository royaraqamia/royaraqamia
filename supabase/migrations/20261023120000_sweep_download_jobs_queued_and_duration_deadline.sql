-- Reconcile `queued` jobs, and size the `running` deadline from the live cap.
--
-- `20261007171335_sweep_download_jobs.sql` swept only `running` jobs, on a
-- hard-coded 15 minutes. Two gaps followed:
--
--   * `create` inserts a `queued` row and the controller hands it to `dispatch`
--     after the response (`runAfter`). If that dispatch throws — or the task is
--     dropped — the row stays `queued` until the 24-hour retention delete, and
--     the visitor polls a job that never resolves. A `queued` row is therefore
--     swept after a short deadline: dispatch runs immediately, so a couple of
--     minutes in the queue is a dropped dispatch, not a busy provider.
--   * The Media Provider may legitimately use the whole `max_duration_seconds`
--     cap — Admin-tunable up to 24 hours — plus transcode and upload time, so a
--     fixed 15 minutes could sweep a healthy job to `failed` mid-flight and the
--     provider's later callback would then be ignored as terminal. The `running`
--     deadline is now the live cap plus a processing buffer, floored so a cap
--     lowered below that buffer cannot sweep a job it is still allowed to run.
--
-- Both transitions record an event, so the events trail matches the status
-- column whatever moved the job. The status vocabulary, the 24-hour retention
-- and the cron schedule are unchanged, and the function keeps its
-- SECURITY DEFINER + revoke-locked shape.
--
-- Rollback: restore the previous definition by re-applying
--   20261007171335_sweep_download_jobs.sql (its body is the target state).

create or replace function public.sweep_download_jobs()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  -- `dispatch` is scheduled straight after the response, so a job still queued
  -- after this long was never handed to the provider.
  queued_deadline constant interval := interval '2 minutes';
  -- Transcode and upload time the provider needs on top of the media duration.
  processing_buffer constant interval := interval '15 minutes';
  -- Floor for the whole `running` deadline: a cap lowered below the buffer must
  -- not let the sweep overtake a job the cap still allows.
  min_running_deadline constant interval := interval '15 minutes';
  -- `DEFAULT_DOWNLOAD_SETTINGS.maxDurationSeconds`; the app falls back to it when
  -- the settings row is absent, so the sweep has to read the same fallback.
  default_duration_cap_seconds constant int := 900;
  duration_cap_seconds int;
  running_deadline interval;
begin
  -- `downloader_settings` holds a single row (id = true).
  select coalesce(
    (select max_duration_seconds from public.downloader_settings where id),
    default_duration_cap_seconds
  )
  into duration_cap_seconds;

  running_deadline := greatest(
    min_running_deadline,
    make_interval(secs => duration_cap_seconds) + processing_buffer
  );

  -- Reconcile stuck work: a job whose dispatch never arrived, or whose provider
  -- call died (crash, restart, dropped callback), is dead, not slow. Record the
  -- terminal transition so the events trail matches the status column.
  with stale as (
    update public.download_jobs
    set status = 'failed',
        error = 'انتهت مهلة المعالجة دون اكتمال.',
        updated_at = now()
    where (status = 'queued' and updated_at < now() - queued_deadline)
       or (status = 'running' and updated_at < now() - running_deadline)
    returning id
  )
  insert into public.download_job_events (job_id, status)
  select id, 'failed' from stale;

  -- Retention: a Download Job is not a record worth keeping beyond a day.
  delete from public.download_jobs
  where created_at < now() - interval '24 hours';
end;
$fn$;

revoke execute on function public.sweep_download_jobs()
  from public, anon, authenticated;
