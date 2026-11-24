-- ============================================================
-- Least-privilege grants, part two: the write privileges anon still holds
--
-- Renumbered from 20270102000000: #1825 had already claimed that stamp, so the
-- integration recorded the version without applying this SQL. The REVOKEs below
-- are idempotent and this file now sorts after every recorded version.
--
-- 20261224000000 closed the incidental TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on
-- tables and the implicit EXECUTE on pg_net. It deliberately left
-- INSERT/UPDATE/DELETE alone because RLS refused those writes and the grants
-- were the working capability model for `authenticated`.
--
-- The audit of 2026-11-24 (#1823) found the other half of the claim in
-- docs/security.md: `anon` still holds INSERT/UPDATE/DELETE on 28 tables and the
-- `following_feed` view, and both public roles hold MAINTAIN and
-- TRUNCATE/REFERENCES/TRIGGER on the two views in `public`. RLS refuses the
-- writes today, but the
-- grant layer is the outer wall — a future permissive policy must not be the
-- only thing between an anonymous client and a write.
--
-- This migration removes only those grants. SELECT stays where a public policy
-- intends it, and the `authenticated` grants stay: their writes are scoped by
-- `auth.uid() = owner` policies. No RLS policy, RPC or service_role grant is
-- touched, and the revoked privileges carry no data a route can read.
--
-- `security/grant-baseline.json` is the generated record of the resulting
-- grant set; `npm run check:grants` compares it with the live ACL.
--
-- Rollback: re-grant the named privileges to the named roles on the named
-- relations. Do not restore a default ACL — that is how the drift arose.
-- ============================================================

revoke insert, update, delete on
  public.analytics_events,
  public.blocks,
  public.budgets,
  public.categories,
  public.certificates,
  public.chat_agent_actions,
  public.chat_attachments,
  public.chat_conversations,
  public.chat_messages,
  public.chat_participants,
  public.community_categories,
  public.community_tags,
  public.device_push_tokens,
  public.expense_splits,
  public.expenses,
  public.following_feed,
  public.habit_logs,
  public.habits,
  public.home_services,
  public.notes,
  public.notifications,
  public.post_categories,
  public.post_tags,
  public.posts,
  public.push_subscriptions,
  public.quran_bookmarks,
  public.quran_reading_positions,
  public.recurring_expenses,
  public.user_settings
from anon;

revoke maintain, truncate, references, trigger on
  public.following_feed,
  public.mcp_catalog_latest_verifications
from anon, authenticated;
