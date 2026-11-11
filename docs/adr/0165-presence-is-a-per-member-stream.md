# Presence is a per-member stream

[#816](https://github.com/royaraqamia/royaraqamia/issues/816) gave a thread "someone is writing
right now". ADR-0116 put it on a private topic named after the conversation, and deliberately refused
**presence beyond the open thread** — no line on a list row, no online dot. The chats list now has to
show the same sentence on every row, the way WhatsApp and Telegram do, and a per-conversation topic
makes that one private join per row: a member with twenty conversations holds twenty channels to
draw one word. It also cannot draw a recording, because the old channel has no event for it.

## The decision

1. **Typing and recording are one per-member stream, `presence:<user id>`.** The member being talked
   _to_ joins their own topic once; a peer publishes into it. The chats list and the open thread read
   the same subscription, and the payload names the conversation the state belongs to, so one channel
   serves every row. This is the shape Telegram and WhatsApp have: one connection, an ephemeral
   map of peer to state, no per-chat subscription.
2. **The reader is the only listener; the peer joins to write.** A private Realtime channel is
   admitted when the caller has **at least one read or write permission** on its topic, so the writer
   joins `presence:<peer id>` with only the `insert` policy admitting it. The absent `select` policy is
   why the writer receives nothing back: presence is not a room, it is one member's inbox.
3. **The policies are the boundary.** `20261125100000_chat_presence_channel.sql` adds
   `private.chat_presence_owner(topic)` and `private.chat_may_announce_presence(owner, sender)`:
   - `select` names the owner alone (`chat_presence_owner(topic) = auth.uid()`);
   - `insert` names a member who is active in the same **active direct** conversation as the owner.
     A refused request, an archived thread, a block or a stranger cannot announce anything. The old
     `chat:<conversation id>` policies stay for one deploy, because a tab opened before this migration
     is still publishing there; a dead topic costs nothing.
4. **The payload is an identity, a state and the conversation.** `{ conversationId, userId, state }`
   with `state` one of `typing`, `recording`, `stop`. The identity is still a cosmetic claim
   (ADR-0116); the reader narrows it, drawing an event only when its `userId` is the direct thread's
   own counterpart and its `conversationId` is a row it holds. A peer could claim another conversation
   in the same stream, which is why that second check exists rather than trusting the payload.
5. **The windows are the lifetime.** Typing is announced on the first keystroke and at most once every
   four seconds, and the reader forgets it after five. Recording is a long state: it is announced
   once and re-announced every four seconds while the microphone runs, and the reader forgets it after
   six. An explicit `stop` closes either immediately. Nothing is stored, and a closed tab or a dead
   socket cannot pin an indicator on screen.
6. **One slot in the thread, one slot in the row.** In the header the live line takes the `@handle`'s
   place under the name and gives it back when it ends; in the list it takes the last-message
   preview's place. The header's height is the avatar's, so nothing jumps. The line is the site's
   primary colour with its three dots animated, and it stands still under `prefers-reduced-motion`.
7. **The assistant is not a peer.** نور has no microphone and no stream of her own; her line is the
   member's own in-flight turn. A module-level registry (`assistant-turn.ts`) marks the conversation
   while `ask` runs, so the list can draw «نور تكتب...» after the member backs out of the thread, and
   the turn's text still lands in the messages. The thread shows the line from `turnStarted` to
   `turnSettled`, including tool calls, and the placeholder bubble is gone: the answer bubble appears
   when there is text.
8. **The app is the same pair.** `ChatPresenceSource` reads the member's stream and opens a write-only
   publisher; `RealtimeClient` gained a `send` on a joined channel, queueing until the join is
   acknowledged. The composer grew the voice-note recorder the site already had — 24 kHz mono WAV from
   `AudioRecord`, uploaded through the existing attachment path — so the app can announce a recording
   as well as draw one. The Android chats port is still switched off; this change draws the pair, it
   does not enable it.

## Consequences

- A member costs one read subscription, plus one write subscription while a thread is open. The list
  costs one, whatever its length.
- The list now draws presence, narrowing ADR-0116's refusal: it is still never a table, a cached row,
  an online dot, or a "delivered" receipt — it is the same ephemeral stream, read one route earlier.
- A recording is visible to the peer for up to six seconds after a crashed sender, which is the same
  bound a typed word already had.
- The copy moved into the pair: `shared/copy/chat-thread.json` and `shared/copy/chats-list.json` carry
  «يكتب الآن...» and «يُسجِّل رسالة صوتيَّة...», so the app and the site cannot word them differently.

## Alternatives considered

- **Keep the per-conversation topic and join one per list row.** No migration, and it works for twenty
  rows; rejected because the cost grows with the list, the list is the screen that must stay cheap,
  and a member with a hundred threads would hold a hundred channels for a cosmetic line.
- **One public or global presence topic.** Rejected: every client would receive every member's state
  and learn who talks to whom, which is the metadata leak ADR-0116 refused.
- **Store presence, or a `last_typed_at` column.** Rejected by ADR-0113 and ADR-0116: it makes a
  five-second fact durable and needs a sweeper to do what the window does for free.
- **A server-side presence fan-out.** Rejected: a second writer and a second path for a fact the
  sender's own client already knows; the insert policy is the whole authorization.
- **Draw the assistant's line in the list from a server row.** Rejected: it would put "is نور writing"
  in Postgres, and the turn is the member's own request, not a fact other members can see.
