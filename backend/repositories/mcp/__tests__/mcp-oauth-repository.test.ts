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

/**
 * Revocation is also a shred. `session_enc` is the encrypted Supabase session
 * the data plane drains, so a revoked row must stop carrying it: otherwise a
 * disconnected grant leaves a replayable credential behind, and a later
 * key-rotation runbook step ("delete the rows") would have nothing extra to do.
 */
function makeRevokeClient(updateError: Error | null = null) {
  const eq = vi.fn().mockResolvedValue({ error: updateError });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table !== 'mcp_oauth_tokens') throw new Error(`unexpected table: ${table}`);
    return { update };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, update, eq };
}

describe('createMcpOAuthRepository.revokeToken', () => {
  it('marks the row revoked and shreds the encrypted bridge session', async () => {
    const { client, from, update, eq } = makeRevokeClient();
    const repo = createMcpOAuthRepository(client);

    await repo.revokeToken('tok-1');

    expect(from).toHaveBeenCalledWith('mcp_oauth_tokens');
    expect(update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
      session_enc: null,
    });
    expect(eq).toHaveBeenCalledWith('id', 'tok-1');
  });

  it('throws when the update fails', async () => {
    const { client } = makeRevokeClient(new Error('revoke failed'));
    const repo = createMcpOAuthRepository(client);

    await expect(repo.revokeToken('tok-1')).rejects.toThrow('revoke failed');
  });
});

