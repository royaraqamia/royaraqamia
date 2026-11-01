import { describe, it, expect, vi } from 'vitest';

import { HiddenServicesService } from '@/backend/services/users/hidden-services-service';
import type { HiddenServicesRepository } from '@/backend/repositories/users/hidden-services-repository';

function repositoryDouble(current: string[]) {
  const add = vi.fn(async () => {});
  const remove = vi.fn(async () => {});
  const repository: HiddenServicesRepository = {
    list: vi.fn(async () => current),
    add,
    remove,
  };
  return { repository, add, remove };
}

describe('HiddenServicesService', () => {
  it('adds what the account did not hold and removes what it did', async () => {
    const { repository, add, remove } = repositoryDouble(['/quran', '/athkar']);
    const service = new HiddenServicesService({ hiddenServices: repository });

    const result = await service.replace('user-1', ['/quran', '/notes']);

    expect(add).toHaveBeenCalledWith('user-1', ['/notes']);
    expect(remove).toHaveBeenCalledWith('user-1', ['/athkar']);
    expect(result).toEqual(['/quran', '/notes']);
  });

  it('issues no statement when the set is unchanged', async () => {
    const { repository, add, remove } = repositoryDouble(['/quran']);
    const service = new HiddenServicesService({ hiddenServices: repository });

    await service.replace('user-1', ['/quran']);

    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('hides a route the account already hid once, not twice', async () => {
    const { repository, add } = repositoryDouble([]);
    const service = new HiddenServicesService({ hiddenServices: repository });

    const result = await service.replace('user-1', ['/quran', '/quran']);

    expect(add).toHaveBeenCalledWith('user-1', ['/quran']);
    expect(result).toEqual(['/quran']);
  });

  it('unhides everything when the set is empty', async () => {
    const { repository, add, remove } = repositoryDouble(['/quran', '/notes']);
    const service = new HiddenServicesService({ hiddenServices: repository });

    await service.replace('user-1', []);

    expect(add).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('user-1', ['/quran', '/notes']);
  });
});
