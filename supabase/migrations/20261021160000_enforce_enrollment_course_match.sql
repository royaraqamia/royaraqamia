-- Keep a training enrollment inside the application's own Course.
--
-- `enroll_application` locked the application and the cohort, checked the cohort
-- was open and claimed a seat, but never compared the two `course_slug` values.
-- An application for one Course could therefore be enrolled into a cohort of
-- another: the seat was consumed, the application moved to 'enrolled', and the
-- student was recorded against the wrong Course — reachable from the admin UI,
-- which listed every cohort regardless of the application's Course.
--
-- The invariant now lives at the seam that claims the seat, so no caller can
-- skip it: the cohort must belong to the application's Course. The refusal is a
-- plain code like the others (`COHORT_COURSE_MISMATCH`), mapped to a typed error
-- in `training-applications-repository.ts` and a 400 by the controller. Raised
-- before the capacity update, so a mismatch consumes no seat and leaves the
-- application untouched. The error order of the existing codes is unchanged.

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

  -- A cohort belongs to exactly one Course, and an application may only claim a
  -- seat inside its own. Checked before the claim so a mismatch costs no seat.
  if v_application.course_slug <> v_cohort.course_slug then
    raise exception 'COHORT_COURSE_MISMATCH';
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

-- `create or replace` keeps the grants from the original definition, but
-- restating them keeps this file runnable on its own.
revoke all on function public.enroll_application(uuid, uuid) from public, anon, authenticated;
grant execute on function public.enroll_application(uuid, uuid) to service_role;

-- Rollback: re-run `create or replace function public.enroll_application` from
-- 20261001130000_create_training_cohorts.sql (the version without the check).
