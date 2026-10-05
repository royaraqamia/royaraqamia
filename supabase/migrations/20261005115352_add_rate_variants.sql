-- Official and parallel rate variants for dual-rate currencies (ADR-0013).
--
-- rate_snapshots.rates stays the reference feed (Frankfurter). official_rates carries a
-- central bank's own value where a dedicated source exists; parallel_rates carries the
-- informal market value. Both are `{ CODE: { rate: number, date: "YYYY-MM-DD"|null } }`
-- maps so the two feeds can age independently, and neither overwrites the reference value.
--
-- Rollback:
--   alter table public.rate_snapshots
--     drop column if exists official_rates,
--     drop column if exists parallel_rates;

alter table public.rate_snapshots
  add column if not exists official_rates jsonb not null default '{}'::jsonb,
  add column if not exists parallel_rates jsonb not null default '{}'::jsonb;
