-- Per-user app preferences. Start with the display currency for SpendTrack,
-- defaulting to USD ($). Rows are created lazily on first change.
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  currency   text not null default 'USD' check (
    currency in ('USD','EUR','GBP','SAR','AED','EGP','JOD','IQD','SYP','KWD','QAR','BHD','OMR')
  ),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can view their own settings"
  on public.user_settings for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Users can insert their own settings"
  on public.user_settings for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "Users can update their own settings"
  on public.user_settings for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

grant select, insert, update on public.user_settings to authenticated;