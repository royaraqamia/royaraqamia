-- FCM device tokens for the Android shell (ADR-0038). Web Push keeps its VAPID
-- subscriptions in push_subscriptions; this is the native transport's registry.
--
-- token is unique rather than (user_id, token): FCM hands the same registration
-- token back for the same install, so a re-register is an upsert, and on a
-- shared device the token legitimately migrates from one signed-in user to the
-- next. The register write therefore runs with the service role (see
-- backend/controllers/push.ts); RLS below still scopes reads and deletes to the
-- owner, which is all the client ever needs.
--
-- rollback: drop table public.device_push_tokens;

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_device_push_tokens_user_id on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

create policy "Own device push tokens select"
  on public.device_push_tokens for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Own device push tokens insert"
  on public.device_push_tokens for insert to authenticated
  with check ( (select auth.uid()) = user_id );

-- REQUIRED: .upsert() runs INSERT ... ON CONFLICT DO UPDATE, which needs an
-- UPDATE grant + policy or every re-register fails under RLS.
create policy "Own device push tokens update"
  on public.device_push_tokens for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "Own device push tokens delete"
  on public.device_push_tokens for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- dispatch reads + dead-token pruning run with the service role (bypasses RLS)
grant select on public.device_push_tokens to service_role;
grant select, insert, update, delete on public.device_push_tokens to authenticated;
