import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// The Local Store path must not touch the network; the pull is kept local and
// empty, and `bulkLinkAction` is a tripwire for the fallback.
vi.mock('@/frontend/api/linksnap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/linksnap')>();
  return {
    ...actual,
    listLinksIncludingDeleted: vi.fn().mockResolvedValue([]),
    bulkLinkAction: vi.fn().mockResolvedValue(999),
  };
});

vi.mock('@/frontend/api/sync-hints', () => ({
  userSyncHints: () => [],
  subscribeToSyncHints: () => () => {},
}));

vi.mock('@/frontend/api/linksnap/sync-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/linksnap/sync-transport')>();
  return {
    ...actual,
    createLinksnapHttpSyncTransport: () => ({
      send: async (entry: { type: string; payload: unknown }) => {
        sentEntries.push(entry);
      },
    }),
  };
});

/** What the Outbox actually replayed, in order. */
const sentEntries: Array<{ type: string; payload: unknown }> = [];

import { bulkLinkAction, type ShortenedLink } from '@/frontend/api/linksnap';
import { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import { LinksnapProvider, useLinksnapContext } from '@/frontend/state/linksnap/linksnap-context';
import { useBulkLinks } from '@/frontend/state/linksnap/use-bulk-links';

function wrapper({ children }: { children: ReactNode }) {
  return <LinksnapProvider user={{ id: 'u-1' }}>{children}</LinksnapProvider>;
}

async function renderBulk(code: string) {
  return renderHook(
    () => ({ bulk: useBulkLinks([code], 'token'), linksnap: useLinksnapContext() }),
    {
      wrapper,
    }
  );
}

describe('useBulkLinks — Local Store path', () => {
  let seeded: { clientId: string; code: string };

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    vi.mocked(bulkLinkAction).mockClear();
    sentEntries.length = 0;

    const store = await LinksnapLocalStore.open(userIdentity('u-1'));
    const record = await store.createLink({ originalUrl: 'https://example.com/a' });
    seeded = { clientId: record.clientId, code: record.code };
    store.close();
  });

  it('queues a tombstone instead of calling the bulk endpoint', async () => {
    const { result } = await renderBulk(seeded.code);
    await waitFor(() => expect(result.current.linksnap?.ready).toBe(true));
    await waitFor(() => expect(result.current.linksnap?.links).toHaveLength(1));

    act(() => result.current.bulk.toggle(seeded.code));
    await act(async () => {
      expect(await result.current.bulk.runDelete()).toEqual({ deleted: 1 });
    });

    // The list drops it (the tombstone is what the store filters on)...
    expect(result.current.linksnap?.links).toEqual([]);
    // ...the row survives as a tombstone rather than being removed...
    const store = result.current.linksnap?.store;
    expect(store).toBeTruthy();
    const rows = await store!.getAllLinks();
    expect(rows.find((row) => row.clientId === seeded.clientId)?.deletedAt).toBeTruthy();
    // ...and the server is told by the same intent an offline delete queues.
    await waitFor(() => expect(sentEntries.map((entry) => entry.type)).toContain('link.delete'));
    expect(bulkLinkAction).not.toHaveBeenCalled();
  });

  it('counts only the selected rows that exist locally', async () => {
    const { result } = await renderBulk(seeded.code);
    await waitFor(() => expect(result.current.linksnap?.ready).toBe(true));
    await waitFor(() => expect(result.current.linksnap?.links).toHaveLength(1));

    act(() => {
      result.current.bulk.toggle(seeded.code);
      result.current.bulk.toggle('nonexistent');
    });

    await act(async () => {
      expect(await result.current.bulk.runDelete()).toEqual({ deleted: 1 });
    });
  });

  it('applies bulk expiry through the store, advancing updatedAt', async () => {
    const { result } = await renderBulk(seeded.code);
    await waitFor(() => expect(result.current.linksnap?.ready).toBe(true));
    await waitFor(() => expect(result.current.linksnap?.links).toHaveLength(1));
    const before = result.current.linksnap!.links[0]?.updatedAt;

    act(() => result.current.bulk.toggle(seeded.code));
    const expiresAt = '2026-09-01T00:00:00.000Z';
    await act(async () => {
      expect(await result.current.bulk.runSetExpiry(expiresAt)).toBe(true);
    });

    const link = result.current.linksnap!.links[0] as ShortenedLink;
    expect(link.expiresAt).toBe(expiresAt);
    // The bumped timestamp is what makes the change win the merge elsewhere.
    expect(link.updatedAt && before && link.updatedAt > before).toBe(true);

    await waitFor(() => {
      const intent = sentEntries.find((entry) => entry.type === 'link.update');
      expect(intent?.payload).toMatchObject({ expiresAt });
    });
    expect(bulkLinkAction).not.toHaveBeenCalled();
  });
});
