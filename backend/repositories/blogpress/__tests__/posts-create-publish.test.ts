import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';

const AUTHOR = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

function makeClient(result: { data: unknown; error: unknown }) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(result);
  });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpcCalls };
}

describe('createAndPublishPost', () => {
  it('publishes through the server-owned RPC with only the editor fields', async () => {
    const { client, rpcCalls } = makeClient({
      data: [{ id: 'p-9', slug: 'post-abc12345' }],
      error: null,
    });

    const result = await createPostsRepository(client).createAndPublishPost(AUTHOR, {
      slug: 'post-abc12345',
      content: 'منشور جديد',
      cover_image: 'https://img/cover.png',
      meta_title: 'عنوان',
      meta_desc: 'وصف',
    });

    expect(result).toEqual({ id: 'p-9', slug: 'post-abc12345' });
    expect(rpcCalls).toEqual([
      {
        name: 'create_and_publish_post',
        args: {
          p_slug: 'post-abc12345',
          p_content: 'منشور جديد',
          p_cover_image: 'https://img/cover.png',
          p_meta_title: 'عنوان',
          p_meta_desc: 'وصف',
          p_reading_time_minutes: expect.any(Number),
        },
      },
    ]);
    // Publication columns are server-owned; sending them would let a client
    // choose `published_at` or visibility.
    expect(rpcCalls[0]?.args).not.toHaveProperty('p_status');
    expect(rpcCalls[0]?.args).not.toHaveProperty('p_published_at');
    expect(rpcCalls[0]?.args).not.toHaveProperty('p_community_visible');
  });

  it('surfaces an RPC failure instead of reporting success', async () => {
    const { client } = makeClient({ data: null, error: { message: 'cap reached' } });

    await expect(
      createPostsRepository(client).createAndPublishPost(AUTHOR, { slug: 'post-abc12345' })
    ).rejects.toThrow('فشل نشر المنشور');
  });

  it('surfaces an empty result instead of returning a phantom id', async () => {
    const { client } = makeClient({ data: [], error: null });

    await expect(
      createPostsRepository(client).createAndPublishPost(AUTHOR, { slug: 'post-abc12345' })
    ).rejects.toThrow('فشل نشر المنشور');
  });
});
