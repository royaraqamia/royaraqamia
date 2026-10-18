import { LocalStoreConnection } from '@/frontend/shared/local-store/connection';
import { promisifyRequest, transactionDone } from '@/frontend/shared/local-store/idb';
import { OUTBOX_STORE, type OutboxEntry } from '@/frontend/shared/local-store/outbox';
import type { OutboxStore } from '@/frontend/shared/local-store/sync-engine';

/**
 * The Outbox half of a Local Store, on its own so a realm that did not create
 * the database can still drain it.
 *
 * Each product store had grown its own copy of these four methods — the same
 * four, differing only in their comments. The service worker needs them against
 * the same object store once the tab is gone (ADR-0058), so they live here:
 * one implementation of the queue's data access, beside the one implementation
 * of its replay order (`sync-engine.ts`) and its HTTP mapping (the transports).
 *
 * `onWrite` is the owning store's write notification, passed through so a queue
 * mutation wakes its subscribers exactly as it did before — including the
 * flush-on-write the subscribers do.
 */
export function createOutboxAccess(
  connection: LocalStoreConnection,
  onWrite?: () => void
): OutboxStore {
  /** All queued intents in strict replay order (`seq` ascending). */
  const read = (): Promise<OutboxEntry[]> =>
    connection.run(async (db) => {
      const transaction = db.transaction(OUTBOX_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(OUTBOX_STORE).getAll() as IDBRequest<OutboxEntry[]>
      );
    }, []);

  /** One readwrite transaction; resolves false when the store is closing (#204). */
  const mutate = (write: (store: IDBObjectStore) => void): Promise<boolean> =>
    connection.run(async (db) => {
      const transaction = db.transaction(OUTBOX_STORE, 'readwrite');
      write(transaction.objectStore(OUTBOX_STORE));
      await transactionDone(transaction);
      return true;
    }, false);

  const patch = async (seq: number, patch: Partial<OutboxEntry>): Promise<void> => {
    // Two transactions: an IndexedDB transaction auto-commits as soon as it has
    // no pending requests, so the read must finish in its own before the write.
    const existing = await connection.run(async (db) => {
      const transaction = db.transaction(OUTBOX_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(OUTBOX_STORE).get(seq) as IDBRequest<OutboxEntry | undefined>
      );
    }, undefined);
    if (!existing) return;

    if (await mutate((store) => store.put({ ...existing, ...patch }))) onWrite?.();
  };

  return {
    getOutbox: read,

    async removeOutbox(seq) {
      if (await mutate((store) => store.delete(seq))) onWrite?.();
    },

    patchOutbox: patch,

    /** Re-arms every permanently-failed intent for a manual retry. */
    async retryFailedOutbox() {
      const failed = (await read()).filter((entry) => entry.status === 'failed');
      if (failed.length === 0) return;

      const retried = await mutate((store) => {
        for (const entry of failed) {
          store.put({
            ...entry,
            status: 'pending',
            attempts: 0,
            nextAttemptAt: 0,
            lastError: null,
          });
        }
      });
      if (retried) onWrite?.();
    },
  };
}

export interface OpenOutboxDeps {
  /**
   * The names `indexedDB.databases()` reported, or `null` where the realm cannot
   * list them. `null` disables the open entirely rather than risking a create.
   */
  existingDatabases: readonly string[] | null;
  factory?: IDBFactory;
}

/** An Outbox opened by a realm that does not own the store; close it when done. */
export interface OpenOutboxResult {
  store: OutboxStore;
  close: () => void;
}

/**
 * Opens the Outbox of a Local Store that already exists.
 *
 * This exists for the background flush (ADR-0058): a service worker draining the
 * queue after the tab is gone attaches to a database a *page* created, and it
 * cannot migrate a schema it does not own. Two rules keep that safe.
 *
 * - **Never create.** `indexedDB.open(name)` without a version *creates* a
 *   storeless version-1 database when the name is unknown — and a product's
 *   migration chain can never repair that, because its first migration is
 *   skipped (`version > oldVersion` is false) and the rest then run against a
 *   schema that never existed. So a name that is absent, or a realm that cannot
 *   list databases, is a no-op.
 * - **Never migrate.** The open carries no version, so it attaches to whatever
 *   version is already there and never triggers an upgrade.
 *   `LocalStoreConnection` closes it again if a page opens a newer version, so a
 *   background reader can never block an upgrade either.
 */
export async function openOutboxAccess(
  dbName: string,
  deps: OpenOutboxDeps
): Promise<OpenOutboxResult | null> {
  const { existingDatabases, factory = globalThis.indexedDB } = deps;
  if (!existingDatabases || !existingDatabases.includes(dbName)) return null;

  const request = factory.open(dbName);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to open Local Store ${dbName}`));
    request.onblocked = () => reject(new Error(`Local Store ${dbName} is blocked by another tab`));
  });

  const connection = new LocalStoreConnection(db);
  return { store: createOutboxAccess(connection), close: () => connection.close() };
}
