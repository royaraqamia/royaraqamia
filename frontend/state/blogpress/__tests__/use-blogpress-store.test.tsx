import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Post } from '@/shared/contracts/blogpress';
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
});
