import { describe, it, expect, vi } from 'vitest';
import { PushDeviceService } from '@/backend/services/push/device-service';
import type { DevicePushTokenRepository } from '@/backend/repositories/push/device-push-tokens-repository';

function makeRepository() {
  const repository: DevicePushTokenRepository = {
    upsert: vi.fn(async () => undefined),
    findByUserId: vi.fn(async () => []),
    findForUsers: vi.fn(async () => []),
    removeByToken: vi.fn(async () => undefined),
    removeToken: vi.fn(async () => undefined),
  };
  return repository;
}

describe('PushDeviceService', () => {
  it('registers a token against the session user', async () => {
    const repository = makeRepository();
    const service = new PushDeviceService({ repository });
    const input = { token: 'device-a', platform: 'ios' as const, userAgent: 'App/1' };

    await service.register('u-1', input);

    expect(repository.upsert).toHaveBeenCalledWith('u-1', input);
  });

  it('unregisters a token scoped to the session user', async () => {
    const repository = makeRepository();
    const service = new PushDeviceService({ repository });

    await service.unregister('u-1', 'device-a');

    expect(repository.removeByToken).toHaveBeenCalledWith('u-1', 'device-a');
  });
});
