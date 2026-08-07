-- Recurring (recurring) monthly expenses. A monthly recurring expense is
-- materialized into `expenses` once per month by a pg_cron job (security
-- definer, postgres owner) so the owner RLS on expenses is satisfied.

create table if not exists public.recurring_expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  category_id uuid not null references public.categories(id) on delete cascade,
  description text null,
  day_of_month   int not null check (day_of_month between 1 and 31),
  start_month text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_recurring_user
  on public.recurring_expenses (user_id);

alter table public.recurring_expenses enable row level security;

create policy "Users can view their own recurring expenses"
  on public.recurring_expenses for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Users can insert their own recurring expenses"
  on public.recurring_expenses for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "Users can update their own recurring expenses"
  on public.recurring_expenses for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "Users can delete their own recurring expenses"
  on public.recurring_expenses for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

grant select, insert, update, delete on public.recurring_expenses to authenticated;

-- Materialize due recurring expenses for the current month into `expenses`.
-- Uses text-form dates so it works whether `expenses.date` is date or text.
create or replace function public.materialize_due_recurring_expenses()
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  rec record;
  first_day date := date_trunc('month', current_date)::date;
  last_day  int  := extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
  target    date;
  target_txt text;
begin
  for rec in
    select * from public.recurring_expenses
    where active = true
      and start_month <= to_char(current_date, 'YYYY-MM')
  loop
    target      := first_day + (least(rec.day_of_month, last_day) - 1);
    target_txt  := to_char(target, 'YYYY-MM-DD');
    if not exists (
      select 1 from public.expenses e
      where e.user_id = rec.user_id
        and e.category_id = rec.category_id
        and e.amount = rec.amount
        and e.date::text = target_txt
    ) then
      insert into public.expenses (user_id, amount, category_id, date, description)
      values (rec.user_id, rec.amount, rec.category_id, target_txt, rec.description);
    end if;
  end loop;
  return true;
end;
$fn$;

revoke execute on function public.materialize_due_recurring_expenses() from public, anon;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'monthly-recurring-expenses') then
    perform cron.schedule(
      'monthly-recurring-expenses',
      '0 8 1 * *',
      $$select public.materialize_due_recurring_expenses()$$
    );
  end if;
end;
$do$;