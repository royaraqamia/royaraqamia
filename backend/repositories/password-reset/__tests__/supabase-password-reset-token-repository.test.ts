import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';

import { SupabasePasswordResetTokenRepository } from '@/backend/repositories/password-reset/supabase-password-reset-token-repository';

interface TokenRecord {
  id: string;
  email: string;
  user_id: string;
  token_hash: string;
  salt: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

function makeClient(
  overrides: {
    insertError?: Error | null;
    record?: TokenRecord | null;
    fetchError?: Error | null;
    updateError?: Error | null;
  } = {}
) {
  const insert = vi.fn().mockResolvedValue({ error: overrides.insertError ?? null });
  const updateEq = vi.fn().mockResolvedValue({ error: overrides.updateError ?? null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: overrides.record ?? null, error: overrides.fetchError ?? null });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const is = vi.fn().mockReturnValue({ order });
  const selectEq = vi.fn().mockReturnValue({ is });
  const select = vi.fn().mockReturnValue({ eq: selectEq });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table !== 'password_reset_tokens') throw new Error(`unexpected table: ${table}`);
    return { insert, select, update };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, insert, update, updateEq, maybeSingle, from, selectEq, is };
}

function makeRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id: 'token-1',
    email: 'user@example.com',
    user_id: 'user-1',
    token_hash: 'hash',
    salt: 'salt',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('SupabasePasswordResetTokenRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createToken', () => {
    it('inserts the token record', async () => {
      const { client, insert, from } = makeClient();
      const repo = new SupabasePasswordResetTokenRepository(client);
      const expiresAt = new Date('2026-08-04T10:00:00.000Z');

      await repo.createToken({
        email: 'user@example.com',
        userId: 'user-1',
        tokenHash: 'hash123',
        salt: 'salt456',
        expiresAt,
      });

      expect(from).toHaveBeenCalledWith('password_reset_tokens');
      expect(insert).toHaveBeenCalledWith({
        email: 'user@example.com',
        user_id: 'user-1',
        token_hash: 'hash123',
        salt: 'salt456',
        expires_at: '2026-08-04T10:00:00.000Z',
      });
    });

    it('throws when the insert fails', async () => {
      const { client } = makeClient({ insertError: new Error('insert failed') });
      const repo = new SupabasePasswordResetTokenRepository(client);
      await expect(
        repo.createToken({
          email: 'user@example.com',
          userId: 'user-1',
          tokenHash: 'h',
          salt: 's',
          expiresAt: new Date(),
        })
      ).rejects.toThrow('insert failed');
    });
  });

  describe('findLatestValidToken', () => {
    it('returns null when no record exists or a fetch error occurs', async () => {
      const { client } = makeClient({ record: null });
      const repo = new SupabasePasswordResetTokenRepository(client);
      await expect(repo.findLatestValidToken('user@example.com')).resolves.toBeNull();

      makeClient({ fetchError: new Error('db down') });
      await expect(repo.findLatestValidToken('user@example.com')).resolves.toBeNull();
    });

    it('returns the mapped record for a valid token', async () => {
      const record = makeRecord({ user_id: 'user-1' });
      const { client, selectEq, is } = makeClient({ record });
      const repo = new SupabasePasswordResetTokenRepository(client);

      await expect(repo.findLatestValidToken('user@example.com')).resolves.toEqual({
        id: 'token-1',
        tokenHash: 'hash',
        salt: 'salt',
        expiresAt: new Date(record.expires_at),
        usedAt: null,
        userId: 'user-1',
        email: 'user@example.com',
      });
      expect(selectEq).toHaveBeenCalledWith('email', 'user@example.com');
      expect(is).toHaveBeenCalledWith('used_at', null);
    });
  });

  describe('markTokenAsUsed', () => {
    it('sets used_at on the record', async () => {
      const { client, update, updateEq } = makeClient();
      const repo = new SupabasePasswordResetTokenRepository(client);

      await repo.markTokenAsUsed('token-1');

      expect(update).toHaveBeenCalledWith({ used_at: expect.any(String) });
      expect(updateEq).toHaveBeenCalledWith('id', 'token-1');
    });

    it('throws when the update fails', async () => {
      const { client } = makeClient({ updateError: new Error('update failed') });
      const repo = new SupabasePasswordResetTokenRepository(client);
      await expect(repo.markTokenAsUsed('token-1')).rejects.toThrow('update failed');
    });
  });
});
