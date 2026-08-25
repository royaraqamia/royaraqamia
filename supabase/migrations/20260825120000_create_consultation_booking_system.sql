-- ============================================================
-- Consultation Booking System
-- Packages (admin-managed) · specific availability slots ·
-- multi-session bookings with manual payment confirmation.
--
-- Status machine:
--   pending_payment ──24h timeout──▶ expired            (slots freed automatically)
--   pending_payment ──user cancel──▶ cancelled          (slots freed, tracking only)
--   pending_payment ──receipt sent─▶ awaiting_review    (exempt from auto-expiry)
--   awaiting_review ──admin confirm▶ confirmed
--   awaiting_review ──admin reject─▶ rejected           (slots freed)
--
-- Rollback note: purely additive —
--   drop function ... ; drop table consultation_booking_slots, consultation_bookings,
--   availability_slots, consultation_packages, consultation_settings cascade;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

create table public.consultation_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_usd numeric(10,2) not null check (price_usd > 0),
  duration_minutes int not null check (duration_minutes between 15 and 480),
  sessions_count int not null default 1 check (sessions_count between 1 and 20),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint availability_slots_time_order check (ends_at > starts_at)
);

create index idx_availability_slots_starts_at on public.availability_slots (starts_at);

create table public.consultation_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid not null references public.consultation_packages(id),
  full_name text not null,
  phone_whatsapp text not null,
  email text not null,
  topic_description text not null,
  region text not null check (region in ('syria', 'global')),
  payment_method text not null check (payment_method in ('shamcash', 'moneygram')),
  amount_due_usd numeric(10,2) not null check (amount_due_usd > 0),
  status text not null default 'pending_payment' check (
    status in ('pending_payment', 'awaiting_review', 'confirmed', 'rejected', 'cancelled', 'expired')
  ),
  expires_at timestamptz not null,
  receipt_sent_at timestamptz,
  confirmed_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_consultation_bookings_user
  on public.consultation_bookings (user_id, created_at desc);
create index idx_consultation_bookings_pending_expiry
  on public.consultation_bookings (expires_at)
  where status = 'pending_payment';
create index idx_consultation_bookings_status_created
  on public.consultation_bookings (status, created_at desc);

-- N sessions per booking
create table public.consultation_booking_slots (
  booking_id uuid not null references public.consultation_bookings(id) on delete cascade,
  slot_id uuid not null references public.availability_slots(id) on delete cascade,
  is_active boolean not null default true,
  primary key (booking_id, slot_id)
);

-- A slot can be held by at most ONE active booking at the database level.
-- `is_active` mirrors the owning booking's reserving status (kept in sync by
-- the trigger below) so a plain partial unique index is enough.
create unique index idx_consultation_booking_slots_active_uniq
  on public.consultation_booking_slots (slot_id)
  where is_active;

create index idx_consultation_booking_slots_slot on public.consultation_booking_slots (slot_id);

-- Admin-editable display/config values (WhatsApp URL, payment details).
create table public.consultation_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Trigger: mirror booking status onto junction `is_active`
-- ------------------------------------------------------------

create or replace function public.sync_consultation_booking_slot_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.consultation_booking_slots
     set is_active = new.status in ('pending_payment', 'awaiting_review', 'confirmed')
   where booking_id = new.id;
  return new;
end;
$$;

create trigger trg_consultation_booking_slot_activity
after insert or update of status on public.consultation_bookings
for each row
execute function public.sync_consultation_booking_slot_activity();

-- Protect slots from deletion while an active reservation holds them.
create or replace function public.block_deleting_reserved_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count int;
begin
  select count(*) into active_count
    from public.consultation_booking_slots s
   where s.slot_id = old.id
     and s.is_active;

  if active_count > 0 then
    raise exception 'SLOT_HAS_ACTIVE_BOOKING';
  end if;

  return old;
end;
$$;

create trigger trg_block_deleting_reserved_slot
before delete on public.availability_slots
for each row
execute function public.block_deleting_reserved_slot();

-- ------------------------------------------------------------
-- 3. Atomic booking creation (race-safe via the unique index)
-- ------------------------------------------------------------

