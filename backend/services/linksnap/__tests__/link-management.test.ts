import { describe, it, expect, vi } from 'vitest';
import { ListLinksService } from '@/backend/services/linksnap/list-links';
import { UpdateLinkService } from '@/backend/services/linksnap/update-link';
import { DeleteLinkService } from '@/backend/services/linksnap/delete-link';
import type { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import type { ShortLink } from '@/shared/contracts/linksnap';

const now = new Date('2026-08-02T08:00:00.000Z');

const linkFixture: ShortLink = {
  code: 'abc123',
  originalUrl: 'https://example.com',
  userId: 'u-1',
  createdAt: now,
  updatedAt: now,
  isBlocked: false,
  expiresAt: null,
};

function makeRepo(overrides: Partial<ShortLinkRepository> = {}) {
  const repository: ShortLinkRepository = {
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

describe('ListLinksService', () => {
  it('lists links for a user', async () => {
    const { repository } = makeRepo();
    const service = new ListLinksService(repository);
    (repository.listByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([linkFixture]);

    await expect(service.execute('u-1')).resolves.toEqual([linkFixture]);
    expect(repository.listByUserId).toHaveBeenCalledWith('u-1');
  });

  it('throws when the user id is missing', async () => {
    const { repository } = makeRepo();
    const service = new ListLinksService(repository);
    await expect(service.execute('')).rejects.toThrow('User ID is required to retrieve links.');
    expect(repository.listByUserId).not.toHaveBeenCalled();
  });
});

describe('UpdateLinkService', () => {
  it('updates a link the user owns', async () => {
    const { repository } = makeRepo();
    const service = new UpdateLinkService(repository);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);
    (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...linkFixture,
      originalUrl: 'https://new.com',
    });

    const result = await service.execute('abc123', 'u-1', { originalUrl: 'https://new.com' });

    expect(result.originalUrl).toBe('https://new.com');
    expect(repository.update).toHaveBeenCalledWith('abc123', { originalUrl: 'https://new.com' });
  });

  it('throws when the code is missing', async () => {
    const { repository } = makeRepo();
    const service = new UpdateLinkService(repository);
    await expect(service.execute('', 'u-1', { originalUrl: 'https://new.com' })).rejects.toThrow(
      'رمز الرابط والمستخدم مطلوبان.'
    );
  });

  it('throws when there is nothing to update', async () => {
    const { repository } = makeRepo();
    const service = new UpdateLinkService(repository);
    await expect(service.execute('abc123', 'u-1', {})).rejects.toThrow(
      'لا توجد تغييرات لتطبيقها على الرابط.'
    );
    expect(repository.findByCode).not.toHaveBeenCalled();
  });

  it('throws when the user id is missing', async () => {
    const { repository } = makeRepo();
    const service = new UpdateLinkService(repository);
    await expect(
      service.execute('abc123', '', { originalUrl: 'https://new.com' })
    ).rejects.toThrow('رمز الرابط والمستخدم مطلوبان.');
  });

  it('throws when the link is not found', async () => {
    const { repository } = makeRepo();
    const service = new UpdateLinkService(repository);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      service.execute('abc123', 'u-1', { originalUrl: 'https://new.com' })
    ).rejects.toThrow('Short link not found.');
  });

  it('throws when the user does not own the link', async () => {
    const { repository } = makeRepo();
    const service = new UpdateLinkService(repository);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);

    await expect(
      service.execute('abc123', 'u-2', { originalUrl: 'https://new.com' })
    ).rejects.toThrow('Unauthorized: You do not own this short link.');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid new URL', async () => {
    const { repository } = makeRepo();
    const service = new UpdateLinkService(repository);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);

    await expect(
      service.execute('abc123', 'u-1', { originalUrl: 'javascript:alert(1)' })
    ).rejects.toThrow('Invalid URL format. Please include http:// or https://');
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('DeleteLinkService', () => {
  it('deletes a link the user owns', async () => {
    const { repository } = makeRepo();
    const service = new DeleteLinkService(repository);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);
    (repository.delete as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(service.execute('abc123', 'u-1')).resolves.toBe(true);
    expect(repository.delete).toHaveBeenCalledWith('abc123', 'u-1');
  });

  it('throws when the code is missing', async () => {
    const { repository } = makeRepo();
    const service = new DeleteLinkService(repository);
    await expect(service.execute('', 'u-1')).rejects.toThrow('رمز الرابط مطلوب.');
  });

  it('throws when the user id is missing', async () => {
    const { repository } = makeRepo();
    const service = new DeleteLinkService(repository);
    await expect(service.execute('abc123', '')).rejects.toThrow(
      'User authorization is required to delete a link.'
    );
  });

  it('throws when the link is not found', async () => {
    const { repository } = makeRepo();
    const service = new DeleteLinkService(repository);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.execute('abc123', 'u-1')).rejects.toThrow('Short link not found.');
  });

  it('throws when the user does not own the link', async () => {
    const { repository } = makeRepo();
    const service = new DeleteLinkService(repository);
    (repository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);

    await expect(service.execute('abc123', 'u-2')).rejects.toThrow(
      'Unauthorized: You do not own this short link.'
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
