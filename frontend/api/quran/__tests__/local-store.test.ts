import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BOOKMARK_INTENT,
  POSITION_INTENT,
  QuranLocalStore,
  quranStoreMigrations,
} from '@/frontend/api/quran/local-store';
import { openLocalStore } from '@/frontend/shared/local-store/idb';
import {
  GUEST_IDENTITY,
  localStoreName,
  userIdentity,
} from '@/frontend/shared/local-store/identity';
import type { Bookmark, QuranSyncSnapshot } from '@/shared/contracts/quran';

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

const open = () => QuranLocalStore.open(GUEST_IDENTITY, factory);

/** A snapshot with nothing in it, so a test names only what it is about. */
function snapshot(over: Partial<QuranSyncSnapshot> = {}): QuranSyncSnapshot {
  return { position: null, bookmarks: [], cursor: null, ...over };
}

function mark(over: Partial<Bookmark> = {}): Bookmark {
  return {
    clientId: 'server-mark',
    surah: 2,
    ayah: 255,
    createdAt: '2026-10-19T09:00:00.000Z',
    updatedAt: '2026-10-19T09:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

describe('QuranLocalStore', () => {
  it('starts a reader with no place and no marks', async () => {
    const store = await open();
    expect(await store.getReadingPosition()).toBeNull();
    expect(await store.listBookmarks()).toEqual([]);
    store.close();
  });

  it('holds one position per reader, replacing it as they read', async () => {
    const store = await open();
    await store.saveReadingPosition(2, 5);
    await store.saveReadingPosition(2, 9);

    expect(await store.getReadingPosition()).toMatchObject({ surah: 2, ayah: 9 });
    store.close();
  });

  it('refuses a ref that is not an ayah', async () => {
    const store = await open();
    const bad: Array<[number, number]> = [
      [0, 1],
      [115, 1],
      [1, 0],
      [1.5, 1],
      [Number.NaN, 1],
    ];
    for (const [surah, ayah] of bad) {
      await expect(store.saveReadingPosition(surah, ayah)).rejects.toThrow(RangeError);
      await expect(store.toggleBookmark(surah, ayah)).rejects.toThrow(RangeError);
    }
    store.close();
  });

  it('marks an ayah and takes the mark off again', async () => {
    const store = await open();
    await store.toggleBookmark(2, 255);
    const [marked] = await store.listBookmarks();
    expect(marked).toMatchObject({ surah: 2, ayah: 255, deletedAt: null });

    await store.toggleBookmark(2, 255);
    expect(await store.listBookmarks()).toEqual([]);

    // Taking a mark off is a tombstone, so marking the ayah again reuses its row
    // instead of accumulating one per toggle — which is what the server will
    // constrain on, and why the id has to survive the round trip.
    await store.toggleBookmark(2, 255);
    const [remarked] = await store.listBookmarks();
    expect(remarked?.clientId).toBe(marked?.clientId);
    store.close();
  });

  it('lists marks in the order of the text', async () => {
    const store = await open();
    await store.toggleBookmark(112, 1);
    await store.toggleBookmark(2, 255);
    await store.toggleBookmark(2, 1);

    expect((await store.listBookmarks()).map((mark) => [mark.surah, mark.ayah])).toEqual([
      [2, 1],
      [2, 255],
      [112, 1],
    ]);
    store.close();
  });

  it('removes a mark by its id, and shrugs at one already gone', async () => {
    const store = await open();
    await store.toggleBookmark(3, 7);
    const [mark] = await store.listBookmarks();

    await store.removeBookmark(mark!.clientId);
    expect(await store.listBookmarks()).toEqual([]);

    await expect(store.removeBookmark(mark!.clientId)).resolves.toBeUndefined();
    await expect(store.removeBookmark('no-such-mark')).resolves.toBeUndefined();
    store.close();
  });

  it('notifies subscribers of every committed write, and stops when they leave', async () => {
    const store = await open();
    const listener = vi.fn();
    const unsubscribe = store.subscribeWrites(listener);

    await store.saveReadingPosition(1, 1);
    await store.toggleBookmark(1, 1);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await store.toggleBookmark(1, 2);
    expect(listener).toHaveBeenCalledTimes(2);
    store.close();
  });

  it('keeps each identity out of the other identity records', async () => {
    const guest = await QuranLocalStore.open(GUEST_IDENTITY, factory);
    const reader = await QuranLocalStore.open(userIdentity('u-1'), factory);

    await guest.saveReadingPosition(2, 255);

    expect(await reader.getReadingPosition()).toBeNull();
    guest.close();
    reader.close();
  });

  it('resolves without writing once the connection is closed', async () => {
    const store = await open();
    store.close();

    await expect(store.saveReadingPosition(1, 1)).resolves.toBeUndefined();
    await expect(store.listBookmarks()).resolves.toEqual([]);
  });
});

describe('QuranLocalStore schema', () => {
  it('adds the Outbox to a store a reader made before it, without losing their records', async () => {
    const name = localStoreName('quran', GUEST_IDENTITY);
    const version1 = await openLocalStore(name, [quranStoreMigrations[0]!], factory);
    await new Promise<void>((resolve, reject) => {
      // The v1 names, written by hand: this is what a device that read before
      // P1b has on it.
      const transaction = version1.transaction(['readingPosition', 'bookmarks'], 'readwrite');
      transaction
        .objectStore('readingPosition')
        .put({ key: 'current', surah: 2, ayah: 255, updatedAt: '2026-10-18T00:00:00.000Z' });
      transaction
        .objectStore('bookmarks')
        .put(mark({ clientId: 'b-1', updatedAt: '2026-10-18T00:00:00.000Z' }));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    version1.close();

    const store = await QuranLocalStore.open(GUEST_IDENTITY, factory);

    expect(await store.getReadingPosition()).toMatchObject({ surah: 2, ayah: 255 });
    expect(await store.listBookmarks()).toHaveLength(1);
    // The v2 stores exist, which is what the flush needs.
    expect(await store.getOutbox()).toEqual([]);
    expect(await store.getSyncCursor()).toBeNull();
    store.close();
  });
});

describe('QuranLocalStore Outbox', () => {
  it('queues one position intent, replacing it rather than growing a queue behind a long read', async () => {
    const store = await open();
    await store.saveReadingPosition(2, 5);
    await store.saveReadingPosition(2, 9);
    await store.saveReadingPosition(2, 255);

    const queued = await store.getOutbox();

    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      entity: 'position',
      type: POSITION_INTENT,
      status: 'pending',
    });
    expect(queued[0]!.payload).toMatchObject({ surah: 2, ayah: 255 });
    // The write names itself: the server's `client_id` is the write that landed,
    // and a replay must carry the id the intent was queued with.
    expect((queued[0]!.payload as { clientId: string }).clientId).toBe(queued[0]!.id);
    store.close();
  });

  it('queues each toggle, because a mark and an unmark are one write with two payloads', async () => {
    const store = await open();
    await store.toggleBookmark(2, 255);
    await store.toggleBookmark(2, 255);

    const queued = await store.getOutbox();

    expect(queued.map((entry) => entry.type)).toEqual([BOOKMARK_INTENT, BOOKMARK_INTENT]);
    expect(queued[0]!.payload).toMatchObject({ surah: 2, ayah: 255, deletedAt: null });
    expect(queued[1]!.payload).toMatchObject({
      surah: 2,
      ayah: 255,
      deletedAt: expect.any(String),
    });
    store.close();
  });

  it('queues a removal as a tombstone, keeping the row it tombstones', async () => {
    const store = await open();
    await store.toggleBookmark(3, 7);
    const [queued] = await store.listBookmarks();
    await store.removeBookmark(queued!.clientId);

    const [last] = (await store.getOutbox()).slice(-1);
    expect(last!.payload).toMatchObject({
      surah: 3,
      ayah: 7,
      deletedAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    store.close();
  });
});

describe('QuranLocalStore cursor', () => {
  it('holds the cursor the last pull advanced to', async () => {
    const store = await open();
    expect(await store.getSyncCursor()).toBeNull();

    await store.setSyncCursor('2026-10-19T12:00:00.000Z');

    expect(await store.getSyncCursor()).toBe('2026-10-19T12:00:00.000Z');
    store.close();
  });

  it('empties every owned store', async () => {
    const store = await open();
    await store.saveReadingPosition(2, 5);
    await store.toggleBookmark(2, 255);
    await store.setSyncCursor('2026-10-19T12:00:00.000Z');

    await store.clear();

    expect(await store.getReadingPosition()).toBeNull();
    expect(await store.listBookmarks()).toEqual([]);
    expect(await store.getOutbox()).toEqual([]);
    expect(await store.getSyncCursor()).toBeNull();
    store.close();
  });
});

describe('QuranLocalStore.applySyncSnapshot', () => {
  it('takes the account place and marks onto a device that has none', async () => {
    const store = await open();

    await store.applySyncSnapshot(
      snapshot({
        position: { surah: 2, ayah: 255, updatedAt: '2026-10-19T10:00:00.000Z' },
        bookmarks: [mark()],
        cursor: '2026-10-19T10:00:01.000Z',
      })
    );

    expect(await store.getReadingPosition()).toEqual({
      surah: 2,
      ayah: 255,
      updatedAt: '2026-10-19T10:00:00.000Z',
    });
    expect((await store.listBookmarks()).map((row) => row.ayah)).toEqual([255]);
    expect(await store.getSyncCursor()).toBe('2026-10-19T10:00:01.000Z');
    store.close();
  });

  it('ignores a server copy older than the local one', async () => {
    const store = await open();
    await store.applySyncSnapshot(
      snapshot({
        position: { surah: 2, ayah: 255, updatedAt: '2026-10-19T10:00:00.000Z' },
        bookmarks: [mark({ updatedAt: '2026-10-19T10:00:00.000Z' })],
      })
    );

    await store.applySyncSnapshot(
      snapshot({
        position: { surah: 5, ayah: 1, updatedAt: '2026-10-19T09:00:00.000Z' },
        bookmarks: [mark({ clientId: 'stale', updatedAt: '2026-10-19T09:00:00.000Z' })],
      })
    );

    expect(await store.getReadingPosition()).toMatchObject({ surah: 2, ayah: 255 });
    expect((await store.listBookmarks())[0]!.clientId).toBe('server-mark');
    store.close();
  });

  it('replaces the row a mark came back under, leaving one row per ayah', async () => {
    const store = await open();
    // Seeded through a pull rather than a toggle, so the ref has no queued
    // intent of its own to hold the server's copy back.
    await store.applySyncSnapshot(
      snapshot({
        bookmarks: [mark({ clientId: 'this-device', updatedAt: '2026-10-19T09:00:00.000Z' })],
      })
    );

    await store.applySyncSnapshot(
      snapshot({
        bookmarks: [mark({ clientId: 'other-device', updatedAt: '2026-10-19T10:00:00.000Z' })],
        cursor: '2026-10-19T12:00:00.000Z',
      })
    );

    const marks = await store.listBookmarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]!.clientId).toBe('other-device');
    store.close();
  });

  it('takes a tombstone from another device as the mark being gone', async () => {
    const store = await open();
    await store.applySyncSnapshot(
      snapshot({
        bookmarks: [mark({ clientId: 'this-device', updatedAt: '2026-10-19T09:00:00.000Z' })],
      })
    );

    await store.applySyncSnapshot(
      snapshot({
        bookmarks: [
          mark({
            clientId: 'other-device',
            deletedAt: '2026-10-19T10:00:00.000Z',
            updatedAt: '2026-10-19T10:00:00.000Z',
          }),
        ],
      })
    );

    expect(await store.listBookmarks()).toEqual([]);
    store.close();
  });

  it('keeps the local row when the page is the echo of our own write', async () => {
    const store = await open();
    await store.applySyncSnapshot(
      snapshot({
        bookmarks: [mark({ clientId: 'this-device', updatedAt: '2026-10-19T09:00:00.000Z' })],
      })
    );

    await store.applySyncSnapshot(
      snapshot({
        bookmarks: [mark({ clientId: 'the-echo', updatedAt: '2026-10-19T09:00:00.000Z' })],
        cursor: '2026-10-19T12:00:00.000Z',
      })
    );

    // Equal write times are the same write, so the key the reader's own device
    // chose for the row survives the round trip.
    const marks = await store.listBookmarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]!.clientId).toBe('this-device');
    store.close();
  });

  it('holds only the refs with a queued intent, and does not move the cursor past them', async () => {
    const store = await open();
    await store.toggleBookmark(2, 255);
    const [local] = await store.listBookmarks();

    await store.applySyncSnapshot(
      snapshot({
        position: { surah: 2, ayah: 255, updatedAt: '2026-10-19T11:00:00.000Z' },
        bookmarks: [
          mark({
            clientId: 'other-device',
            deletedAt: '2026-10-19T11:00:00.000Z',
            updatedAt: '2026-10-19T11:00:00.000Z',
          }),
        ],
        cursor: '2026-10-19T11:00:01.000Z',
      })
    );

    // The mark has not flushed, so the device is still its authority...
    expect((await store.listBookmarks())[0]!.clientId).toBe(local!.clientId);
    // ...and because one ref was held back, the page cannot be passed over yet:
    // the next pull has to be able to re-fetch it.
    expect(await store.getSyncCursor()).toBeNull();
    // The place has nothing queued, so it merges as usual.
    expect(await store.getReadingPosition()).toMatchObject({ surah: 2, ayah: 255 });
    store.close();
  });

  it('holds the place too while its own write has not flushed', async () => {
    const store = await open();
    await store.saveReadingPosition(2, 5);

    await store.applySyncSnapshot(
      snapshot({
        position: { surah: 9, ayah: 1, updatedAt: '2030-01-01T00:00:00.000Z' },
        cursor: '2030-01-01T00:00:01.000Z',
      })
    );

    expect(await store.getReadingPosition()).toMatchObject({ surah: 2, ayah: 5 });
    expect(await store.getSyncCursor()).toBeNull();
    store.close();
  });

  it('advances the cursor when nothing was held back', async () => {
    const store = await open();

    await store.applySyncSnapshot(
      snapshot({ bookmarks: [mark()], cursor: '2026-10-19T12:00:00.000Z' })
    );

    expect(await store.getSyncCursor()).toBe('2026-10-19T12:00:00.000Z');
    store.close();
  });
});

