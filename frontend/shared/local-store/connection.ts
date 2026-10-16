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
