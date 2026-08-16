-- send_daily_habit_reminders() is SECURITY DEFINER (postgres owner) and now
-- reads Vault secrets and POSTs to the app webhook via pg_net. It is only
-- meant to run from the pg_cron job. anon/public were already revoked in the
-- original migration; revoke authenticated here too so it cannot be invoked
-- via /rest/v1/rpc/send_daily_habit_reminders.
revoke execute on function public.send_daily_habit_reminders() from authenticated;