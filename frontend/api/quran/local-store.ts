import {
  GUEST_IDENTITY,
  localStoreName,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import {
  openLocalStore,
  promisifyRequest,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';
import { LocalStoreConnection } from '@/frontend/shared/local-store/connection';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import type { Bookmark, ReadingPosition } from '@/shared/contracts/quran';

const PRODUCT = 'quran';
const READING_POSITION_STORE = 'readingPosition';
const BOOKMARKS_STORE = 'bookmarks';

/**
 * The Reading position is one row per reader, so it is stored under a single
 * fixed key rather than one minted per write: "where did I stop" has no history
 * worth keeping, and a singleton cannot accumulate stale rows.
 */
const POSITION_KEY = 'current';

/** The number of suras, so a ref outside the text is a bug rather than a record. */
export const SURAH_COUNT = 114;

/**
 * Forward-only schema. v1 is exactly the two records the reader owns (ADR-0056);
 * the Outbox joins in a later version, once there is a session to replay to.
 */
export const QURAN_STORE_VERSION = 1;

export const quranStoreMigrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      db.createObjectStore(READING_POSITION_STORE, { keyPath: 'key' });
      const bookmarks = db.createObjectStore(BOOKMARKS_STORE, { keyPath: 'clientId' });
      // The only lookup there is: "is this ayah already marked?".
      bookmarks.createIndex('by_surah_ayah', ['surah', 'ayah']);
    },
  },
];

/** A `readingPosition` row: the position plus the key that makes it a singleton. */
interface ReadingPositionRow extends ReadingPosition {
  key: typeof POSITION_KEY;
}

/** True when the pair names an ayah that exists. */
export function isAyahRef(surah: number, ayah: number): boolean {
  return (
    Number.isInteger(surah) &&
    surah >= 1 &&
    surah <= SURAH_COUNT &&
    Number.isInteger(ayah) &&
    ayah >= 1
  );
}

/**
 * The Quran Reader's Local Store (ADR-0056): where a reader stopped and what they
 * marked, on the device, with no account and no network. Reading never waits on
 * this store, and this store never waits on a server.
 *
 * It is partitioned by identity like every other Local Store, but the reader's
 * surfaces open it as the guest for now: sync arrives with the session that
 * Claims it (P1b), and until then a signed-in reader's records must not land
 * somewhere the reader would then lose them from.
 *
 * Every operation goes through the connection (#204), so a write that outlives
 * its owning component resolves as a no-op instead of throwing on a closed
 * connection.
 */
export class QuranLocalStore {
  private readonly connection: LocalStoreConnection;
  private readonly writeListeners = new Set<() => void>();

  private constructor(
    db: IDBDatabase,
    readonly identity: LocalIdentity
  ) {
    this.connection = new LocalStoreConnection(db);
  }

  subscribeWrites(listener: () => void): () => void {
    this.writeListeners.add(listener);
    return () => {
      this.writeListeners.delete(listener);
    };
  }

  private notifyWrites(): void {
    for (const listener of this.writeListeners) listener();
  }

  static async open(
    identity: LocalIdentity = GUEST_IDENTITY,
    factory: IDBFactory = globalThis.indexedDB
  ): Promise<QuranLocalStore> {
    const db = await openLocalStore(
      localStoreName(PRODUCT, identity),
      quranStoreMigrations,
      factory
    );
    return new QuranLocalStore(db, identity);
  }

  /**
   * Closes the connection: work already in flight settles first, and every
   * operation after this one resolves without touching IndexedDB (#204).
   */
  close(): void {
    this.connection.close();
  }

  /** Commits a batch of writes in one transaction. */
  private async commit(writes: ReadonlyArray<[store: string, value: unknown]>): Promise<void> {
    if (writes.length === 0) return;
    const committed = await this.connection.run(async (db) => {
      const transaction = db.transaction(
        writes.map(([store]) => store),
        'readwrite'
      );
      for (const [store, value] of writes) {
        transaction.objectStore(store).put(value);
      }
      await transactionDone(transaction);
      return true;
    }, false);
    if (committed) this.notifyWrites();
  }

