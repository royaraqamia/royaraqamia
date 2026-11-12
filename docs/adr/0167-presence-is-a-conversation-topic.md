# Presence is a conversation's topic

ADR-0165 moved typing and recording from `chat:<conversation id>` to a per-member stream,
`presence:<user id>`, so the chats list could draw one word per row from a single subscription. The
sender joined the peer's stream **write-only**, admitted — ADR-0165 assumed — by the `insert` policy.

Realtime does not admit that. A private channel is authorised on **join** against the `select`
policy, and only the join's channel is then allowed to send; a topic the caller cannot read is a
topic the caller cannot join. In production the sender's join came back
`Unauthorized: You do not have permissions to read from this Channel topic`, `joinBroadcastChannel`
never reached `SUBSCRIBED`, and its queued keystrokes were dropped on leave. The indicator never
appeared on the peer's screen, in the thread or in the list, for either member. The receiving half was
correct all along: a service-role broadcast into the recipient's topic drew «يكتب الآن...» and
«يُسجِّل رسالة صوتيَّة...» in both places.

## The decision

1. **Presence lives on the conversation's own topic, `presence:<conversation id>`.** Both members join
   it, and the same join carries both halves: the member hears the peer and announces what they are
   doing. This is the unit the state belongs to, and it is the shape both WhatsApp and Telegram have —
   a chat's typing line belongs to that chat.
2. **One policy for both directions: an active member of an active direct thread.**
   `20261126120000_chat_presence_per_thread.sql` adds `private.chat_presence_thread(topic)` and
   `private.chat_can_hear_presence(thread, member)`, and grants `select` and `insert` on exactly that
   predicate. A stranger, a refused request, an archived thread or a blocked pair can neither join nor
   send. Nothing beyond the pair is exposed, which is the property the per-member stream was trying to
   keep.
3. **The list joins the rows it can hear.** One channel per direct, active thread, dropped when the row
   leaves the list or the screen closes. The cost is now the list's length rather than one; that is
   the price of the platform's join rule, and it is bounded by what the list renders.
4. **The payload and the windows are unchanged.** `{ conversationId, userId, state }`, `typing` /
   `recording` / `stop`, throttled to one event per four seconds, forgotten after five (typing) or six
   (recording) with a four-second recording heartbeat. The conversation id in the payload is still
   checked, and the sender is still narrowed to the direct thread's counterpart, because the identity
   remains a cosmetic claim (ADR-0116).
5. **The app is the same pair.** `ChatRealtime.presenceSpec(conversationId)` and
   `ChatPresenceSource` take the conversation rather than a peer id; the list opens a channel per row,
   the open thread one. The Android port is still switched off; this change keeps it true to the site.

## Consequences

- A member now holds one channel per direct row in the list, plus the open thread's. At twenty rows
  that is twenty-one joins on one socket — measured as acceptable, and the reason the list's own
  subscription is now a set rather than a single stream.
- A member hears their own events on the topic; the client drops them by `userId`. The topic is the
  pair, so there is nobody else to hear.
- The per-member helpers (`chat_presence_owner`, `chat_may_announce_presence`) are dropped: no policy
  names them. The older `chat:<conversation id>` policies stay dead for one deploy, as before.
- Violating the assumption is now a test rather than a review: a join that the policy refuses is a
  `CHANNEL_ERROR`, so a change to the predicate fails visibly instead of silently.

## Alternatives considered

- **Grant `select` on `presence:<peer id>` to anyone allowed to announce.** One policy line, no client
  change; rejected because it lets a member read every presence event in the peer's stream, including
  those from other conversations. That is the metadata leak ADR-0116 refused.
- **Send presence through the broadcast REST API with the member's token.** It works — `private: true`
  is required — and needs no join; rejected because it turns every keystroke into an HTTPS request,
  puts the access token in the client's hands for a cosmetic fact, and is a workaround around the
  platform's model rather than a use of it. (Still rejected as the primary path by
  [ADR-0169](0169-the-socket-belongs-to-the-session.md), which fixes the cold-open cost by giving the
  socket to the session instead.)
- **Keep the per-member stream and change the platform.** Not ours to change.
- **One channel per list row, kept forever.** Rejected: channels are joined and dropped with the rows,
  so a long list that is scrolled away does not keep a socket per conversation alive.
