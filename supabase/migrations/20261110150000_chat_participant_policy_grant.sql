-- ============================================================
-- The participant policy's helper needs EXECUTE for the role that calls it
--
-- `20261107090000_chat_participant_state_machine.sql` replaced the participants
-- insert policy with one that asks `private.chat_may_add_participant(...)`, and
-- revoked that function from every role. A policy expression runs as the caller,
-- not as the table owner, so `authenticated` needs EXECUTE on the helper for the
-- policy to evaluate at all. Without it every participant insert (and therefore
-- every group, and the assistant's own thread) answers
--
--   permission denied for function chat_may_add_participant
--
-- which the surface shows as `chat.addParticipant` failing: a 500 on a first
-- open, not a refusal. The same class of bug as #811 (#641 in the notes): a
-- function a policy calls is part of the policy's interface.
--
-- `20261103100000_chat_policy_helper_grants.sql` is the precedent for the four
-- helpers that came before it; this is the same grant for the fifth.
--
-- Rollback:
--   revoke execute on function private.chat_may_add_participant(uuid, uuid, uuid, text)
--     from authenticated;
-- ============================================================

grant execute on function private.chat_may_add_participant(uuid, uuid, uuid, text)
  to authenticated;
