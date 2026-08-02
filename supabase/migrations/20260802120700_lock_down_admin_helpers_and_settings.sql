-- is_admin() is needed by RLS policies for authenticated; revoke from anon/PUBLIC only
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- sync_admin_flag is trigger-only; never callable by clients
revoke execute on function public.sync_admin_flag() from public, anon, authenticated;

-- app_settings is config-only; clients must never touch it directly
revoke all on table public.app_settings from anon, authenticated;
