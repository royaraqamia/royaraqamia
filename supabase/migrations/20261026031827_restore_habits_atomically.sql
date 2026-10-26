-- ============================================================
-- Restore a HabitFlow backup in one transaction (#550)
--
-- `SupabaseHabitRepository.restoreFromBackup` used to clear the account's
-- `habit_logs` and `habits` with one PostgREST request each and then re-insert
-- the backup with two more. There is no transaction across those requests: a
-- failure after the clear left the account empty or half restored. The owned-item
-- cap trigger from #526 is one such failure — a free Plan importing a backup of
-- more than five habits raises `PL001` on the sixth insert, long after the
-- account's own data was deleted.
--
-- A backup taken in local mode carries ids like `h-ab12cd34`. The old restore
-- re-inserted those habits under a server-minted id but sent every log with the
-- original `habit_id`, so `habit_logs_habit_id_fkey` rejected the log insert and
-- every log was lost.
--
-- This function does the whole restore in one transaction:
--
--   * the owner comes from `auth.uid()`, never from the payload;
--   * the caller's `habit_logs` and `habits` are deleted;
--   * each habit is inserted, minting an id when the backup's id is not a UUID,
--     and the old id -> inserted id mapping is kept;
--   * each log is inserted with the mapped `habit_id`.
--
-- Any refusal or error — the plan cap included — rolls the delete back with the
-- inserts, so the account keeps exactly the data it had before the attempt.
--
-- Rollback:
--   drop function if exists public.restore_habits(jsonb);
-- ============================================================

create or replace function public.restore_habits(p_backup jsonb)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_owner uuid := auth.uid();
  v_habit jsonb;
  v_log jsonb;
  v_old_id text;
  v_new_id uuid;
  v_map jsonb := '{}'::jsonb;
begin
  if v_owner is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_backup is null
     or jsonb_typeof(p_backup) <> 'object'
     or jsonb_typeof(p_backup -> 'habits') is distinct from 'array'
     or jsonb_typeof(p_backup -> 'logs') is distinct from 'array'
  then
    raise exception 'a backup with habits and logs arrays is required'
      using errcode = '22023';
  end if;

  -- The clear and both inserts are one transaction: a refusal anywhere below
  -- rolls the clear back too.
  delete from public.habit_logs where user_id = v_owner;
  delete from public.habits where user_id = v_owner;

  for v_habit in select value from jsonb_array_elements(p_backup -> 'habits')
  loop
    v_old_id := v_habit ->> 'id';

    if v_old_id is null or length(v_old_id) = 0 then
      raise exception 'a habit id is required' using errcode = '22023';
    end if;

    -- A local-mode id (`h-*`) is not a UUID, so the row needs a server-minted
    -- one. A UUID from a Supabase backup is kept, as the old restore did.
    v_new_id := case
      when v_old_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then v_old_id::uuid
      else gen_random_uuid()
    end;

    insert into public.habits (
      id, name, frequency, created_at, archived, user_id,
      target, target_period, reminder_time
    ) values (
      v_new_id,
      v_habit ->> 'name',
      coalesce(nullif(v_habit ->> 'frequency', ''), 'daily'),
      coalesce(nullif(v_habit ->> 'createdAt', '')::timestamptz, now()),
      coalesce((v_habit ->> 'archived')::boolean, false),
      v_owner,
      nullif(v_habit ->> 'target', '')::integer,
      case
        when (v_habit ->> 'targetPeriod') in ('week', 'month')
          then v_habit ->> 'targetPeriod'
        else null
      end,
      nullif(v_habit ->> 'reminderTime', '')::time
    );

    v_map := v_map || jsonb_build_object(v_old_id, v_new_id::text);
  end loop;

  for v_log in select value from jsonb_array_elements(p_backup -> 'logs')
  loop
    v_old_id := v_log ->> 'habitId';
    v_new_id := nullif(v_map ->> v_old_id, '')::uuid;

    if v_new_id is null then
      raise exception 'a habit log references a habit outside the backup: %', v_old_id
        using errcode = '23503';
    end if;

    insert into public.habit_logs (
      habit_id, date, completed, completed_at, log_kind, note, user_id
    ) values (
      v_new_id,
      (v_log ->> 'date')::date,
      coalesce((v_log ->> 'completed')::boolean, false),
      coalesce(nullif(v_log ->> 'completedAt', '')::timestamptz, now()),
      case
        when (v_log ->> 'kind') in ('complete', 'skip', 'miss', 'none')
          then v_log ->> 'kind'
        when coalesce((v_log ->> 'completed')::boolean, false)
          then 'complete'
        else 'none'
      end,
      v_log ->> 'note',
      v_owner
    );
  end loop;
end;
$$;

-- A signed-in caller runs the restore against their own rows only; `anon` gets
-- nothing, and the service role keeps execute for server-side callers.
revoke all on function public.restore_habits(jsonb) from public, anon;
grant execute on function public.restore_habits(jsonb) to authenticated, service_role;
