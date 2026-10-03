-- Authoritative, O(1) email → auth-user lookup for the auth service.
--
-- The Supabase admin auth API has no email filter (listUsers pages the whole
-- user base), and public.users can theoretically miss a row if the
-- handle_new_user trigger ever fails or a user is created out-of-band. This
-- SECURITY DEFINER function reads auth.users directly using its unique email
-- index, so account recovery (OTP confirmation, password reset) never depends
-- on the public.users mirror being complete.
--
-- Read-only, and locked to service_role: the app reaches it through the admin
-- client's rpc(), never through a user-facing role.

create or replace function public.get_auth_user_by_email(p_email text)
returns table (id uuid, email text, email_confirmed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, coalesce(u.email, '') as email, u.email_confirmed_at
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

revoke all on function public.get_auth_user_by_email(text) from public;
revoke all on function public.get_auth_user_by_email(text) from anon;
revoke all on function public.get_auth_user_by_email(text) from authenticated;
grant execute on function public.get_auth_user_by_email(text) to service_role;
