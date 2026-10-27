-- Materialize each recurring expense once per month, by its own identity (#618).
--
-- The previous body (20261023140000) decided whether a row was already
-- materialized by looking for any expense of the same user, category, amount and
-- date. That is a guess, not an identity: two recurring expenses that share an
-- amount and a category on the same day collapsed into one row, and an expense
-- the user typed by hand with the same figures suppressed the recurring one for
-- the month.
--
-- The materializer now names the row the way the app already names an offline
-- create: `expenses.client_id` carries a v5 UUID derived from the recurring
-- expense's own id and the target month, so the unique `(user_id, client_id)`
-- index (20261010120000) is the idempotence key. A re-run of the same month is
-- `on conflict do nothing`; two recurring expenses with identical figures are
-- two rows; a manual expense with the same figures is unrelated, because it has
-- a client_id of its own (or none).
--
-- The per-row PL001 guard from 20261023140000 is kept: a free account sitting on
-- the expense cap is skipped, and the run continues for every other account.
-- Anything else still raises, so a real failure is not swallowed.
--
-- `uuid-ossp` lives in the non-exposed `extensions` schema, so the calls are
-- schema-qualified rather than added to this function's `search_path`.
--
-- Rollback: re-create the 20261023140000 body (the amount/category/date check
-- with the PL001 guard). The client_ids written here are additive; leaving them
-- in place is harmless, and no row is deleted by rolling back.
--
-- Rows this month were written with a NULL client_id by the old body, so a manual
-- run of the function before the monthly job moves on would insert one more row
-- for those recurring expenses. The 1st-of-month run materializes a new month
-- and is unaffected.

create extension if not exists "uuid-ossp" with schema extensions;

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
begin
  for rec in
    select * from public.recurring_expenses
    where active = true
      and start_month <= to_char(current_date, 'YYYY-MM')
  loop
    target := first_day + (least(rec.day_of_month, last_day) - 1);
    begin
      insert into public.expenses (user_id, amount, category_id, date, description, client_id)
      values (
        rec.user_id,
        rec.amount,
        rec.category_id,
        target,
        rec.description,
        extensions.uuid_generate_v5(
          extensions.uuid_ns_url(),
          'recurring:' || rec.id::text || ':' || to_char(target, 'YYYY-MM')
        )
      )
      on conflict (user_id, client_id) do nothing;
    exception
      when sqlstate 'PL001' then
        null;
    end;
  end loop;
  return true;
end;
$fn$;

revoke execute on function public.materialize_due_recurring_expenses() from public, anon;
revoke execute on function public.materialize_due_recurring_expenses() from authenticated;
