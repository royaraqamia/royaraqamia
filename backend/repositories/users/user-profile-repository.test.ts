import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createUserProfileRepository } from '@/backend/repositories/users/user-profile-repository';

function makeClient() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null });
  const upsert = vi.fn().mockReturnValue({ maybeSingle });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upsert, insert });
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    upsert,
    insert,
    maybeSingle,
  };
}

describe('createUserProfileRepository', () => {
  it('upserts the public users table with the profile payload', async () => {
    const { client, from, upsert, maybeSingle } = makeClient();
    const repository = createUserProfileRepository(client);

    await repository.upsert({
      id: 'u-1',
      email: 'user@example.com',
      name: 'مستخدم',
      avatar_url: 'https://avatar.com/1',
    });

    expect(from).toHaveBeenCalledWith('users');
    const [payload] = upsert.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      id: 'u-1',
      email: 'user@example.com',
      name: 'مستخدم',
      avatar_url: 'https://avatar.com/1',
    });
    expect(payload.created_at).toBeDefined();
    expect(maybeSingle).toHaveBeenCalled();
  });

  it('defaults a missing avatar to null', async () => {
    const { client, upsert } = makeClient();
    const repository = createUserProfileRepository(client);

    await repository.upsert({ id: 'u-1', email: 'user@example.com', name: 'مستخدم' });

    const [payload] = upsert.mock.calls[0] as [Record<string, unknown>];
    expect(payload.avatar_url).toBeNull();
  });
});

describe('createUserProfileRepository.createIfAbsent', () => {
  it('inserts the profile when no row exists', async () => {
    const { client, insert } = makeClient();
    const repository = createUserProfileRepository(client);

    await repository.createIfAbsent({
      id: 'u-1',
      email: 'oauth@example.com',
      name: 'OAuth User',
      avatar_url: 'https://avatar.com/1',
    });

    const [payload] = insert.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      id: 'u-1',
      email: 'oauth@example.com',
      name: 'OAuth User',
      avatar_url: 'https://avatar.com/1',
    });
  });

  it('swallows a unique-violation so an existing row is never overwritten', async () => {
    const { client, insert } = makeClient();
    insert.mockResolvedValue({ error: { code: '23505' } });
    const repository = createUserProfileRepository(client);

    await expect(
      repository.createIfAbsent({ id: 'u-1', email: 'oauth@example.com', name: 'OAuth User' })
    ).resolves.toBeUndefined();
  });

  it('rethrows any other insert error', async () => {
    const { client, insert } = makeClient();
    insert.mockResolvedValue({ error: { code: '23503' } });
    const repository = createUserProfileRepository(client);

    await expect(
      repository.createIfAbsent({ id: 'u-1', email: 'oauth@example.com', name: 'OAuth User' })
    ).rejects.toMatchObject({ code: '23503' });
  });
});
