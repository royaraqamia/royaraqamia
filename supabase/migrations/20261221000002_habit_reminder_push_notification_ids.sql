-- Habit reminders used to POST the user ids they had just written. The webhook
-- then rebuilt the push's title and URL in TypeScript, while the bell row held
-- a different body — two writers for one sentence. It now posts the ids of the
-- rows it inserted so the webhook can read the stored title, body and type.

create or replace function public.send_daily_habit_reminders()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_ids text[];
  v_url text;
  v_token text;
begin
  with ins as (
    insert into public.notifications (user_id, type, title, body, metadata)
    select
      d.user_id,
      'habit_reminder',
      'تذكير بعادتك اليومية',
      'لا تنسَ إنجاز عادتك اليوم: ' || d.habit_name,
      jsonb_build_object('habit_id', d.habit_id, 'habit_name', d.habit_name)
    from public.habit_reminders_due(clock_timestamp()) d
    returning id
  )
  select array_agg(distinct id::text) into v_ids from ins;

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
    body := jsonb_build_object('notification_ids', to_jsonb(v_ids)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    timeout_milliseconds := 5000
  );
end;
$fn$;

-- `create or replace` keeps the ACL of the existing function; stay explicit so
-- a fresh install never exposes the producer to PUBLIC.
revoke execute on function public.send_daily_habit_reminders()
  from public, anon, authenticated;
