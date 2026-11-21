-- One audience for habit notifications, and null means no reminder (#1678, ADR-0211).
--
-- The form calls the reminder time «اختياري» and submits an empty field as null; the
-- assistant's `set_habit_reminder` summary calls that same empty value «إزالة التذكير».
-- Only the database read it as a daily 07:00 Damascus reminder. Removing the
-- coalesce is the fix: a member who did not choose a time is not reminded.
--
-- Deletion is a tombstone. `habits.deleted_at` is excluded from every application
-- read but was never part of either producer's selection, so deleting a habit left
-- its reminders running. The two producers now join one view instead of reading
-- `public.habits` and re-deriving the audience a third time.
--
-- The recovery selection is also a callable function now, mirroring
-- `habit_reminders_due(p_now)`, so the same three boundary cases can be asserted
-- against a pinned clock without running cron or calling the push webhook. No
-- applied migration is edited; the cron schedules and the push transport are
-- untouched.

-- The single definition of "a habit the member asked to be reminded about".
-- Lives in the non-exposed `private` schema and is read by the SECURITY DEFINER
-- cron functions, so no Data API role needs access to it.
create view private.habits_remindable as
select h.id, h.user_id, h.name, h.reminder_time
from public.habits h
where h.deleted_at is null
  and h.archived = false
  and h.frequency = 'daily'
  and h.user_id is not null
  and h.reminder_time is not null;

comment on view private.habits_remindable is
  'Live daily habits with an explicitly chosen reminder time; the one audience every habit notification producer reads (ADR-0211).';

revoke all on private.habits_remindable from public, anon, authenticated;

-- An unset time is no longer due at 07:00: there is no time to fall in the window.
create or replace function public.habit_reminder_is_due(
  p_reminder_time time,
  p_now timestamptz
)
returns boolean
language sql
stable
set search_path = 'public'
as $fn$
  select p_reminder_time is not null
    and p_reminder_time <= (p_now at time zone 'Asia/Damascus')::time
    and p_reminder_time > (p_now at time zone 'Asia/Damascus')::time - interval '15 minutes';
$fn$;

comment on function public.habit_reminder_is_due(time, timestamptz) is
  'True when a chosen Damascus wall-clock time falls inside the 15-minute window ending at p_now; null opts out (ADR-0211).';

create or replace function public.habit_reminders_due(p_now timestamptz)
returns table (user_id uuid, habit_id uuid, habit_name text)
language sql
stable
set search_path = 'public'
as $fn$
  select h.user_id, h.id, h.name
  from private.habits_remindable h
  where public.habit_reminder_is_due(h.reminder_time, p_now)
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
  'The habits due for a reminder at p_now: the shared remindable audience, the Damascus clock, and the completed/already-reminded guards.';

-- The recovery selection, extracted from the cron body so it can be tested. Its
-- missed day is still UTC, as the body computed it; ADR-0211 records the split.
create or replace function public.habit_recovery_nudges_due(p_now timestamptz)
returns table (user_id uuid, habit_id uuid, habit_name text, miss_date date)
language sql
stable
set search_path = 'public'
as $fn$
  select h.user_id, h.id, h.name, d.miss_date
  from private.habits_remindable h
  cross join (select ((p_now at time zone 'UTC')::date - 1) as miss_date) d
  where not exists (
      select 1
      from public.habit_logs l
      where l.habit_id = h.id
        and l.user_id = h.user_id
        and l.date = d.miss_date
        and l.completed = true
    )
    and not exists (
      select 1
      from public.habit_logs l
      where l.habit_id = h.id
        and l.user_id = h.user_id
        and l.date = d.miss_date
        and l.log_kind = 'skip'
    )
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = h.user_id
        and n.type = 'recovery_nudge'
        and (n.metadata ->> 'habit_id') = h.id::text
        and (n.metadata ->> 'date') = to_char(d.miss_date, 'YYYY-MM-DD')
    );
$fn$;

comment on function public.habit_recovery_nudges_due(timestamptz) is
  'The shared remindable audience that missed its UTC day at p_now, with the completed/skipped/already-nudged guards.';

create or replace function public.send_recovery_nudges()
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
      'recovery_nudge',
      'عادتك انتظرتك بالأمس',
      'فاتتك عادتك أمس: ' || d.habit_name || '. عُد إليها اليوم واستعد إيقاعك.',
      jsonb_build_object(
        'habit_id', d.habit_id,
        'habit_name', d.habit_name,
        'date', to_char(d.miss_date, 'YYYY-MM-DD')
      )
    from public.habit_recovery_nudges_due(now()) d
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

-- `create or replace` keeps the ACL of an existing signature; the new selection
-- function starts with EXECUTE for PUBLIC, so revoke it explicitly.
revoke all on function public.habit_reminder_is_due(time, timestamptz)
  from public, anon, authenticated;
revoke all on function public.habit_reminders_due(timestamptz)
  from public, anon, authenticated;
revoke all on function public.habit_recovery_nudges_due(timestamptz)
  from public, anon, authenticated;
revoke all on function public.send_daily_habit_reminders()
  from public, anon, authenticated;
revoke all on function public.send_recovery_nudges()
  from public, anon, authenticated;

comment on column public.habits.reminder_time is
  'Per-habit reminder time on the Damascus wall clock (Asia/Damascus, UTC+3); null means the member opted out of reminders (ADR-0211).';
