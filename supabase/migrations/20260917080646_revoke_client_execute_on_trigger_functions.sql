-- ============================================================
-- Revoke client EXECUTE on trigger-only functions
--
-- public.block_deleting_reserved_slot() and
-- public.sync_consultation_booking_slot_activity() both return `trigger` and are used
-- by exactly one trigger each. PostgreSQL grants EXECUTE on new functions to PUBLIC by
-- default, so both were reachable by anon and authenticated through
-- /rest/v1/rpc, which the security advisor flagged.
--
-- Safe to revoke: a trigger does not require the caller to hold EXECUTE on its
-- function, and both are SECURITY DEFINER.
--
-- public.increment_post_view_count(uuid) is deliberately left executable. It is a plain
-- `void` function with no trigger, called by clients to count public blog views, so the
-- same advisor finding is intentional there.
--
-- Verified after applying: anon and authenticated can no longer execute either function,
-- while service_role still can.
-- ============================================================

revoke execute on function public.block_deleting_reserved_slot() from public, anon, authenticated;
revoke execute on function public.sync_consultation_booking_slot_activity() from public, anon, authenticated;
