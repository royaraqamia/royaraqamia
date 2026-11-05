-- ============================================================
-- One list for a reader's own sources (ADR-0130), and a personal digest nobody
-- switches on (ADR-0131).
--
-- The account page used to draw a link twice: once as a proposal with its
-- system/Admin state, and once as a feed with its health. It is one list now —
-- the request while it is on its way, the feed once it is accepted — and the
-- reader can clear either from that list, so the delete needs a policy.
--
-- The personal digest stopped being an opt-in: a reader who holds a source of
-- their own, or who narrowed the catalogue, gets the digest built for them. The
-- column stays (the nightly run and the board read it) but it is true from now
--   on, so no account is left on the shared digest by a switch it can no longer
--   reach.
--
-- Rollback (the data is not lost: only the default and the policy are new):
--   alter table public.news_source_preferences alter column personal_enabled set default false;
--   drop policy if exists "news_source_requests_own_delete" on public.news_source_requests;
--   revoke delete on public.news_source_requests from authenticated;
-- ============================================================

-- ------------------------------------------------------------
-- The digest is on for every account
-- ------------------------------------------------------------
update public.news_source_preferences
   set personal_enabled = true
 where personal_enabled is not true;

alter table public.news_source_preferences
  alter column personal_enabled set default true;

comment on column public.news_source_preferences.personal_enabled is
  'True for every account since ADR-0131: the nightly run builds a digest for a reader who narrowed the catalogue or holds their own sources. The column is kept because the workflow and the board read it.';

-- ------------------------------------------------------------
-- A reader may clear a row that has not become a feed
-- ------------------------------------------------------------
-- The delete is the other half of the one list. An accepted row is the feed's
-- history and the feed is what a reader removes instead, so the policy stops at
-- `user_source_id is null`: a request that produced a source is not deletable
-- from here.
drop policy if exists "news_source_requests_own_delete" on public.news_source_requests;
create policy "news_source_requests_own_delete"
  on public.news_source_requests
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and user_source_id is null
    and status in ('resolving', 'ready', 'needs_review', 'rejected')
  );

grant delete on public.news_source_requests to authenticated;
