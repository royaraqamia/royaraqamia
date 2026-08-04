import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createUserProfileRepository } from '@/backend/repositories/users/user-profile-repository';

function makeClient() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null });
  const upsert = vi.fn().mockReturnValue({ maybeSingle });
  const from = vi.fn().mockReturnValue({ upsert });
  return { client: { from } as unknown as SupabaseClient<Database>, from, upsert, maybeSingle };
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
