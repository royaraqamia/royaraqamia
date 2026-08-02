-- Remove PUBLIC EXECUTE grants (anon/authenticated inherit via PUBLIC)
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.increment_otp_attempts(uuid) from public;
