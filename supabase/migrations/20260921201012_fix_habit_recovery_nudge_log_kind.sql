-- Fix send_recovery_nudges(): the "not skipped yesterday" predicate referenced
-- `l.kind`, but the column is `log_kind` (added in 20260807160000_habit_log_kinds.sql
-- and never renamed). Every daily run raised `column l.kind does not exist`, so
-- recovery nudges were never sent and the pg_cron job logged an error each day.
--
-- Recreates the function with the corrected column; keeps the existing grants
-- (revoked from public/anon/authenticated) and the daily 08:00 UTC cron schedule.

create or replace function public.send_recovery_nudges()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  yday date := (now() - interval '1 day')::date;
  v_ids text[];
  v_url text;
  v_token text;
begin
  with ins as (
    insert into public.notifications (user_id, type, title, body, metadata)
    select
      h.user_id,
      'recovery_nudge',
      'عادتك انتظرتك بالأمس',
      'فاتتك عادتك أمس: ' || h.name || '. عُد إليها اليوم واستعد إيقاعك.',
      jsonb_build_object(
        'habit_id', h.id,
        'habit_name', h.name,
        'date', to_char(yday, 'YYYY-MM-DD')
      )
    from public.habits h
    where h.archived = false
      and h.frequency = 'daily'
      and h.user_id is not null
      and not exists (
        select 1 from public.habit_logs l
        where l.habit_id = h.id
          and l.user_id = h.user_id
          and l.date = yday
          and l.completed = true
      )
      and not exists (
        select 1 from public.habit_logs l
        where l.habit_id = h.id
          and l.user_id = h.user_id
          and l.date = yday
          and l.log_kind = 'skip'
      )
      and not exists (
        select 1 from public.notifications n
        where n.user_id = h.user_id
          and n.type = 'recovery_nudge'
          and (n.metadata ->> 'habit_id') = h.id::text
          and (n.metadata ->> 'date') = to_char(yday, 'YYYY-MM-DD')
      )
    returning user_id
  )
  select array_agg(distinct user_id::text) into v_ids from ins;

  if v_ids is null or cardinality(v_ids) = 0 then
    return;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'push_webhook_url'
  limit 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'push_webhook_token'
  limit 1;

  if v_url is null or v_token is null or v_url = '' or v_token = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('user_ids', to_jsonb(v_ids)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    timeout_milliseconds := 5000
  );
end;
$fn$;

revoke execute on function public.send_recovery_nudges() from public, anon, authenticated;

-- Nudge once a day at 08:00 UTC, after the per-habit reminder window.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'daily-habit-recovery-nudge') then
    perform cron.unschedule('daily-habit-recovery-nudge');
  end if;
  perform cron.schedule(
    'daily-habit-recovery-nudge',
    '0 8 * * *',
    $$select public.send_recovery_nudges()$$
  );
end;
$do$;