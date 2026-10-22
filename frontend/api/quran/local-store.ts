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
import { createOutboxAccess } from '@/frontend/shared/local-store/outbox-access';
import type { OutboxStore } from '@/frontend/shared/local-store/sync-engine';
import {
  OUTBOX_STORE,
  type NewOutboxEntry,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import { assertOwnedItemSlot } from '@/frontend/shared/plans/plan-limits';
import {
  QURAN_SURAH_COUNT,
  type Bookmark,
  type QuranSyncSnapshot,
  type ReadingPosition,
} from '@/shared/contracts/quran';

const PRODUCT = 'quran';
const READING_POSITION_STORE = 'readingPosition';
const BOOKMARKS_STORE = 'bookmarks';
const META_STORE = 'meta';

/**
 * The Reading position is one row per reader, so it is stored under a single
 * fixed key rather than one minted per write: "where did I stop" has no history
 * worth keeping, and a singleton cannot accumulate stale rows.
 */
const POSITION_KEY = 'current';

/** The key of the one row in `meta`. */
const SYNC_CURSOR_KEY = 'syncCursor';

/**
 * The reader's two Outbox intents, as their transport matches them (ADR-0029).
 * The names are the contract between this store and `sync-transport.ts`, so both
 * read them from here.
 */
export const POSITION_INTENT = 'position.set';
export const BOOKMARK_INTENT = 'bookmark.set';

/**
 * The number of suras, so a ref outside the text is a bug rather than a record.
 * The sync contract validates the same range on the server.
 */
export const SURAH_COUNT = QURAN_SURAH_COUNT;

/**
 * Forward-only schema. v1 is exactly the two records the reader owns (ADR-0056);
 * v2 adds the Outbox that carries them to an account, and the `meta` store that
 * holds the cursor they are pulled back with.
 *
 * Both join in one version because they are one feature: an intent without a
 * cursor syncs up only, and there is nothing to gain from a device sitting at a
 * version between the two.
 */
export const QURAN_STORE_VERSION = 2;

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
  {
    version: 2,
    migrate: (db) => {
      // `seq` is auto-increment so replay order is the exact write order.
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
      db.createObjectStore(META_STORE, { keyPath: 'key' });
    },
  },
];

/** A `readingPosition` row: the position plus the key that makes it a singleton. */
interface ReadingPositionRow extends ReadingPosition {
  key: typeof POSITION_KEY;
}

/** A durable write-intent paired with the mutation that produced it. */
interface OutboxIntent {
  entity: string;
  type: string;
  /** The request body; `entry()` adds the write's own id to it as `clientId`. */
  payload: unknown;
}

/** One write in a commit: a `put`, or a `delete` by primary key. */
type StoreWrite = { store: string; put: unknown } | { store: string; delete: IDBValidKey };

