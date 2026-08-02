-- Admin source of truth: allowlist seeded from ADMIN_EMAILS
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  admin_emails text[] not null default '{}'
);

insert into public.app_settings (id, admin_emails)
values (true, array['contact@royaraqamia.com'])
on conflict (id) do update set admin_emails = excluded.admin_emails;

-- is_admin flag on users (Option A)
alter table public.users add column if not exists is_admin boolean not null default false;

-- Helper: true when the session user is admin by flag (A) or by allowlist email (B)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false)
      or (auth.jwt()->>'email') in (select unnest(admin_emails) from public.app_settings where id = true)
$$;

-- Backfill existing admins from the allowlist
update public.users set is_admin = true
where email in (select unnest(admin_emails) from public.app_settings where id = true);

-- Keep is_admin in sync whenever a user row is inserted or email changes
create or replace function public.sync_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  new.is_admin := new.email in (select unnest(admin_emails) from public.app_settings where id = true);
  return new;
end;
$$;

drop trigger if exists trg_sync_admin_flag on public.users;
create trigger trg_sync_admin_flag
  before insert or update of email on public.users
  for each row execute function public.sync_admin_flag();

-- Replace the overly permissive certificate write policies with admin-only policies
drop policy if exists "Admins can insert certificates" on public.certificates;
drop policy if exists "Admins can update certificates" on public.certificates;
drop policy if exists "Admins can delete certificates" on public.certificates;

create policy "Admins can insert certificates" on public.certificates
  for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update certificates" on public.certificates
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete certificates" on public.certificates
  for delete to authenticated
  using (public.is_admin());
