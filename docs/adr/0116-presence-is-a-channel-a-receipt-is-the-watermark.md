# 0116. Presence is a channel, a receipt is the watermark

> **Amended by [ADR 0165](0165-presence-is-a-per-member-stream.md).** Typing now travels on a
> per-member `presence:<user id>` private topic rather than `chat:<conversation id>`, so the chats
> list can draw it once for every row; the refusal of "presence beyond the open thread" is narrowed
> to the list, and still forbids a table, an online dot and a delivered receipt.
>
> **Further amended by [ADR 0167](0167-presence-is-a-conversation-topic.md).** The topic is the
> conversation again, `presence:<conversation id>`, because Realtime refuses a join the `select`
> policy does not admit; both members join it, and the list opens one channel per row.

[#816](https://github.com/royaraqamia/royaraqamia/issues/816) gives a chat thread the two facts a
conversation has that a message log cannot hold: someone is writing right now, and someone has read
what was written. ADR-0113 deliberately refused both as tables — a typing row is dead the moment it
is written, and a receipt row per member per message is a write storm — so this records where each
one actually lives, and what a client is allowed to believe from the other.

## The decision

- **Typing is a Realtime Broadcast on a private topic, and touches no table.** The topic is
  `chat:<conversation id>`; Realtime authorises it with the policies on `realtime.messages` when the
  socket joins (`20261110090000_chat_typing_channel.sql`), so the name is not the boundary — the
  membership is. `private.chat_is_participant` is the predicate read and write both, and a
  non-member's join is refused rather than ignored.
- **The composer broadcasts on the first keystroke, then at most once every four seconds.** The
  reader clears the writer five seconds after the last event, so a closed tab or a dropped "stop"
  cannot pin an indicator on screen. Nothing about typing reaches Postgres, the notification tables
  or the offline cache, and the payload carries an identity, never a message — ADR-0113's rule that
  content travels by pull, with RLS as the only boundary, is unchanged.
- **A payload identity is a cosmetic claim, not a fact.** Broadcasts are client-written by
  definition, so a member could name another member as the one typing. That is accepted because the
  indicator is a sentence nobody reads a decision from, and the alternative — a server write per
  keystroke — is the table this decision exists to avoid.
- **A receipt is the roster's watermark read against one line.** `chat_participants.last_read_at` is
  the only record: a direct thread says «قُرئت» once the peer's watermark is at or past the message,
  a group says «قرأها N» for the active members whose watermark is past it. No query, no per-message
  row, and the count can only be as exact as a watermark allows — which ADR-0113 already chose.
- **The watermark moves only while the thread is on screen.** Open, a new line while visible, and
  returning focus all stamp it; a hidden tab stamps nothing, because a background fetch is not
  something the reader saw. That is the same rule the tab's own unread badge needs.
- **A peer's read arrives as a roster hint.** `chat_participants` is already published and already
  readable by the caller, so the open thread subscribes to its own conversation's rows rather than
  inventing a second channel for the fact. One refresh per participant change is the cost.

## Refused

- **A `chat_typing` table, or a `last_typed_at` column.** Both make a temporary fact durable, and
  both need a sweeper to do what a five-second window does for free.
- **Per-message read rows.** Exact for a group and a write per member per line; ADR-0113 already
  refused them, and a receipt that reads the watermark answers the only question the surface asks.
- **A public Broadcast channel named after the conversation.** A conversation id is not a secret,
  and a channel anyone can join is presence leaked to anyone who guesses.
- **Presence beyond the open thread** — an online dot on a list row, "delivered" as distinct from
  read — and push per message. Each is a different question with a different lifetime.
