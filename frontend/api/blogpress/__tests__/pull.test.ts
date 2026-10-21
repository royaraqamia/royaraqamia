import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/frontend/api/blogpress', () => ({ getSyncSnapshot: vi.fn() }));

import { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { pullBlogpressData } from '@/frontend/api/blogpress/pull';
import { getSyncSnapshot } from '@/frontend/api/blogpress';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import type { Post } from '@/shared/contracts/blogpress';

const IDENTITY = userIdentity('u-1');

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    author_id: 'author-1',
    slug: 'post-1',
    content: 'البداية',
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
    created_at: '2026-08-18T08:00:00.000Z',
    updated_at: '2026-08-18T08:00:00.000Z',
    ...overrides,
  };
}

describe('pullBlogpressData', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    vi.mocked(getSyncSnapshot).mockReset();
  });

  it('merges the snapshot and reports the rows the server sent', async () => {
    vi.mocked(getSyncSnapshot).mockResolvedValue({
      posts: [post(), post({ id: 'post-2', slug: 'post-2', content: 'الثاني' })],
    });

    const store = await BlogpressLocalStore.open(IDENTITY);
    try {
      expect(await pullBlogpressData(store)).toBe(2);

      expect(await store.getDrafts()).toEqual([
        expect.objectContaining({ id: 'post-1', content: 'البداية' }),
        expect.objectContaining({ id: 'post-2', content: 'الثاني' }),
      ]);
      // The pull is a read, not a write: nothing was queued to flush.
      expect(await store.getOutbox()).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('leaves a queued local edit to the server copy the merge would clobber', async () => {
    vi.mocked(getSyncSnapshot).mockResolvedValue({
      posts: [post({ id: 'post-2', slug: 'post-2', content: 'نسخة السِرفر' })],
    });

    const store = await BlogpressLocalStore.open(IDENTITY);
    try {
      // The page holds `post-2` and has edited it: an unflushed edit must not be
      // clobbered by an older server copy (ADR-0029's pending-aware merge).
      await store.saveDraft({
        id: 'post-2',
        slug: 'post-2',
        content: 'مسوَّدة محليّة',
        coverImage: '',
        metaTitle: '',
        metaDesc: '',
      });
      const local = await store.getDraft('post-2');
      expect(local?.content).toBe('مسوَّدة محليّة');

      expect(await pullBlogpressData(store)).toBe(1);
      expect((await store.getDraft('post-2'))?.content).toBe('مسوَّدة محليّة');
      // The edit's intent survived the pull untouched.
      expect((await store.getOutbox()).map((entry) => entry.type)).toEqual(['post.save']);
    } finally {
      store.close();
    }
  });

  it('applies a server tombstone as a delete on this device', async () => {
    // A tombstone is the row's post-delete `updated_at`, so it is newer than
    // the local copy (which still holds the pre-delete timestamp).
    vi.mocked(getSyncSnapshot).mockResolvedValue({
      posts: [
        post({ updated_at: '2026-09-18T08:00:00.000Z', deleted_at: '2026-09-18T08:00:00.000Z' }),
      ],
    });

    const store = await BlogpressLocalStore.open(IDENTITY);
    try {
      await store.seedIfEmpty([post()]);
      expect(await pullBlogpressData(store)).toBe(1);
      expect((await store.getDraft('post-1'))?.deletedAt).toBe('2026-09-18T08:00:00.000Z');
    } finally {
      store.close();
    }
  });

  it('asks the endpoint for the whole owned set', async () => {
    vi.mocked(getSyncSnapshot).mockResolvedValue({ posts: [] });
    const store = await BlogpressLocalStore.open(IDENTITY);
    try {
      await pullBlogpressData(store);
      expect(getSyncSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      store.close();
    }
  });
});
