import { describe, it, expect, vi } from 'vitest';
import { BulkShortenService } from '@/backend/services/linksnap/bulk-shorten';
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
  return { repository, service: new BulkShortenService(repository) };
}

describe('BulkShortenService.execute', () => {
  it('shortens a list of valid URLs', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    const results = await service.execute(['https://a.com', 'https://b.com'], 'u-1');

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.shortLink).toBeDefined();
      expect(r.error).toBeUndefined();
      expect(r.shortLink?.code).toMatch(/^[a-zA-Z0-9]{6}$/);
      expect(r.shortLink?.userId).toBe('u-1');
    }
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('requires user authentication', async () => {
    const { service } = makeRepo();
    await expect(service.execute(['https://a.com'], '')).rejects.toThrow(
      'Bulk shortening requires user authentication.'
    );
  });

  it('requires at least one URL', async () => {
    const { service } = makeRepo();
    await expect(service.execute([], 'u-1')).rejects.toThrow(
      'Please provide at least one URL to shorten.'
    );
  });

  it('requires urls to be an array', async () => {
    const { service } = makeRepo();
    await expect(service.execute(null as unknown as string[], 'u-1')).rejects.toThrow(
      "يجب أن يحتوي الإدخال على مصفوفة من 'urls'."
    );
    await expect(service.execute('not-an-array' as unknown as string[], 'u-1')).rejects.toThrow(
      "يجب أن يحتوي الإدخال على مصفوفة من 'urls'."
    );
  });

  it('caps the batch at 50 URLs', async () => {
    const { service } = makeRepo();
    const urls = Array.from({ length: 51 }, (_, i) => `https://site${i}.com`);
    await expect(service.execute(urls, 'u-1')).rejects.toThrow(
      'Bulk shortening is capped at 50 links per batch to prevent abuse.'
    );
  });

  it('accepts exactly 50 URLs (boundary)', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    const urls = Array.from({ length: 50 }, (_, i) => `https://site${i}.com`);
    const results = await service.execute(urls, 'u-1');
    expect(results).toHaveLength(50);
  });

  it('reports per-URL errors instead of failing the whole batch', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    const results = await service.execute(['not-a-url', 'https://good.com'], 'u-1');

    expect(results[0]).toMatchObject({
      originalUrl: 'not-a-url',
      error: expect.stringContaining('Invalid URL format'),
    });
    expect(results[1]).toMatchObject({ originalUrl: 'https://good.com' });
    expect(results[1]!.shortLink).toBeDefined();
  });

  it('reports empty or whitespace entries as errors', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    const results = await service.execute(['', '   '], 'u-1');

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.error === 'Empty or whitespace input.')).toBe(true);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('reports when code generation fails for a single URL', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const results = await service.execute(['https://a.com'], 'u-1');

    expect(results[0]!.error).toBe('Unable to generate a unique short code after 5 attempts.');
  });

  it('isolates a repository error to the affected URL', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    const results = await service.execute(['https://a.com', 'https://b.com'], 'u-1');

    expect(results.every((r) => r.error === 'db down')).toBe(true);
  });

  it('reports malicious URLs per item', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repository.create as ReturnType<typeof vi.fn>).mockImplementation(async (link) => link);

    const results = await service.execute(['http://localhost', 'https://good.com'], 'u-1');

    expect(results[0]!.error).toContain('Security Block');
    expect(results[1]!.shortLink).toBeDefined();
  });
});
