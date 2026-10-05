-- Reschedule consultation bookings under the service role.
--
-- Bookings are anonymous and unpaid, so every path — the signed-in booker's own
-- `/account/submissions` edit included — runs on the service-role client. That
-- client has no `auth.uid()`, so the original `reschedule_consultation_booking`
-- check (and the `NOT_AUTHENTICATED` raise that followed) fired on every
-- reschedule and turned the edit into a 500.
--
-- Mirror `create_consultation_booking`, which took the same route when bookings
-- became anonymous: the caller passes the already-resolved `p_user_id`, and
-- ownership is enforced by matching it against the booking's `user_id` rather
-- than relying on a session. Only `service_role` may execute, so the ownership
-- predicate — not a client grant — is what keeps one booker off another's row.
--
-- Rollback note: re-create the previous 3-argument function from
-- 20261001185541_add_consultation_submitter_edits.sql.

-- The argument list changes, so `create or replace` cannot replace the old
-- signature; drop it explicitly. It is unreachable once the client is updated.
drop function if exists public.reschedule_consultation_booking(uuid, uuid, uuid[]);

create or replace function public.reschedule_consultation_booking(
  p_booking_id uuid,
  p_user_id uuid,
  p_package_id uuid,
  p_slot_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.consultation_bookings;
  v_package public.consultation_packages;
  v_required int;
  v_distinct_ids uuid[];
  v_found int;
  v_constraint text;
begin
  -- A NULL p_user_id matches no row (`user_id = NULL` is never true), so an
  -- anonymous or missing owner resolves to BOOKING_NOT_FOUND, not a 500.
  select * into v_booking
    from public.consultation_bookings
   where id = p_booking_id
     and user_id = p_user_id
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

revoke all on function public.reschedule_consultation_booking(uuid, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.reschedule_consultation_booking(uuid, uuid, uuid, uuid[])
  to service_role;
