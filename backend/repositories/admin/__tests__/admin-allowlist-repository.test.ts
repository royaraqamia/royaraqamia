import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createAdminAllowlistRepository } from '@/backend/repositories/admin/admin-allowlist-repository';

function makeClient(adminEmails: string[] | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: adminEmails ? { admin_emails: adminEmails } : null });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
  const upsert = vi.fn().mockResolvedValue(undefined);
  const rpc = vi.fn().mockResolvedValue(undefined);
  const from = vi
    .fn()
    .mockImplementation((table: string) =>
      table === 'app_settings' ? { select, upsert } : {}
    );
  return {
    client: { from, rpc } as unknown as SupabaseClient<Database>,
    select,
    upsert,
    rpc,
  };
}

describe('createAdminAllowlistRepository', () => {
  it('does not write when the stored allowlist already matches', async () => {
    const { client, select, upsert, rpc } = makeClient(['a@x.com', 'b@x.com']);

    await createAdminAllowlistRepository(client).sync(['a@x.com', 'b@x.com']);

    expect(select).toHaveBeenCalledWith('admin_emails');
    expect(upsert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('upserts the allowlist and recomputes flags when it differs', async () => {
    const { client, upsert, rpc } = makeClient(['a@x.com']);

    await createAdminAllowlistRepository(client).sync(['a@x.com', 'c@x.com']);

    expect(upsert).toHaveBeenCalledWith({ id: true, admin_emails: ['a@x.com', 'c@x.com'] });
    expect(rpc).toHaveBeenCalledWith('recompute_admin_flags', {
      p_emails: ['a@x.com', 'c@x.com'],
    });
  });

  it('writes when nothing is stored yet', async () => {
    const { client, upsert, rpc } = makeClient(null);

    await createAdminAllowlistRepository(client).sync(['a@x.com']);

    expect(upsert).toHaveBeenCalledWith({ id: true, admin_emails: ['a@x.com'] });
    expect(rpc).toHaveBeenCalledWith('recompute_admin_flags', { p_emails: ['a@x.com'] });
  });
});
