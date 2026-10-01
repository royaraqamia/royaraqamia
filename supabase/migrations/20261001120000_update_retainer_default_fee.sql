-- Raise the advertised Retainer figure from 100 to 150 USD.
--
-- `retainers.monthly_fee_usd` defaults to the advertised figure: a submission
-- stores it the moment it lands, before any Admin agrees terms, so the table
-- default and RETAINER_DEFAULT_MONTHLY_FEE_USD (shared/contracts/retainers.ts)
-- are the same number. The default is raised here rather than by editing the
-- applied create_retainers migration (docs/supabase.md: never edit an applied
-- migration). Existing rows keep the terms they were submitted under.
--
-- Rollback: alter table public.retainers alter column monthly_fee_usd set default 100;

alter table public.retainers
  alter column monthly_fee_usd set default 150;
