import { mirrorFor, type LocalStoreMirror } from '@/frontend/shared/local-store/mirror';
import { openLocalStore, type LocalStoreMigration } from '@/frontend/shared/local-store/idb';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';

/**
 * The lifetime of one Local Store connection.
 *
 * Every store-owning hook closes its store in the effect cleanup. That cleanup
 * can land while a Sync Engine flush is parked inside `transport.send`, and
 * `IDBDatabase.transaction()` throws `InvalidStateError` once the connection is
 * closed — so the flush's next store call rejected the un-awaited `flush()` and
 * skipped the `pull()`/`readIntoState()` that follows (#204). #200/#203 fixed
 * the same race one layer up, on the engine's BroadcastChannel.
 *
 * Aborting the flush on teardown is not an option: a store the caller owns
 * outlives the hook, and an in-flight flush must still drain the Outbox there
 * (#198). So the fix lives here, in the connection's lifetime:
 *
 * - `close()` stops accepting new work. Every later operation resolves to its
 *   empty value and never opens a transaction, so nothing can hit
 *   `InvalidStateError` — the flush either completes or is cleanly abandoned.
 * - The real `IDBDatabase.close()` is deferred until the operations already
 *   inside IndexedDB settle, so an in-flight transaction is never yanked.
 *
 * The stores route every read and write through `run()`, which also means a
 * no-op'd write skips its `notifyWrites()`, so subscribers are not woken for
 * work that did not land.
 */
export class LocalStoreConnection {
  private readonly db: IDBDatabase;
  /** Operations currently inside IndexedDB; `close()` waits for this to reach 0. */
  private pending = 0;
  private closing = false;
  private closed = false;

  constructor(db: IDBDatabase) {
    this.db = db;

    // `openLocalStore` closes this connection when another tab opens a newer
    // schema version. Route that through `close()` too, so operations landing
    // afterwards no-op instead of throwing on a connection we did not close
    // (#204), then let the original handler run: closing here must not swallow
    // the `onVersionChange` a caller asked for.
    const onVersionChange = db.onversionchange;
    db.onversionchange = (event) => {
      this.close();
      if (typeof onVersionChange === 'function') onVersionChange.call(db, event);
    };
  }

  /** True once `close()` has run; no further operation reaches the database. */
  get isClosing(): boolean {
    return this.closing;
  }

  /**
   * Closes the connection. Idempotent. The underlying `close()` waits for
   * operations already in flight, so it is safe to call at any point.
   */
  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.settleIfIdle();
  }

  /**
   * Runs one store operation against the connection. Resolves to `whenClosed` —
   * the caller's empty value, `[]` or `null` or `false` — without touching
   * IndexedDB once the connection is closing or closed.
   */
  async run<T>(operation: (db: IDBDatabase) => Promise<T>, whenClosed: T): Promise<T> {
    if (this.closing) return whenClosed;
    this.pending += 1;
    try {
      return await operation(this.db);
    } finally {
      this.pending -= 1;
      this.settleIfIdle();
    }
  }

  private settleIfIdle(): void {
    if (this.closed || !this.closing || this.pending > 0) return;
    this.closed = true;
    this.db.close();
  }
}

/**
 * One connection per database, kept for the document's lifetime (#494).
 *
 * Before this, every product hook opened its own `IDBDatabase` on mount and
 * closed it on unmount: a route change reopened the store and re-read every
 * list, even though nothing had changed, and two components could race two
 * connections for the same database — with the version-change handover closing
 * the one a third component was still reading.
 *
 * So the open path moved here, behind the same registry: the first `open()` of a
 * database opens it, and every later one hands out another *lease* on that
 * connection. Closing a store closes its lease only — the database stays open
 * for the next navigation, and for a lease that is still reading. The
 * connection itself closes when the identity changes (`closeIdentityStores`) or
 * when a newer tab migrates the schema out from under it, which the
 * `LocalStoreConnection` already handles by no-op'ing every later operation.
 *
 * Test isolation is the factory: `new IDBFactory()` starts a fresh registry, so
 * a test that opens a database twice gets the connection it expects.
 */
