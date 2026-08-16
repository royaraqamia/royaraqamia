-- Web Push subscriptions (browser PushManager → web-push dispatch).
-- endpoint is unique so .upsert({ onConflict: 'endpoint' }) handles multi-device
-- resubscribes idempotently.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_push_subscriptions_user_id on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "Own push subscriptions select"
  on public.push_subscriptions for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Own push subscriptions insert"
  on public.push_subscriptions for insert to authenticated
  with check ( (select auth.uid()) = user_id );

-- REQUIRED: .upsert() runs INSERT ... ON CONFLICT DO UPDATE, which needs an
-- UPDATE grant + policy or every resubscribe fails under RLS.
create policy "Own push subscriptions update"
  on public.push_subscriptions for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "Own push subscriptions delete"
  on public.push_subscriptions for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- dispatch reads + prune run with the service role (bypasses RLS)
grant select on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.push_subscriptions to authenticated;