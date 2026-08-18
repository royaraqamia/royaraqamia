import { describe, it, expect, vi } from 'vitest';
import { CheckCodeAvailabilityService } from '@/backend/services/linksnap/check-code-availability';
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
  return { repository, service: new CheckCodeAvailabilityService(repository) };
}

describe('CheckCodeAvailabilityService.execute', () => {
  it('reports a free code as available', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const result = await service.execute('my-page');

    expect(result.available).toBe(true);
    expect(result.error).toBeUndefined();
    expect(repository.exists).toHaveBeenCalledWith('my-page');
  });

  it('reports a taken code as unavailable with an Arabic message', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const result = await service.execute('taken1');

    expect(result.available).toBe(false);
    expect(result.error).toContain('مستخدم بالفعل');
  });

  it('sanitizes the code before checking', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await service.execute(' my page ');

    expect(repository.exists).toHaveBeenCalledWith('mypage');
  });

  it('rejects codes shorter than 3 characters without querying the DB', async () => {
    const { repository, service } = makeRepo();

    const result = await service.execute('ab');

    expect(result.available).toBe(false);
    expect(result.error).toContain('3 أحرف');
    expect(repository.exists).not.toHaveBeenCalled();
  });

  it('rejects codes longer than 16 characters without querying the DB', async () => {
    const { repository, service } = makeRepo();

    const result = await service.execute('a'.repeat(17));

    expect(result.available).toBe(false);
    expect(result.error).toContain('16 حرفًا');
    expect(repository.exists).not.toHaveBeenCalled();
  });

  it('rejects reserved codes without querying the DB', async () => {
    const { repository, service } = makeRepo();

    const result = await service.execute('api');

    expect(result.available).toBe(false);
    expect(result.error).toContain('محجوز');
    expect(repository.exists).not.toHaveBeenCalled();
  });

  it('sanitizes dots out of a slug before checking availability', async () => {
    const { repository, service } = makeRepo();
    (repository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const result = await service.execute('my.page');

    expect(repository.exists).toHaveBeenCalledWith('mypage');
    expect(result.available).toBe(true);
  });
});
