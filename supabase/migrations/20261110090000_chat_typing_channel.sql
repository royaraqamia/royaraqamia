-- ============================================================
-- Typing is a private Realtime channel, not a table (#816)
--
-- A typing event is meaningless a minute later, so it is never stored: the
-- composer broadcasts it on a channel per conversation while it is being
-- written, and the reader draws it for five seconds after the last event. The
-- only durable half of this change is the read receipt, and that is derived from
-- `chat_participants.last_read_at` (ADR-0113: unread is a watermark, not
-- receipts) — no table, column or cache entry is added.
--
-- The channel has to be a boundary, so it is a **private** channel authorised by
-- RLS on `realtime.messages`, not a public channel named with the conversation
-- id. Realtime evaluates the policies on that table when the socket joins a
-- topic, using the caller's JWT:
--
--   * `select` decides who may receive on the topic;
--   * `insert` decides who may broadcast on it.
--
-- Both name the membership predicate every other chat policy already uses,
-- `private.chat_is_participant`, so a non-member cannot join the channel and a
-- member who left stops receiving the moment their connection re-authorises.
--
-- The topic is `chat:<conversation uuid>`. Realtime hands the policy the raw
-- topic string and RLS may not raise on a malformed one, so a UUID topic is
-- parsed by `private.chat_conversation_from_topic`, which answers `null` for
-- anything that is not `chat:` followed by a UUID.
--
-- Two deployment facts this file cannot carry:
--   * Realtime's "Allow public access" project setting does not weaken this: a
--     channel joined with `private: true` is authorised by these policies
--     whatever that setting says.
--   * `realtime.messages` is provisioned by the platform, so the guard below
--     skips the policies on a database that does not have it (a bare Postgres
--     replay), the same way the chats migration guards its publication.
--
-- Rollback:
--   drop policy if exists "Members receive their thread's typing" on realtime.messages;
--   drop policy if exists "Members broadcast their thread's typing" on realtime.messages;
--   drop function if exists private.chat_conversation_from_topic(text);
-- ============================================================

-- ------------------------------------------------------------
-- The topic, parsed into the conversation it names
-- ------------------------------------------------------------

-- `immutable` and pinned to an empty path: the body uses only `split_part` and
-- the `~` operator, both of which resolve through `pg_catalog`. Anything that is
-- not `chat:<uuid>` answers null, so a malformed topic reaches
-- `chat_is_participant(null, ...)` — which is false — instead of failing the
-- policy with `invalid input syntax for type uuid`.
create or replace function private.chat_conversation_from_topic(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~* '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_topic, ':', 2)::uuid
    else null
  end;
$$;

revoke all on function private.chat_conversation_from_topic(text) from public, anon;
-- A policy expression runs with the privileges of the caller, so the role that
-- queries `realtime.messages` needs EXECUTE on the helper it names
-- (#811 regression, 20261103100000).
grant execute on function private.chat_conversation_from_topic(text) to authenticated;

-- ------------------------------------------------------------
-- Realtime authorisation: who may join, and who may speak
-- ------------------------------------------------------------

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages is not in this database; skipping the typing channel policies';
    return;
  end if;

  execute 'drop policy if exists "Members receive their thread''s typing" on realtime.messages';
  execute $policy$
    create policy "Members receive their thread's typing"
      on realtime.messages for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and private.chat_is_participant(
          private.chat_conversation_from_topic((select realtime.topic())),
          (select auth.uid())
        )
      )
  $policy$;

  execute 'drop policy if exists "Members broadcast their thread''s typing" on realtime.messages';
  execute $policy$
    create policy "Members broadcast their thread's typing"
      on realtime.messages for insert
      to authenticated
      with check (
        realtime.messages.extension = 'broadcast'
        and private.chat_is_participant(
          private.chat_conversation_from_topic((select realtime.topic())),
          (select auth.uid())
        )
      )
  $policy$;
end $$;

comment on function private.chat_conversation_from_topic(text) is
  'The conversation a Realtime topic names, or null when the topic is not chat:<uuid> (#816).';