describe('createMcpOAuthRepository.revokeAllUserTokens', () => {
  it('shreds every bridge session the user holds, not just their access rows', async () => {
    const { client, from, update, eq } = makeRevokeClient();
    const repo = createMcpOAuthRepository(client);

    await repo.revokeAllUserTokens('user-1');

    expect(from).toHaveBeenCalledWith('mcp_oauth_tokens');
    expect(update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
      session_enc: null,
    });
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('throws when the update fails', async () => {
    const { client } = makeRevokeClient(new Error('revoke all failed'));
    const repo = createMcpOAuthRepository(client);

    await expect(repo.revokeAllUserTokens('user-1')).rejects.toThrow('revoke all failed');
  });
});

/**
 * The read side of the account surface: one grant per connected client, folded
 * from that user's live token rows — the refresh rows date it, the access rows
 * show its use — plus the client registration's name.
 */
function makeGrantsClient(
  options: {
    rows?: Array<{
      client_id: string;
      kind: 'access' | 'refresh';
      created_at: string;
      last_used_at: string | null;
    }> | null;
    tokensError?: Error | null;
    clients?: Array<{ id: string; client_name: string | null }> | null;
    clientsError?: Error | null;
  } = {}
) {
  const gt = vi.fn().mockResolvedValue({
    data: options.rows ?? [],
    error: options.tokensError ?? null,
  });
  const is = vi.fn(() => ({ gt }));
  const eq = vi.fn(() => ({ eq, is }));
  const selectTokens = vi.fn(() => ({ eq }));

  const clientsIn = vi.fn().mockResolvedValue({
    data: options.clients ?? [],
    error: options.clientsError ?? null,
  });
  const selectClients = vi.fn(() => ({ in: clientsIn }));

  const from = vi.fn((table: string) => {
    if (table === 'mcp_oauth_tokens') return { select: selectTokens };
    if (table === 'mcp_oauth_clients') return { select: selectClients };
    throw new Error(`unexpected table: ${table}`);
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, eq, is, gt, selectTokens, selectClients, clientsIn };
}

describe('createMcpOAuthRepository.listUserGrants', () => {
  const NOW = new Date('2026-10-14T00:00:00.000Z');

  it('reads this user’s live rows of both kinds', async () => {
    const { client, selectTokens, eq, is, gt } = makeGrantsClient();

    await createMcpOAuthRepository(client).listUserGrants('user-1', NOW);

    expect(selectTokens).toHaveBeenCalledWith('client_id, kind, created_at, last_used_at');
    // Both kinds in one read: the refresh row is the grant, the access row is
    // the only row that carries a use worth showing.
    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(is).toHaveBeenCalledWith('revoked_at', null);
    expect(gt).toHaveBeenCalledWith('expires_at', NOW.toISOString());
  });

  it('dates a grant from its refresh rows and shows use from its access row', async () => {
    const { client, selectClients, clientsIn } = makeGrantsClient({
      rows: [
        {
          client_id: 'client-1',
          kind: 'refresh',
          created_at: '2026-10-01T10:00:00Z',
          last_used_at: null,
        },
        {
          client_id: 'client-1',
          kind: 'access',
          created_at: '2026-08-01T10:00:00Z',
          last_used_at: '2026-08-01T11:00:00Z',
        },
        {
          client_id: 'client-1',
          kind: 'refresh',
          created_at: '2026-09-01T10:00:00Z',
          last_used_at: null,
        },
        {
          client_id: 'client-1',
          kind: 'access',
          created_at: '2026-10-01T10:00:00Z',
          last_used_at: '2026-10-13T10:00:00Z',
        },
      ],
      clients: [{ id: 'client-1', client_name: 'Claude Code' }],
    });

    await expect(createMcpOAuthRepository(client).listUserGrants('user-1', NOW)).resolves.toEqual([
      {
        client_id: 'client-1',
        client_name: 'Claude Code',
        // The earliest *refresh* row dates the grant; the older access row does not.
        connected_at: '2026-09-01T10:00:00Z',
        // The newest stamp on any live row; refresh rows are never stamped.
        last_used_at: '2026-10-13T10:00:00Z',
      },
    ]);
    // The token rows carry the client's row id, so the name is keyed on `id`.
    expect(selectClients).toHaveBeenCalledWith('id, client_name');
    expect(clientsIn).toHaveBeenCalledWith('id', ['client-1']);
  });

  it('keeps the newest stamp when a later access row has not been used yet', async () => {
    const { client } = makeGrantsClient({
      rows: [
        {
          client_id: 'client-1',
          kind: 'refresh',
          created_at: '2026-09-01T10:00:00Z',
          last_used_at: null,
        },
        {
          client_id: 'client-1',
          kind: 'access',
          created_at: '2026-10-13T09:00:00Z',
          last_used_at: null,
        },
        {
          client_id: 'client-1',
          kind: 'access',
          created_at: '2026-10-12T09:00:00Z',
          last_used_at: '2026-10-12T09:30:00Z',
        },
      ],
    });

    const [grant] = await createMcpOAuthRepository(client).listUserGrants('user-1', NOW);

    expect(grant?.last_used_at).toBe('2026-10-12T09:30:00Z');
  });

  it('reports no grant when a client holds only access rows', async () => {
    const { client, selectClients } = makeGrantsClient({
      rows: [
        {
          client_id: 'client-1',
          kind: 'access',
          created_at: '2026-10-13T09:00:00Z',
          last_used_at: '2026-10-13T09:00:00Z',
        },
      ],
    });

    // No refresh row means the pair is gone: the client cannot refresh and is
    // not a connection the account area should offer to disconnect.
    await expect(createMcpOAuthRepository(client).listUserGrants('user-1', NOW)).resolves.toEqual(
      []
    );
    expect(selectClients).not.toHaveBeenCalled();
  });

  it('compares timestamps as instants, not as strings', async () => {
    // 07:00-03:00 is 10:00Z, an hour *before* the 13:00Z row whose string sorts first.
    const { client } = makeGrantsClient({
      rows: [
        {
          client_id: 'client-1',
          kind: 'refresh',
          created_at: '2026-09-01T13:00:00Z',
          last_used_at: null,
        },
        {
          client_id: 'client-1',
          kind: 'refresh',
          created_at: '2026-09-01T07:00:00-03:00',
          last_used_at: null,
        },
      ],
    });

    const [grant] = await createMcpOAuthRepository(client).listUserGrants('user-1', NOW);

    expect(grant?.connected_at).toBe('2026-09-01T07:00:00-03:00');
  });

  it('keeps a grant whose registration is gone, unnamed', async () => {
    const { client } = makeGrantsClient({
      rows: [
        {
          client_id: 'client-1',
          kind: 'refresh',
          created_at: '2026-09-01T10:00:00Z',
          last_used_at: null,
        },
      ],
      clients: [],
    });

    const [grant] = await createMcpOAuthRepository(client).listUserGrants('user-1', NOW);

    expect(grant).toMatchObject({ client_id: 'client-1', client_name: null });
  });

  it('skips the client lookup when the user has no live grants', async () => {
    const { client, selectClients } = makeGrantsClient({ rows: [] });

    await expect(createMcpOAuthRepository(client).listUserGrants('user-1', NOW)).resolves.toEqual(
      []
    );
    expect(selectClients).not.toHaveBeenCalled();
  });

  it('throws when the token read fails', async () => {
    const { client } = makeGrantsClient({ tokensError: new Error('tokens down') });

    await expect(createMcpOAuthRepository(client).listUserGrants('user-1', NOW)).rejects.toThrow(
      'tokens down'
    );
  });

  it('throws when the client lookup fails', async () => {
    const { client } = makeGrantsClient({
      rows: [
        {
          client_id: 'client-1',
          kind: 'refresh',
          created_at: '2026-09-01T10:00:00Z',
          last_used_at: null,
        },
      ],
      clientsError: new Error('clients down'),
    });

    await expect(createMcpOAuthRepository(client).listUserGrants('user-1', NOW)).rejects.toThrow(
      'clients down'
    );
  });
});

/**
 * The read side of a live revoke: a user's live bridge ciphertexts, read *before*
 * the shred that would take them away, optionally narrowed to one grant.
 */
function makeSessionEncClient(
  options: { rows?: Array<{ session_enc: string | null }>; error?: Error | null } = {}
) {
  const result = { data: options.rows ?? [], error: options.error ?? null };
  // `not` doubles as the chain link (when a client filter follows) and as the
  // awaited result of the user-scoped read.
  const clientEq = vi.fn().mockResolvedValue(result);
  const not = vi.fn(() => Object.assign(Promise.resolve(result), { eq: clientEq }));
  const userEq = vi.fn(() => ({ not }));
  const select = vi.fn(() => ({ eq: userEq }));

  const from = vi.fn((table: string) => {
    if (table !== 'mcp_oauth_tokens') throw new Error(`unexpected table: ${table}`);
    return { select };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, select, userEq, not, clientEq };
}

describe('createMcpOAuthRepository.listUserSessionEncs', () => {
  it('reads this user’s live ciphertexts, ignoring shredded rows', async () => {
    const { client, select, userEq, not, clientEq } = makeSessionEncClient({
      rows: [{ session_enc: 'enc-a' }, { session_enc: null }, { session_enc: 'enc-b' }],
    });

    await expect(createMcpOAuthRepository(client).listUserSessionEncs('user-1')).resolves.toEqual([
      'enc-a',
      'enc-b',
    ]);

    expect(select).toHaveBeenCalledWith('session_enc');
    expect(userEq).toHaveBeenCalledWith('user_id', 'user-1');
    // A row without a ciphertext is a revoked or retired one: there is nothing
    // left in it to revoke.
    expect(not).toHaveBeenCalledWith('session_enc', 'is', null);
    expect(clientEq).not.toHaveBeenCalled();
  });

  it('narrows to one client’s grant when asked for a single disconnect', async () => {
    const { client, userEq, clientEq } = makeSessionEncClient({
      rows: [{ session_enc: 'enc-a' }],
    });

    await expect(
      createMcpOAuthRepository(client).listUserSessionEncs('user-1', 'client-1')
    ).resolves.toEqual(['enc-a']);

    expect(userEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(clientEq).toHaveBeenCalledWith('client_id', 'client-1');
  });

  it('reports no sessions when the user holds none', async () => {
    const { client } = makeSessionEncClient({ rows: [] });

    await expect(createMcpOAuthRepository(client).listUserSessionEncs('user-1')).resolves.toEqual(
      []
    );
  });

  it('throws when the read fails', async () => {
    const { client } = makeSessionEncClient({ error: new Error('tokens down') });

    await expect(createMcpOAuthRepository(client).listUserSessionEncs('user-1')).rejects.toThrow(
      'tokens down'
    );
  });
});

/** `revokeUserClientTokens` chains two `.eq()`s: user, then client. */
function makeClientRevokeClient(updateError: Error | null = null) {
  const clientEq = vi.fn().mockResolvedValue({ error: updateError });
  const userEq = vi.fn(() => ({ eq: clientEq }));
  const update = vi.fn(() => ({ eq: userEq }));
  const from = vi.fn((table: string) => {
    if (table !== 'mcp_oauth_tokens') throw new Error(`unexpected table: ${table}`);
    return { update };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, update, userEq, clientEq };
}

describe('createMcpOAuthRepository.revokeUserClientTokens', () => {
  it('shreds only that client’s rows for that user', async () => {
    const { client, update, userEq, clientEq } = makeClientRevokeClient();

    await createMcpOAuthRepository(client).revokeUserClientTokens('user-1', 'client-1');

    expect(update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
      session_enc: null,
    });
    expect(userEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(clientEq).toHaveBeenCalledWith('client_id', 'client-1');
  });

  it('throws when the update fails', async () => {
    const { client } = makeClientRevokeClient(new Error('disconnect failed'));

    await expect(
      createMcpOAuthRepository(client).revokeUserClientTokens('user-1', 'client-1')
    ).rejects.toThrow('disconnect failed');
  });
});

/**
 * A live authorization code exchanges for a fresh token pair and carries its own
 * bridge ciphertext, so a disconnect has to drop it too — otherwise a client
 * mid-exchange mints a grant the revoke has already passed.
 */
function makeAuthCodeDeleteClient(deleteError: Error | null = null) {
  const clientEq = vi.fn().mockResolvedValue({ error: deleteError });
  // Doubles as the chain link (`.eq()` returns the client-scoped filter) and as
  // the awaited result of the user-scoped delete, which has only one `.eq()`.
  const userEq = vi.fn(() => ({ eq: clientEq, error: deleteError }));
  const deleteFrom = vi.fn(() => ({ eq: userEq }));
  const from = vi.fn((table: string) => {
    if (table !== 'mcp_oauth_auth_codes') throw new Error(`unexpected table: ${table}`);
    return { delete: deleteFrom };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, deleteFrom, userEq, clientEq };
}

describe('createMcpOAuthRepository.deleteUserClientAuthCodes', () => {
  it('drops one client’s codes for that user only', async () => {
    const { client, deleteFrom, userEq, clientEq } = makeAuthCodeDeleteClient();

    await createMcpOAuthRepository(client).deleteUserClientAuthCodes('user-1', 'client-1');

    expect(deleteFrom).toHaveBeenCalled();
    expect(userEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(clientEq).toHaveBeenCalledWith('client_id', 'client-1');
  });

  it('throws when the delete fails', async () => {
    const { client } = makeAuthCodeDeleteClient(new Error('code delete failed'));

    await expect(
      createMcpOAuthRepository(client).deleteUserClientAuthCodes('user-1', 'client-1')
    ).rejects.toThrow('code delete failed');
  });
});

describe('createMcpOAuthRepository.deleteUserAuthCodes', () => {
  it('drops every code the user holds, across clients', async () => {
    const { client, userEq, clientEq } = makeAuthCodeDeleteClient();

    await createMcpOAuthRepository(client).deleteUserAuthCodes('user-1');

    expect(userEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(clientEq).not.toHaveBeenCalled();
  });

  it('throws when the delete fails', async () => {
    const { client } = makeAuthCodeDeleteClient(new Error('code delete failed'));

    await expect(createMcpOAuthRepository(client).deleteUserAuthCodes('user-1')).rejects.toThrow(
      'code delete failed'
    );
  });
});
