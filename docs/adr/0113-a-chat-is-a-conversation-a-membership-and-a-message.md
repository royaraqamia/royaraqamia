# 0113. A chat is a conversation, a membership, and a message — and nothing else

## Status

Accepted (foundation). The surface lands in the pull requests that follow.

## Context

The notifications page has carried a `chats` tab since ADR-0097 with nothing
behind it: `tabOf()` returns `'alerts'` for every row, and the tab renders «لا
توجد محادثات بعد». The product wants three things in it — member-to-member
messages, group conversations, and an assistant — and each of them pulls the
schema in a different direction:

- a DM needs **consent** before a stranger's messages arrive;
- a group needs **membership that can be pending**, the same consent one step
  later;
- the assistant needs a thread that a model writes into, without a second user
  and without the model acquiring ambient authority over the account.

Three schemas for those three things would mean three lists, three thread
components, three realtime subscriptions, and a fourth for the app. The previous
attempts in this codebase to draw one product twice (the bell's dialogue and the
notifications page, ADR-0097) show what that costs.

## Decision

**One membership model, one thread.** `chat_conversations.kind` is `direct`,
`group` or `agent`; every widget reads the same rows.

1. **Consent is a participant status, not a separate request table.**
   `requested` (a DM you have to answer), `invited` (a group you were added to),
   `active`, `declined`, `left`. A direct thread's `status` is derived from those
   rows by a trigger, which is why no client holds an UPDATE grant on the
   conversation: there is no path where a client can open a thread the other
   side has not accepted.

2. **A direct thread is unique by pair.** `direct_key` is the sorted pair of
   member ids, written by the same trigger and backed by a unique index. A
   second attempt to start the same DM fails the insert, and the service answers
   with the thread that already exists rather than creating a parallel one.

3. **Reads are RLS, in both directions.** `private.chat_is_participant` (active
   member of an active thread) guards messages and attachments;
   `private.chat_has_conversation_access` (any status but `left`) guards the
   conversation and its roster, so a pending request is readable by the person
   who has to answer it and by nobody else. The helpers are SECURITY DEFINER
   because a policy that reads `chat_participants` from inside
   `chat_participants` recurses.

4. **Unread is a watermark, not receipts.** `participants.last_read_at` answers
   "is anything newer than mine" for a list and a badge. A row per message per
   member would be the wrong shape for a group of 32 and a write storm on every
   line.

5. **Nothing is hard-deleted.** A message is tombstoned (`deleted_at`), which is
   an UPDATE, so it carries the new row and reaches a Realtime subscriber
   without `replica identity full` (the reasoning in ADR-0060 still holds).

6. **An edit is bounded in time and in column set.** The RLS window is fifteen
   minutes, a trigger refuses a changed `conversation_id`, `sender_id`,
   `sender_kind`, `created_at` or `reply_to_id`, `edited_at` is the server's,
   and a tombstone cannot be undone.

7. **Staff cannot read a live thread.** There is no admin SELECT policy on
   `chat_messages`, and no service-role read path in the surface. The one
   exception is `report_chat_conversation`, which freezes the last fifty
   messages into `chat_reports.snapshot` at the moment of reporting: the
   evidence is built by the database from the real rows, so a caller can neither
   forge a snapshot nor file an empty one, and staff read the frozen copy.

8. **Blocks are enforced where the message is written**, in the insert policy:
   a blocked member's write is refused by the database, not by a UI check.

9. **The assistant is a kind, not an integration.** An `agent` conversation has
   one participant (its owner) and messages with `sender_kind = 'agent'`. The
   model never holds a session: tools it proposes are recorded and applied only
   after the owner confirms, in the pull request that adds them.

10. **Attachments are capped by bytes, not by count.** 25 MB per file, 1 GB per
    member, both enforced in the table and its trigger, because a count cap at
    any size would allow an unbounded total.

## Consequences

- One realtime publication (`chat_conversations`, `chat_participants`,
  `chat_messages`) serves the list, the unread badge and the open thread, and
  the app subscribes to the same three tables.
- A pending DM is visible to both sides: the sender reads «بانتظار الموافقة»,
  the recipient reads the request and can accept or refuse it. Refusing sets the
  conversation `declined`; neither side can then post into it.
- The assistant's write tools are deliberately absent from this schema. They
  arrive as `chat_agent_actions` rows in the pull request that adds them, so a
  tool cannot exist before the confirmation step that applies it.
- The group cap (3 free / 20 Pro) belongs to the groups pull request, where the
  owned-item counter learns the new key.

## Alternatives considered

- **A request table beside conversations.** Two sources of truth for "is this
  open", and a join on every list read. A participant status is the same fact in
  the place the roster already is.
- **Per-message receipts.** Exact for groups, but a write per member per
  message; a watermark answers the only questions the surface asks.
- **A service-role read for the admin view.** Rejected: it is precisely the
  read ADR-0113 promises cannot happen. The snapshot is the compromise, and it
  is bounded by design.
- **Broadcasting message payloads over Realtime.** A hint that a row exists plus
  a pull keeps RLS the single boundary and avoids a payload shape that has to be
  kept in step with the contract.
