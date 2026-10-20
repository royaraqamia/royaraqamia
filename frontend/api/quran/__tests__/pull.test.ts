import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/frontend/api/quran/sync-api', () => ({ pullQuranSync: vi.fn() }));

import { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { pullQuranData } from '@/frontend/api/quran/pull';
import { pullQuranSync } from '@/frontend/api/quran/sync-api';
import { userIdentity } from '@/frontend/shared/local-store/identity';

const IDENTITY = userIdentity('u-1');

const SNAPSHOT = {
  position: { surah: 3, ayah: 7, updatedAt: '2026-10-19T10:00:00.000Z' },
  bookmarks: [
    {
      clientId: 'b-1',
      surah: 2,
      ayah: 255,
      createdAt: '2026-10-19T10:00:00.000Z',
      updatedAt: '2026-10-19T10:00:00.000Z',
      deletedAt: null,
    },
  ],
  cursor: '2026-10-19T10:00:00.000Z',
};

describe('pullQuranData', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    vi.mocked(pullQuranSync).mockReset();
    vi.mocked(pullQuranSync).mockResolvedValue(SNAPSHOT);
  });

  it('applies the snapshot and reports the rows the server sent', async () => {
    const store = await QuranLocalStore.open(IDENTITY);
    try {
      expect(await pullQuranData(store)).toBe(2);

      expect(pullQuranSync).toHaveBeenCalledWith(null);
      expect(await store.getReadingPosition()).toMatchObject({ surah: 3, ayah: 7 });
      expect(await store.listBookmarks()).toEqual([expect.objectContaining({ clientId: 'b-1' })]);
    } finally {
      store.close();
    }
  });

  it('asks since the cursor the store advanced to', async () => {
    const store = await QuranLocalStore.open(IDENTITY);
    try {
      await pullQuranData(store);
      await pullQuranData(store);

      expect(vi.mocked(pullQuranSync).mock.calls).toEqual([[null], ['2026-10-19T10:00:00.000Z']]);
    } finally {
      store.close();
    }
  });
});
