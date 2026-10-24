import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';

/**
 * The publication transitions are server-owned (#526). A client write that moves
 * `status`, `published_at`, `community_visible`, `view_count` or `featured` is
 * refused by a database trigger, so every one of these methods has to reach the
 * gated RPC instead of `.from('posts').update(...)`.
 */
function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const from = vi.fn();

  return {
    client: { rpc, from } as unknown as SupabaseClient<Database>,
    rpc,
    from,
  };
}

describe('blogpress post transitions go through the gated RPCs', () => {
  it('publishPost calls publish_post with the post id only', async () => {
    const { client, rpc, from } = rpcClient({ data: 'hello', error: null });

    await expect(createPostsRepository(client).publishPost('p1', 'u1')).resolves.toEqual({
      slug: 'hello',
    });

    expect(rpc).toHaveBeenCalledWith('publish_post', { p_post_id: 'p1' });
    expect(from).not.toHaveBeenCalled();
  });

  it('saveAndPublishPost sends the editor fields and lets the RPC set the status', async () => {
    const { client, rpc } = rpcClient({ data: 'hello', error: null });

    await createPostsRepository(client).saveAndPublishPost('p1', 'u1', {
      slug: 'hello',
      content: 'a short body',
    });

    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('publish_post');
    expect(args.p_post_id).toBe('p1');
    expect(args.p_fields).toMatchObject({ slug: 'hello', content: 'a short body' });
    expect(args.p_fields).not.toHaveProperty('status');
    expect(args.p_fields).not.toHaveProperty('published_at');
  });

  it('unpublishPost, schedulePost and setPostFeatured each call their own RPC', async () => {
    const first = rpcClient({ data: 'hello', error: null });
    await createPostsRepository(first.client).unpublishPost('p1', 'u1');
    expect(first.rpc).toHaveBeenCalledWith('unpublish_post', { p_post_id: 'p1' });

    const second = rpcClient({ data: 'hello', error: null });
    await createPostsRepository(second.client).schedulePost('p1', 'u1', '2026-11-01T09:00:00Z');
    expect(second.rpc).toHaveBeenCalledWith('schedule_post', {
      p_post_id: 'p1',
      p_publish_at: '2026-11-01T09:00:00Z',
    });

    const third = rpcClient({ data: 'hello', error: null });
    await createPostsRepository(third.client).setPostFeatured('p1', 'u1', true);
    expect(third.rpc).toHaveBeenCalledWith('set_post_featured', {
      p_post_id: 'p1',
      p_featured: true,
    });
  });

  it('a transition failure surfaces the Arabic message the controller forwards', async () => {
    const { client } = rpcClient({ data: null, error: { message: 'cap', code: '23514' } });

    await expect(createPostsRepository(client).publishPost('p1', 'u1')).rejects.toThrow(
      'فشل نشر المنشور'
    );
  });

  it('an RPC that answers no slug is a failure, not a silent success', async () => {
    const { client } = rpcClient({ data: null, error: null });

    await expect(createPostsRepository(client).publishPost('p1', 'u1')).rejects.toThrow(
      'فشل نشر المنشور'
    );
  });

  it('restorePost revives the tombstone through restore_post, never as a client insert', async () => {
    const { client, rpc, from } = rpcClient({ data: 'post-id', error: null });

    const snapshot = {
      id: 'post-id',
      slug: 'hello',
      content: 'body',
      cover_image: null,
      meta_title: null,
      meta_desc: null,
    };

    await expect(createPostsRepository(client).restorePost('u1', snapshot)).resolves.toEqual({
      id: 'post-id',
    });

    expect(rpc).toHaveBeenCalledWith('restore_post', { p_snapshot: snapshot });
    expect(from).not.toHaveBeenCalled();
  });

  it('a restore with no owned tombstone is a 404, not an infrastructure failure', async () => {
    const { client } = rpcClient({
      data: null,
      error: { message: 'deleted post not found', code: 'P0002' },
    });

    await expect(
      createPostsRepository(client).restorePost('u1', {
        slug: 'hello',
        content: 'body',
        cover_image: null,
        meta_title: null,
        meta_desc: null,
      })
    ).rejects.toMatchObject({ statusCode: 404, message: 'المنشور المحذوف غير موجود' });
  });

  it('bulk publish and unpublish run in one bulk_publish_posts call', async () => {
    const { client, rpc } = rpcClient({ data: ['a', 'b'], error: null });

    await expect(
      createPostsRepository(client).bulkActionPosts(['p1', 'p2'], 'u1', 'publish')
    ).resolves.toEqual({ affected: 2, slugs: ['a', 'b'] });

    expect(rpc).toHaveBeenCalledWith('bulk_publish_posts', {
      p_post_ids: ['p1', 'p2'],
      p_publish: true,
    });
  });
});

/** The one update payload `updatePost` builds, with a thenable PostgREST chain. */
function updateClient(result: { error: unknown }) {
  const payloads: Array<Record<string, unknown>> = [];

  const builder: Record<string, unknown> = {};
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    payloads.push(payload);
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.lte = vi.fn(() => builder);
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);

  return {
    client: { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>,
    payloads,
  };
}

describe('blogpress post edits leave the server-owned columns alone', () => {
  it('drops status and publish_at even when the input carries them', async () => {
    const { client, payloads } = updateClient({ error: null });

    await createPostsRepository(client).updatePost('p1', 'u1', {
      slug: 'hello',
      content: 'body',
      status: 'published',
      publish_at: '2026-11-01T09:00:00Z',
    });

    const payload = payloads[0];
    if (!payload) throw new Error('expected an update payload');
    expect(payload).toMatchObject({ slug: 'hello', content: 'body' });
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('publish_at');
  });
});
