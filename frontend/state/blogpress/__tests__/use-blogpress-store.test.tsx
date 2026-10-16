import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Post } from '@/shared/contracts/blogpress';

/** When set, the transport's `send` parks on it, holding a flush open. */
let sendGate: Promise<void> | null = null;
const sentTypes: string[] = [];

vi.mock('@/frontend/api/blogpress/sync-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/blogpress/sync-transport')>();
  return {
    ...actual,
    createBlogpressHttpSyncTransport: () => ({
      send: async (entry: { type: string }) => {
        sentTypes.push(entry.type);
        if (sendGate) await sendGate;
      },
    }),
  };
});

import { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import { useBlogpressStore } from '@/frontend/state/blogpress/use-blogpress-store';

const POST = {
  id: 'p-1',
  author_id: 'u-1',
  slug: 'hello',
  content: null,
  status: 'draft',
  cover_image: null,
  meta_title: null,
  meta_desc: null,
  published_at: null,
  publish_at: null,
  view_count: 0,
  featured: false,
  community_visible: false,
  reading_time_minutes: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} satisfies Post;

describe('useBlogpressStore', () => {
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
      const { result, unmount } = renderHook(() => useBlogpressStore(POST, 'u-1'));
      await waitFor(() => expect(result.current.ready).toBe(true));

      unmount();

      expect(closed).toContain('blogpress-sync');
    } finally {
      BroadcastChannel.prototype.close = originalClose;
    }
  });

  // #204: this hook owns the store, so unmount closes it while the flush is
  // still parked inside `send`. The next store call must not reject on the
  // closed connection — the flush is cleanly abandoned and the intent stays
  // queued for the next mount to replay.
  it('abandons an in-flight flush without rejecting when it unmounts', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    const seeded = await BlogpressLocalStore.open(userIdentity('u-1'));
    await seeded.saveDraft({
      id: POST.id,
      slug: POST.slug,
      content: 'مسودة',
      coverImage: '',
      metaTitle: '',
      metaDesc: '',
    });

    let releaseSend: () => void = () => {};
    sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    try {
      const { result, unmount } = renderHook(() => useBlogpressStore(POST, 'u-1'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      // The flush has picked the intent up and is parked inside `send`.
      await waitFor(() => expect(sentTypes).toContain('post.save'));

      unmount();
      releaseSend();

      // Give a rejection raised by the post-unmount store calls a tick to surface.
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      process.off('unhandledRejection', onRejection);
      seeded.close();
    }

    expect(rejections).toEqual([]);

    const store = await BlogpressLocalStore.open(userIdentity('u-1'));
    expect(await store.getOutbox()).toHaveLength(1);
    store.close();
  });
});