type Writes = StoreWrite[];

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
 * It is partitioned by identity like every other Local Store: a guest reads and
 * writes the guest database, and signing in Claims it into the account's (ADR-
 * 0027). Every mutation lands here and queues its Outbox intent in the same
 * IndexedDB transaction, so a write is durable before it is acknowledged and its
 * replay cannot be lost by a crash in between (ADR-0029).
 *
 * Every operation goes through the connection (#204), so a write that outlives
 * its owning component resolves as a no-op instead of throwing on a closed
 * connection.
 */
export class QuranLocalStore {
  private readonly connection: LocalStoreConnection;
  private readonly outbox: OutboxStore;
  private readonly writeListeners = new Set<() => void>();

  private constructor(
    db: IDBDatabase,
    readonly identity: LocalIdentity
  ) {
    this.connection = new LocalStoreConnection(db);
    this.outbox = createOutboxAccess(this.connection, () => this.notifyWrites());
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

  /**
   * Commits record writes and, when present, the Outbox intent atomically.
   *
   * Returns false when the store is closing and nothing was written (#204), so a
   * caller that must not run a follow-up it cannot undo can check first.
   */
  private async commit(writes: readonly StoreWrite[], intent?: OutboxIntent): Promise<boolean> {
    if (writes.length === 0 && !intent) return true;

    const stores = [...new Set(writes.map((write) => write.store))];
    if (intent) stores.push(OUTBOX_STORE);

    const committed = await this.connection.run(async (db) => {
      const transaction = db.transaction(stores, 'readwrite');
      for (const write of writes) {
        if ('put' in write) transaction.objectStore(write.store).put(write.put);
        else transaction.objectStore(write.store).delete(write.delete);
      }
      if (intent) {
        transaction.objectStore(OUTBOX_STORE).put(this.entry(intent));
      }
      await transactionDone(transaction);
      return true;
    }, false);
    if (committed) this.notifyWrites();
    return committed;
  }

  /**
   * The queued intent for a write: one entry, with fresh `seq` and `id`.
   *
   * The payload's `clientId` is the entry's own id. The reader's rows have
   * natural keys — there is no row id to carry — so what the server's `client_id`
   * can usefully record is *which write* landed last; minting it here is also
   * what keeps every replay of this intent carrying the id it was queued with.
   */
  private entry(intent: OutboxIntent): NewOutboxEntry {
    const id = uuidv7();
    return {
      id,
      entity: intent.entity,
      type: intent.type,
      payload: { ...(intent.payload as Record<string, unknown>), clientId: id },
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
      lastError: null,
      nextAttemptAt: 0,
    };
  }

  private async getOne<T>(store: string, key: IDBValidKey): Promise<T | null> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(store, 'readonly');
      const value = await promisifyRequest(
        transaction.objectStore(store).get(key) as IDBRequest<T | undefined>
      );
      return value ?? null;
    }, null);
  }

  // --- Reading position ------------------------------------------------------

  /** Where the reader stopped, or null if they have not started. */
  async getReadingPosition(): Promise<ReadingPosition | null> {
    const row = await this.readPosition();
    return row ? { surah: row.surah, ayah: row.ayah, updatedAt: row.updatedAt } : null;
  }

  private readPosition(): Promise<ReadingPositionRow | null> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(READING_POSITION_STORE, 'readonly');
      const value = await promisifyRequest(
        transaction.objectStore(READING_POSITION_STORE).get(POSITION_KEY) as IDBRequest<
          ReadingPositionRow | undefined
        >
      );
      return value ?? null;
    }, null);
  }

  /**
   * Records where the reader is now. Called as they read rather than when they
   * leave, so a crashed tab still resumes in the right place.
   *
   * A reader's place is a singleton, and so is the intent that carries it: a
   * second write replaces the queued one instead of leaving a hundred positions
   * behind a long read. Nothing is lost by that — an older place holds no
   * information a newer one does not, which is the same reason the row itself is
   * a singleton (ADR-0056) — and the server would drop the stale replay anyway.
   */
  async saveReadingPosition(surah: number, ayah: number): Promise<void> {
    if (!isAyahRef(surah, ayah)) {
      throw new RangeError(`Reading position ${surah}:${ayah} is not an ayah`);
    }
    const updatedAt = new Date().toISOString();
    const row: ReadingPositionRow = { key: POSITION_KEY, surah, ayah, updatedAt };

    // Hand-rolled rather than `commit`: the same transaction has to read the
    // queue and delete the intent it supersedes.
    const committed = await this.connection.run(async (db) => {
      const transaction = db.transaction([READING_POSITION_STORE, OUTBOX_STORE], 'readwrite');
      transaction.objectStore(READING_POSITION_STORE).put(row);

      const outbox = transaction.objectStore(OUTBOX_STORE);
      const queued = await promisifyRequest(outbox.getAll() as IDBRequest<OutboxEntry[]>);
      for (const entry of queued) {
        if (entry.type === POSITION_INTENT) outbox.delete(entry.seq);
      }
      outbox.put(
        this.entry({
          entity: 'position',
          type: POSITION_INTENT,
          payload: { surah, ayah, updatedAt },
        })
      );

      await transactionDone(transaction);
      return true;
    }, false);
    if (committed) this.notifyWrites();
  }

  // --- Bookmarks -------------------------------------------------------------

  /** Every mark that is still standing, in the order of the text. */
  async listBookmarks(): Promise<Bookmark[]> {
    const rows = await this.readBookmarks();
    return rows.filter((row) => !row.deletedAt).sort(byTextOrder);
  }

  /** Every mark, tombstones included, as a merge and a claim need to see them. */
  private readBookmarks(): Promise<Bookmark[]> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(BOOKMARKS_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(BOOKMARKS_STORE).getAll() as IDBRequest<Bookmark[]>
      );
    }, []);
  }

  /**
   * Marks the ayah, or unmarks it if it is already marked.
   *
   * Unmarking writes a tombstone and remarking clears it, so an ayah holds one
   * row for good — which is the constraint the server enforces on the same pair,
   * and the reason a toggle cannot accumulate rows.
   *
   * Unlike the position, each toggle queues its own intent: a mark and an unmark
   * are one write with two payloads, and the payload an earlier one carried is
   * not recoverable from the newer one.
   */
  async toggleBookmark(surah: number, ayah: number): Promise<void> {
    if (!isAyahRef(surah, ayah)) {
      throw new RangeError(`Bookmark ${surah}:${ayah} is not an ayah`);
    }
    const existing = await this.findBookmark(surah, ayah);
    const now = new Date().toISOString();
    if (existing) {
      const row: Bookmark = {
        ...existing,
        deletedAt: existing.deletedAt ? null : now,
        updatedAt: now,
      };
      await this.commit([{ store: BOOKMARKS_STORE, put: row }], this.bookmarkIntent(row));
      return;
    }

    // A new mark takes a slot; re-marking a tombstoned ayah frees one first,
    // which the count below already reflects.
    const bookmarks = await this.listBookmarks();
    assertOwnedItemSlot(this.identity, 'quran_bookmarks', bookmarks.length);

    const bookmark: Bookmark = {
      clientId: uuidv7(),
      surah,
      ayah,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.commit([{ store: BOOKMARKS_STORE, put: bookmark }], this.bookmarkIntent(bookmark));
  }

  /** Removes a mark by its id, as the bookmarks list does. */
  async removeBookmark(clientId: string): Promise<void> {
    const existing = await this.getOne<Bookmark>(BOOKMARKS_STORE, clientId);
    if (!existing || existing.deletedAt) return;

    const now = new Date().toISOString();
    const row: Bookmark = { ...existing, deletedAt: now, updatedAt: now };
    await this.commit([{ store: BOOKMARKS_STORE, put: row }], this.bookmarkIntent(row));
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

  private bookmarkIntent(row: Bookmark): OutboxIntent {
    return {
      entity: 'bookmark',
      type: BOOKMARK_INTENT,
      payload: {
        surah: row.surah,
        ayah: row.ayah,
        deletedAt: row.deletedAt,
        updatedAt: row.updatedAt,
      },
    };
  }

  // --- Server merge & guest claim -------------------------------------------

  /**
   * Merges an incremental sync page and advances the cursor, last-write-wins on
   * `updatedAt` with the server as the tiebreaker (ADR-0029).
   *
   * A ref with a queued local intent is left alone: the device's unflushed write
   * must not be clobbered by the server's copy. The cursor must not move past one
   * of those refs either (#313) — the local copy is authoritative until the
   * intent flushes, and the next incremental page has to be able to re-fetch the
   * row so the two sides converge. When nothing is held back the cursor advances
   * to the page cursor, so an uninterrupted sync never re-scans.
   */
  async applySyncSnapshot(snapshot: QuranSyncSnapshot): Promise<void> {
    const skipped = await this.mergeServerPage(snapshot);
    if (skipped > 0 || !snapshot.cursor) return;
    await this.setSyncCursor(snapshot.cursor);
  }

  /** Merges a server page; returns how many refs a pending intent held back. */
  private async mergeServerPage(snapshot: QuranSyncSnapshot): Promise<number> {
    const [localPosition, localBookmarks, outbox] = await Promise.all([
      this.readPosition(),
      this.readBookmarks(),
      this.getOutbox(),
    ]);
    const pending = pendingRefs(outbox);
    const writes: Writes = [];
    let skipped = 0;

    if (snapshot.position) {
      if (pending.position) skipped += 1;
      else if (isNewer(snapshot.position.updatedAt, localPosition?.updatedAt)) {
        writes.push({
          store: READING_POSITION_STORE,
          put: { key: POSITION_KEY, ...snapshot.position },
        });
      }
    }

    const localByAyah = new Map(localBookmarks.map((row) => [ayahKey(row.surah, row.ayah), row]));
    for (const server of snapshot.bookmarks) {
      const key = ayahKey(server.surah, server.ayah);
      if (pending.bookmarks.has(key)) {
        skipped += 1;
        continue;
      }
      const local = localByAyah.get(key);
      // Equal write times mean this is the echo of our own write: keep the local
      // row, and with it the key the reader's own device chose for it.
      if (local && !isNewer(server.updatedAt, local.updatedAt)) continue;
      // A row is keyed by the write that made it, so taking a server copy has to
      // remove the local one first: `put` under a different key would leave two
      // rows for one ayah, and one row per Ayah is the point.
      if (local && local.clientId !== server.clientId) {
        writes.push({ store: BOOKMARKS_STORE, delete: local.clientId });
      }
      writes.push({ store: BOOKMARKS_STORE, put: server });
    }

    if (writes.length > 0) await this.commit(writes);
    return skipped;
  }

  /**
   * Claims a guest store into this (signed-in) one: the same LWW merge as a pull,
   * plus re-homing the guest's queued intents so offline work is pushed under the
   * account, and then emptying the guest (ADR-0027).
   */
  async claimFrom(guest: QuranLocalStore): Promise<void> {
    const [guestPosition, guestBookmarks, guestOutbox, localPosition, localBookmarks] =
      await Promise.all([
        guest.readPosition(),
        guest.readBookmarks(),
        guest.getOutbox(),
        this.readPosition(),
        this.readBookmarks(),
      ]);

    const writes: Writes = [];
    if (guestPosition && isNewer(guestPosition.updatedAt, localPosition?.updatedAt)) {
      writes.push({ store: READING_POSITION_STORE, put: guestPosition });
    }

    const localByAyah = new Map(localBookmarks.map((row) => [ayahKey(row.surah, row.ayah), row]));
    for (const guestRow of guestBookmarks) {
      const key = ayahKey(guestRow.surah, guestRow.ayah);
      const local = localByAyah.get(key);
      if (local && !isNewer(guestRow.updatedAt, local.updatedAt)) continue;
      if (local && local.clientId !== guestRow.clientId) {
        writes.push({ store: BOOKMARKS_STORE, delete: local.clientId });
      }
      writes.push({ store: BOOKMARKS_STORE, put: guestRow });
    }

    // Re-home the guest's queued intents. `seq` is dropped so this store assigns
    // fresh, monotonic keys in iteration order. A position queued on both sides
    // is left as two intents rather than resolved here: the server decides them
    // on `updatedAt`, so a stale replay cannot win, and the next position write
    // coalesces the queue again.
    for (const entry of guestOutbox) {
      const intent: NewOutboxEntry = { ...entry };
      delete (intent as Partial<OutboxEntry>).seq;
      writes.push({ store: OUTBOX_STORE, put: intent });
    }

    if (writes.length > 0 && !(await this.commit(writes))) return;
    await guest.clear();
  }

  // --- Outbox ---------------------------------------------------------------
  // Data access is shared with the worker realm (`outbox-access.ts`); this store
  // contributes only its write notification.

  getOutbox(): Promise<OutboxEntry[]> {
    return this.outbox.getOutbox();
  }

  removeOutbox(seq: number): Promise<void> {
    return this.outbox.removeOutbox(seq);
  }

  patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    return this.outbox.patchOutbox(seq, patch);
  }

  retryFailedOutbox(): Promise<void> {
    return this.outbox.retryFailedOutbox();
  }

  // --- Sync cursor ----------------------------------------------------------

  /** The `server_updated_at` cursor the last sync advanced to, or null. */
  async getSyncCursor(): Promise<string | null> {
    const row = await this.getOne<{ key: string; value: string }>(META_STORE, SYNC_CURSOR_KEY);
    return row?.value ?? null;
  }

  async setSyncCursor(value: string): Promise<void> {
    await this.commit([{ store: META_STORE, put: { key: SYNC_CURSOR_KEY, value } }]);
  }

  /** Empties every owned store — what a claim does to the guest it took them from. */
  async clear(): Promise<void> {
    const stores = [READING_POSITION_STORE, BOOKMARKS_STORE, OUTBOX_STORE, META_STORE];
    const cleared = await this.connection.run(async (db) => {
      const transaction = db.transaction(stores, 'readwrite');
      for (const store of stores) {
        transaction.objectStore(store).clear();
      }
      await transactionDone(transaction);
      return true;
    }, false);
    if (cleared) this.notifyWrites();
  }
}

