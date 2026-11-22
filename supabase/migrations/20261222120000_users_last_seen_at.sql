-- A last seen is a durable fact about a member, unlike a typing event (ADR 0212).
-- Nullable on purpose: a dormant row must not claim activity that never happened.
-- The foreground heartbeat stamps it the next time that member is actually here.
alter table public.users add column if not exists last_seen_at timestamptz;

-- Future signup rows get a stamp at creation; existing rows keep null until seen.
alter table public.users alter column last_seen_at set default now();

comment on column public.users.last_seen_at is
  'The last time this member was foregrounded in the app; null means not seen since this column existed (ADR 0212).';

-- RLS already limits a session to its own row. The column grant is the other half
-- of the boundary: a table with policies and no grant is invisible (docs/supabase.md).
grant update (last_seen_at) on public.users to authenticated;
