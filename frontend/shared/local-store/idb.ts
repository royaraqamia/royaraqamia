/**
 * A tiny promise wrapper over IndexedDB with a forward-only migration chain.
 *
 * The Local Store is the client's source of truth for Owned data (ADR-0028),
 * so its schema evolves like any durable store: additive, ordered migrations
 * keyed by a monotonically increasing `version`. We never edit an applied
 * migration; a new one is appended. `openLocalStore` refuses a chain whose
 * versions are not strictly increasing, so a bad migration can't silently
 * run twice or out of order.
 */
export interface LocalStoreMigration {
  /** Strictly increasing across the chain; each runs exactly once, in order. */
  version: number;
  migrate: (db: IDBDatabase, transaction: IDBTransaction, oldVersion: number) => void;
}

export function isIndexedDbSupported(): boolean {
  return typeof globalThis.indexedDB !== 'undefined';
}

function assertForwardOnly(migrations: readonly LocalStoreMigration[]): void {
  if (migrations.length === 0) {
    throw new Error('A Local Store needs at least one migration');
  }
  for (let i = 0; i < migrations.length; i += 1) {
    const version = migrations[i]!.version;
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(`Local Store migration version must be a positive integer, got ${version}`);
    }
    if (i > 0 && version <= migrations[i - 1]!.version) {
      throw new Error(
        `Local Store migrations must be strictly increasing: ${migrations[i - 1]!.version} -> ${version}`
      );
    }
  }
}

export function openLocalStore(
  dbName: string,
  migrations: readonly LocalStoreMigration[],
  factory: IDBFactory = globalThis.indexedDB
): Promise<IDBDatabase> {
  assertForwardOnly(migrations);

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const targetVersion = ordered[ordered.length - 1]!.version;

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(dbName, targetVersion);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) {
        return;
      }
      const oldVersion = event.oldVersion;
      for (const migration of ordered) {
        if (migration.version > oldVersion && migration.version <= request.result.version) {
          migration.migrate(db, transaction, oldVersion);
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to open Local Store ${dbName}`));
    request.onblocked = () => reject(new Error(`Local Store ${dbName} is blocked by another tab`));
  });
}

export function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Local Store write aborted'));
  });
}
