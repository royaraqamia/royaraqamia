-- Submitter edits for consultation_bookings.
--
-- A signed-in booker now has an account-based path to edit their own booking
-- after submitting it (`/account/submissions`). Contact/topic fields are
-- replaceable directly; changing the package or the session slots is a
-- reschedule, which must move the scarce slot holds atomically — hence the
-- `reschedule_consultation_booking` RPC rather than a plain update. `status`,
-- `confirmed_at`, `rejected_reason`, `reference_code` and `user_id` stay
-- server/Admin-owned.
--
-- `edited_at` records the last submitter edit specifically, so an Admin can
-- tell a booker's correction apart from their own status writes (which only
-- move `updated_at`). It stays NULL until the first edit.
--
-- Ownership is enforced with `(select auth.uid()) = user_id` in the RPC, which
-- is the seam account-based editing runs through. The `(user_id, created_at
-- desc)` index keeps the "my submissions" read cheap; it replaces the index
-- dropped when the payment-era user policy was removed.

alter table public.consultation_bookings
  add column if not exists edited_at timestamptz;

create index if not exists idx_consultation_bookings_user_created
  on public.consultation_bookings (user_id, created_at desc)
  where user_id is not null;

-- ------------------------------------------------------------
-- Reschedule: swap the package and/or slot holds atomically
-- ------------------------------------------------------------
-- Only a booking still holding its slots (pending / confirmed) may be
-- rescheduled. Unlike creation, this must RELEASE the old links first: the
-- partial unique index on `(slot_id) where is_active` would otherwise collide
-- when a booker keeps some of their existing sessions. The activity trigger
-- keeps `is_active` in step with the header status, so a reschedule of a
-- `confirmed` booking keeps the new holds active.
--
-- Authentication + ownership are checked before any mutation, and the
-- conflicting-slot check is the unique index itself (race-safe), so two bookers
-- cannot claim the same slot.

create or replace function public.reschedule_consultation_booking(
  p_booking_id uuid,
  p_package_id uuid,
  p_slot_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.consultation_bookings;
  v_package public.consultation_packages;
  v_required int;
  v_distinct_ids uuid[];
  v_found int;
  v_constraint text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_booking
    from public.consultation_bookings
   where id = p_booking_id
     and user_id = v_user_id
     for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- Only a booking that still holds its slots may be rescheduled.
  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'BOOKING_NOT_RESCHEDULABLE';
  end if;

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

  select count(*) into v_found
    from public.availability_slots
   where id = any(v_distinct_ids)
     and starts_at > now();

  if v_found <> v_required then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  -- Release the holds we own, then claim the new ones in one transaction.
  delete from public.consultation_booking_slots
   where booking_id = p_booking_id;

  begin
    insert into public.consultation_booking_slots (booking_id, slot_id)
    select p_booking_id, unnest(v_distinct_ids);

    update public.consultation_bookings
       set package_id = p_package_id,
           edited_at = now(),
           updated_at = now()
     where id = p_booking_id;
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

revoke all on function public.reschedule_consultation_booking(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.reschedule_consultation_booking(uuid, uuid, uuid[])
  to service_role;
