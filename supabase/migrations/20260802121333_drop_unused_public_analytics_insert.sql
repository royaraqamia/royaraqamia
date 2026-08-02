-- The app records clicks only via the service-role admin client (bypasses RLS).
-- This PUBLIC INSERT policy was never used and let anyone spam the table.
drop policy if exists "analytics_insert" on public.analytics_events;
