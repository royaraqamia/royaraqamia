-- ============================================================
-- Verified members only in the community directory
--
-- The community roster and people-search list every row in public.users, but a
-- row is written at *signup* — before the email is confirmed. handle_new_user()
-- inserts on the auth.users insert, and the app upserts at the pending-signup
-- step (backend/services/auth), so an address that never verifies (or a bot)
-- would otherwise sit in the public, crawlable directory forever.
--
-- This migration mirrors the authoritative "is this a real member" signal from
-- auth.users.email_confirmed_at into public.users.verified and lets the
-- directory filter on it:
--
--   * `verified` defaults to false;
--   * a BEFORE INSERT trigger on public.users copies the auth row's confirmed
--     state, so an OAuth signup (Google sets email_confirmed_at up front) is
--     verified immediately, while a password signup starts unverified;
--   * an AFTER UPDATE OF email_confirmed_at trigger on auth.users flips the row
--     to verified once confirmUserEmail() runs (admin updateUserById with
--     email_confirm: true);
--   * a backfill for pre-existing rows.
--
-- Why not gate row *creation*: handle_new_user() is baseline and its body is
-- not owned by these migrations, so the confirmed-state mirror is done from the
-- side we control. Reading auth.users needs SECURITY DEFINER (the service role
-- cannot see the auth schema).
--
-- Rollback: drop trigger trg_sync_user_verified on auth.users; drop trigger
-- trg_set_user_verified on public.users; drop function
-- sync_user_verified_from_auth, set_user_verified_on_insert; drop index
-- idx_users_verified_created_at; alter table public.users drop column verified.
-- ============================================================

alter table public.users add column if not exists verified boolean not null default false;

-- Set the flag from the auth row whenever a public row is first written.
create or replace function public.set_user_verified_on_insert()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  select (au.email_confirmed_at is not null)
    into new.verified
    from auth.users au
    where au.id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_set_user_verified on public.users;
create trigger trg_set_user_verified
  before insert on public.users
  for each row execute function public.set_user_verified_on_insert();

-- Flip to verified when the email is confirmed after the row already exists.
create or replace function public.sync_user_verified_from_auth()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  update public.users
     set verified = (new.email_confirmed_at is not null)
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_verified on auth.users;
create trigger trg_sync_user_verified
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_user_verified_from_auth();

-- Trigger functions are never called by clients.
revoke execute on function public.set_user_verified_on_insert() from public, anon, authenticated;
revoke execute on function public.sync_user_verified_from_auth() from public, anon, authenticated;

-- Backfill from the authoritative source. Safe to re-run.
update public.users u
   set verified = (au.email_confirmed_at is not null)
  from auth.users au
 where au.id = u.id;

-- Serves the "newest verified members" roster query.
create index if not exists idx_users_verified_created_at
  on public.users (created_at desc)
  where verified;
