-- training_cohorts + seat-bearing enrollment for training_applications.
--
-- A Course is now taught as one or more Cohorts: a dated intake with a fixed number
-- of seats. This is the first genuinely scarce resource in the training offering, so
-- an Application can now reserve a seat — see docs/adr/0008-training-uses-dated-cohorts-with-seats.md.
--
-- The seat is NOT claimed when the applicant applies. Applying stays anonymous, free
-- and rate-limited; a seat is claimed only when an operator enrolls the application
-- (status -> 'enrolled' with a cohort), which goes through public.enroll_application()
-- so the capacity check and the status write share one transaction.
--
-- Capacity is enforced with a stored seats_taken counter advanced by a guarded
-- conditional update. This is deliberately NOT consultation's partial-unique-index
-- guard: that index proves "at most one active booking per slot" (capacity 1) and
-- cannot express "at most N".

-- ------------------------------------------------------------
-- 1. Cohorts
-- ------------------------------------------------------------

create table if not exists public.training_cohorts (
  id uuid primary key default gen_random_uuid(),
  course_slug text not null,
  label text not null,
  starts_at timestamptz not null,
  capacity int not null check (capacity > 0),
  -- Derived from the count of enrolled Applications, but stored so the capacity
  -- check can be a single guarded UPDATE rather than a count-then-insert race.
  seats_taken int not null default 0 check (seats_taken >= 0),
  status text not null default 'open'
    check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_cohorts_not_overbooked check (seats_taken <= capacity)
);

-- Public form lists open cohorts for a course, soonest first.
create index if not exists idx_training_cohorts_open
  on public.training_cohorts (course_slug, starts_at)
  where status = 'open';

alter table public.training_cohorts enable row level security;

revoke all on public.training_cohorts from anon;
revoke all on public.training_cohorts from authenticated;
grant all on public.training_cohorts to service_role;

create policy "training_cohorts_service_role"
  on public.training_cohorts
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- 2. Applications gain a (nullable) cohort
-- ------------------------------------------------------------

-- Nullable on purpose: applications created before cohorts existed keep cohort_id
-- null, which reads as "applied when there were no cohorts". No backfill.
alter table public.training_applications
  add column if not exists cohort_id uuid
    references public.training_cohorts (id) on delete set null;

-- An enrolled application must name the cohort that holds its seat. Enrollment
-- without a cohort would be a seat claimed from nowhere, so it is not representable.
alter table public.training_applications
  drop constraint if exists training_applications_enrolled_requires_cohort;

alter table public.training_applications
  add constraint training_applications_enrolled_requires_cohort
  check (status <> 'enrolled' or cohort_id is not null);

-- Admin list: applications in a cohort, for seat accounting.
create index if not exists idx_training_applications_cohort
  on public.training_applications (cohort_id)
  where cohort_id is not null;

-- ------------------------------------------------------------
-- 3. Enrollment / release RPCs
-- ------------------------------------------------------------

-- Claim a seat: move an application into 'enrolled' against a cohort, consuming one
-- seat. Returns the updated application id. Raises:
--   APPLICATION_NOT_FOUND | COHORT_NOT_FOUND | COHORT_CLOSED | COHORT_FULL | ALREADY_ENROLLED
create or replace function public.enroll_application(
  p_application_id uuid,
  p_cohort_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.training_applications;
  v_cohort public.training_cohorts;
  v_claimed uuid;
begin
  select * into v_application
    from public.training_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  if v_application.status = 'enrolled' then
    raise exception 'ALREADY_ENROLLED';
  end if;

  select * into v_cohort
    from public.training_cohorts
   where id = p_cohort_id
   for update;

  if not found then
    raise exception 'COHORT_NOT_FOUND';
  end if;

  if v_cohort.status <> 'open' then
    raise exception 'COHORT_CLOSED';
  end if;

  -- The seat claim. A guarded conditional UPDATE, not a count-then-insert: the
  -- row lock taken above serialises concurrent enrollments into this cohort, and
  -- the WHERE clause is the capacity guard. Zero rows updated = cohort full.
  update public.training_cohorts
     set seats_taken = seats_taken + 1,
         updated_at = now()
   where id = p_cohort_id
     and seats_taken < capacity
  returning id into v_claimed;

  if v_claimed is null then
    raise exception 'COHORT_FULL';
  end if;

  update public.training_applications
     set status = 'enrolled',
         cohort_id = p_cohort_id,
         updated_at = now()
   where id = p_application_id;

  return p_application_id;
end;
$$;

-- Release a seat: move an application out of 'enrolled' (to any non-enrolled status)
-- and give its seat back. Raises:
--   APPLICATION_NOT_FOUND | NOT_ENROLLED
create or replace function public.release_application(
  p_application_id uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.training_applications;
begin
  if p_status not in ('new', 'contacted', 'rejected') then
    raise exception 'INVALID_TARGET_STATUS';
  end if;

  select * into v_application
    from public.training_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  if v_application.status <> 'enrolled' then
    raise exception 'NOT_ENROLLED';
  end if;

  -- Floored at 0: the counter may be mid-drift, and releasing must never push it
  -- negative. greatest() keeps the invariant check (seats_taken >= 0) satisfiable.
  update public.training_cohorts
     set seats_taken = greatest(seats_taken - 1, 0),
         updated_at = now()
   where id = v_application.cohort_id;

  update public.training_applications
     set status = p_status,
         cohort_id = null,
         updated_at = now()
   where id = p_application_id;

  return p_application_id;
end;
$$;

-- Only the service role runs these: enrollment is an operator action behind an
-- admin-guarded API route, never a client call.
revoke all on function public.enroll_application(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_application(uuid, text) from public, anon, authenticated;
grant execute on function public.enroll_application(uuid, uuid) to service_role;
grant execute on function public.release_application(uuid, text) to service_role;

-- ------------------------------------------------------------
-- 4. Reconcile the stored counter with the truth
-- ------------------------------------------------------------

-- seats_taken is derivable (count of enrolled applications per cohort). The counter
-- is only an optimisation for the guarded UPDATE, so bring it back to truth once, in
-- case any path ever bypassed the RPCs above.
update public.training_cohorts c
   set seats_taken = coalesce(sub.enrolled_count, 0)
  from (
    select cohort_id, count(*)::int as enrolled_count
      from public.training_applications
     where status = 'enrolled'
       and cohort_id is not null
     group by cohort_id
  ) sub
 where sub.cohort_id = c.id;

-- Cohorts with no enrolled applications must also read zero.
update public.training_cohorts c
   set seats_taken = 0
 where not exists (
   select 1
     from public.training_applications a
    where a.cohort_id = c.id
      and a.status = 'enrolled'
 );

-- Rollback:
--   drop function if exists public.release_application(uuid, text);
--   drop function if exists public.enroll_application(uuid, uuid);
--   alter table public.training_applications drop column if exists cohort_id;
--   drop table if exists public.training_cohorts;
