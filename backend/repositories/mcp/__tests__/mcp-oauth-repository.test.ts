import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createMcpOAuthRepository } from '@/backend/repositories/mcp/mcp-oauth-repository';

/**
 * `markAuthCodeUsed` is the replay guard: it must only flip `used_at` while it
 * is still null and report whether this caller won the claim. The chain is
 * `update({...}).eq('id', id).is('used_at', null).select('id').maybeSingle()`.
 */
function makeClient(
  overrides: {
    updatedRow?: { id: string } | null;
    updateError?: Error | null;
  } = {}
) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: overrides.updatedRow ?? null,
    error: overrides.updateError ?? null,
  });
  const selectUpdated = vi.fn(() => ({ maybeSingle }));
  const is = vi.fn(() => ({ select: selectUpdated }));
  const eq = vi.fn(() => ({ is }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table !== 'mcp_oauth_auth_codes') throw new Error(`unexpected table: ${table}`);
    return { update };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, update, eq, is, selectUpdated, maybeSingle };
}

describe('createMcpOAuthRepository.markAuthCodeUsed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims an unused code and reports success', async () => {
    const { client, from, update, eq, is, selectUpdated } = makeClient({
      updatedRow: { id: 'code-1' },
    });
    const repo = createMcpOAuthRepository(client);

    await expect(repo.markAuthCodeUsed('code-1')).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith('mcp_oauth_auth_codes');
    expect(update).toHaveBeenCalledWith({ used_at: expect.any(String) });
    expect(eq).toHaveBeenCalledWith('id', 'code-1');
    // The guard: only rows whose used_at is still null can be claimed.
    expect(is).toHaveBeenCalledWith('used_at', null);
    expect(selectUpdated).toHaveBeenCalledWith('id');
  });

  it('reports a lost race when no unused row matched', async () => {
    const { client } = makeClient({ updatedRow: null });
    const repo = createMcpOAuthRepository(client);

    await expect(repo.markAuthCodeUsed('code-1')).resolves.toBe(false);
  });

  it('throws when the update fails', async () => {
    const { client } = makeClient({ updateError: new Error('update failed') });
    const repo = createMcpOAuthRepository(client);

    await expect(repo.markAuthCodeUsed('code-1')).rejects.toThrow('update failed');
  });
});
