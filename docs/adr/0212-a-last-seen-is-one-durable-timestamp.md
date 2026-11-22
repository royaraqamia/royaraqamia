# 0212. A last seen is one durable timestamp

## Status

Accepted (2026-11-22). Supersedes the refusal of an online dot and a presence table in
[ADR 0116](0116-presence-is-a-channel-a-receipt-is-the-watermark.md), without changing that ADR's
decision about typing or read receipts.

## Context

ADR-0116 refused "presence beyond the open thread": a typing event dies in five seconds, a receipt
is already a watermark on the roster, and a durable table for a temporary fact would need a sweeper.
That reasoning still holds for typing and for receipts. It does not hold for a _last seen_: unlike a
typing event, the question "when was this member last here?" has an answer that stays true for weeks,
so durability is the feature rather than the bug.

Members asked for the WhatsApp/Telegram line under the peer's name: «متصل الآن» while they are here,
and an exact last-seen time once they are not. نور is an assistant that is always available, so its
line is a statement about the service, not a timestamp.

## Decision

1. **`public.users.last_seen_at` is the single fact.** One nullable `timestamptz` per member. It is
   null until the member is actually foregrounded, so a dormant row never claims an activity that
   did not happen. The public projection carries it alongside the name and avatar the header already
   reads, so the header pays no extra query.
2. **"Online now" is derived, not stored.** A timestamp younger than 60 seconds reads «متصل الآن»;
   an older one reads the exact local time («آخر ظهور اليوم الساعة 3:45 م», yesterday, or the full
   date). The 60-second window is twice the heartbeat interval, so a dropped ping does not flicker.
   No second column, no separate online table, and no Realtime channel carry this state.
3. **A 30-second foreground heartbeat writes it.** The app stamps on sign-in, on returning to a
   visible tab, and whenever a message is sent; while the tab is hidden it writes nothing. That is
   at most two small updates a minute for an active member and zero for an idle one. Stamping on
   every authenticated request would multiply that by every read the app makes.
4. **An open chat refreshes the peer's stamp every 30 seconds while visible**, through a narrow
   presence read rather than a full thread refresh. The full refresh stamps _our own_ read watermark,
   so using it as a poll would turn a display update into a write storm.
5. **نور shows «متاحة الآن»** in the floating panel and in the full thread header. It has no peer
   row and no heartbeat; an AI assistant that times out would be a lie, not presence.
6. **The old refusal is narrowed, not repealed.** Typing stays an ephemeral Realtime broadcast and
   the read receipt stays `chat_participants.last_read_at` (ADR-0116, ADR-0167). Only the sentence
   "presence beyond the open thread" is replaced by this decision, for this one durable fact.
7. **One dot, on the avatar's bottom-right corner, in both the chat list rows and the public
   `/u/[username]` profile.** It is the same 60-second window as the under-name line, drawn by one
   optional flag on `MemberAvatar`, and it is never the only carrier of the state: the profile also
   prints the line, and the row's avatar labels itself for assistive technology. A colour-only dot
   fails WCAG 1.4.1. The dot does not go in the thread header, which already has the line directly
   under the name.
8. **One shared tick, one shared poll.** The dot and the line derive from the same `isOnline`
   predicate; a visible chat list polls the existing thread-list endpoint once every 30 seconds,
   not once per row. The profile ages its stamp on a client tick and does not poll — a member who
   comes online while someone is reading their profile appears on the next load, which is a better
   trade than a request per open profile.

## Why not the alternatives

- **A `presence` / `last_seen` table.** It adds a join to every header and a second place to secure
  for a value that has exactly one row per member. A column on the row the header already loads is
  both cheaper and easier to reason about.
- **A column on `chat_participants`.** It repeats one fact across every conversation, turns one
  heartbeat into one write per thread, and makes the value depend on the chat rather than the member.
- **Deriving "last seen" from `last_read_at`.** That answers "when did they read this thread", not
  "when were they here". A member who is active in another conversation would look absent.
- **A per-user Realtime topic.** ADR-0165 tried it and ADR-0167 reversed it: Realtime refuses a join
  the `select` policy does not admit, and a public topic leaks presence to anyone who guesses an id.
- **Exact-time-only, with no online state.** It would report «آخر ظهور قبل ثانية» for a member who is
  reading the message right now, which is worse than useless in a chat header.

## Consequences

- `users.last_seen_at` is visible to any signed-in member, with no privacy switch (product decision,
  2026-11-22). It is deliberately not in the anonymous public directory projection.
- The presence poll is one small GET every 30 seconds per open direct chat, and none for the
  assistant, a hidden tab, or a closed panel.
- The timestamp is client-authorized through the existing own-row RLS policy plus a new
  `update (last_seen_at)` column grant; a member can forge their own last seen, exactly as they can
  forge their own typing broadcast (ADR-0116). Both lines are cosmetic, not evidence.
- No Android port ships with this change; the site is the only client that reads the column. A port
  is a separate pair with its own parity row.