describe('QuranLocalStore.claimFrom', () => {
  it('moves the guest records onto the account and empties the guest', async () => {
    const guest = await QuranLocalStore.open(GUEST_IDENTITY, factory);
    const account = await QuranLocalStore.open(userIdentity('u-1'), factory);
    await guest.saveReadingPosition(2, 255);
    await guest.toggleBookmark(2, 255);

    await account.claimFrom(guest);

    expect(await account.getReadingPosition()).toMatchObject({ surah: 2, ayah: 255 });
    expect((await account.listBookmarks()).map((row) => [row.surah, row.ayah])).toEqual([[2, 255]]);
    expect(await guest.getReadingPosition()).toBeNull();
    expect(await guest.listBookmarks()).toEqual([]);
    expect(await guest.getOutbox()).toEqual([]);
    guest.close();
    account.close();
  });

  it('re-homes the guest queued intents so offline work is pushed under the account', async () => {
    const guest = await QuranLocalStore.open(GUEST_IDENTITY, factory);
    const account = await QuranLocalStore.open(userIdentity('u-1'), factory);
    await guest.saveReadingPosition(2, 255);
    await guest.toggleBookmark(2, 255);
    const queued = await guest.getOutbox();

    await account.claimFrom(guest);

    const claimed = await account.getOutbox();
    expect(claimed.map((entry) => entry.type)).toEqual(queued.map((entry) => entry.type));
    expect(claimed.map((entry) => entry.payload)).toEqual(queued.map((entry) => entry.payload));
    // Fresh, monotonic sequence keys in iteration order, so the account's own
    // queue cannot be reordered by the claim (ADR-0029).
    expect(claimed.map((entry) => entry.seq)).toEqual(
      [...claimed.map((entry) => entry.seq)].sort((a, b) => a - b)
    );
    guest.close();
    account.close();
  });

  it('lets the newer side win each record, in both directions', async () => {
    const guest = await QuranLocalStore.open(GUEST_IDENTITY, factory);
    const account = await QuranLocalStore.open(userIdentity('u-1'), factory);
    // The account holds the newer place; the guest holds the newer mark.
    await account.applySyncSnapshot(
      snapshot({
        position: { surah: 3, ayah: 1, updatedAt: '2026-10-19T11:00:00.000Z' },
        bookmarks: [mark({ clientId: 'account-mark', updatedAt: '2026-10-19T09:00:00.000Z' })],
      })
    );
    await guest.applySyncSnapshot(
      snapshot({
        position: { surah: 5, ayah: 1, updatedAt: '2026-10-19T08:00:00.000Z' },
        bookmarks: [mark({ clientId: 'guest-mark', updatedAt: '2026-10-19T10:00:00.000Z' })],
      })
    );

    await account.claimFrom(guest);

    expect(await account.getReadingPosition()).toMatchObject({ surah: 3, ayah: 1 });
    expect((await account.listBookmarks())[0]!.clientId).toBe('guest-mark');
    guest.close();
    account.close();
  });
});
