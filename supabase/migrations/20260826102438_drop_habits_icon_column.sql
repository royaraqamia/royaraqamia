-- Drop the legacy habits.icon column now that the habit icon feature is removed.
-- Rollback: ALTER TABLE public.habits ADD COLUMN icon text;
ALTER TABLE public.habits DROP COLUMN IF EXISTS icon;
