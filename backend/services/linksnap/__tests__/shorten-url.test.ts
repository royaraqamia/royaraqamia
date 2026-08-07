import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShortenUrlService } from '@/backend/services/linksnap/shorten-url';
import type { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';

function makeRepo(overrides: Partial<ShortLinkRepository> = {}) {
  const repository: ShortLinkRepository = {
    findByCode: vi.fn(),
    create: vi.fn(),
    listByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    setExpiryMany: vi.fn(),
    exists: vi.fn(),
    ...overrides,
  };
  return { repository, service: new ShortenUrlService(repository) };
}

describe('ShortenUrlService.execute', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('generates a unique random code when no custom code is given', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    const result = await service.execute('https://example.com', 'u-1');

    expect(result.code).toHaveLength(6);
    expect(result.code).toMatch(/^[a-zA-Z0-9]{6}$/);
    expect(result.originalUrl).toBe('https://example.com');
    expect(result.userId).toBe('u-1');
    expect(result.isBlocked).toBe(false);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: result.code, originalUrl: 'https://example.com' })
    );
  });

  it('uses a valid custom code', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    const result = await service.execute('https://example.com', null, 'my-page');

    expect(result.code).toBe('my-page');
    expect(repository.exists).toHaveBeenCalledWith('my-page');
  });

  it('retries up to 5 times when generated codes collide', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    await service.execute('https://example.com', null);

    expect(repository.exists).toHaveBeenCalledTimes(3);
  });

  it('throws when unable to find a unique code after 5 attempts', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(service.execute('https://example.com', null)).rejects.toThrow(
      'Server was unable to generate a unique link code. Please try again.'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('throws for a custom code shorter than 3 characters after sanitization', async () => {
    const { repository, service } = makeRepo();
    await expect(service.execute('https://example.com', null, 'ab')).rejects.toThrow(
      'Custom short code must be at least 3 characters long.'
    );
    await expect(service.execute('https://example.com', null, 'a!b')).rejects.toThrow(
      'Custom short code must be at least 3 characters long.'
    );
    expect(repository.exists).not.toHaveBeenCalled();
  });

  it('throws for a custom code over 16 characters after sanitization', async () => {
    const { service } = makeRepo();
    await expect(service.execute('https://example.com', null, 'a'.repeat(17))).rejects.toThrow(
      'Custom short code must be under 16 characters.'
    );
  });

  it('accepts a custom code of exactly 3 and exactly 16 characters (boundary)', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    const short = await service.execute('https://example.com', null, 'abc');
    expect(short.code).toBe('abc');

    const long = await service.execute('https://example.com', null, 'a'.repeat(16));
    expect(long.code).toHaveLength(16);
  });

  it('throws when a custom code is already taken', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(service.execute('https://example.com', null, 'taken1')).rejects.toThrow(
      'This custom short code is already taken. Please try another one.'
    );
  });

  it('rejects invalid URLs', async () => {
    const { repository, service } = makeRepo();
    await expect(service.execute('example.com', null)).rejects.toThrow(
      'Invalid URL format. Please include http:// or https://'
    );
    await expect(service.execute('', null)).rejects.toThrow('URL cannot be empty.');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects malicious or loopback URLs', async () => {
    const { service } = makeRepo();
    await expect(service.execute('http://localhost:3000', null)).rejects.toThrow('Security Block');
  });

  it('propagates repository errors', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    await expect(service.execute('https://example.com', null)).rejects.toThrow('db down');
  });
});
