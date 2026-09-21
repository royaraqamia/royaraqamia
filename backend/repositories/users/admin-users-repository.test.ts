import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createAdminUsersRepository } from '@/backend/repositories/users/admin-users-repository';

function makeClient(rows: Array<{ id: string }>) {
  const result = { data: rows };
  const eq = vi.fn().mockResolvedValue(result);
  const inFilter = vi.fn().mockResolvedValue(result);
  const builder = Object.assign(Promise.resolve(result), { eq, in: inFilter });
  const select = vi.fn().mockReturnValue(builder);
  const from = vi.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    select,
    eq,
  };
}

describe('createAdminUsersRepository', () => {
  it('reads the Admin audience from the derived is_admin flag', async () => {
    const { client, from, select, eq } = makeClient([{ id: 'admin-1' }]);
    const repository = createAdminUsersRepository(client);

    await expect(repository.findAdminUserIds()).resolves.toEqual(['admin-1']);

    expect(from).toHaveBeenCalledWith('users');
    expect(select).toHaveBeenCalledWith('id');
    expect(eq).toHaveBeenCalledWith('is_admin', true);
  });

  it('reads every user id for all-user announcements', async () => {
    const { client, from, select } = makeClient([{ id: 'u-1' }, { id: 'u-2' }]);
    const repository = createAdminUsersRepository(client);

    await expect(repository.findAllUserIds()).resolves.toEqual(['u-1', 'u-2']);

    expect(from).toHaveBeenCalledWith('users');
    expect(select).toHaveBeenCalledWith('id');
  });
});
