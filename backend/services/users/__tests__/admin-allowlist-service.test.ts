import { describe, it, expect, vi } from 'vitest';
import type { AdminAllowlistRepository } from '@/backend/repositories/admin/admin-allowlist-repository';
import { AdminAllowlistService } from '@/backend/services/users/admin-allowlist-service';

function makeRepository(current: string[]) {
  const read = vi.fn().mockResolvedValue(current);
  const sync = vi.fn().mockResolvedValue(undefined);
  return { repository: { read, sync } as AdminAllowlistRepository, read, sync };
}

describe('AdminAllowlistService', () => {
  it('reports in sync without writing when the lists match', async () => {
    const { repository, sync } = makeRepository(['a@x.com']);

    const result = await new AdminAllowlistService(repository).sync(['a@x.com']);

    expect(result).toMatchObject({
      inSync: true,
      applied: false,
      allowlistSize: 1,
      databaseSize: 1,
    });
    expect(sync).not.toHaveBeenCalled();
  });

  it('reports the difference without writing on a dry run', async () => {
    const { repository, sync } = makeRepository(['a@x.com']);

    const result = await new AdminAllowlistService(repository).sync(['b@x.com'], { dryRun: true });

    expect(result).toMatchObject({
      inSync: false,
      applied: false,
      allowlistSize: 1,
      databaseSize: 1,
    });
    expect(sync).not.toHaveBeenCalled();
  });

  it('writes and reports applied when the lists differ', async () => {
    const { repository, sync } = makeRepository(['a@x.com']);

    const result = await new AdminAllowlistService(repository).sync(['b@x.com']);

    expect(result).toMatchObject({
      inSync: true,
      applied: true,
      allowlistSize: 1,
      databaseSize: 1,
    });
    expect(sync).toHaveBeenCalledWith(['b@x.com']);
  });

  it('treats the same addresses in a different order as in sync', async () => {
    const { repository, sync } = makeRepository(['b@x.com', 'a@x.com']);

    const result = await new AdminAllowlistService(repository).sync(['a@x.com', 'b@x.com']);

    expect(result.inSync).toBe(true);
    expect(sync).not.toHaveBeenCalled();
  });

  it('applies an empty allowlist, matching the fail-closed app guard', async () => {
    const { repository, sync } = makeRepository(['a@x.com']);

    const result = await new AdminAllowlistService(repository).sync([]);

    expect(result).toMatchObject({ inSync: true, applied: true, allowlistSize: 0 });
    expect(sync).toHaveBeenCalledWith([]);
  });
});
