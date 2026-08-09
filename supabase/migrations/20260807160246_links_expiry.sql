-- LinkSnap: add link expiry and support date-range analytics queries.

-- 1) Optional expiry timestamp on short links. NULL means the link never expires.
--    A link whose expires_at is in the past redirects to an error page.
ALTER TABLE public.short_links
  ADD COLUMN expires_at timestamptz;

-- 2) Index on analytics_events.clicked_at to make date-range analytics fast.
CREATE INDEX IF NOT EXISTS analytics_events_clicked_at_idx
  ON public.analytics_events (clicked_at);

-- No new tables, so no RLS changes are required. Existing short_links RLS
-- (both reads and writes) continues to govern the new column.