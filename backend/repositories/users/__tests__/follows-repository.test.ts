import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createFollowsRepository } from '@/backend/repositories/users/follows-repository';
import { RepositoryError } from '@/backend/shared/repository-error';

const { loggerError, captureException } = vi.hoisted(() => ({
  loggerError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/backend/shared/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));

// #1369: PostgREST answers 416 for a range that starts past the last row, with
// no count in the response - the page is empty, not the read broken.
const RANGE_NOT_SATISFIABLE = { message: 'Requested range not satisfiable', code: 'PGRST103' };
const DB_ERROR = { message: 'db down', code: 'PGRST500' };

/**
 * `guardRepositoryMethods` calls every repository method as a bare function, so
 * a method that reaches a sibling through `this` finds no object. These tests
 * go through the guarded repository on purpose: the crash this covers happened
 * only in the wiring, never in a direct call to the method.
 */
function createBlocksClient(rows: Array<{ blocker_id: string; blocked_id: string }>) {
  const builder = {
    select: vi.fn(() => builder),
    or: vi.fn(async () => ({ data: rows, error: null })),
  };
  const from = vi.fn((table: string) => {
    if (table !== 'blocks') throw new Error(`unexpected table: ${table}`);
    return builder;
  });
  return { from } as unknown as SupabaseClient<Database>;
}

describe('createFollowsRepository.isBlockedEitherWay', () => {
  it('sees a block the viewer wrote', async () => {
    const repository = createFollowsRepository(
      createBlocksClient([{ blocker_id: 'viewer', blocked_id: 'target' }])
    );

    await expect(repository.isBlockedEitherWay('viewer', 'target')).resolves.toBe(true);
  });

  it('sees a block the other member wrote', async () => {
    const repository = createFollowsRepository(
      createBlocksClient([{ blocker_id: 'target', blocked_id: 'viewer' }])
    );

    await expect(repository.isBlockedEitherWay('viewer', 'target')).resolves.toBe(true);
  });

  it('answers false when neither direction is blocked', async () => {
    const repository = createFollowsRepository(
      createBlocksClient([{ blocker_id: 'viewer', blocked_id: 'someone-else' }])
    );

    await expect(repository.isBlockedEitherWay('viewer', 'target')).resolves.toBe(false);
  });
});

describe('createFollowsRepository.blockedAmong', () => {
  it('splits the viewer’s block rows into the two directions', async () => {
    const repository = createFollowsRepository(
      createBlocksClient([
        { blocker_id: 'viewer', blocked_id: 'target-a' },
        { blocker_id: 'target-b', blocked_id: 'viewer' },
        { blocker_id: 'viewer', blocked_id: 'not-requested' },
      ])
    );

    await expect(repository.blockedAmong('viewer', ['target-a', 'target-b'])).resolves.toEqual({
      blockedByViewer: ['target-a'],
      blockedViewer: ['target-b'],
    });
  });
});

/**
 * A client for one paged read: the range query answers `page`, and the count
 * query a 416 sends it on answers `total`. The count read has no terminal
 * method - it is awaited straight off `eq` - so the builder is thenable and
 * picks its answer from the `head` flag the second `select` sets.
 */
function createPageClient(options: {
  page: { data: unknown; error: unknown; count: number | null };
  total: { error?: unknown; count: number };
}) {
  let head = false;

  const builder = {
    select: vi.fn((_columns: string, selectOptions?: { head?: boolean }) => {
      head = selectOptions?.head === true;
      return builder;
    }),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(async () => options.page),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(
        head
          ? { data: null, error: options.total.error ?? null, count: options.total.count }
          : options.page
      ).then(resolve, reject),
  };

  const from = vi.fn((table: string) => {
    if (table !== 'follows') throw new Error(`unexpected table: ${table}`);
    return builder;
  });

  return { supabase: { from } as unknown as SupabaseClient<Database>, builder };
}

describe('createFollowsRepository.listFollowerIds', () => {
  it('maps a page of rows and keeps the exact total', async () => {
    const { supabase } = createPageClient({
      page: {
        data: [
          { follower_id: 'newer', followee_id: 'owner' },
          { follower_id: 'older', followee_id: 'owner' },
        ],
        error: null,
        count: 2,
      },
      total: { count: 2 },
    });
    const repository = createFollowsRepository(supabase);

    await expect(repository.listFollowerIds('owner', 1, 30)).resolves.toEqual({
      ids: ['newer', 'older'],
      total: 2,
    });
  });

  // #1369: a page past the last row used to cross the repository seam as a
  // failure and answer 500. It is an empty page, and the total still comes back
  // so the caller can send the reader to the page that exists.
  it('answers an empty page past the last row with the real total', async () => {
    const { supabase, builder } = createPageClient({
      page: { data: null, error: RANGE_NOT_SATISFIABLE, count: null },
      total: { count: 1 },
    });
    const repository = createFollowsRepository(supabase);

    await expect(repository.listFollowerIds('owner', 2, 30)).resolves.toEqual({
      ids: [],
      total: 1,
    });
    expect(builder.select).toHaveBeenCalledWith('follower_id', { count: 'exact', head: true });
  });

  it('still fails on a read error that is not an empty page', async () => {
    const { supabase } = createPageClient({
      page: { data: null, error: DB_ERROR, count: null },
      total: { count: 0 },
    });
    const repository = createFollowsRepository(supabase);

    await expect(repository.listFollowerIds('owner', 1, 30)).rejects.toBeInstanceOf(
      RepositoryError
    );
  });
});

describe('createFollowsRepository.listFollowingIds', () => {
  it('answers an empty page past the last row with the real total', async () => {
    const { supabase } = createPageClient({
      page: { data: null, error: RANGE_NOT_SATISFIABLE, count: null },
      total: { count: 42 },
    });
    const repository = createFollowsRepository(supabase);

    await expect(repository.listFollowingIds('owner', 3, 30)).resolves.toEqual({
      ids: [],
      total: 42,
    });
  });
});

/**
 * A client for one write: `.upsert(values, options)` hands back the builder and
 * `.select()` is the terminal read. `data` is what PostgREST answers - a row
 * when this call wrote the edge, nothing when the pair was already there.
 */
function createFollowClient(options: {
  data: Array<{ follower_id: string }> | null;
  error?: unknown;
}) {
  const select = vi.fn(async () => ({ data: options.data, error: options.error ?? null }));
  const upsert = vi.fn(() => ({ select }));

  const from = vi.fn((table: string) => {
    if (table !== 'follows') throw new Error(`unexpected table: ${table}`);
    return { upsert };
  });

  return { supabase: { from } as unknown as SupabaseClient<Database>, upsert };
}

describe('createFollowsRepository.follow', () => {
  it('answers true for the insert that wrote the edge', async () => {
    const { supabase, upsert } = createFollowClient({ data: [{ follower_id: 'viewer' }] });
    const repository = createFollowsRepository(supabase);

    await expect(repository.follow('viewer', 'target')).resolves.toBe(true);
    // The pair is the conflict target, so an unrelated unique violation still
    // fails instead of being read as a repeat.
    expect(upsert).toHaveBeenCalledWith(
      { follower_id: 'viewer', followee_id: 'target' },
      { onConflict: 'follower_id,followee_id', ignoreDuplicates: true }
    );
  });

  // #1371: a repeat used to come back 23505, which the repository swallowed into
  // `void` - so the service could not tell a new follow from a retried one and
  // notified again. A conflict is now "no row written", not "success".
  it('answers false when the pair was already there', async () => {
    const { supabase } = createFollowClient({ data: [] });
    const repository = createFollowsRepository(supabase);

    await expect(repository.follow('viewer', 'target')).resolves.toBe(false);
  });

  it('still fails on a write error that is not a duplicate pair', async () => {
    const { supabase } = createFollowClient({ data: null, error: DB_ERROR });
    const repository = createFollowsRepository(supabase);

    await expect(repository.follow('viewer', 'target')).rejects.toBeInstanceOf(RepositoryError);
  });
});
