# The topic belongs to the conversation, not the screen

[ADR-0169](0169-the-socket-belongs-to-the-session.md) gave the socket to the tab, which took the
handshake off the first keystroke. What was left was the topic's own join: `presence:<conversation
id>` was joined by whichever screen drew the thread, and a screen's lifetime is not the conversation's.

The chats list joins one channel per direct row it can hear (ADR-0167, decision 3). Opening a row is a
route change to `/chats/<id>`, which unmounts the list and closes its channels; the thread then joins
the same topic again, cold. Measured on production on 2026-11-12, the thread's first keystroke reached
the peer 0.4–0.9 s late on a joined topic and 2.3–3.3 s late on one that had just been re-joined. The
re-join bought nothing: it was the same topic, on the same socket, for the same pair.

## The decision

1. **One channel per conversation per tab, held by a registry.** `presence-channels.ts` keys its
   entries by conversation id and reference-counts its callers; the first caller joins and every later
   one shares that join. The list's row and the thread it opens are the same entry, not two channels
   on one topic.
2. **The last release holds the join for a grace window.** A route change unmounts the old screen
   before the new one mounts, so an immediate close would leave exactly the gap this fixes. The topic
   waits `CHAT_PRESENCE_CHANNEL_GRACE_MS` (60 s — the same bound ADR-0169 gives the socket) for a new
   caller, and a caller that arrives inside it cancels the close. A tab that leaves chat holds nothing
   for the rest of its life.
3. **A different member is a different channel.** The topic's policy authorises the socket's JWT, so
   an entry joined as someone else is closed and rebuilt rather than shared.
4. **Signing out closes everything at once.** The grace window is for a route change, not for an
   identity change: the session provider's expiry branch calls `closeAllChatPresence()`, which keeps
   ADR-0167's "nothing is joined behind the next member" true even though the hooks now release
   instead of leaving.
5. **The publish half travels with the channel.** `acquireChatPresence` returns `announce`, `stop` and
   `release`, so a caller announces through the same join it hears on — the reason ADR-0167 gave for
   one channel per conversation in the first place.

## Consequences

- **List → thread costs no join.** The member's first keystroke on a thread they reached from the list
  goes out on a topic that is already `SUBSCRIBED`.
- **Two screens no longer hold two channels.** The list's row and the open thread are one join, so a
  member with twenty rows and a thread open holds twenty, not twenty-one.
- **A tab that leaves chat keeps its topics for up to a minute.** No listener is attached, so nothing
  is drawn; the cost is the server's view of a joined channel, which the socket already pays for
  (ADR-0169).
- **A cold document is unchanged.** A direct link to `/chats/<id>` has no earlier screen to borrow a
  join from; the route-and-session join from [ADR-0167's amendment](0167-presence-is-a-conversation-topic.md)
  is what covers it, in parallel with the thread's read.
- **The app keeps its screen-scoped channels.** `ChatThread.kt` and `ChatsScreen.kt` join per
  composable and close on dispose; the app's `RealtimeClient` already keeps one socket for
  `idleKeepAliveMs`, and a shared channel store there is its own change with its own battery question.
  The divergence is transport, not behaviour: both clients join the same topic, send the same payload
  and draw the same two states.

## Alternatives considered

- **Keep the channel on the list and never drop it.** The list is one screen; a member who deep-links
  into a thread never mounted it, and a member who leaves chat would hold every row forever.
- **A registry without the grace window.** The release and the next acquire happen on opposite sides of
  a route change, so the entry would close in the gap and the join would be paid again — the registry
  would dedupe nothing the app actually does.
- **Move the join into the session provider.** It would hold a channel per conversation the tab ever
  saw, with no screen to say when a row is gone; the registry's callers are what bound the set.
- **Publish the first event over the broadcast REST endpoint.** Rejected twice already (ADR-0167,
  ADR-0169 decision 5), and this change removes the delay it was proposed for.
