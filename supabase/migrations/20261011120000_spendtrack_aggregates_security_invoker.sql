-- ============================================================
-- SpendTrack spend aggregates: SECURITY DEFINER -> SECURITY INVOKER
--
-- The security advisor flags `get_total_expenses`, `get_daily_totals` and
-- `get_category_breakdown` as "SECURITY DEFINER function executable by
-- authenticated". They do not need definer rights:
--
--   * every body already rejects a caller whose JWT does not match the target
--     (`if auth.uid() is distinct from p_user_id then raise exception 'forbidden'`);
--   * the only caller is the user-scoped session client
--     (backend/controllers/spendtrack.ts -> withAuthenticatedUser), never
--     service-role, so auth.uid() is always the row owner;
--   * the underlying RLS already scopes every read to the caller: `expenses`
--     and `expense_splits` are own-row, and `categories` is `user_id IS NULL OR
--     auth.uid() = user_id` — the same "own + defaults" set the repository asks
--     for. So INVOKER returns identical rows while dropping a needless
--     privilege escalation.
--
-- Bodies are copied verbatim from 20261010140000 with only the SECURITY clause
-- changed; signatures, defaults and grants (CREATE OR REPLACE keeps them) are
-- unchanged.
--
-- Rollback: re-run the three CREATE OR REPLACE bodies with `security definer`.
-- ============================================================

create or replace function public.get_total_expenses(
  p_user_id uuid,
  p_start date,
  p_end date,
  p_categories uuid[] default null
)
returns numeric
language plpgsql
security invoker
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
security invoker
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
security invoker
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
