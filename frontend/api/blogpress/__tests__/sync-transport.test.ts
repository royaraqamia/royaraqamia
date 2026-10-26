import { describe, it, expect, vi, beforeEach } from 'vitest';

const request = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock('@/frontend/transport/http', () => ({
  request,
  ApiError: class ApiError extends Error {},
}));

const uploadImage = vi.hoisted(() => vi.fn());
vi.mock('@/frontend/api/blogpress', () => ({ uploadImage }));

import { createBlogpressHttpSyncTransport } from '@/frontend/api/blogpress/sync-transport';
import { mediaPlaceholder, type BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

function entry(type: string, payload: Record<string, unknown>): OutboxEntry {
  return {
    seq: 1,
    id: 'x',
    entity: 'post',
    type,
    payload,
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
  };
}

function fakeStore(overrides: Partial<BlogpressLocalStore> = {}): BlogpressLocalStore {
  return {
    getMedia: vi.fn().mockResolvedValue(null),
    markMediaUploaded: vi.fn().mockResolvedValue(undefined),
    applyResolvedContent: vi.fn().mockResolvedValue(undefined),
    confirmDraft: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BlogpressLocalStore;
}

describe('createBlogpressHttpSyncTransport', () => {
  beforeEach(() => {
    request.mockClear();
    uploadImage.mockReset();
  });

  it('replays an offline-created draft as an idempotent create', async () => {
    const store = fakeStore();
    await createBlogpressHttpSyncTransport(store).send(
      entry('post.save', {
        id: 'p-1',
        clientId: 'p-1',
        slug: 'p-1',
        content: 'مرحباً',
        cover_image: '',
        meta_title: '',
        meta_desc: '',
        updatedAt: '2026-08-01T00:00:00Z',
        isNew: true,
      })
    );

    expect(request).toHaveBeenCalledWith('/api/blogpress/posts', {
      method: 'POST',
      body: JSON.stringify({
        id: 'p-1',
        clientId: 'p-1',
        slug: 'p-1',
        content: 'مرحباً',
        cover_image: '',
        meta_title: '',
        meta_desc: '',
        updatedAt: '2026-08-01T00:00:00Z',
      }),
    });
    expect(store.confirmDraft).toBeDefined();
  });

  it('replays an edited draft as a last-write-wins PATCH', async () => {
    await createBlogpressHttpSyncTransport(fakeStore()).send(
      entry('post.save', {
        id: 'p-1',
        clientId: 'p-1',
        slug: 'p-1',
        content: 'نسخة أحدث',
        cover_image: '',
        meta_title: '',
        meta_desc: '',
        updatedAt: '2026-08-02T00:00:00Z',
        isNew: false,
      })
    );

    expect(request).toHaveBeenCalledWith('/api/blogpress/posts/p-1', {
      method: 'PATCH',
      body: JSON.stringify({
        slug: 'p-1',
        content: 'نسخة أحدث',
        cover_image: '',
        meta_title: '',
        meta_desc: '',
        clientId: 'p-1',
        updatedAt: '2026-08-02T00:00:00Z',
      }),
    });
  });

  it('replays a delete as a DELETE', async () => {
    await createBlogpressHttpSyncTransport(fakeStore()).send(
      entry('post.delete', { id: 'p-1', updatedAt: '2026-08-01T00:00:00Z' })
    );

    expect(request).toHaveBeenCalledWith('/api/blogpress/posts/p-1', {
      method: 'DELETE',
      body: JSON.stringify({ updatedAt: '2026-08-01T00:00:00Z' }),
    });
  });

  it('uploads a queued attachment and swaps its placeholder for the URL', async () => {
    const mediaId = '11111111-1111-7111-8111-111111111111';
    const blob = new Blob(['bytes'], { type: 'image/png' });
    const store = fakeStore({
      getMedia: vi.fn().mockResolvedValue({
        id: mediaId,
        postId: 'p-1',
        fileName: 'a.png',
        mimeType: 'image/png',
        blob,
        status: 'pending',
        url: null,
      }),
    } as Partial<BlogpressLocalStore>);
    uploadImage.mockResolvedValue({ url: 'https://cdn.example/a.png' });

    await createBlogpressHttpSyncTransport(store).send(
      entry('post.save', {
        id: 'p-1',
        clientId: 'p-1',
        slug: 'p-1',
        content: `![a](${mediaPlaceholder(mediaId)})`,
        cover_image: '',
        meta_title: '',
        meta_desc: '',
        updatedAt: '2026-08-01T00:00:00Z',
        isNew: false,
      })
    );

    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(store.markMediaUploaded).toHaveBeenCalledWith(mediaId, 'https://cdn.example/a.png');
    const body = JSON.parse((request.mock.calls[0]![1] as { body: string }).body) as {
      content: string;
    };
    expect(body.content).toBe('![a](https://cdn.example/a.png)');
  });

  it('names the upload failure in Arabic when the server answers without a URL', async () => {
    const mediaId = '11111111-1111-7111-8111-111111111111';
    const blob = new Blob(['bytes'], { type: 'image/png' });
    const store = fakeStore({
      getMedia: vi.fn().mockResolvedValue({
        id: mediaId,
        postId: 'p-1',
        fileName: 'a.png',
        mimeType: 'image/png',
        blob,
        status: 'pending',
        url: null,
      }),
    } as Partial<BlogpressLocalStore>);
    uploadImage.mockResolvedValue({});

    // The queue renders this reason in the sync pill, so it must be Arabic like
    // the rest of the failure vocabulary (#475).
    await expect(
      createBlogpressHttpSyncTransport(store).send(
        entry('post.save', {
          id: 'p-1',
          clientId: 'p-1',
          slug: 'p-1',
          content: `![a](${mediaPlaceholder(mediaId)})`,
          cover_image: '',
          meta_title: '',
          meta_desc: '',
          updatedAt: '2026-08-01T00:00:00Z',
          isNew: false,
        })
      )
    ).rejects.toThrow('فشل رفع الصُّورة. أعد المحاولة.');
    expect(store.markMediaUploaded).not.toHaveBeenCalled();
  });

  it('rejects an unknown intent type as permanent', async () => {
    await expect(
      createBlogpressHttpSyncTransport(fakeStore()).send(entry('nope', {}))
    ).rejects.toThrow('Unknown outbox intent type: nope');
  });
});