/** The natural key of an Ayah, as a `Map` needs it. */
function ayahKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

/**
 * True when `incoming` is a later write than `existing`, by write time. Both
 * sides are `toISOString()` — the server normalises what it hands back — so the
 * comparison is a plain string one, and a write with no timestamp always wins.
 */
function isNewer(incoming?: string, existing?: string | null): boolean {
  if (!existing) return true;
  if (!incoming) return false;
  return incoming > existing;
}

/** The refs that hold a queued intent, so a pull cannot clobber them. */
function pendingRefs(outbox: OutboxEntry[]): { position: boolean; bookmarks: Set<string> } {
  let position = false;
  const bookmarks = new Set<string>();
  for (const entry of outbox) {
    if (entry.type === POSITION_INTENT) {
      position = true;
      continue;
    }
    if (entry.type !== BOOKMARK_INTENT) continue;
    const payload = (entry.payload ?? {}) as { surah?: unknown; ayah?: unknown };
    if (typeof payload.surah === 'number' && typeof payload.ayah === 'number') {
      bookmarks.add(ayahKey(payload.surah, payload.ayah));
    }
  }
  return { position, bookmarks };
}

/** The order of the text: sura, then ayah. */
function byTextOrder(a: Bookmark, b: Bookmark): number {
  return a.surah - b.surah || a.ayah - b.ayah;
}
