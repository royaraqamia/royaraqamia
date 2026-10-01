-- The TypeScript client passes NULL to these RPC parameters to mean "no filter"
-- or "anonymous", and each function already branches on NULL at runtime
-- (e.g. `p_categories is null or ...`). But the parameters were declared without
-- a DEFAULT, so the generated types reported them as non-nullable and the call
-- sites no longer type-check. Declaring DEFAULT NULL restores the honest,
-- nullable signature without changing behaviour at call time.
--
-- Postgres requires every input parameter after one with a DEFAULT to also have
-- a DEFAULT, which is why create_consultation_booking (whose nullable parameter,
-- p_user_id, is first) carries defaults across all its parameters. Defaults do
-- not change the function's identity, so CREATE OR REPLACE preserves the
-- existing grants.

create or replace function public.get_total_expenses(
  p_user_id uuid,
  p_start date,
  p_end date,
  p_categories uuid[] default null
)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'forbidden';
  end if;
  return coalesce(
    (select sum(e.amount) from expenses e
     where e.user_id = p_user_id
       and e.date between p_start and p_end
       and (p_categories is null or e.category_id = any(p_categories))),
    0
  );
end;
$function$;

create or replace function public.get_daily_totals(
  p_user_id uuid,
  p_start date,
  p_end date,
  p_categories uuid[] default null
)
returns table(date date, total numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'forbidden';
  end if;
  return query
  select e.date, coalesce(sum(e.amount), 0)::decimal
  from expenses e
  where e.user_id = p_user_id
    and e.date between p_start and p_end
    and (p_categories is null or e.category_id = any(p_categories))
  group by e.date
  order by e.date;
end;
$function$;

create or replace function public.get_category_breakdown(
  p_user_id uuid,
  p_start date,
  p_end date,
  p_categories uuid[] default null
)
returns table(category_id uuid, name text, color_hex text, total numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'forbidden';
  end if;
  return query
  with allocations as (
    select
      e.id as expense_id,
      coalesce(s.category_id, e.category_id) as category_id,
      coalesce(s.amount, e.amount) as amount
    from expenses e
    left join expense_splits s on s.expense_id = e.id
    where e.user_id = p_user_id
      and e.date between p_start and p_end
      and (p_categories is null or coalesce(s.category_id, e.category_id) = any(p_categories))
  )
  select c.id, c.name, c.color_hex, coalesce(sum(a.amount), 0)::decimal
  from categories c
  join allocations a on a.category_id = c.id
  group by c.id, c.name, c.color_hex
  having coalesce(sum(a.amount), 0) > 0
  order by 4 desc;
end;
$function$;

create or replace function public.create_consultation_booking(
  p_user_id uuid default null,
  p_package_id uuid default null,
  p_slot_ids uuid[] default null,
  p_full_name text default null,
  p_phone_whatsapp text default null,
  p_email text default null,
  p_topic_description text default null,
  p_reference_code text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;
