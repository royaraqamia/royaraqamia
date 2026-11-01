-- ============================================================
-- The services a member has hidden from the menu and the home row
--
-- `خدماتنا` lists sixteen rows, and a member who does not use eight of them
-- scrolls past eight rows every time (ADR-0112). This is the record of the
-- choice: one row per hidden service, keyed by the route the row navigates to,
-- which is already the row's identity in both clients (`SERVICES_LINK` on the
-- site, `ServicesEntry.route` in the shell) — so nothing new has to be kept in
-- sync, and a route that disappears leaves a row that is simply ignored.
--
-- Hiding is presentation only: the destination still answers, an old bookmark
-- still works, and no data is deleted or excluded from a count. The page that
-- writes this is `/account/services`, and a member who never hides anything
-- holds no rows here, so a fresh account reads as the full menu.
--
-- Rollback: `drop table public.hidden_services;` — the preference is the table,
-- so dropping it restores the sixteen-row menu for everyone.
-- ============================================================

create table if not exists public.hidden_services (
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- The row's route, exactly as both clients spell it (`/quran`). No enum: the
  -- catalog lives in `shared/contracts/hidden-services.ts`, and a service that is
  -- retired leaves a row that no client matches rather than a constraint that
  -- refuses the next write. The shape check keeps a stray value from being a
  -- sentence, so a displayed key (should one ever be shown) is a path.
  service_key text not null check (service_key ~ '^/[a-z0-9/-]{1,120}$'),
  hidden_at   timestamptz not null default now(),
  primary key (user_id, service_key)
);

comment on table public.hidden_services is
  'Services a member hid from the خدماتنا menu and the home row (ADR-0112). Presentation only: the route still answers.';

alter table public.hidden_services enable row level security;

drop policy if exists "Users can view their own hidden services" on public.hidden_services;
create policy "Users can view their own hidden services"
  on public.hidden_services for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "Users can hide their own services" on public.hidden_services;
create policy "Users can hide their own services"
  on public.hidden_services for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

-- No update policy: the row is the fact, so a change is a delete and an insert.
-- Re-hiding an already-hidden service is the same statement, which is why the
-- replace below upserts instead of failing on the primary key.
drop policy if exists "Users can unhide their own services" on public.hidden_services;
create policy "Users can unhide their own services"
  on public.hidden_services for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

grant select, insert, delete on public.hidden_services to authenticated;
