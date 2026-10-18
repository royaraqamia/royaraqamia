import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * PostgREST-shaped fake with an RPC surface. `createPost` calls the
 * `SECURITY INVOKER` `upsert_post` function, which applies last-write-wins on
 * `updated_at` and returns the applied row (or no row when the replay is stale),
 * so `opts.rpc` drives that outcome while `opts.tables.posts` serves the
 * follow-up re-read of the winner.
 */
class Builder {
  constructor(
    private readonly table: string,
    private readonly calls: string[],
    private readonly result: () => Result
  ) {}

  private log(op: string) {
    this.calls.push(`${this.table}:${op}`);
    return this;
  }

  select(columns?: string) {
    return this.log(`select ${columns ?? ''}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  maybeSingle() {
    this.log('maybeSingle');
    return Promise.resolve(this.result());
  }
}

function makeClient(opts: { rpc?: Result; tables?: Record<string, Result> } = {}) {
  const calls: string[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const from = vi.fn(
    (table: string) =>
      new Builder(table, calls, () => opts.tables?.[table] ?? { data: null, error: null })
  );
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(opts.rpc ?? { data: [], error: null });
  });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, calls, rpcCalls };
}

const AUTHOR = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-7111-8111-111111111111';

describe('createPost — a create replay is last-write-wins', () => {
  it('a newer replay applies through the LWW upsert and returns the stored id', async () => {
    const { client, rpcCalls } = makeClient({
      rpc: { data: [{ id: CLIENT_ID }], error: null },
    });
    const repo = createPostsRepository(client);

    const result = await repo.createPost(AUTHOR, {
      id: CLIENT_ID,
      clientId: CLIENT_ID,
      slug: 'draft-post',
      content: '# hello',
      updatedAt: '2026-10-18T00:00:00.000Z',
    });

    expect(result).toEqual({ id: CLIENT_ID });
    expect(rpcCalls[0]?.name).toBe('upsert_post');
    expect(rpcCalls[0]?.args).toMatchObject({
      p_id: CLIENT_ID,
      p_author_id: AUTHOR,
      p_client_id: CLIENT_ID,
      p_slug: 'draft-post',
      p_content: '# hello',
      p_updated_at: '2026-10-18T00:00:00.000Z',
    });
  });

  it('a stale replay leaves the newer stored row untouched and still succeeds', async () => {
    // `upsert_post` applied last-write-wins and returned no row: another device
    // edited the post after this create was queued and lost its response.
    //
    // The stored id is the uuid the device minted in practice; it is different
    // here on purpose, so reporting it proves the id comes from the re-read
    // winner and not from the local draft.
    const storedWinner = {
      id: '22222222-2222-7222-8222-222222222222',
      author_id: AUTHOR,
      client_id: CLIENT_ID,
      slug: 'draft-post',
      content: '# newer edit',
      updated_at: '2026-10-18T09:00:00.000Z',
    };
    const { client, calls, rpcCalls } = makeClient({
      rpc: { data: [], error: null },
      tables: { posts: { data: storedWinner, error: null } },
    });
    const repo = createPostsRepository(client);

    const result = await repo.createPost(AUTHOR, {
      id: CLIENT_ID,
      clientId: CLIENT_ID,
      slug: 'draft-post',
      content: '# original',
      updatedAt: '2026-10-18T00:00:00.000Z',
    });

    expect(rpcCalls.map((call) => call.name)).toEqual(['upsert_post']);
    expect(result).toEqual({ id: storedWinner.id });
    // The replay wrote nothing: it only read the winner back, keyed on the
    // `(author_id, client_id)` identity the upsert conflicts on.
    expect(calls).toEqual([
      'posts:select *',
      `posts:eq author_id=${AUTHOR}`,
      `posts:eq client_id=${CLIENT_ID}`,
      'posts:maybeSingle',
    ]);
  });

  it('an online create mints its own id and replays through the same upsert', async () => {
    const { client, rpcCalls } = makeClient({
      rpc: { data: [{ id: 'server-minted' }], error: null },
    });
    const repo = createPostsRepository(client);

    const result = await repo.createPost(AUTHOR);

    expect(result).toEqual({ id: 'server-minted' });
    const args = rpcCalls[0]?.args ?? {};
    expect(rpcCalls[0]?.name).toBe('upsert_post');
    expect(args.p_id).toBe(args.p_client_id);
    expect(String(args.p_slug)).toMatch(/^post-[0-9a-f]{8}$/);
    expect(String(args.p_updated_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('surfaces an upsert failure instead of reporting success', async () => {
    const { client } = makeClient({ rpc: { data: null, error: { message: 'boom' } } });
    const repo = createPostsRepository(client);

    await expect(repo.createPost(AUTHOR)).rejects.toThrow();
  });
});
