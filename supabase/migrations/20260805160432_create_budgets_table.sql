-- Monthly spending budget per user (one row per user per month). Used to
-- trigger `expense_alert` notifications when the month's total exceeds it.
create table if not exists public.budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  month      text not null,
  amount     numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists idx_budgets_user_month
  on public.budgets (user_id, month);

alter table public.budgets enable row level security;

create policy "Users can view their own budgets"
  on public.budgets for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Users can insert their own budgets"
  on public.budgets for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "Users can update their own budgets"
  on public.budgets for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "Users can delete their own budgets"
  on public.budgets for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

grant select, insert, update, delete on public.budgets to authenticated;
