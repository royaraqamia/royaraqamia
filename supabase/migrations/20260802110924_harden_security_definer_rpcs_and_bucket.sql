-- 1) Fix IDOR: enforce auth.uid() = p_user_id on expense RPCs
create or replace function public.get_total_expenses(
  p_user_id uuid,
  p_start date,
  p_end date,
  p_categories uuid[]
)
returns numeric
language plpgsql
security definer
set search_path = 'public'
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
  p_categories uuid[]
)
returns table(date date, total numeric)
language plpgsql
security definer
set search_path = 'public'
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
  p_categories uuid[]
)
returns table(category_id uuid, name text, color_hex text, total numeric)
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'forbidden';
  end if;
  return query
  select c.id, c.name, c.color_hex, coalesce(sum(e.amount), 0)::decimal
  from categories c
  left join expenses e on e.category_id = c.id
    and e.user_id = p_user_id
    and e.date between p_start and p_end
  where c.user_id is null or c.user_id = p_user_id
  group by c.id, c.name, c.color_hex
  having coalesce(sum(e.amount), 0) > 0
  order by total desc;
end;
$function$;

-- 2) Harden search_path on remaining flagged functions
alter function public.generate_certificate_code() set search_path = 'public';
alter function public.update_updated_at() set search_path = 'public';
alter function public.handle_new_user() set search_path = 'public';
alter function public.increment_otp_attempts(uuid) set search_path = 'public';

-- 3) Revoke client EXECUTE on maintenance/trigger functions (never called by clients)
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.increment_otp_attempts(uuid) from anon, authenticated;

-- 4) Drop permissive listing policy on the public post-images bucket
drop policy if exists "Public read access for post-images" on storage.objects;
