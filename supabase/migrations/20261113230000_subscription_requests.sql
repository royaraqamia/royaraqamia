-- ============================================================
-- subscription_requests: the «اشترِك الآن» form, on the site
--
-- The pricing page's paid pill used to open a WhatsApp chat. It now opens
-- `/pricing/subscribe`, which writes one of these rows for the signed-in reader
-- and answers with a reference code; an Admin reads the list at
-- `/admin/plans/requests` and activates the plan from `/admin/plans`.
--
-- Like `retainers`, `project_requests` and `training_applications`, the row is
-- written server-side, so the table is service-role only: no client reads or
-- writes it directly, and the Admin list is served through an admin-guarded
-- route. The row records a request, not a charge — nothing is collected on the
-- site (ADR-0005, ADR-0006).
--
-- `user_id` is NOT NULL on purpose: a plan is activated on an account, so a
-- request without one cannot be acted on. The account is also what stops two
-- readers colliding on the same plan grant.
--
-- `client_id` is the Outbox's idempotency key (ADR-0029, ticket #169): a submit
-- queued offline and replayed must return the row it already created. It is
-- nullable because the online path never sends one, and unique where present.
-- ============================================================

create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null default 'pro' check (plan in ('pro')),
  full_name text not null,
  phone_whatsapp text not null,
  email text,
  note text,
  reference_code text not null unique,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'activated', 'declined')),
  notes text,
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin list, filtered by status and newest first.
create index if not exists idx_subscription_requests_status_created
  on public.subscription_requests (status, created_at desc);

-- Admin list, unfiltered.
create index if not exists idx_subscription_requests_created
  on public.subscription_requests (created_at desc);

-- One row per replayed submit.
create unique index if not exists subscription_requests_client_id_key
  on public.subscription_requests (client_id);

-- The account's own history, newest first: what the account area reads.
create index if not exists idx_subscription_requests_user_created
  on public.subscription_requests (user_id, created_at desc);

alter table public.subscription_requests enable row level security;

-- Service role only: the submit route and the Admin routes are the only writers
-- and readers, and both are authenticated server-side.
revoke all on public.subscription_requests from anon;
revoke all on public.subscription_requests from authenticated;
grant all on public.subscription_requests to service_role;

create policy "subscription_requests_service_role"
  on public.subscription_requests
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- The request notification type
--
-- The Admin audience is told a request arrived; `notifications.type` is a check
-- constraint, so the new value has to be listed there too (the same edit
-- `20260925133838` and `20261103140000` made for their own types).
-- ------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
    check (type in (
      'certificate_issued',
      'post_published',
      'habit_reminder',
      'recovery_nudge',
      'expense_alert',
      'link_clicked',
      'system_announcement',
      'training_application',
      'consultation_booking',
      'project_request',
      'retainer_request',
      'subscription_request',
      'chat_request'
    ));
