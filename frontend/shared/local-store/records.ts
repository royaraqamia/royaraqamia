import { promisifyRequest, transactionDone } from '@/frontend/shared/local-store/idb';
import type { LocalStoreMirror } from '@/frontend/shared/local-store/mirror';
import type { LocalStoreRunner } from '@/frontend/shared/local-store/outbox-access';
import { OUTBOX_STORE, type NewOutboxEntry } from '@/frontend/shared/local-store/outbox';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';

/**
 * The record half of a Local Store, on its own for the same reason the Outbox
 * half is (`outbox-access.ts`): every product store had grown its own copy of
 * these methods, and the copies had already drifted into three contracts.
 *
 * A product store now owns only what is genuinely its own — the store names and
 * key paths, the migration chain, its typed reads and writes, and its `PRODUCT`
 * constant. The transaction, the mirror update in the same tick and the write
 * notification live here once (#494, ADR-0058).
 */

/** The lease a record access runs against — it knows whether its holder closed (#204). */
export interface RecordStore extends LocalStoreRunner {
  /** True once the holder (or its connection) has closed; reads no-op then (#204). */
  readonly isClosed: boolean;
}

/** A durable write-intent paired with the mutation that produced it. */
export interface RecordIntent {
  entity: string;
  type: string;
  payload: unknown;
}

/** One record write: a `put`, or a `delete` by primary key. */
export type RecordChange = { store: string; put: unknown } | { store: string; delete: IDBValidKey };

/**
 * The pair form every product but Quran commits: `[store, value]` means a `put`.
 * Kept as tuples because that is the shape the existing call sites write.
 */
export type RecordWrites = ReadonlyArray<readonly [store: string, value: unknown]>;

/**
 * The record methods every product store shares, plus the escapers a product
 * still needs for its own choreography: a bulk clear, a hand-rolled coalescing
 * transaction, and the mirror's notification for both halves.
 */
export interface RecordAccess {
  /** A store's rows, through the mirror when it is hydrated (#494). */
  readAll<T>(store: string): Promise<T[]>;
  /** One row by its primary key; never served from the mirror. */
  getOne<T>(store: string, key: IDBValidKey): Promise<T | null>;
  /** Commits `put` pairs and, when present, the Outbox intent atomically. */
  commit(writes: RecordWrites, intent?: RecordIntent): Promise<boolean>;
  /** Like {@link commit}, for writes that mix `put` and `delete` (Quran's merge). */
  commitChanges(changes: readonly RecordChange[], intent?: RecordIntent): Promise<boolean>;
  /** Deletes rows by key; the store's mirror is dropped, not patched row by row. */
  delete(store: string, keys: readonly IDBValidKey[]): Promise<void>;
  /** Empties every named store and forgets their mirrors. */
  clear(stores: readonly string[]): Promise<boolean>;
  /** The queued intent for a write, with the store's own stamping rule applied. */
  entry(intent: RecordIntent): NewOutboxEntry;
  /** Wakes the owning store's subscribers after a committed write. */
  subscribeWrites(listener: () => void): () => void;
  /** The same notification, for the Outbox half's mutations. */
  notifyWrites(): void;
}

export interface RecordAccessOptions {
  /** The mirror the store feeds and reads through (#494). */
  mirror: LocalStoreMirror;
  /** Object store name -> the key path the mirror indexes it by. */
  stores?: Readonly<Record<string, string>>;
  /**
   * True when a queued intent's payload should carry the entry's own id as
   * `clientId`. Quran's rows have natural keys — there is no row id to carry —
   * so what the server's `client_id` records is *which write* landed last.
   */
  stampClientId?: boolean;
}

