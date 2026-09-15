-- ============================================================
-- Consultation booking performance hardening
--   1. Single-round-trip available-slots query (anti-join, definer).
--   2. Index the admin "all statuses" listing by created_at.
--   3. Move stale-pending expiry off the read path onto pg_cron.
--
-- Rollback note:
--   drop function public.list_available_consultation_slots(timestamptz);
--   drop index public.idx_consultation_bookings_created_at;
--   select cron.unschedule('consultation-expiry-sweep');
-- ============================================================

-- ------------------------------------------------------------
-- 1. Available slots in one query
-- ------------------------------------------------------------
-- Previously the API fetched every future slot, then fetched every active
-- reservation with a giant `slot_id IN (...)` list, and filtered in JS.
-- This returns only the free future slots directly from the database.

create or replace function public.list_available_consultation_slots(p_now timestamptz)
returns table(slot_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  return query
  select s.id, s.starts_at, s.ends_at
  from public.availability_slots s
  where s.starts_at > p_now
    and not exists (
      select 1
      from public.consultation_booking_slots bs
      where bs.slot_id = s.id
        and bs.is_active
    )
  order by s.starts_at asc;
end;
$function$;

revoke all on function public.list_available_consultation_slots(timestamptz) from public, anon;
grant execute on function public.list_available_consultation_slots(timestamptz) to authenticated;

-- ------------------------------------------------------------
-- 2. Admin listing without a status filter
-- ------------------------------------------------------------
-- `idx_consultation_bookings_status_created` only helps filtered lists; the
-- "all statuses" tab sorts by created_at alone.

create index if not exists idx_consultation_bookings_created_at
  on public.consultation_bookings (created_at desc);

-- ------------------------------------------------------------
-- 3. Scheduled expiry sweep
-- ------------------------------------------------------------
-- The sweep used to run as a write on every `listAvailableSlots` /
-- `listMyBookings` request (via a second service-role client). A once-a-minute
-- cron job keeps slots freed within a minute without taxing the read path.

create extension if not exists pg_cron;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'consultation-expiry-sweep') then
    perform cron.schedule(
      'consultation-expiry-sweep',
      '* * * * *',
      $$select public.expire_stale_consultation_bookings()$$
    );
  end if;
end;
$do$;
