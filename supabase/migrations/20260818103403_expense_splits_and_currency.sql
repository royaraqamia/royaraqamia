-- P2: split expenses across categories + per-expense currency.
--
-- 1) expenses.currency: optional override of the user's base currency for a
--    single expense (NULL = inherit base currency). Display-level only.
-- 2) expense_splits: allocate a single expense across multiple categories,
--    summing to the expense total (validated in the service). Category
--    breakdown / per-category budgets then reflect the allocated amounts.
-- 3) get_category_breakdown recreated so split amounts flow into the
--    per-category breakdown instead of only the parent category.

alter table public.expenses
  add column currency text,
  add constraint expenses_currency_check
    check (currency is null or currency in (
      'USD','EUR','GBP','SAR','AED','EGP','JOD','IQD','SYP','KWD','QAR','BHD','OMR'
    ));

comment on column public.expenses.currency is
  'Optional per-expense currency code; null inherits the user base currency.';

create table public.expense_splits (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  created_at  timestamptz not null default now()
);

create index expense_splits_expense_id_idx on public.expense_splits (expense_id);
create index expense_splits_category_id_idx on public.expense_splits (category_id);

alter table public.expense_splits enable row level security;

create policy "Users can view splits of their own expenses"
  on public.expense_splits for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and e.user_id = (select auth.uid())
    )
  );

create policy "Users can insert splits of their own expenses"
  on public.expense_splits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and e.user_id = (select auth.uid())
    )
  );

create policy "Users can update splits of their own expenses"
  on public.expense_splits for update
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and e.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and e.user_id = (select auth.uid())
    )
  );

create policy "Users can delete splits of their own expenses"
  on public.expense_splits for delete
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and e.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.expense_splits to authenticated;

-- Category breakdown now honours splits: an expense with splits allocates its
-- amount across each split category; a plain expense counts fully against its
-- parent category.
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
