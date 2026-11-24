# 0218. A list is read when it opens, not on a timer

## Status

Accepted (2026-11-24). Supersedes decision 8 of [ADR 0212](0212-a-last-seen-is-one-durable-timestamp.md)
for the chat list only: the durable `users.last_seen_at` fact and the narrow
per-thread presence poll are unchanged.

## Context

ADR 0212 made a visible chat list poll the thread-list endpoint once every 30
seconds so a row's presence dot stayed honest. The endpoint was
`list_chat_threads()`, which returned every conversation a member had ever had
and resolved four correlated subqueries for each row. The notifications page
also called the same hook at its top level, so opening the bell read the whole
list even when the visitor never opened the Chats tab — only to sum a badge.
Production recorded 320,695 calls in 22 days for 25 users and 16 conversations,
roughly 9.9 reads a minute, and nothing on the server bounds a member's history
(#1803).

The cost is the shape of the read, not the bytes on the wire. Caching the answer
for 30 seconds or slowing the timer hides the growth without bounding it.

## Decision

1. **`list_chat_threads(limit, before, before_id)` is a keyset page.** The
   assistant row stays pinned first and is returned only on the first page; the
   rest are ordered by `(last_message_at, id)` descending, with no-message rows
   last. The server clamps the read to 1..2000 (the API caps a caller at 100,
   while an internal thread-open lookup may scan past one page) and answers an
   opaque cursor only when a lookahead row exists.
2. **The badge has its own aggregate.** `chat_unread_count()` sums the member's
   unread messages in one read and is exposed at `/api/chats/unread-count`. The
   notifications page reads it for the tab badge without mounting the list hook;
   `useChatThreads` lives in the Chats tab component and is called only while
   that tab is on screen.
3. **The list is read once on open and once per page step.** No timer re-reads
   it. A page step is an explicit user action, so read volume follows the tab
   rather than wall-clock time.
4. **The presence dot comes from the stream the row already has.** Each direct
   row holds its own Realtime presence channel (`useChatPresenceList`); a full
   list re-read is not needed to keep a typing or recording dot honest. The
   badge aggregate refreshes on a real chat row change, not on a tick.
5. **The per-thread poll stays.** An open thread still refreshes its peer's
   `last_seen_at` every 30 seconds through the narrow presence endpoint, because
   that durable fact has no channel (ADR 0212 decisions 1-7).

## Why not the alternatives

- **Memoise the list for 30 seconds.** The page is still the member's whole
  history; the cache only hides how often it is paid.
- **Raise the poll to 60 seconds.** Halves the rate and leaves the unbounded
  read and the bell's unconditional visit in place.
- **Drop columns from the payload.** The cost is the per-row subqueries, not the
  response bytes.
- **Read the dot from a presence table.** A durable row for a fact that dies in
  five seconds was already refused in ADR 0116 and is unnecessary here.

## Consequences

- A member with more than one page sees a "load more" control; the device store
  keeps its existing 20-row window, so an offline cold start paints that window
  rather than every page the member stepped through.
- A thread opened from a URL resolves its summary through a bounded lookup
  rather than the first page, so a conversation beyond page one is still
  reachable.
- The zero-argument `list_chat_threads()` is dropped; callers use the
  parameterised signature through the existing RPC grant to `authenticated`.
- No Realtime schema change, no archive feature and no change to the local
  store's 30-day prune.
