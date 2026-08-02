-- Recomputed by the app whenever ADMIN_EMAILS changes, keeping is_admin flags
-- and the app_settings allowlist consistent with the server-side env var.
create or replace function public.recompute_admin_flags(p_emails text[])
returns void
language sql
security definer
set search_path = 'public'
as $$
  update public.users
     set is_admin = lower(coalesce(email, '')) in (select lower(x) from unnest(p_emails) x)
$$;

revoke execute on function public.recompute_admin_flags(text[]) from public, anon, authenticated;
