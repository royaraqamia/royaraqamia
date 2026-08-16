-- Phase 2: push habit reminders to the app via pg_net webhook.
--
-- Habit reminders are inserted by this DB-side cron function (which bypasses
-- the app), so the Web Push dispatch has to happen here too: collect the
-- distinct user ids of the rows just inserted, then POST them to the app's
-- /api/push/webhook endpoint, which fans out the actual VAPID push.
--
-- The webhook URL + bearer token are read from the Supabase Vault
-- (`vault.decrypted_secrets`, names `push_webhook_url` / `push_webhook_token`).
-- If they are not provisioned, the function silently skips the HTTP dispatch —
-- in-app (Realtime) habit reminders keep working either way. Provision once:
--   select vault.create_secret('<url>', 'push_webhook_url');
--   select vault.create_secret('<token>', 'push_webhook_token');

create extension if not exists pg_net;

create or replace function public.send_daily_habit_reminders()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  eff_time time := coalesce((clock_timestamp() at time zone 'utc')::time, time '07:00');
  v_ids text[];
  v_url text;
  v_token text;
begin
  with ins as (
    insert into public.notifications (user_id, type, title, body, metadata)
    select
      h.user_id,
      'habit_reminder',
      'تذكير بعادتك اليومية',
      'لا تنسَ إنجاز عادتك اليوم: ' || h.name,
      jsonb_build_object('habit_id', h.id, 'habit_name', h.name)
    from public.habits h
    where h.archived = false
      and h.frequency = 'daily'
      and h.user_id is not null
      and coalesce(h.reminder_time, time '07:00') <= eff_time
      and coalesce(h.reminder_time, time '07:00') > eff_time - interval '15 minutes'
      and not exists (
        select 1 from public.habit_logs l
        where l.habit_id = h.id
          and l.user_id = h.user_id
          and l.date = current_date
          and l.completed = true
      )
      and not exists (
        select 1 from public.notifications n
        where n.user_id = h.user_id
          and n.type = 'habit_reminder'
          and n.created_at >= date_trunc('day', now())
          and (n.metadata ->> 'habit_id') = h.id::text
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

  -- async POST; the returned request_id is intentionally discarded
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

revoke execute on function public.send_daily_habit_reminders() from public, anon;