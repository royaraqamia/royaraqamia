# The hand-rolled service worker is grown, not replaced by Workbox or Serwist

`public/sw.js` already carries logic a framework would fight: content-hashed asset versioning,
Web Push including `pushsubscriptionchange`, and origin-checked `message` handling. We decided to
**keep the hand-rolled worker** and grow it — cache tiers, the never-cache list, an outbox flush
hook — rather than migrate to Workbox or Serwist.

The deciding factor is that a migration would risk the working push/update flow for routing and
Background Sync helpers we can write directly, and the Next.js App Router precache plugins for both
libraries are thin. The worker stays small enough to reason about; its logic moves into testable
modules rather than growing inline.

## Considered Options

- **Adopt Serwist.** Rejected: immaturity against Next.js 16 App Router, and it would replace a
  bespoke push/versioning setup that is currently working.
- **Adopt Workbox routing only.** Rejected: the value is small next to the integration cost, and it
  would still need custom hooks for our push and versioning.

## Consequences

We own cache strategy and Background Sync registration. The worker's `activate` cleanup touches
Cache Storage only — **never IndexedDB** — so the Local Store and Outbox survive every update. New
workers install as _waiting_ and activation stays governed by the existing "update available"
prompt; we never auto-`skipWaiting` destructively. Because owned writes are idempotent
(ADR-0029), a flush interrupted by a worker restart is safe to replay.
