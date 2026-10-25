import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/** The session the hook sees; a mutable user is how a sign-in is driven here. */
let sessionUser: { id: string } | null = null;

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: sessionUser }),
}));

// The pull hits the network; it is stubbed down to the snapshot each test wants.
vi.mock('@/frontend/api/quran/sync-api', () => ({ pullQuranSync: vi.fn() }));

/** The sources and hint callbacks the surface subscribed with (ADR-0060). */
let hintSources: unknown = null;
const hintCallbacks: Array<() => void> = [];

vi.mock('@/frontend/api/sync-hints', () => ({
  userSyncHints: (tables: readonly string[], userId: string) =>
    tables.map((table) => ({
      table,
      channel: `${table}_sync_hints`,
      filter: `user_id=eq.${userId}`,
    })),
  subscribeToSyncHints: (sources: unknown, onHint: () => void) => {
    hintSources = sources;
    hintCallbacks.push(onHint);
    return () => {
      const index = hintCallbacks.indexOf(onHint);
      if (index >= 0) hintCallbacks.splice(index, 1);
    };
  },
}));

const sentTypes: string[] = [];

vi.mock('@/frontend/api/quran/sync-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/quran/sync-transport')>();
  return {
    ...actual,
    createQuranHttpSyncTransport: () => ({
      send: async (entry: { type: string }) => {
        sentTypes.push(entry.type);
      },
    }),
  };
});

import { pullQuranSync } from '@/frontend/api/quran/sync-api';
import { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';
import { QURAN_SNAPSHOT_ROUTE, useQuranReader } from '@/frontend/state/quran/use-quran-reader';
import { clearSnapshots, writeSnapshot } from '@/frontend/shared/local-store/snapshot';
import type { QuranSyncSnapshot } from '@/shared/contracts/quran';

const EMPTY: QuranSyncSnapshot = { position: null, bookmarks: [], cursor: null };

describe('useQuranReader', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    window.localStorage.clear();
    clearSnapshots();
    sessionUser = null;
    sentTypes.length = 0;
    hintSources = null;
    hintCallbacks.length = 0;
    vi.mocked(pullQuranSync).mockReset();
    vi.mocked(pullQuranSync).mockResolvedValue(EMPTY);
  });

  it('reads as the guest, and asks the server nothing', async () => {
    const { result } = renderHook(() => useQuranReader());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.isSignedIn).toBe(false);
    // Reading is anonymous (ADR-0056): no pull, no hints and no flush.
    expect(pullQuranSync).not.toHaveBeenCalled();
    expect(hintSources).toBeNull();

    await act(async () => {
      await result.current.toggleBookmark(2, 255);
    });
    expect(sentTypes).toEqual([]);
  });

  it('claims what the guest wrote into the account, and empties the guest', async () => {
    const { result, rerender } = renderHook(() => useQuranReader());
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.toggleBookmark(2, 255);
    });
    expect(sentTypes).toEqual([]);

    sessionUser = { id: 'u-1' };
    rerender();

    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    await waitFor(() =>
      expect(result.current.bookmarks).toEqual([expect.objectContaining({ surah: 2, ayah: 255 })])
    );

    // The claim is asynchronous: wait on its outcome — the guest store emptied —
    // rather than on a render that can happen before the claim has run.
    const guest = await QuranLocalStore.open(GUEST_IDENTITY);
    await waitFor(async () => {
      expect(await guest.listBookmarks()).toEqual([]);
    });
    guest.close();

    const account = await QuranLocalStore.open(userIdentity('u-1'));
    expect(await account.listBookmarks()).toEqual([
      expect.objectContaining({ surah: 2, ayah: 255 }),
    ]);
    account.close();
  });

  it('takes the records another device already put on the account', async () => {
    sessionUser = { id: 'u-1' };
    vi.mocked(pullQuranSync).mockResolvedValue({
      position: { surah: 3, ayah: 7, updatedAt: '2026-10-19T10:00:00.000Z' },
      bookmarks: [
        {
          clientId: 'other-device',
          surah: 2,
          ayah: 255,
          createdAt: '2026-10-19T10:00:00.000Z',
          updatedAt: '2026-10-19T10:00:00.000Z',
          deletedAt: null,
        },
      ],
      cursor: '2026-10-19T10:00:00.000Z',
    });

    const { result } = renderHook(() => useQuranReader());
    await waitFor(() => expect(result.current.ready).toBe(true));

    await waitFor(() =>
      expect(result.current.readingPosition).toMatchObject({ surah: 3, ayah: 7 })
    );
    expect(result.current.bookmarks).toEqual([expect.objectContaining({ ayah: 255 })]);
  });

  it('flushes a mark made after mount without waiting for a focus event', async () => {
    sessionUser = { id: 'u-1' };
    const { result } = renderHook(() => useQuranReader());
    await waitFor(() => expect(result.current.ready).toBe(true));

    // Nothing is queued at mount, so the write itself is the only thing that can
    // send — no focus, online or visibility event is dispatched.
    await act(async () => {
      await result.current.toggleBookmark(2, 255);
    });

    await waitFor(() => expect(sentTypes).toContain('bookmark.set'));
  });

  it('pulls when a hint says another device wrote', async () => {
    sessionUser = { id: 'u-1' };
    const { result } = renderHook(() => useQuranReader());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(hintCallbacks).toHaveLength(1));

    expect(hintSources).toEqual([
      {
        table: 'quran_reading_positions',
        channel: 'quran_reading_positions_sync_hints',
        filter: 'user_id=eq.u-1',
      },
      {
        table: 'quran_bookmarks',
        channel: 'quran_bookmarks_sync_hints',
        filter: 'user_id=eq.u-1',
      },
    ]);

    const before = vi.mocked(pullQuranSync).mock.calls.length;
    await act(async () => {
      for (const hint of [...hintCallbacks]) hint();
    });

    await waitFor(() => expect(vi.mocked(pullQuranSync).mock.calls.length).toBe(before + 1));
  });

  /**
   * #495, and the acceptance names this one: the Quran reader's first frame is
   * the reader's place, not the top of the index. The store read is still a
   * promise, so the recorded screen is what the first commit paints.
   */
  it('paints the recorded position before the store opens', async () => {
    writeSnapshot(GUEST_IDENTITY, QURAN_SNAPSHOT_ROUTE, {
      readingPosition: { surah: 18, ayah: 10, updatedAt: '2026-10-20T09:00:00.000Z' },
      bookmarks: [],
    });

    const { result } = renderHook(() => useQuranReader());

    // Synchronously, on the first client commit — no `waitFor`.
    expect(result.current.readingPosition).toMatchObject({ surah: 18, ayah: 10 });

    // The store answered with no position, and the snapshot is replaced rather
    // than merged into it.
    await waitFor(() => expect(result.current.readingPosition).toBeNull());
    expect(result.current.ready).toBe(true);
  });
});