create or replace function public.create_consultation_booking(
  p_package_id uuid,
  p_slot_ids uuid[],
  p_full_name text,
  p_phone_whatsapp text,
  p_email text,
  p_topic_description text,
  p_region text,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_package public.consultation_packages;
  v_required int;
  v_distinct_ids uuid[];
  v_found int;
  v_conflicting int;
  v_booking_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_package
    from public.consultation_packages
   where id = p_package_id
     and is_active;

  if not found then
    raise exception 'PACKAGE_NOT_FOUND';
  end if;

  v_distinct_ids := array(select distinct unnest(p_slot_ids));
  v_required := v_package.sessions_count;

  if coalesce(array_length(v_distinct_ids, 1), 0) <> v_required then
    raise exception 'SLOT_COUNT_MISMATCH';
  end if;

  -- All requested slots must exist, be in the future, and have sane ordering.
  select count(*) into v_found
    from public.availability_slots
   where id = any(v_distinct_ids)
     and starts_at > now();

  if v_found <> v_required then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  begin
    insert into public.consultation_bookings (
      user_id, package_id, full_name, phone_whatsapp, email,
      topic_description, region, payment_method,
      amount_due_usd, status, expires_at
    ) values (
      v_user_id, p_package_id, p_full_name, p_phone_whatsapp, p_email,
      p_topic_description, p_region, p_payment_method,
      v_package.price_usd, 'pending_payment', now() + interval '24 hours'
    )
    returning id into v_booking_id;

    insert into public.consultation_booking_slots (booking_id, slot_id)
    select v_booking_id, unnest(v_distinct_ids);

    return v_booking_id;
  exception
    when unique_violation then
      raise exception 'SLOT_TAKEN';
  end;
end;
$$;

-- User actions: mark receipt as sent / cancel own booking.
create or replace function public.mark_consultation_receipt_sent(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.consultation_bookings
     set status = 'awaiting_review',
         receipt_sent_at = now(),
         updated_at = now()
   where id = p_booking_id
     and user_id = v_user_id
     and status = 'pending_payment'
     and expires_at > now();

  if not found then
    raise exception 'BOOKING_NOT_PENDING';
  end if;
end;
$$;

create or replace function public.cancel_consultation_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.consultation_bookings
     set status = 'cancelled',
         updated_at = now()
   where id = p_booking_id
     and user_id = v_user_id
     and status in ('pending_payment', 'awaiting_review');

  if not found then
    raise exception 'BOOKING_NOT_CANCELLABLE';
  end if;
end;
$$;

-- Lazy expiry sweep: flips stale pendings to expired; the activity trigger
-- releases their slots. Runs with the service role from the API layer.
create or replace function public.expire_stale_consultation_bookings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  update public.consultation_bookings
     set status = 'expired',
         updated_at = now()
   where status = 'pending_payment'
     and expires_at < now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.create_consultation_booking(uuid, uuid[], text, text, text, text, text, text)
  from public, anon;
revoke all on function public.mark_consultation_receipt_sent(uuid) from public, anon;
revoke all on function public.cancel_consultation_booking(uuid) from public, anon;
revoke all on function public.expire_stale_consultation_bookings() from public, anon, authenticated;

grant execute on function public.create_consultation_booking(uuid, uuid[], text, text, text, text, text, text)
  to authenticated;
grant execute on function public.mark_consultation_receipt_sent(uuid) to authenticated;
grant execute on function public.cancel_consultation_booking(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------

alter table public.consultation_packages enable row level security;
alter table public.availability_slots enable row level security;
alter table public.consultation_bookings enable row level security;
alter table public.consultation_booking_slots enable row level security;
alter table public.consultation_settings enable row level security;

-- Public pricing/times info (the booking page itself is auth-gated).
create policy "Public read consultation packages"
  on public.consultation_packages for select
  to anon, authenticated
  using (true);

create policy "Public read availability slots"
  on public.availability_slots for select
  to anon, authenticated
  using (true);

-- Bookings: owner read-only. ALL mutations flow through the SECURITY DEFINER
-- RPCs above or the service-role repositories behind admin-guarded endpoints.
create policy "Own consultation bookings select"
  on public.consultation_bookings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own consultation booking slots select"
  on public.consultation_booking_slots for select
  to authenticated
  using (
    exists (
      select 1 from public.consultation_bookings b
      where b.id = booking_id
        and (select auth.uid()) = b.user_id
    )
  );

-- Settings are config-only; clients never touch them directly
-- (same discipline as app_settings). Service role bypasses RLS.
revoke all on table public.consultation_settings from anon, authenticated;
revoke all on table public.consultation_packages from anon, authenticated;
revoke all on table public.availability_slots from anon, authenticated;
revoke all on table public.consultation_bookings from anon, authenticated;
revoke all on table public.consultation_booking_slots from anon, authenticated;

grant select on table public.consultation_packages to anon, authenticated;
grant select on table public.availability_slots to anon, authenticated;
grant select on table public.consultation_bookings to authenticated;
grant select on table public.consultation_booking_slots to authenticated;

-- ------------------------------------------------------------
-- 5. Seed defaults (placeholders swappable from the admin dashboard)
-- ------------------------------------------------------------

insert into public.consultation_packages (name, description, price_usd, duration_minutes, sessions_count, sort_order)
select
  'توجيه تقني متكامل',
  'تحليل كامل لاحتياجاتك الرقمية، مراجعة ما لديك، ورسم مسار التعلم أو التنفيذ خطوة بخطوة.',
  25.00, 60, 1, 0
where not exists (select 1 from public.consultation_packages);

insert into public.consultation_settings (key, value) values
  ('booking_whatsapp_url', 'https://wa.me/963968478904'),
  ('payment_shamcash_qr_path', '/images/payments/shamcash-qr-placeholder.png'),
  ('payment_moneygram_name', '[اسم المدير التنفيذي — سيُستبدل بالبيانات الحقيقية]'),
  ('payment_moneygram_phone', '[رقم الهاتف — سيُستبدل بالبيانات الحقيقية]'),
  ('payment_moneygram_branch', '[اسم الفرص المفضّل — سيُستبدل بالبيانات الحقيقية]')
on conflict (key) do nothing;
