import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModerateLinkService } from '@/backend/services/linksnap/moderate-link';
import { GetSystemStatsService } from '@/backend/services/linksnap/get-system-stats';
import type { IShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import type { IAdminRepository } from '@/backend/repositories/linksnap/admin-repository';
import type { ShortLink } from '@/shared/contracts/linksnap';

const adminEmails = ['admin@example.com'];

const now = new Date('2026-08-02T08:00:00.000Z');

const linkFixture: ShortLink = {
  code: 'abc123',
  originalUrl: 'https://example.com',
  userId: 'u-1',
  createdAt: now,
  updatedAt: now,
  isBlocked: false,
};

function makeLinkRepo(overrides: Partial<IShortLinkRepository> = {}) {
  const repository: IShortLinkRepository = {
    findByCode: vi.fn(),
    create: vi.fn(),
    listByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    ...overrides,
  };
  return { repository };
}

describe('ModerateLinkService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks a link as an admin', async () => {
    const { repository } = makeLinkRepo();
    const service = new ModerateLinkService(repository, adminEmails);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);
    (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...linkFixture,
      isBlocked: true,
    });

    const result = await service.execute('admin@example.com', 'abc123', true);

    expect(result.isBlocked).toBe(true);
    expect(repository.update).toHaveBeenCalledWith('abc123', { isBlocked: true });
  });

  it('unblocks a link as an admin', async () => {
    const { repository } = makeLinkRepo();
    const service = new ModerateLinkService(repository, adminEmails);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...linkFixture,
      isBlocked: true,
    });
    (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...linkFixture,
      isBlocked: false,
    });

    await service.execute('admin@example.com', 'abc123', false);

    expect(repository.update).toHaveBeenCalledWith('abc123', { isBlocked: false });
  });

  it('denies non-admin users', async () => {
    const { repository } = makeLinkRepo();
    const service = new ModerateLinkService(repository, adminEmails);
    await expect(service.execute('user@example.com', 'abc123', true)).rejects.toThrow(
      'Access Denied: Administrative privileges required.'
    );
    expect(repository.findByCode).not.toHaveBeenCalled();
  });

  it('denies when the allowlist is empty (fail closed)', async () => {
    const { repository } = makeLinkRepo();
    const service = new ModerateLinkService(repository, []);
    await expect(service.execute('admin@example.com', 'abc123', true)).rejects.toThrow(
      'Access Denied: Administrative privileges required.'
    );
  });

  it('throws when the code is missing', async () => {
    const { repository } = makeLinkRepo();
    const service = new ModerateLinkService(repository, adminEmails);
    await expect(service.execute('admin@example.com', '', true)).rejects.toThrow(
      "كل من 'code' والقيمة المنطقية 'isBlocked' مطلوبان."
    );
  });

  it('throws when isBlocked is not a boolean', async () => {
    const { repository } = makeLinkRepo();
    const service = new ModerateLinkService(repository, adminEmails);
    await expect(
      service.execute('admin@example.com', 'abc123', 'yes' as unknown as boolean)
    ).rejects.toThrow("كل من 'code' والقيمة المنطقية 'isBlocked' مطلوبان.");
    expect(repository.findByCode).not.toHaveBeenCalled();
  });

  it('throws when the link is not found', async () => {
    const { repository } = makeLinkRepo();
    const service = new ModerateLinkService(repository, adminEmails);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.execute('admin@example.com', 'abc123', true)).rejects.toThrow(
      'Short link not found.'
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('GetSystemStatsService', () => {
  const statsFixture = {
    totalLinks: 10,
    totalClicks: 100,
    blockedLinksCount: 1,
    links: [],
  };

  beforeEach(() => vi.clearAllMocks());

  it('returns stats for an admin', async () => {
    const adminRepository: IAdminRepository = { getSystemStats: vi.fn() };
    (adminRepository.getSystemStats as ReturnType<typeof vi.fn>).mockResolvedValue(statsFixture);

    const service = new GetSystemStatsService(adminRepository, adminEmails);

    await expect(service.execute('admin@example.com')).resolves.toEqual(statsFixture);
  });

  it('denies non-admin users', async () => {
    const adminRepository: IAdminRepository = { getSystemStats: vi.fn() };
    const service = new GetSystemStatsService(adminRepository, adminEmails);

    await expect(service.execute('user@example.com')).rejects.toThrow(
      'Access Denied: Administrative privileges required.'
    );
    expect(adminRepository.getSystemStats).not.toHaveBeenCalled();
  });

  it('propagates repository errors for admins', async () => {
    const adminRepository: IAdminRepository = { getSystemStats: vi.fn() };
    (adminRepository.getSystemStats as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('stats unavailable')
    );
    const service = new GetSystemStatsService(adminRepository, adminEmails);

    await expect(service.execute('admin@example.com')).rejects.toThrow('stats unavailable');
  });
});