  private async readAll<T>(store: string): Promise<T[]> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(store, 'readonly');
      return promisifyRequest(transaction.objectStore(store).getAll() as IDBRequest<T[]>);
    }, []);
  }

  // --- Reading position ------------------------------------------------------

  /** Where the reader stopped, or null if they have not started. */
  async getReadingPosition(): Promise<ReadingPosition | null> {
    const row = await this.connection.run(async (db) => {
      const transaction = db.transaction(READING_POSITION_STORE, 'readonly');
      const value = await promisifyRequest(
        transaction.objectStore(READING_POSITION_STORE).get(POSITION_KEY) as IDBRequest<
          ReadingPositionRow | undefined
        >
      );
      return value ?? null;
    }, null);
    return row ? { surah: row.surah, ayah: row.ayah, updatedAt: row.updatedAt } : null;
  }

  /**
   * Records where the reader is now. Called as they read rather than when they
   * leave, so a crashed tab still resumes in the right place.
   */
  async saveReadingPosition(surah: number, ayah: number): Promise<void> {
    if (!isAyahRef(surah, ayah)) {
      throw new RangeError(`Reading position ${surah}:${ayah} is not an ayah`);
    }
    const row: ReadingPositionRow = {
      key: POSITION_KEY,
      surah,
      ayah,
      updatedAt: new Date().toISOString(),
    };
    await this.commit([[READING_POSITION_STORE, row]]);
  }

  // --- Bookmarks -------------------------------------------------------------

  /** Every mark that is still standing, in the order of the text. */
  async listBookmarks(): Promise<Bookmark[]> {
    const rows = await this.readAll<Bookmark>(BOOKMARKS_STORE);
    return rows.filter((row) => !row.deletedAt).sort(byTextOrder);
  }

  /**
   * Marks the ayah, or unmarks it if it is already marked.
   *
   * Unmarking writes a tombstone and remarking clears it, so an ayah holds one
   * row for good — which is the constraint the server will enforce on the same
   * pair, and the reason a toggle cannot accumulate rows.
   */
  async toggleBookmark(surah: number, ayah: number): Promise<void> {
    if (!isAyahRef(surah, ayah)) {
      throw new RangeError(`Bookmark ${surah}:${ayah} is not an ayah`);
    }
    const existing = await this.findBookmark(surah, ayah);
    const now = new Date().toISOString();

    if (existing) {
      await this.commit([
        [
          BOOKMARKS_STORE,
          { ...existing, deletedAt: existing.deletedAt ? null : now, updatedAt: now },
        ],
      ]);
      return;
    }

    const bookmark: Bookmark = {
      clientId: uuidv7(),
      surah,
      ayah,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.commit([[BOOKMARKS_STORE, bookmark]]);
  }

  /** Removes a mark by its id, as the bookmarks list does. */
  async removeBookmark(clientId: string): Promise<void> {
    const existing = await this.connection.run(async (db) => {
      const transaction = db.transaction(BOOKMARKS_STORE, 'readonly');
      const value = await promisifyRequest(
        transaction.objectStore(BOOKMARKS_STORE).get(clientId) as IDBRequest<Bookmark | undefined>
      );
      return value ?? null;
    }, null);
    if (!existing || existing.deletedAt) return;

    const now = new Date().toISOString();
    await this.commit([[BOOKMARKS_STORE, { ...existing, deletedAt: now, updatedAt: now }]]);
  }

  /** The row for an ayah, tombstoned or not, so a toggle can reuse it. */
  private async findBookmark(surah: number, ayah: number): Promise<Bookmark | null> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(BOOKMARKS_STORE, 'readonly');
      const value = await promisifyRequest(
        transaction
          .objectStore(BOOKMARKS_STORE)
          .index('by_surah_ayah')
          .get([surah, ayah]) as IDBRequest<Bookmark | undefined>
      );
      return value ?? null;
    }, null);
  }
}

/** The order of the text: sura, then ayah. */
function byTextOrder(a: Bookmark, b: Bookmark): number {
  return a.surah - b.surah || a.ayah - b.ayah;
}
