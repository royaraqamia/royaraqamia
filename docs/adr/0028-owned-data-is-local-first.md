# A user's own records are local-first; shared reads stay server-authoritative

Offline-first needs an answer to "who is the source of truth". We split the data by ownership.
**Owned data** — habits, expenses, links, drafts: records one user authors and controls — is
**local-first**: the Local Store is authoritative and the server is a sync/backup peer, so the UI
renders from IndexedDB and never waits on the network. **Shared data** — the Community feed,
Exchange Rates, Certificates, Availability Slots: read-oriented records the server owns — stays
**server-authoritative** and is served from a stale-while-revalidate cache.

The split avoids the two failure modes at once: local-first removes cache-invalidation hell for
records that only one user writes, while server-authoritative caching keeps shared data correct
without pretending the device can own it.

## Considered Options

- **Server-authoritative with an optimistic client cache (everything).** Rejected: every owned
  record then needs invalidation and `etag`/version choreography for a single-writer dataset, which
  is complexity without benefit.
- **Local-first for everything.** Rejected: the device cannot be authoritative over rates, slots or
  a public feed; caching those as source of truth would serve wrong data confidently.
- **A CRDT per record.** Rejected for now: the records are single-owner and ~single-device, so
  conflict resolution is rare and last-write-wins is sufficient (see ADR-0029).

## Consequences

Account-tool routes stop being RSC-data-driven and become client-hydrated from IndexedDB, with the
server loader kept as the initial seed and warm path. Public routes stay RSC and are cached by the
service worker. Each owned record carries a stable identity the client mints (ADR-0029), because
the device can create it before any server is reachable.
