# The app subscribes to Realtime, and pulls on the hint

The native chats thread had one way to learn that another member wrote: ask again
every five seconds (the `POLL_MS` loop in `ChatThread.kt`). The site has never
worked that way. ADR-0060 says a change is a **hint**: the server pushes "a row
moved", and the client runs the pull it already has, merging with last-write-wins.
The web thread subscribes to `chat_messages` and `chat_participants` and refreshes
on each change; the app asked on a clock instead, because the native shell had no
socket.

That was acceptable while the thread was the only live surface, and it stops being
acceptable now. The chats list's unread badge, the roster's read receipt and every
later ported dashboard want the same signal, and three surfaces each polling is
three clocks, three batteries and three chances to be stale. This records the one
client that replaces the clock, and the reading of the database's Realtime policies
the client depends on.

## Decision

1. **One client, one socket, many channels.** `RealtimeClient` holds a single
   Phoenix socket and joins every subscribed topic on it. A surface subscribes and
   receives `Hint`, `Ready`, `Broadcast` or `Refused`; closing the last
   subscription closes the socket. The client is the app's, not chats': the chat
   topics are what use it first, and the next surface reuses it.
2. **The transport is a small RFC 6455 client, not a dependency.** The app already
   carries `HttpURLConnection` for every request and no WebSocket library. A new
   library for one socket would be a dependency added to the APK for a protocol
   the platform does not expose, so `Rfc6455WebSocketFactory` implements exactly
   what Realtime needs: the HTTP upgrade, text frames, fragmentation, ping/pong and
   close, client-masked as the protocol requires. `RealtimeSocket` is the seam, so
   the protocol and its rules are tested on a JVM with no network.
3. **A hint is not a payload.** `postgres_changes` reports only that the row set
   changed. The open thread calls the same `load()` it calls on open and after a
   write; the repository merges the page into the device store keyed by the
   server's message id. A hint at the wrong moment costs a request; a reconnect
   that replays a change costs the same request, and the id-keyed merge means an
   already-drawn line cannot be drawn twice. This is ADR-0113's refusal to
   broadcast content, made the client's behaviour.
4. **The token is read at join time, and a refusal renews once.** The client never
   stores a token: `RealtimeSession.token()` is asked when a socket is opened, so a
   token refreshed mid-session is the one the next join carries. A `phx_error` or
   an error reply means the socket is dropped, `Session.renew(generation)` is
   asked once, and the reconnect joins with what it returns. A rotation noticed on
   the heartbeat also drops the socket, so the token on the wire is never older
   than the session's.
5. **A refused topic is named, never silent.** The refusal is delivered as
   `RealtimeEvent.Refused(topic, reason)` and logged with the topic. Every join has
   its own `ref`, so the server's error reply names exactly which channel was
   refused. A socket that cannot open is a `Log.w` and a backoff, never a screen
   error: the mount pull and the device cache still answer, which is the ADR-0060
   rule that a hint costs latency and never data.
6. **Private topics are authorised by `realtime.messages`, not by their name.**
   The typing channel joins with `private: true` and the session token, which is
   the shape `20261110090000_chat_typing_channel.sql` authorises: `select` for who
   may receive, `insert` for who may speak, both calling
   `private.chat_is_participant(chat_conversation_from_topic(realtime.topic()), auth.uid())`.
   `postgres_changes` is authorised by the RLS on the table it streams, with the
   join's token. So the client's job is to send the token and to join private where
   the topic is private; the boundary remains the database's.
7. **Reconnect is capped exponential backoff.** 1s, 2s, 4s, 8s, 16s, then 30s,
   reset by any successful join. A radio that returns does not wait on a user
   action, and a server that is down is not hammered. The subscription belongs to
   the screen: the open thread closes it when it leaves, and a process with no
   open live screen holds no socket. The background tier remains the FCM wake of
   ADR-0059, not a second socket.
8. **The thread's five-second poll is removed in the same change.** `ChatThread`
   reads once on open (and after every write) and then pulls on a debounced hint
   (400 ms, the site's `HINT_DEBOUNCE_MS`). There is no second mechanism to keep in
   step with the socket.

## Consequences

- The chat thread's seam is `ChatHintSource`: `RealtimeChatHints` wires the two
  tables (`chat_messages`, `chat_participants`), and a test or a tree without the
  client passes no source and still gets the mount read.
- The wiring lives in `AppGraph`: the Realtime base is the project origin at
  `/realtime/v1/websocket?apikey=<publishable>&vsn=1.0.0`, derived from the auth
  base the app already carries, exactly as the storage base is.
- The typing channel's client-side shape exists (`ChatRealtime.typingSpec`) and is
  tested, but the composer and the indicator remain the chats port's own slice;
  this change deliberately does not draw them.
- A message sent by another member appears while the thread is open without a
  poll. A reconnect re-joins and pulls; the merge is idempotent, so nothing already
  on screen is added again.

## Alternatives considered

- **Add a WebSocket library.** Rejected: a dependency for one protocol, in an APK
  with a size budget and a rule that the platform's own client is enough for every
  other request.
- **Keep polling beside the socket.** Rejected: two mechanisms for one fact, and
  the clock is exactly the latency this removes.
- **Carry the changed row in the event.** Rejected by ADR-0060 and ADR-0113: it
  makes the subscription a second writer and skips the idempotent pull.
- **Reconnect on every hint or on a fixed timer.** Rejected: backoff is the
  smallest rule that both recovers quickly and does not hammer a dead server.
