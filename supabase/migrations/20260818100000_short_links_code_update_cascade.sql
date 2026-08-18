-- LinkSnap: allow re-slugging short links.
--
-- analytics_events.link_code references short_links.code. Changing a link's
-- slug (code) must re-point its click history, so the FK needs ON UPDATE
-- CASCADE instead of NO ACTION.
ALTER TABLE public.analytics_events
  DROP CONSTRAINT analytics_events_link_code_fkey;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_link_code_fkey
  FOREIGN KEY (link_code)
  REFERENCES public.short_links(code)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
