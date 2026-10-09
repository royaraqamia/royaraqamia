-- ============================================================
-- Public usernames on public.users
--
-- The community gains public member profiles at /u/<username>. This migration
-- adds a URL-safe handle to every user:
--
--   * a unique, lower-case `username` column;
--   * a BEFORE INSERT OR UPDATE trigger that fills it from the display name
--     when absent. Signup reaches public.users through both the
--     handle_new_user() trigger and the app's upsert (backend/services/auth),
--     so the database is the one place that can guarantee every row has a
--     handle regardless of which path created it;
--   * a backfill for pre-existing rows. This is a data write over a user table,
--     which docs/supabase.md gates behind approval — approved as part of the
--     usernames feature. It only ever touches rows whose username IS NULL and
--     is safe to re-run.
--
-- Collisions resolve with a numeric suffix (name, name-2, ...). Names with no
-- URL-safe characters fall back to `user`. Once set, a handle never changes
-- when the display name changes (the trigger returns early on a non-empty
-- username), so profile links stay stable until the user edits it themselves.
--
-- Rollback: drop trigger trg_assign_username; drop function assign_username,
-- slugify_username; drop index idx_users_username; alter table public.users
-- drop column username.
-- ============================================================

alter table public.users add column if not exists username text;

-- Lower-case, keep ascii alphanumerics + Arabic letters (U+0621..U+064A, which
-- excludes Arabic punctuation and diacritics), collapse the rest to single
-- hyphens, trim leading/trailing hyphens. Anything left empty (e.g. a fully
-- non-Latin/Arabic name) yields '' and the caller falls back to `user`.
create or replace function public.slugify_username(raw text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select trim(
    both '-'
    from regexp_replace(lower(coalesce(raw, '')), E'[^a-z0-9\u0621-\u064A]+', '-', 'g')
  )
$$;

create or replace function public.assign_username()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  base text;
  candidate text;
  suffix int := 0;
begin
  -- A handle the user (or the app) supplied wins; normalise and keep it.
  if new.username is not null and btrim(new.username) <> '' then
    new.username := lower(btrim(new.username));
    return new;
  end if;

  base := public.slugify_username(new.name);
  if base is null or base = '' then
    base := 'user';
  end if;
  base := left(base, 30);

  candidate := base;
  loop
    exit when not exists (
      select 1
      from public.users
      where lower(username) = candidate
        and id is distinct from new.id
    );
    suffix := suffix + 1;
    candidate := left(base, 27) || '-' || suffix::text;
  end loop;

  new.username := candidate;
  return new;
end;
$$;

drop trigger if exists trg_assign_username on public.users;
create trigger trg_assign_username
  before insert or update of name, username on public.users
  for each row execute function public.assign_username();

-- Backfill. `set username = username` still lists the column in the SET, so the
-- BEFORE UPDATE OF username trigger fires for every NULL row and assigns one.
update public.users set username = username where username is null;

alter table public.users alter column username set not null;
create unique index if not exists idx_users_username on public.users (username);

-- The profile editor updates username server-side on the service role, but the
-- own-row update policy already scopes any authenticated write to auth.uid().
grant update (username) on public.users to authenticated;

comment on column public.users.username is
  'Public, lower-case, unique handle. Profile URL: /u/<username>. Auto-assigned from name on insert; user-editable.';
