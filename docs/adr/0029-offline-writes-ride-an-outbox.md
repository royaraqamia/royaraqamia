# Offline writes ride an outbox of client-generated IDs and idempotent upserts

To let a user write with no network, the write lands in an **Outbox** inside the Local Store and is
replayed when connectivity returns. Every owned record is created with a **client-generated
UUIDv7** and every write is an **idempotent upsert keyed on `client_id` unique per user**, so a
replay — including one interrupted by a service-worker restart — is safe. Deletes are
**tombstones** (`deleted_at`) rather than hard deletes, so a removal syncs without losing row
identity. Conflicts resolve by **last-write-wins on `updated_at`, server time as the tiebreaker**;
there is no CRDT.

The outbox is ordered per entity, retried with exponential backoff and jitter, and its **permanent
failures are surfaced** (global banner + an account "pending changes" view) — never silently
dropped. Flushes are triggered on `online`, `visibilitychange`, focus and manual retry, with the
Background Sync API used opportunistically where available and never depended upon. A single flush
leader is elected with the Web Locks API and other tabs are notified over BroadcastChannel.

## Considered Options

- **Server-generated IDs.** Rejected: the device cannot reference a record it created before the
  server has ever seen it.
- **Non-idempotent POSTs with client-side de-duplication.** Rejected: a retried POST after a lost
  response creates duplicates; idempotency belongs at the contract.
- **CRDTs (e.g. Yjs/Automerge) per record.** Rejected: single-owner, near-single-device data does
  not justify the storage and reasoning cost.
- **Hard deletes.** Rejected: a deleted row cannot sync its deletion to another device.
- **Periodic Background Sync as the primary trigger.** Rejected: unsupported in Safari and Firefox.

## Consequences

Owned tables gain `client_id`, `updated_at` and `deleted_at` via additive migrations, and the
matching endpoints become upserts; RLS stays user-scoped. A partial failure is visible rather than
lost, which means the UI must own a sync-status surface. The service worker's caches are evictable
but the Local Store and Outbox are not (ADR-0030).