export function createRecordAccess(
  connection: RecordStore,
  options: RecordAccessOptions
): RecordAccess {
  const { mirror } = options;
  if (options.stores) mirror.declare(options.stores);

  const listeners = new Set<() => void>();

  const notifyWrites = (): void => {
    for (const listener of listeners) listener();
  };

  const entry = (intent: RecordIntent): NewOutboxEntry => {
    const id = uuidv7();
    return {
      id,
      entity: intent.entity,
      type: intent.type,
      payload: options.stampClientId
        ? { ...(intent.payload as Record<string, unknown>), clientId: id }
        : intent.payload,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
      lastError: null,
      nextAttemptAt: 0,
    };
  };

  /**
   * One readwrite transaction for the records and, when present, their intent.
   * Returns false when the store is closing and nothing was written (#204), so a
   * caller that must not run a follow-up it cannot undo can check first.
   */
  const apply = async (
    changes: readonly RecordChange[],
    intent?: RecordIntent
  ): Promise<boolean> => {
    if (changes.length === 0 && !intent) return true;

    const stores = [...new Set(changes.map((change) => change.store))];
    if (intent) stores.push(OUTBOX_STORE);

    const committed = await connection.run(async (db) => {
      const transaction = db.transaction(stores, 'readwrite');
      for (const change of changes) {
        const objectStore = transaction.objectStore(change.store);
        if ('put' in change) objectStore.put(change.put);
        else objectStore.delete(change.delete);
      }
      if (intent) transaction.objectStore(OUTBOX_STORE).put(entry(intent));
      await transactionDone(transaction);
      return true;
    }, false);
    if (!committed) return false;

    // The mirror is updated in the same tick the write commits, so a subscriber
    // that reads on `notifyWrites` sees the new rows (#494). A store that lost
    // rows is dropped rather than patched: the mirror caches whole stores, and a
    // half-updated list is a lie the next read has to fix.
    const deleted = new Set(
      changes.flatMap((change) => ('delete' in change ? [change.store] : []))
    );
    for (const change of changes) {
      if (!('put' in change) || deleted.has(change.store)) continue;
      mirror.put(change.store, change.put);
    }
    for (const store of deleted) mirror.drop(store);
    notifyWrites();
    return true;
  };

  return {
    async readAll<T>(store: string): Promise<T[]> {
      if (connection.isClosed) return [];

      // A copy: the mirror's array belongs to every holder, and a caller that
      // sorts its list in place must not reorder the next one.
      const mirrored = mirror.read<T>(store);
      if (mirrored) return [...mirrored];

      const rows = await connection.run(async (db) => {
        const transaction = db.transaction(store, 'readonly');
        return promisifyRequest(transaction.objectStore(store).getAll() as IDBRequest<T[]>);
      }, []);
      if (!connection.isClosed) mirror.fill(store, rows);
      return rows;
    },

    getOne<T>(store: string, key: IDBValidKey): Promise<T | null> {
      return connection.run(async (db) => {
        const transaction = db.transaction(store, 'readonly');
        const value = await promisifyRequest(
          transaction.objectStore(store).get(key) as IDBRequest<T | undefined>
        );
        return value ?? null;
      }, null);
    },

    commit(writes, intent) {
      return apply(
        writes.map(([store, value]): RecordChange => ({ store, put: value })),
        intent
      );
    },

    commitChanges(changes, intent) {
      return apply(changes, intent);
    },

    async delete(store, keys) {
      if (keys.length === 0) return;

      const removed = await connection.run(async (db) => {
        const transaction = db.transaction(store, 'readwrite');
        for (const key of keys) transaction.objectStore(store).delete(key);
        await transactionDone(transaction);
        return true;
      }, false);
      if (!removed) return;

      // The mirror caches whole stores and has no per-row delete: dropping it
      // costs the next read a re-hydration, which is cheaper than serving a list
      // the sweep already removed a row from.
      mirror.drop(store);
      notifyWrites();
    },

    async clear(stores) {
      if (stores.length === 0) return true;

      const cleared = await connection.run(async (db) => {
        const transaction = db.transaction(stores, 'readwrite');
        for (const store of stores) transaction.objectStore(store).clear();
        await transactionDone(transaction);
        return true;
      }, false);
      if (!cleared) return false;

      for (const store of stores) mirror.drop(store);
      notifyWrites();
      return true;
    },

    entry,

    subscribeWrites(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    notifyWrites,
  };
}
