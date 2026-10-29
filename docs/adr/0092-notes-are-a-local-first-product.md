# Notes are a local-first product, like every owned surface before them

`/notes` is a small Markdown notebook: a list, a rich-text editor, and a search box. It is also the
first product added since ADR-0073 settled the shape of a Local-Store surface, so it inherits that
shape rather than inventing a second one.

**The device is the source of truth.** Every note is written to the identity-partitioned IndexedDB
store (`notes__guest`, `notes__user:<id>`) and its Outbox intent commits in the same transaction. A
guest can create, edit, search and delete with no account and no network. The document is a static,
data-free shell, so the worker caches and precaches it; nothing paints from a loader and nothing
waits for a session to answer whose notes these are. Signing in Claims the guest store into the
account namespace and pushes what it holds (ADR-0027), which is why the surface needs no "migrate my
notes" control.

**The row is the note, not a record of a write.** A note's primary key is the UUIDv7 the device
minted, on both sides of the wire. That makes a replay an idempotent upsert instead of a second
note, and it is why `client_id` on the row is traceability rather than a second identity — the same
choice SpendTrack makes for its expenses. `server_updated_at` is the pull cursor, maintained by the
shared clock-skew-clamped trigger; a queued local write is authoritative until it flushes, and the
cursor does not advance past it (#313). Last-write-wins on the client's `updated_at` is the whole
conflict rule, because a note is single-owner (ADR-0029).

**The body is Markdown, not HTML.** The editor is Tiptap, the same engine BlogPress already ships,
but the stored form is the Markdown source: portable, diffable, searchable without rendering, and
safe to project to plain text for a list preview. Nothing server-side renders a note as HTML. The
editor itself is a lazy chunk, because a visitor can read the list without ever opening a note.

**Search is local.** Title and body are matched in the device's own store, after folding Arabic
diacritics, tatweel and the alef/ya/ta-marbuta variants, so a query typed the way a reader thinks of
a word finds the way it was written. There is no server search, no index, and no read that needs the
network.

**Delete is a tombstone and the undo is a resurrect.** Delete hides the note immediately, queues the
tombstone, and offers one undo in the toast; the undo clears `deleted_at` and queues an update that
revives the row the server still holds. There is no Trash screen and no retention policy, because the
undo is the whole recovery story and the plan cap counts live rows only.

**Remote shell first, bundle later.** The route ships as a precached remote shell rather than joining
the APK's bundled surfaces (ADR-0088) in this change. Bundling is a native release with its own
Artifacts, and the offline promise here is already the same as the other owned products' — one visit,
then it reloads with the radio off. The `bundle: remote` row in `perf/surfaces.json` is the honest
record; moving it to `bundled` is a separate Android change.

**The cap is an owned-item cap, not a metered action.** Creating a note costs nothing; it takes a
standing slot, 5 on Free and 50 on Pro (ADR-0093 restated the numbers), enforced on the device from
the cached caps and at the row by the same Postgres trigger every other capped table uses
(ADR-0075). An account that lapses back to Free keeps its notes and cannot add more.

**Background tiers are wired, deliberately.** Notes joins `DRAINABLE_PRODUCTS` (a closed tab's Outbox
still reaches the server), `PULLABLE_PRODUCTS` (a phone that never opens the app still learns what a
laptop wrote), and the Realtime hint publication (a foreground tab pulls when another device writes).
A new owned product that skipped these would look synced and be minutes behind, which is the failure
mode the hint tier exists to remove (ADR-0058, ADR-0059, ADR-0060).

## Considered options

- **A server-rendered list.** Rejected: it would make the document per-user, put it back on the
  never-cache list, and cost the offline reload the shell promises (ADR-0073).
- **HTML in the database.** Rejected: it is heavier, not diffable, and makes a plain-text projection
  a rendering problem rather than a string operation.
- **Server-side search.** Rejected for v1: it would be a live read on a product whose whole point is
  that the notes are already on the device.
- **Bundling the surface in the APK now.** Deferred, not rejected: it is an Android release and a
  separate decision, and this change is web-only.
- **Tags, pins and a Trash screen.** Deferred: the product is a notebook, and each of these is a list
  surface of its own. Recently-edited order and one undo cover the same ground for now.
