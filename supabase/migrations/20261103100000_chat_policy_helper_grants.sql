-- The chat helpers a policy calls have to be executable by the caller
--
-- A row level security expression runs with the privileges of the role that
-- queries the table, so a helper a policy names needs EXECUTE for that role.
-- `SECURITY DEFINER` decides whose rights the body runs with, not who may call
-- it. `20261103090000_chats.sql` revoked EXECUTE on the helpers from
-- `authenticated` as well, which made every chat read and write abort before
-- RLS decided anything:
--
--   select ... -> ERROR: permission denied for function chat_is_participant
--   select ... -> ERROR: permission denied for function chat_has_conversation_access
--
-- The first read of `startDirect` is a conversations select, which is why
-- starting a conversation from the member picker answered 500 and created
-- nothing, and why the Chats tab could not list a thread at all.
--
-- Only the three below are named by a policy. Everything else in that migration
-- is a trigger (already definer, called by the table, not by a role) or is
-- reached from a definer function, and stays revoked.
--
-- Rollback:
--   revoke execute on function private.chat_has_conversation_access(uuid, uuid) from authenticated;
--   revoke execute on function private.chat_is_participant(uuid, uuid) from authenticated;
--   revoke execute on function private.chat_can_write(uuid, uuid) from authenticated;

grant execute on function private.chat_has_conversation_access(uuid, uuid) to authenticated;
grant execute on function private.chat_is_participant(uuid, uuid) to authenticated;
grant execute on function private.chat_can_write(uuid, uuid) to authenticated;
