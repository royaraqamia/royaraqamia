import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createFollowsRepository } from '@/backend/repositories/users/follows-repository';

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
