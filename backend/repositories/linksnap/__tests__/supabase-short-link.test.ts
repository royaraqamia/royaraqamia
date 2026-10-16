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
  update(row: unknown) {
    return this.log(`update ${JSON.stringify(row)}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
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

function makeClient(results: Record<string, Result> = {}) {
  const calls: string[] = [];
  const from = vi.fn(
    (table: string) =>
      new Builder(table, calls, () => results[table] ?? { data: null, error: null })
  );
  return { client: { from } as unknown as SupabaseClient, calls };
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
});
