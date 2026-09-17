-- The apply form no longer collects an email address or a self-reported
-- experience level, so both columns are dead weight on training_applications.
--
-- Rollback (structure only — dropped values cannot be restored):
--   alter table public.training_applications
--     add column if not exists email text,
--     add column if not exists experience_level text
--       check (experience_level in ('beginner', 'basic', 'experienced'));

alter table public.training_applications
  drop column if exists email,
  drop column if exists experience_level;
