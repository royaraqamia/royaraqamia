# The device's data has its own public shell

The spec promises an outbox/diagnostics view and "Remove this device's copy" on
`/account`, and the code had neither (#370). The queue was visible only as a
count in `SyncStatusPill`: a user could not see _what_ was waiting, retry one
item, or read a permanent failure beyond the pill's tooltip. Sign-out keeps the
account's Local Store on disk by design, so a shared or borrowed device had no
way to drop it at all.

The obvious home cannot host it. `/account` is in the worker's never-cache list
(ADR-0031) because a signed-in document served from cache could leak one
session's data to the next. A view that must work offline cannot be an `/account`
page — and `/offline`, the document a reload actually lands on, cannot show a
local queue.

## The decision

`/device` is a top-level route, outside every never-cache prefix, with a
data-free server shell and a client gate that paints IndexedDB after mount.

- **Nothing account-bearing is rendered on the server.** The page is one static
  document, which is what makes caching it safe on a shared device. Every fact
  comes from IndexedDB in the browser.
- **It survives sign-out.** `/device` joins the offline page and the manifest in
  the worker's sign-out keep-list: the copy sign-out deliberately keeps is
  removed from here, and that moment is _after_ the session is gone.
- **It is reached from `/account`, and warmed there.** The row is a plain link
  for guests and members alike — the page is local-only, so there is nothing to
  gate. Rendering it also fetches `/device` once per tab, because a route never
  visited online has no cached document, and this is the one surface that must
  exist when the radio is off.
- **It reads without owning.** Each copy is opened through `openOutboxAccess`,
  the version-less attach the service worker already uses: no product store is
  imported, nothing is created and nothing migrated. This is also why the page
  is not `frontend/api/sync-products.ts` — that module is the worker's
  composition root and drags every transport into the app bundle.

## What the page does

**Inspect.** Every Local Store on the device, account and guest alike, found by
listing database names (`<product>__<identity>`) and matched against
`LOCAL_STORE_PRODUCTS`. Per queued intent it shows the replay type, the entity,
the age, the attempt count, and the last permanent error.

**Retry one item.** The intent is re-armed (`pending`, no attempts, no backoff,
no last error) and the background tiers are asked to deliver it — the same
`requestOutboxFlush()`/`requestShellFlush()` a product page uses after a write.
Delivery stays the sync engine's job; this page is never a second writer.

**Remove a copy.** The queue is counted first, then the databases are deleted
with `deleteDatabase`. The confirmation says how many stores and how many
unsynced writes go with them, and the result says what actually went. A delete
IndexedDB reports as `blocked` (another tab holds the database) is retried for
four seconds and then reported as still open, rather than resetting a button
that never finishes.

## Limits

- **A browser without `indexedDB.databases()` cannot list copies.** The page
  then falls back to the names it can derive — the guest namespace and the
  signed-in account's — and offers removal only, saying the queue cannot be
  listed. That is a stated limit, not a silent empty state.
- **The first online visit still matters.** The document is cached when
  `/account` or `/device` is visited; a device that has never had the app online
  has nothing to serve, exactly as for every other route.
- **LinkSnap is listed but cannot be drained in the background.** Its API takes a
  bearer token rather than the cookie, so a retry re-arms the intent and
  LinkSnap's own tab delivers it. The other products' queues drain through the
  worker as usual.

## Consequences

`frontend/shared/local-store/device-copy.ts` is the read/retry/remove side, with
tests that open every real product store and assert the registry finds it — the
same drift guard the drain registry has, because the page names databases by
string. `frontend/ui/device/__tests__/device-view.test.tsx` covers the per-item
detail, a single-item retry, removal with its reported summary, the
unsupported-browser fallback and the empty device. `scripts/__tests__/sw.test.mjs`
proves `/device` survives the sign-out purge along with `/offline`.
