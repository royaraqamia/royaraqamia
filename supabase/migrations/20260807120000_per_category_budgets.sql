-- Per-category monthly budgets alongside the overall monthly budget.
-- `budgets.category_id` is NULL for the overall month budget and set for a
-- category-specific budget. Unique constraints are partial so that both an
-- overall budget and per-category budgets can coexist for the same month.

alter table public.budgets
  drop constraint if exists budgets_user_id_month_key;

alter table public.budgets
  add column if not exists category_id uuid null
    references public.categories(id) on delete cascade;

create unique index if not exists idx_budgets_user_month_overall
  on public.budgets (user_id, month)
  where category_id is null;

create unique index if not exists idx_budgets_user_month_category
  on public.budgets (user_id, month, category_id)
  where category_id is not null;