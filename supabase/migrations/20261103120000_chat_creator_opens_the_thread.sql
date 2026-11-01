-- A member who opens a thread has to be able to be in it
--
-- `20261103090000_chats.sql` asks for two things the creator cannot satisfy in
-- the same breath:
--
-- - the conversation insert is a plain `insert ... returning`, and `returning`
--   applies the select policy — which only sees a thread you are already a
--   participant in, so the insert itself failed with `new row violates row level
--   security policy for table "chat_conversations"`;
-- - the participant insert needs `chat_is_participant`, which needs a roster row
--   that does not exist yet, so the creator could not join the thread they had
--   just opened.
--
-- Starting a conversation therefore answered 500 every time and left nothing
-- behind. The two policies now carry the missing case:
--
-- - the creator reads the thread they opened (nothing else: the thread is empty
--   until the first participant row exists, and `list_chat_threads` joins the
--   roster, so an orphan conversation never lists);
-- - the creator may add themselves as an active participant. Everyone else
--   still arrives as a request or an invite, which is what keeps a direct thread
--   closed until the other side answers.
--
-- Rollback:
--   drop policy if exists "Creators read their conversation" on public.chat_conversations;
--   drop policy if exists "Members add a participant" on public.chat_participants;
--   (then restore both definitions from 20261103090000_chats.sql)

drop policy if exists "Creators read their conversation" on public.chat_conversations;
create policy "Creators read their conversation"
  on public.chat_conversations for select
  to authenticated
  using ( created_by = (select auth.uid()) );

drop policy if exists "Members add a participant" on public.chat_participants;
create policy "Members add a participant"
  on public.chat_participants for insert
  to authenticated
  with check (
    (
      user_id = (select auth.uid())
      and exists (
        select 1
          from public.chat_conversations c
         where c.id = conversation_id
           and c.created_by = (select auth.uid())
      )
    )
    or (
      private.chat_is_participant(conversation_id, (select auth.uid()))
      and status in ('requested', 'invited')
    )
  );
