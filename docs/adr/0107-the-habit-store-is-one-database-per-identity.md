# The habit store is one database per identity

> **Status:** accepted (2026-10-31, #768). Shapes the app's Local Store; does not
> change the web's.

The app has to paint HabitFlow's rows before a network answer arrives, including
a cold launch with the radio off (#649's first criterion). Two things stand in
the way of doing that honestly, and both are decisions rather than code:

1. **Whose rows are these?** The store is partitioned per identity, so the paint
   needs the partition before it needs any row — and the only thing that used to
   answer it was the session, which is an async refresh. On the launch this is
   for, that answer never comes.
2. **What happens when a row's shape changes?** A device keeps rows across an
   app update. An upgrade that opens a database with a schema its code does not
   recognise either migrates it or loses it, and only one of those is a decision
   a user would accept.

## The decision

**The identity is remembered, and the store is opened from it.** `Session` keeps
the account id GoTrue returns with the pair — the same value the web resolves
into `user:<id>` — in a preferences file of its own
(`PreferencesIdentityStorage`), reads it once at construction, and answers
`storeIdentity` from memory. A launch with no network opens `user:<id>` and
paints; the refresh that follows reconciles and, only if the server _refuses_ the
token, forgets the pointer. A sign-out forgets it too, so a guest cannot paint
the previous account's rows — while the rows themselves stay on disk, which is
ADR-0027's rule for the web and is the same rule here.

**One database file per identity, named for the web's partition.** The web names
its store `<product>__<identity>` (`localStoreName`), and the app opens
`<product>__<identity>.db` — `habitflow__guest.db`,
`habitflow__user%3A<id>.db`. The colon is percent-encoded because a file name is
not a database name: Android's ext4 would accept it and a JVM path check (or a
copy through another filesystem) does not. Nothing parses the name back; it is
opened, not read.

**A pull is one transaction, and it upserts.** The snapshot replace happens
inside a `@Transaction`, so a process killed mid-pull leaves the previous list or
the new one. Rows are keyed by id, so a pull that arrives twice costs a request
and no state. Tombstones are stored rather than deleted (ADR-0029): dropping a
row the server has already announced would make the next pull re-create it.

**Migrations are forward-only and additive.** `version` moves by one per change,
every change ships a `Migration` that preserves rows, the exported schema is
committed (`android/app/schemas/`), and `fallbackToDestructiveMigration` is never
used. A device that loses its rows on upgrade has no way to tell anyone, and the
schema diff that shipped the loss is the only place it could have been caught.

## What this does not decide

- **Pending writes.** Decided by [ADR-0109](0109-a-queued-write-is-a-row-and-an-intent-in-one-transaction.md)
  (#650): the queue is rows in this database, a write and its intent commit in one
  transaction, and the pull skips a row a queued intent still owns. The web's
  merge is pending-aware (ADR-0029) and so is this one.
- **The guest namespace's content.** HabitFlow requires a session for its sync
  route, so the guest database exists and is empty. The partition is one shape
  for both because a namespace that only exists once you sign in is the kind of
  gap a "guest create" produces later.
- **A Claim on sign-in.** When a guest can write, its rows move into the account
  namespace deduped by `client_id` (ADR-0056's rule for the Quran reader), and
  that is still owed beside the outbox.

## Consequences

`AppGraph` owns one `IdentityScopedStore<HabitStores>`: the store for the current
identity, opened on first use and released when the identity changes, which is
the only lifetime a partitioned store can safely have. The DAO's tests run on the
JVM under Robolectric, against real SQLite files, because the claims this
decision makes are about rows on disk — a fake store would prove only that the
fake behaves.
