import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

const open = () => QuranLocalStore.open(GUEST_IDENTITY, factory);

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
