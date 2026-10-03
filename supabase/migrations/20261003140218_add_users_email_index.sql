-- Speed up email-keyed auth lookups.
--
-- The Supabase admin auth API cannot filter users by email (it only pages all
-- users), so getUserByEmail resolves the auth user id through public.users.
-- Without an index that lookup degenerates into a sequential scan on every
-- unconfirmed-login, OTP-verification, and password-reset request. public.users
-- stores emails already lowercased (Supabase Auth lowercases them and
-- handle_new_user copies them through), so a plain b-tree index serves the
-- equality lookup.

create index if not exists idx_users_email on public.users (email);
