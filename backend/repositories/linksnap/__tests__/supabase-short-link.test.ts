import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseShortLinkRepository } from '@/backend/repositories/linksnap/supabase-short-link';

interface Result {
  data: unknown;
  error: unknown;
}

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

  select() {
    return this.log('select');
  }
  insert(row: unknown) {
    return this.log(`insert ${JSON.stringify(row)}`);
  }
  update(row: unknown) {
    return this.log(`update ${JSON.stringify(row)}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
  }
  in(column: string, values: unknown[]) {
    return this.log(`in ${column}=${values.join(',')}`);
  }
  lte(column: string, value: unknown) {
    return this.log(`lte ${column}=${String(value)}`);
  }
  order(column: string) {
    return this.log(`order ${column}`);
  }
  maybeSingle() {
    this.log('maybeSingle');
    return Promise.resolve(this.result());
  }
  single() {
    this.log('single');
    return Promise.resolve(this.result());
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

function makeClient(
  results: Record<string, Result> = {},
  rpcResult: Result = { data: null, error: null }
) {
  const calls: string[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const from = vi.fn(
    (table: string) =>
      new Builder(table, calls, () => results[table] ?? { data: null, error: null })
  );
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcResult);
  });
  return { client: { from, rpc } as unknown as SupabaseClient, calls, rpcCalls };
}

const linkRow = {
  code: 'abc123',
  original_url: 'https://x.example',
  user_id: 'u-1',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  is_blocked: false,
  expires_at: null,
  password_hash: null,
  client_id: '11111111-1111-7111-8111-111111111111',
  deleted_at: null,
};

describe('SupabaseShortLinkRepository — offline last-write-wins', () => {
  it('update is guarded by updated_at (a stale replay cannot revive a newer delete)', async () => {
    const { client, calls } = makeClient({ short_links: { data: [linkRow], error: null } });
    const repo = new SupabaseShortLinkRepository(client);
    const updatedAt = '2026-08-05T00:00:00.000Z';

    await repo.update('abc123', { originalUrl: 'https://y.example' }, { updatedAt });

    expect(calls.some((c) => c.includes(`lte updated_at=${updatedAt}`))).toBe(true);
    expect(calls.find((c) => c.includes('update'))).toContain(`"updated_at":"${updatedAt}"`);
  });

  it('findByCode resolves a password-protected link through the privileged client', async () => {
    const protectedRow = { ...linkRow, password_hash: 'scrypt:salt:hash' };
    const { client, calls } = makeClient({ short_links: { data: protectedRow, error: null } });
    const repo = new SupabaseShortLinkRepository(client);

    const link = await repo.findByCode('abc123');

    // The hash is read server-side (service role); `anon` no longer holds SELECT
    // on short_links, so it can never reach the Data API (see the
    // *_narrow_short_links_public_read.sql migration).
    expect(link?.passwordHash).toBe('scrypt:salt:hash');
    expect(calls).toContain('short_links:select');
    expect(calls).toContain('short_links:eq code=abc123');
    expect(calls).toContain('short_links:single');
  });

  it('delete tombstones with last-write-wins on updated_at', async () => {
    const { client, calls } = makeClient({ short_links: { data: [], error: null } });
    const repo = new SupabaseShortLinkRepository(client);
    const updatedAt = '2026-08-05T00:00:00.000Z';

    await repo.delete('abc123', 'u-1', { updatedAt });

    expect(calls.some((c) => c.includes(`lte updated_at=${updatedAt}`))).toBe(true);
    expect(calls.find((c) => c.includes('update'))).toContain(`"deleted_at":"${updatedAt}"`);
  });

  describe('bulk writes', () => {
    it('deleteMany tombstones instead of deleting, and counts the matched rows', async () => {
      const { client, calls } = makeClient({
        short_links: { data: [{ code: 'a' }, { code: 'b' }], error: null },
      });
      const repo = new SupabaseShortLinkRepository(client);

      const affected = await repo.deleteMany(['a', 'b', 'foreign'], 'u-1');

      // A tombstone, not a hard delete: `analytics_events` cascades on DELETE.
      const update = calls.find((c) => c.includes('update'));
      expect(calls).not.toContain('short_links:delete');
      expect(update).toContain('"deleted_at":');
      expect(update).toContain('"updated_at":');
      expect(calls).toContain('short_links:in code=a,b,foreign');
      expect(calls).toContain('short_links:eq user_id=u-1');
      // Already-tombstoned rows are left alone, so a replay stays a no-op.
      expect(calls).toContain('short_links:is deleted_at=null');
      // The answer is what the database matched, not how many codes were sent.
      expect(affected).toBe(2);
    });

    it('deleteMany reports 0 when nothing matched', async () => {
      const { client } = makeClient({ short_links: { data: [], error: null } });
      const repo = new SupabaseShortLinkRepository(client);

      expect(await repo.deleteMany(['foreign'], 'u-1')).toBe(0);
    });

    it('setExpiryMany advances updated_at so the change wins the merge', async () => {
      const { client, calls } = makeClient({
        short_links: { data: [{ code: 'a' }], error: null },
      });
      const repo = new SupabaseShortLinkRepository(client);
      const expiresAt = new Date('2026-09-01T00:00:00.000Z');

      const affected = await repo.setExpiryMany(['a'], expiresAt, 'u-1');

      const update = calls.find((c) => c.includes('update'));
      expect(update).toContain(`"expires_at":"${expiresAt.toISOString()}"`);
      // Without this, last-write-wins sees equal timestamps and the other
      // device never applies the new expiry.
      expect(update).toContain('"updated_at":"');
      expect(calls).toContain('short_links:eq user_id=u-1');
      expect(calls).toContain('short_links:is deleted_at=null');
      expect(affected).toBe(1);
    });
  });

  it('listByUserIdIncludingDeleted keeps tombstones in the sync snapshot', async () => {
    const deletedAt = '2026-08-05T00:00:00.000Z';
    const { client, calls } = makeClient({
      short_links: { data: [{ ...linkRow, deleted_at: deletedAt }], error: null },
    });
    const repo = new SupabaseShortLinkRepository(client);

    const links = await repo.listByUserIdIncludingDeleted('u-1');

    // The sync read is deliberately unfiltered by `deleted_at`; the display
    // read (`listByUserId`) keeps its tombstone filter.
    expect(calls).not.toContain('short_links:is deleted_at=null');
    expect(calls).toContain('short_links:eq user_id=u-1');
    expect(links[0]?.deletedAt).toEqual(new Date(deletedAt));
  });

  describe('create — replayed create is last-write-wins', () => {
    const link = {
      code: 'abc123',
      originalUrl: 'https://x.example',
      userId: 'u-1',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      isBlocked: false,
      expiresAt: null,
      passwordHash: null,
      clientId: '11111111-1111-7111-8111-111111111111',
      deletedAt: null,
    };

    it('a newer create applies through the LWW RPC', async () => {
      const { client, rpcCalls } = makeClient({}, { data: [linkRow], error: null });
      const repo = new SupabaseShortLinkRepository(client);

      const result = await repo.create(link);

      expect(rpcCalls[0]?.name).toBe('upsert_short_link');
      expect(rpcCalls[0]?.args).toMatchObject({
        p_code: 'abc123',
        p_user_id: 'u-1',
        p_client_id: '11111111-1111-7111-8111-111111111111',
        p_updated_at: '2026-08-01T00:00:00.000Z',
      });
      expect(result.code).toBe('abc123');
    });

    it('a stale create replay returns the stored winner', async () => {
      const newer = {
        ...linkRow,
        original_url: 'https://newer.example',
        updated_at: '2026-08-06T00:00:00.000Z',
      };
      const { client } = makeClient(
        { short_links: { data: newer, error: null } },
        { data: [], error: null }
      );
      const repo = new SupabaseShortLinkRepository(client);

      const result = await repo.create(link);

      expect(result.originalUrl).toBe('https://newer.example');
      expect(result.updatedAt).toEqual(new Date('2026-08-06T00:00:00.000Z'));
    });

    it('falls back to a plain insert without a client id', async () => {
      const { client, calls, rpcCalls } = makeClient({
        short_links: { data: linkRow, error: null },
      });
      const repo = new SupabaseShortLinkRepository(client);

      await repo.create({ ...link, clientId: null });

      expect(rpcCalls).toEqual([]);
      expect(calls.some((c) => c.startsWith('short_links:insert'))).toBe(true);
    });
  });
});
