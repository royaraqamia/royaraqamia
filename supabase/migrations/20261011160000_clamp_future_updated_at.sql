-- ============================================================
-- Clock-skew guard for last-write-wins
--
-- Offline replay resolves conflicts by last-write-wins on the client-supplied
-- `updated_at` (ADR-0029). That assumes the two devices' clocks are roughly in
-- step. A device whose clock runs *ahead* is the dangerous case: it stamps
-- writes in the future and then wins every conflict forever, and no later,
-- genuinely-newer write from a correct device can ever overtake it.
--
-- Bound the damage at the data boundary: a logical write time more than a small
-- tolerance in the future is clamped to server `now()`. A *past*-skewed clock is
-- deliberately left alone — it simply loses conflicts it should have won, which
-- is a clock-correctness problem, not a poison pill that pins the row forever.
-- (A fully skew-proof design needs a hybrid logical clock; recorded in ADR-0033.)
--
-- This reuses the existing `touch_server_updated_at` trigger function that
-- already fires BEFORE INSERT OR UPDATE on the SpendTrack tables, so no new
-- triggers are needed. Only SpendTrack carries the watermark triggers today.
--
-- Rollback: re-run the 20261011150000 body (without the clamp).

create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
set search_path = 'public'
as $fn$
begin
  new.server_updated_at = now();

  if new.updated_at is not null and new.updated_at > now() + interval '5 minutes' then
    new.updated_at = now();
  end if;

  return new;
end;
$fn$;
