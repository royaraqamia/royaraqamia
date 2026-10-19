# Quran reading is anonymous; bookmarks are local-first and sync only for signed-in readers

The Quran Reader is a public tool, but it is also the only tool whose useful state — where a reader
stopped, and what they marked — is worth keeping. We split it the way ADR-0028 splits everything
else: reading needs no account, and a reader's own records are local-first. Signing in does not
unlock the reader; it only turns the Local Store into a shared one, so a reader who never signs in
still finds their place, and one who does finds it on their other devices. Because the records are
single-owner the sync is deliberately dumb — a client-minted id per record, an idempotent upsert
through the Outbox, tombstones for removals, last-write-wins on `updated_at` (ADR-0029, ADR-0033) —
and a first sign-in **Claims** what the device already holds rather than starting over.

## Considered Options

- **Sign-in required to read.** Rejected: it puts the Quran behind an account for no benefit, and
  makes the tool unusable offline in exactly the case it is most wanted.
- **No persistence at all.** Rejected: a reader returning to a 604-page text with no resume point
  has lost the one thing the tool needs to remember. Persistence is the feature; the account is not.
- **Server-authoritative reading state.** Rejected by ADR-0028: these are single-writer records, so
  server authority buys invalidation choreography and nothing else.
- **Device-local only, never synced.** Rejected: the point of keeping a place is being able to find
  it from another device, and the sync is cheap once the record already has an identity.

## Consequences

- The reader renders the resume point from the Local Store and never waits on the network for it.
- Two owner-scoped tables (one row per reader for the Reading position, one per Bookmark) enter the
  additive-migration path (ADR-0040, ADR-0041); their rows carry `client_id`, `updated_at` and
  `deleted_at` like every other owned record.
- Sign-out must not delete the Local Store (it survives sign-out by design), so a reader's local
  place outlives their session and is re-Claimed if they sign back in.
- The server half is three routes under `/quran/api`: a pull (`GET /quran/api/sync?since=<cursor>`)
  returning the position, every Bookmark including tombstones, and the next cursor, plus two
  idempotent writes (`POST /quran/api/position`, `POST /quran/api/bookmarks`). Both tables key on the
  natural identity — `(user_id)` and `(user_id, surah, ayah)` — so a replay can never accumulate rows,
  and `client_id` records the last writer instead of being the replay key.
