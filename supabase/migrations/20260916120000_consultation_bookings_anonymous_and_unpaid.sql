-- ============================================================
-- Consultation bookings become anonymous and unpaid.
--
-- A booking is now a request: any visitor may submit one without an
-- account and without payment. It still holds its Availability Slots
-- while an operator reviews it.
--
-- Status machine (payment and the 24h expiry window are gone):
--   pending ──admin confirm──▶ confirmed
--   pending ──admin reject───▶ rejected   (slots freed)
--   pending ──admin cancel───▶ cancelled  (slots freed)
--
-- Rollback note: this migration drops the payment/expiry columns, the
-- receipt + cancel RPCs, the expiry cron job and the owner RLS policies.
-- Reverting means restoring them from
-- 20260825120000_create_consultation_booking_system.sql and
-- 20260915145927_perf_consultation_booking.sql, and re-adding a
-- NOT NULL user_id constraint (impossible for rows created anonymously).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Slot activity now tracks the unpaid statuses
-- ------------------------------------------------------------
-- Replaced first so the status remap below recomputes `is_active`
-- against the new status list from the start.

create or replace function public.sync_consultation_booking_slot_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.consultation_booking_slots
     set is_active = new.status in ('pending', 'confirmed')
   where booking_id = new.id;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Reference codes
-- ------------------------------------------------------------
-- Short, human-quotable identifiers (`CONS-2026-A7K2M9QX`) so a booker
-- can name their request on WhatsApp without quoting a raw UUID.

alter table public.consultation_bookings
  add column if not exists reference_code text;

update public.consultation_bookings
   set reference_code = 'CONS-' || to_char(coalesce(created_at, now()), 'YYYY') || '-' ||
       upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 where reference_code is null;

alter table public.consultation_bookings
  alter column reference_code set not null;

alter table public.consultation_bookings
  add constraint consultation_bookings_reference_code_key unique (reference_code);

-- ------------------------------------------------------------
-- 3. Anonymity: user_id becomes opportunistic attribution
-- ------------------------------------------------------------
-- Same convention as `training_applications.user_id`: present when a
-- visitor happened to be signed in, normally NULL.

alter table public.consultation_bookings
  drop constraint consultation_bookings_user_id_fkey;

alter table public.consultation_bookings
  alter column user_id drop not null;

alter table public.consultation_bookings
  add constraint consultation_bookings_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Email is no longer injected from an account; it stays nullable so a
-- future form can collect it without another migration.
alter table public.consultation_bookings
  alter column email drop not null;

-- ------------------------------------------------------------
-- 4. Status remap + new check
-- ------------------------------------------------------------

alter table public.consultation_bookings
  drop constraint consultation_bookings_status_check;

update public.consultation_bookings
   set status = case
     when status in ('pending_payment', 'awaiting_review') then 'pending'
     when status = 'expired' then 'cancelled'
     else status
   end
 where status in ('pending_payment', 'awaiting_review', 'expired');

alter table public.consultation_bookings
  alter column status set default 'pending';

alter table public.consultation_bookings
  add constraint consultation_bookings_status_check
  check (status in ('pending', 'confirmed', 'rejected', 'cancelled'));

-- ------------------------------------------------------------
-- 5. Drop payment + expiry columns
-- ------------------------------------------------------------
-- Dropping `expires_at` also drops idx_consultation_bookings_pending_expiry.

alter table public.consultation_bookings
  drop column if exists region,
  drop column if exists payment_method,
  drop column if exists amount_due_usd,
  drop column if exists expires_at,
  drop column if exists receipt_sent_at;

-- ------------------------------------------------------------
-- 6. Booking creation — anonymous, unpaid, reference-coded
-- ------------------------------------------------------------

drop function if exists public.create_consultation_booking(uuid, uuid[], text, text, text, text, text, text);

create or replace function public.create_consultation_booking(
  p_user_id uuid,
  p_package_id uuid,
  p_slot_ids uuid[],
  p_full_name text,
  p_phone_whatsapp text,
  p_email text,
  p_topic_description text,
  p_reference_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package public.consultation_packages;
  v_required int;
  v_distinct_ids uuid[];
  v_found int;
  v_booking_id uuid;
  v_constraint text;
begin
  select * into v_package
    from public.consultation_packages
   where id = p_package_id
     and is_active;

  if not found then
    raise exception 'PACKAGE_NOT_FOUND';
  end if;

  v_distinct_ids := array(select distinct unnest(p_slot_ids));
  v_required := v_package.sessions_count;

  if coalesce(array_length(v_distinct_ids, 1), 0) <> v_required then
    raise exception 'SLOT_COUNT_MISMATCH';
  end if;

  -- All requested slots must exist, be in the future, and have sane ordering.
  select count(*) into v_found
    from public.availability_slots
   where id = any(v_distinct_ids)
     and starts_at > now();

  if v_found <> v_required then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  begin
    insert into public.consultation_bookings (
      user_id, package_id, full_name, phone_whatsapp, email,
      topic_description, reference_code, status
    ) values (
      p_user_id, p_package_id, p_full_name, p_phone_whatsapp, p_email,
      p_topic_description, p_reference_code, 'pending'
    )
    returning id into v_booking_id;

    insert into public.consultation_booking_slots (booking_id, slot_id)
    select v_booking_id, unnest(v_distinct_ids);

    return v_booking_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'consultation_bookings_reference_code_key' then
        raise exception 'REFERENCE_TAKEN';
      end if;
      raise exception 'SLOT_TAKEN';
  end;
end;
$$;

-- ------------------------------------------------------------
-- 7. Remove the receipt, user-cancel and expiry machinery
-- ------------------------------------------------------------

drop function if exists public.mark_consultation_receipt_sent(uuid);
drop function if exists public.cancel_consultation_booking(uuid);

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'consultation-expiry-sweep') then
    perform cron.unschedule('consultation-expiry-sweep');
  end if;
end;
$do$;

drop function if exists public.expire_stale_consultation_bookings();

-- ------------------------------------------------------------
-- 8. Grants
-- ------------------------------------------------------------

revoke all on function public.create_consultation_booking(uuid, uuid, uuid[], text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_consultation_booking(uuid, uuid, uuid[], text, text, text, text, text)
  to service_role;

-- The booking page is now public; the server reads slots with the service
-- role, so the browser never calls this directly.
grant execute on function public.list_available_consultation_slots(timestamptz) to service_role;

-- ------------------------------------------------------------
-- 9. RLS: bookings are service-role only
-- ------------------------------------------------------------
-- Nobody can read a booking back once submitted (there is no account and
-- no lookup); all access flows through admin-guarded endpoints.

drop policy if exists "Own consultation bookings select" on public.consultation_bookings;
drop policy if exists "Own consultation booking slots select" on public.consultation_booking_slots;

revoke all on table public.consultation_bookings from anon, authenticated;
revoke all on table public.consultation_booking_slots from anon, authenticated;

-- ------------------------------------------------------------
-- 10. Settings: payment keys are dead
-- ------------------------------------------------------------

delete from public.consultation_settings
 where key in (
   'payment_shamcash_code',
   'payment_shamcash_qr_path',
   'payment_moneygram_name',
   'payment_moneygram_phone',
   'payment_moneygram_branch'
 );
