-- The recurring-expenses materializer is SECURITY DEFINER (postgres owner) and
-- is only meant to be invoked by the pg_cron job. It must not be callable by
-- the anon/authenticated roles. anon+public were already revoked in the
-- original migration; revoke authenticated here too.
revoke execute on function public.materialize_due_recurring_expenses() from authenticated;