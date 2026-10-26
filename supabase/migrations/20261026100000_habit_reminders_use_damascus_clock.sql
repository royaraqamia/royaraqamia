-- Habit reminders fire on the app's Damascus clock (#604).
--
-- `habits.reminder_time` is a wall-clock time a person picked in the Add/Edit
-- Habit form, and the audience behind this app is Damascene (UTC+3 all year, no
-- DST). The column was compared against the UTC clock, so a habit set for 08:00
-- was reminded at 11:00 local. This file moves the whole reminder path onto
-- `Asia/Damascus`, the frame the app already uses for dated content
-- (`shared/contracts/news.ts`).
--
-- The day boundary has to move with it, and that is where the reminder could
-- invert: the client writes `habit_logs.date` from the device's local calendar
-- (`frontend/state/habitflow/use-dashboard-data.ts`), so comparing it with UTC
-- `current_date` judged a 22:00 reminder — which fires at 01:00 Damascus — against
-- the previous UTC day, and reminded somebody whose new local day was already
-- logged. The once-per-day dedupe reads the start of the Damascus day for the
-- same reason, and keeps it a `timestamptz` rather than a naive timestamp.
--
-- The selection lives in two callable functions so the boundaries can be
-- asserted against a fixed clock (`supabase/tests/habit_reminders_damascus_test.sql`)
-- instead of waiting for a cron run. `send_daily_habit_reminders()` keeps the
-- insert, the payload and the webhook fan-out exactly as they were: the cron
-- schedule and the push transport are untouched.
--
-- No backfill: a stored time is the wall clock the person chose, so re-reading
-- it in Damascus time is the fix rather than a data change.

-- The window: due when the habit's Damascus wall clock falls inside
-- `(p_now - 15 minutes, p_now]`. The cron runs every 15 minutes, so every minute
-- of the day lands in exactly one window.
create or replace function public.habit_reminder_is_due(
  p_reminder_time time,
  p_now timestamptz
)
returns boolean
language sql
stable
set search_path = 'public'
as $fn$
  select
    coalesce(p_reminder_time, time '07:00') <= (p_now at time zone 'Asia/Damascus')::time
    and coalesce(p_reminder_time, time '07:00')
          > (p_now at time zone 'Asia/Damascus')::time - interval '15 minutes';
$fn$;

comment on function public.habit_reminder_is_due(time, timestamptz) is
  'True when a reminder set on the Damascus wall clock falls inside the 15-minute window ending at p_now.';

-- The start of the Damascus day p_now falls in, as a timestamp with time zone.
-- `at time zone` both ways: out to the Damascus wall clock for the truncation,
-- back to an instant for the comparisons.
create or replace function public.habit_damascus_day_start(p_now timestamptz)
returns timestamptz
language sql
stable
set search_path = 'public'
as $fn$
  select date_trunc('day', p_now at time zone 'Asia/Damascus') at time zone 'Asia/Damascus';
$fn$;

comment on function public.habit_damascus_day_start(timestamptz) is
  'The instant the Damascus calendar day containing p_now began.';

-- The habits the reminder run would notify at p_now: daily, live, due on the
-- Damascus clock, not yet logged complete for the Damascus day, and not already
-- reminded during that same Damascus day. Same rules as before, read on one
-- documented clock.
create or replace function public.habit_reminders_due(p_now timestamptz)
returns table (user_id uuid, habit_id uuid, habit_name text)
language sql
stable
set search_path = 'public'
as $fn$
  select h.user_id, h.id, h.name
  from public.habits h
  where h.archived = false
    and h.frequency = 'daily'
    and h.user_id is not null
    and public.habit_reminder_is_due(h.reminder_time, p_now)
    and not exists (
      select 1
      from public.habit_logs l
      where l.habit_id = h.id
        and l.user_id = h.user_id
        and l.date = (public.habit_damascus_day_start(p_now) at time zone 'Asia/Damascus')::date
        and l.completed = true
    )
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = h.user_id
        and n.type = 'habit_reminder'
        and n.created_at >= public.habit_damascus_day_start(p_now)
        and (n.metadata ->> 'habit_id') = h.id::text
    );
$fn$;

comment on function public.habit_reminders_due(timestamptz) is
  'The habits due for a reminder at p_now, on the Damascus clock, with the completed-today and already-reminded-today guards applied.';

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

-- The selection helpers are internal to the cron run: `create or replace` keeps
-- the ACL of a function whose signature is unchanged, but a new function reaches
-- PUBLIC until it is revoked.
revoke execute on function public.habit_reminder_is_due(time, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.habit_damascus_day_start(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.habit_reminders_due(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.send_daily_habit_reminders()
  from public, anon, authenticated;

comment on column public.habits.reminder_time is
  'Per-habit reminder time on the Damascus wall clock (Asia/Damascus, UTC+3); null defaults to 07:00 Damascus.';
