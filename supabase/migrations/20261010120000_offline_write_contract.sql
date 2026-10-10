-- Offline-first write contract (ADR-0027 … ADR-0031, ticket #162).
--
-- Owned product tables accept a client-minted id so an Outbox replay is an
-- idempotent upsert keyed on (user_id, client_id): replaying a write after a
-- lost response never duplicates a row. Deletes are tombstones (deleted_at)
-- so a delete can also be replayed, and normal reads exclude tombstones.
--
-- Additive only. Legacy rows keep client_id = NULL; the unique index treats
-- NULLs as distinct, so pre-existing rows never collide.
--
-- Scope:
--   HabitFlow  — habits, habit_logs        (reference implementation, #163/#164)
--   SpendTrack — expenses, expense_splits, budgets, categories, recurring_expenses
--   LinkSnap   — short_links
-- BlogPress `posts` is deliberately out of scope here: it keys ownership on
-- `author_id` (not `user_id`) and its rows are also read by the shared
-- Community feed, which must learn to filter tombstones first. That lands with
-- the BlogPress drafts ticket (#168).
--
-- RLS is unchanged: every table is already user-scoped, and no service-role
-- path is introduced.

do $$
declare
  owned text[] := array[
    'habits',
    'habit_logs',
    'expenses',
    'expense_splits',
    'budgets',
    'categories',
    'recurring_expenses',
    'short_links'
  ];
  t text;
begin
  foreach t in array owned loop
    execute format('alter table public.%I add column if not exists client_id uuid', t);
    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()',
      t
    );
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);

    -- Idempotent upsert target for the Outbox. NULL client_ids (legacy rows)
    -- stay distinct under Postgres unique-index semantics, so they never collide.
    -- expense_splits is owned through its parent expense and carries no user_id,
    -- so it dedupes on (expense_id, client_id) instead.
    if t = 'expense_splits' then
      execute format(
        'create unique index if not exists %I on public.%I (expense_id, client_id)',
        t || '_expense_id_client_id_key',
        t
      );
    else
      execute format(
        'create unique index if not exists %I on public.%I (user_id, client_id)',
        t || '_user_id_client_id_key',
        t
      );
    end if;
  end loop;
end $$;
