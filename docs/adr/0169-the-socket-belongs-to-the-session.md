# The socket belongs to the session

On a just-opened thread, the first word a member typed reached the peer's «يكتب الآن...» line **2.9 s**
later; the same keystroke on a thread whose channel was already joined took **308 ms** (measured on
production on 2026-11-12, two real accounts, a raw subscriber on `presence:<conversation id>` beside
the UI). The event was not lost — `joinBroadcastChannel` queues it until `SUBSCRIBED` — it was waiting
behind a connection that did not exist yet.

The connection is the tab's, and it was being treated as the screen's. Nothing opened it until a
channel subscribed, and Supabase's client starts its empty-channel shutdown the moment the last
channel leaves, so a member moving from the chats list to a thread raced a teardown they could not
see. The first keystroke then paid a WebSocket handshake, its upgrade, the topic's join and — when
the token was near expiry — an auth refresh, in that order.

## The decision

1. **The browser opens one socket per tab, once the member is known.** `warmRealtimeSocket()` is
   called from the session provider when a user id appears, deferred to an idle frame, and
   idempotent per page. It is a bare `realtime.connect()`: no channel, no topic, nothing to
   authorize. A guest opens nothing, because the call site is gated on a session.
2. **The socket outlives its channels.** `createClient` passes `disconnectOnEmptyChannelsAfterMs`
   at a tab's lifetime instead of the library's two-heartbeat default, so leaving the list for a
   thread closes no connection. The bound exists to keep the timer representable, not as a promise
   to close: a member can reach chat from every page, and a socket that closes on the way in is the
   defect being fixed.
3. **What the screens hold does not change.** One channel per direct row on the list, one for the
   open thread, joined and dropped with the screen (ADR-0167). This is about the transport under
   them, not about which topics are joined.
4. **The app does the same, with a battery-honest bound.** `RealtimeClient` keeps its socket for
   `idleKeepAliveMs` (60 s by default) after the last channel closes, and the idle watchdog closes
   it when that window is spent. The app already joins the list's rows and the open thread on one
   client, so the window is what stops a list-to-thread move from redialling. It is not a
   process-lifetime socket: a phone's radio is metered and its process outlives a screen.
5. **The REST broadcast stays rejected as the primary path.** ADR-0167 refused it, and nothing here
   changes that: it is a second way to publish presence, authorized by a second predicate, so every
   later change to who may announce would have to be made twice. It also spends an HTTPS round trip
   on the coldest keystroke — the same order as a join on a socket that is already connected, which
   is the only case it could win.

## What it costs

- **A signed-in tab holds a socket while it is open**, on every page, with a heartbeat every 25 s.
  That is the price of chat being reachable from everywhere, and it is one connection, not one per
  screen.
- **A cold deep link still dials.** A tab that opens `/chats/<id>` directly has no earlier page to
  warm it, so the first keystroke can still wait for the handshake, though the warm-up and the
  thread's own read now run in parallel. The issue's acceptance number is measured on the thread a
  member opens after the app started; a direct deep link is the case this decision does not cover.
- **A bridge is a measurement's decision, not a preference.** If production still misses ~500 ms on
  the cold deep-link path after this lands, the REST-broadcast fallback becomes the justified
  exception — recorded as its own amendment, never as the default publish path.

## Alternatives considered

- **Warm on the chats list only.** Cheaper on the rest of the site, but the list is one screen and
  the defect is the move out of it: the thread's channel is a different screen's.
- **Keep a joined channel alive for the session.** It holds the socket open the same way, and adds a
  topic whose only purpose is to keep the library from closing it — a policy question (who may join
  it) bought to avoid configuring one option.
- **Publish the first event over the broadcast REST endpoint.** See decision 5.
- **Drop the queued first event instead of delaying it.** Honest, and it is what an offline WhatsApp
  does, but the delay is what the issue reports: the line does appear, seconds late, which reads as
  a broken indicator rather than an absent one.