export interface LocalStoreLease {
  /** The database this lease is on, e.g. `habitflow__guest`. */
  readonly name: string;
  /** The in-memory mirror the store feeds and reads through (#494). */
  readonly mirror: LocalStoreMirror;
  /** Runs one operation, unless this lease (or the connection) has closed. */
  run<T>(operation: (db: IDBDatabase) => Promise<T>, whenClosed: T): Promise<T>;
  /** True once this holder is closed, or its connection went away. */
  readonly isClosed: boolean;
  /** Marks this holder closed. Idempotent; the shared connection stays open. */
  close(): void;
}

interface SharedConnection {
  connection: LocalStoreConnection;
}

/**
 * The in-flight open, not the opened connection: two hooks mounting together
 * must land on one database, and awaiting the promise is what makes that true
 * even though both reach here before either has finished opening.
 */
const registries = new WeakMap<IDBFactory, Map<string, Promise<SharedConnection>>>();

function registry(factory: IDBFactory): Map<string, Promise<SharedConnection>> {
  let map = registries.get(factory);
  if (!map) {
    map = new Map();
    registries.set(factory, map);
  }
  return map;
}

class SharedLocalStoreLease implements LocalStoreLease {
  private closed = false;

  constructor(
    readonly name: string,
    readonly mirror: LocalStoreMirror,
    private readonly shared: SharedConnection
  ) {}

  run<T>(operation: (db: IDBDatabase) => Promise<T>, whenClosed: T): Promise<T> {
    if (this.closed) return Promise.resolve(whenClosed);
    return this.shared.connection.run(operation, whenClosed);
  }

  get isClosed(): boolean {
    return this.closed || this.shared.connection.isClosing;
  }

  close(): void {
    this.closed = true;
  }
}

/**
 * Opens `name` if it is not already open, then leases it. The migrations run
 * once per database per document; a caller that opens twice gets the same
 * connection and its own lease.
 */
export async function acquireLocalStore(
  name: string,
  migrations: readonly LocalStoreMigration[],
  factory: IDBFactory = globalThis.indexedDB
): Promise<LocalStoreLease> {
  const map = registry(factory);
  const mirror = mirrorFor(name, factory);

  for (;;) {
    const existing = map.get(name);
    if (!existing) break;

    const shared = await existing;
    // A connection the platform closed for a newer schema version is replaced
    // rather than reused: every operation on it would no-op (#204).
    if (!shared.connection.isClosing) {
      return new SharedLocalStoreLease(name, mirror, shared);
    }
    map.delete(name);
    mirror.clear();
  }

  const opening = openLocalStore(name, migrations, factory)
    .then((db) => ({ connection: new LocalStoreConnection(db) }))
    .catch((error: unknown) => {
      map.delete(name);
      throw error;
    });
  map.set(name, opening);

  return new SharedLocalStoreLease(name, mirror, await opening);
}

/** Closes and forgets one database. The next `acquireLocalStore` reopens it. */
export async function closeLocalStore(
  name: string,
  factory: IDBFactory = globalThis.indexedDB
): Promise<void> {
  const map = registry(factory);
  const opening = map.get(name);
  if (!opening) return;
  map.delete(name);
  (await opening).connection.close();
  mirrorFor(name, factory).clear();
}

/**
 * Closes every database belonging to an identity, which is what an identity
 * change means: the next surface opens the new partition, and the old account's
 * connection is not left open for the rest of the document.
 */
export async function closeIdentityStores(
  identity: LocalIdentity,
  factory: IDBFactory | undefined = globalThis.indexedDB
): Promise<void> {
  // A realm without IndexedDB has no stores to close (`useLocalIdentity` is
  // mounted on the server and in tests that never touch a database).
  if (!factory) return;

  const suffix = `__${identity}`;
  await Promise.all(
    [...registry(factory).keys()]
      .filter((name) => name.endsWith(suffix))
      .map((name) => closeLocalStore(name, factory))
  );
}

/** Closes every database this realm holds open (tests, a hard reset). */
export async function closeAllLocalStores(
  factory: IDBFactory | undefined = globalThis.indexedDB
): Promise<void> {
  if (!factory) return;
  await Promise.all([...registry(factory).keys()].map((name) => closeLocalStore(name, factory)));
}
