-- SpendTrack offline contract, part 1: aggregates ignore tombstones.
--
-- The offline write contract (20261010120000) turned SpendTrack deletes into
-- tombstones (deleted_at) so an Outbox replay is idempotent. The three spend
-- aggregates still summed every row, so a deleted expense kept counting toward
-- totals, the pie breakdown and the daily bars until it was hard-deleted.
--
-- These are the exact bodies from 20261001140000 with `e.deleted_at is null`
-- (and `s.deleted_at is null` for the split join) added. CREATE OR REPLACE keeps
-- the existing signature, SECURITY DEFINER flag and grants unchanged.

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
       and e.deleted_at is null
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
    and e.deleted_at is null
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
    left join expense_splits s on s.expense_id = e.id and s.deleted_at is null
    where e.user_id = p_user_id
      and e.date between p_start and p_end
      and e.deleted_at is null
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
