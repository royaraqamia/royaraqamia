import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// The signed-in background pull hits the network; keep it local and empty.
vi.mock('@/frontend/api/linksnap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/linksnap')>();
  return {
    ...actual,
    listLinksIncludingDeleted: vi.fn().mockResolvedValue([]),
  };
});

/** When set, the transport's `send` parks on it, holding a flush open. */
let sendGate: Promise<void> | null = null;
const sentTypes: string[] = [];

vi.mock('@/frontend/api/linksnap/sync-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/linksnap/sync-transport')>();
  return {
    ...actual,
    createLinksnapHttpSyncTransport: () => ({
      send: async (entry: { type: string }) => {
        sentTypes.push(entry.type);
        if (sendGate) await sendGate;
      },
    }),
  };
});

import { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import { useLinksnap } from '@/frontend/state/linksnap/use-linksnap';

describe('useLinksnap', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    sendGate = null;
    sentTypes.length = 0;
  });

  // The engine owns the channel now (#200); the hook's job is to dispose it.
  // Disposal is what stops a flush that lands after teardown from posting to a
  // closed channel — proven at the engine level in
  // `shared/local-store/__tests__/sync-engine.test.ts`.
  it('closes its broadcast channel when it unmounts', async () => {
    const closed: string[] = [];
    const originalClose = BroadcastChannel.prototype.close;
    BroadcastChannel.prototype.close = function (this: BroadcastChannel) {
      closed.push(this.name);
      return originalClose.call(this);
    };

    try {
      const { result, unmount } = renderHook(() =>
        useLinksnap({ token: 'test-token', user: { id: 'u-1' } })
      );
      await waitFor(() => expect(result.current.ready).toBe(true));

      unmount();

      expect(closed).toContain('linksnap-sync');
    } finally {
      BroadcastChannel.prototype.close = originalClose;
    }
  });

  // #204: the hook owns the store, so unmount closes it while the flush is
  // still parked inside `send`. The next store call must not reject on the
  // closed connection — the flush is cleanly abandoned and the intent stays
  // queued for the next mount to replay.
  it('abandons an in-flight flush without rejecting when it unmounts', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    const seeded = await LinksnapLocalStore.open(userIdentity('u-1'));
    await seeded.createLink({ originalUrl: 'https://example.com/a' });

    let releaseSend: () => void = () => {};
    sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    try {
      const { result, unmount } = renderHook(() =>
        useLinksnap({ token: 'test-token', user: { id: 'u-1' } })
      );
      await waitFor(() => expect(result.current.ready).toBe(true));
      // The flush has picked the intent up and is parked inside `send`.
      await waitFor(() => expect(sentTypes).toContain('link.create'));

      unmount();
      releaseSend();

      // Give a rejection raised by the post-unmount store calls a tick to surface.
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      process.off('unhandledRejection', onRejection);
      seeded.close();
    }

    expect(rejections).toEqual([]);

    const store = await LinksnapLocalStore.open(userIdentity('u-1'));
    expect(await store.getOutbox()).toHaveLength(1);
    store.close();
  });
});
