import { describe, it, expect, vi } from 'vitest';
import { BulkLinkActionService } from '@/backend/services/linksnap/bulk-link-action';
import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';

function makeDeps() {
  return {
    shortLinkRepository: {
      delete: vi.fn(),
      deleteMany: vi.fn(),
      setExpiryMany: vi.fn(),
      exists: vi.fn(),
    } as unknown as ShortLinkRepository,
  };
}

describe('BulkLinkActionService.execute', () => {
  it('deletes the selected unique codes', async () => {
    const { shortLinkRepository } = makeDeps();
    const service = new BulkLinkActionService(shortLinkRepository);

    const result = await service.execute('delete', ['a', 'b', 'a', ''], 'u-1');

    expect(result).toEqual({ action: 'delete', affected: 2 });
    expect(shortLinkRepository.deleteMany).toHaveBeenCalledWith(['a', 'b'], 'u-1');
  });

  it('sets expiry for the selected unique codes', async () => {
    const { shortLinkRepository } = makeDeps();
    const service = new BulkLinkActionService(shortLinkRepository);
    const expiresAt = new Date('2026-09-01T00:00:00Z');

    const result = await service.execute('setExpiry', ['a', 'b'], 'u-1', expiresAt);

    expect(result).toEqual({ action: 'setExpiry', affected: 2 });
    expect(shortLinkRepository.setExpiryMany).toHaveBeenCalledWith(['a', 'b'], expiresAt, 'u-1');
  });

  it('clears expiry when expiresAt is null for setExpiry', async () => {
    const { shortLinkRepository } = makeDeps();
    const service = new BulkLinkActionService(shortLinkRepository);

    await service.execute('setExpiry', ['a'], 'u-1', null);

    expect(shortLinkRepository.setExpiryMany).toHaveBeenCalledWith(['a'], null, 'u-1');
  });

  it('throws when no codes are provided', async () => {
    const { shortLinkRepository } = makeDeps();
    const service = new BulkLinkActionService(shortLinkRepository);
    await expect(service.execute('delete', [], 'u-1')).rejects.toThrow(
      'يجب اختيار رابط واحد على الأقل.'
    );
    expect(shortLinkRepository.deleteMany).not.toHaveBeenCalled();
  });

  it('throws when setExpiry has no expiry date', async () => {
    const { shortLinkRepository } = makeDeps();
    const service = new BulkLinkActionService(shortLinkRepository);
    await expect(service.execute('setExpiry', ['a'], 'u-1')).rejects.toThrow(
      'يجب تحديد تاريخ انتهاء الصلاحية.'
    );
    expect(shortLinkRepository.setExpiryMany).not.toHaveBeenCalled();
  });

  it('throws when the user is not authenticated', async () => {
    const { shortLinkRepository } = makeDeps();
    const service = new BulkLinkActionService(shortLinkRepository);
    await expect(service.execute('delete', ['a'], '')).rejects.toThrow(
      'User authorization is required to manage links.'
    );
    expect(shortLinkRepository.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates repository errors', async () => {
    const { shortLinkRepository } = makeDeps();
    (shortLinkRepository.deleteMany as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down')
    );
    const service = new BulkLinkActionService(shortLinkRepository);
    await expect(service.execute('delete', ['a'], 'u-1')).rejects.toThrow('db down');
  });
});
