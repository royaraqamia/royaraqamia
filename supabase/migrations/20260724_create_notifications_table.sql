create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in (
                'certificate_issued',
                'post_published',
                'habit_reminder',
                'expense_alert',
                'link_clicked',
                'system_announcement'
              )),
  title       text not null,
  body        text,
  metadata    jsonb default '{}'::jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index idx_notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where is_read = false;

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Users can update their own notifications"
  on public.notifications for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "Users can delete their own notifications"
  on public.notifications for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

alter publication supabase_realtime add table public.notifications;

grant insert on public.notifications to service_role;
grant select, update, delete on public.notifications to authenticated;