-- `public.chat_reports` is written by `public.report_chat_conversation` and by
-- nothing else (#886).
--
-- That function is where a report's facts are decided: the reporter comes from
-- `auth.uid()`, the reason is trimmed and bounded, the reported side is checked,
-- and the evidence is frozen from the thread's last fifty messages by
-- `private.chat_thread_snapshot`. The table also carried `insert` for
-- `authenticated` (the grant block at the end of `20261103090000_chats.sql`),
-- and the `Reporters file a report` policy only checks that `reporter_id` is the
-- caller and that the caller is in the conversation — so it constrains neither
-- `snapshot`, `reported_user_id` nor `status`.
--
-- A member could therefore POST straight to `/rest/v1/chat_reports` with a
-- fabricated `snapshot`, an arbitrary `reported_user_id` and a `status` of
-- `reviewed`. Staff read every report through the admin branch of
-- `Reporters read their report`, so forged evidence steers moderation and a row
-- that reads `reviewed` hides a real complaint.
--
-- The Data API write privilege goes. SELECT stays, and so does the policy: a
-- `security definer` function writes as the table's owner, which no grant to
-- `authenticated` reaches, so the RPC keeps working while the direct path
-- cannot. The policy is left in place as defence in depth — the grant is the
-- gate, not the policy.
--
-- Rollback:
--   grant insert on public.chat_reports to authenticated;

revoke insert, update, delete on public.chat_reports from authenticated, anon;

comment on policy "Reporters file a report" on public.chat_reports is
  'Defence in depth only (#886): `authenticated` holds no INSERT on this table, so public.report_chat_conversation is the one writer.';
