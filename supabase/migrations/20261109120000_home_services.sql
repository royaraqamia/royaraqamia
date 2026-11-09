-- ============================================================
-- The apps a member keeps on the homepage
--
-- The homepage is the app door (ADR-0146): the apps a member adds are its tabs,
-- in the order they were added. This is the record of that choice: one row per
-- app, keyed by the route both clients already use as the row's identity
-- (`SERVICES_LINK` on the site, `ServicesEntry.route` in the shell).
--
-- The preference is presentation only: an app that is not added still answers
-- its own route, and a stored key the catalog has retired is ignored rather than
-- breaking the read. A guest keeps the same list on the device and merges it
-- here on sign-in (ADR-0146).
--
-- Rollback: `drop table public.home_services;` — the list is the table, so
-- dropping it restores the empty homepage for everyone.
-- ============================================================

create table if not exists public.home_services (
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- The app's route, exactly as both clients spell it (`/quran`). No enum: the
  -- catalog lives in `shared/contracts/home-services.ts`, and an app retired
  -- from it leaves a row that no client matches rather than a constraint that
  -- refuses the next write. The shape check keeps a stray value from being a
  -- sentence, so a displayed key (should one ever be shown) is a path.
  service_key text not null check (service_key ~ '^/[a-z0-9/-]{1,120}$'),
  -- Tab order. Add order, no cap (ADR-0146), and no uniqueness: a merge of two
  -- devices may write two rows at one number, so order falls back to the row's
  -- own key rather than refusing the write.
  position    integer not null check (position >= 0 and position < 1000),
  added_at    timestamptz not null default now(),
  primary key (user_id, service_key)
);

create index if not exists home_services_order_idx
  on public.home_services (user_id, position, added_at);

comment on table public.home_services is
  'Apps a member keeps on the homepage, in tab order (ADR-0146). Presentation only: a route still answers when it is not added.';

alter table public.home_services enable row level security;

drop policy if exists "Users can view their own homepage apps" on public.home_services;
create policy "Users can view their own homepage apps"
  on public.home_services for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "Users can add their own homepage apps" on public.home_services;
create policy "Users can add their own homepage apps"
  on public.home_services for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

-- A re-save moves an app's position rather than rewriting the row: the whole
-- ordered set is the write, and a device that reorders nothing still upserts.
drop policy if exists "Users can order their own homepage apps" on public.home_services;
create policy "Users can order their own homepage apps"
  on public.home_services for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

drop policy if exists "Users can remove their own homepage apps" on public.home_services;
create policy "Users can remove their own homepage apps"
  on public.home_services for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

grant select, insert, update, delete on public.home_services to authenticated;
