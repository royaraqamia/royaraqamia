import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BlogpressLocalStore,
  mediaPlaceholder,
  mediaPlaceholderIds,
  postFromDraft,
} from '@/frontend/api/blogpress/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';
import type { Post } from '@/shared/contracts/blogpress';

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

function open(identity = GUEST_IDENTITY) {
  return BlogpressLocalStore.open(identity, factory);
}

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

describe('BlogpressLocalStore', () => {
  it('carries the dashboard display fields through the store and back out (#449)', async () => {
    const store = await open();
    await store.seedIfEmpty([
      post({
        view_count: 12,
        featured: true,
        community_visible: true,
        published_at: '2026-08-17T08:00:00.000Z',
        reading_time_minutes: 4,
      }),
    ]);

    const draft = await store.getDraft('post-1');
    expect(draft?.viewCount).toBe(12);
    expect(draft?.featured).toBe(true);
    expect(draft?.communityVisible).toBe(true);
    expect(draft?.publishedAt).toBe('2026-08-17T08:00:00.000Z');
    expect(draft?.readingTimeMinutes).toBe(4);

    // The dashboard reads the store's drafts as posts, so the fields have to
    // survive the round trip rather than resetting to their defaults offline.
    const mapped = postFromDraft(draft!, 'author-1');
    expect(mapped).toMatchObject({
      id: 'post-1',
      author_id: 'author-1',
      view_count: 12,
      featured: true,
      community_visible: true,
      published_at: '2026-08-17T08:00:00.000Z',
      reading_time_minutes: 4,
    });
    store.close();
  });

  it('seeds the server post once without queueing an intent', async () => {
    const store = await open();
    await store.seedIfEmpty([post()]);

    const draft = await store.getDraft('post-1');
    expect(draft?.content).toBe('البداية');
    expect(draft?.isNew).toBe(false);
    expect(await store.getOutbox()).toHaveLength(0);
    store.close();
  });

  it('queues a post.save intent when a draft is edited', async () => {
    const store = await open();
    await store.seedIfEmpty([post()]);
    await store.saveDraft({
      id: 'post-1',
      clientId: 'post-1',
      slug: 'post-1',
      content: 'نصٌّ جديد',
      coverImage: '',
      metaTitle: '',
      metaDesc: '',
      isNew: false,
    });

    const outbox = await store.getOutbox();
    expect(outbox.map((e) => e.type)).toEqual(['post.save']);
    expect(outbox[0]?.payload).toMatchObject({
      id: 'post-1',
      content: 'نصٌّ جديد',
      isNew: false,
    });
    store.close();
  });

  it('tombstones a deleted draft and hides it from reads', async () => {
    const store = await open();
    await store.seedIfEmpty([post()]);
    await store.deleteDraft('post-1');

    expect(await store.getDrafts()).toHaveLength(0);
    expect((await store.getOutbox()).at(-1)?.type).toBe('post.delete');
    store.close();
  });

  it('stores attachment blobs and tracks their upload', async () => {
    const store = await open();
    const media = await store.putMedia({
      postId: 'post-1',
      fileName: 'cover.png',
      mimeType: 'image/png',
      blob: new Blob(['bytes'], { type: 'image/png' }),
    });

    expect(mediaPlaceholderIds(`![x](${mediaPlaceholder(media.id)})`)).toEqual([media.id]);
    expect(await store.getPendingMedia()).toHaveLength(1);

    await store.markMediaUploaded(media.id, 'https://cdn.example/x.png');
    expect(await store.getPendingMedia()).toHaveLength(0);
    expect((await store.getMedia(media.id))?.url).toBe('https://cdn.example/x.png');
    store.close();
  });

  it('claims guest drafts, blobs and intents into the account store', async () => {
    const guest = await open(GUEST_IDENTITY);
    await guest.seedIfEmpty([post()]);
    await guest.saveDraft({
      id: 'post-1',
      clientId: 'post-1',
      slug: 'post-1',
      content: 'كتبه الزَّائر',
      coverImage: '',
      metaTitle: '',
      metaDesc: '',
    });
    await guest.putMedia({
      postId: 'post-1',
      fileName: 'a.png',
      mimeType: 'image/png',
      blob: new Blob(['x']),
    });

    const account = await open(userIdentity('user-9'));
    await account.claimFrom(guest);

    const draft = await account.getDraft('post-1');
    expect(draft?.content).toBe('كتبه الزَّائر');
    expect(await account.getOutbox()).toHaveLength(1);
    expect(await guest.getDrafts()).toHaveLength(0);
    account.close();
    guest.close();
  });
});
