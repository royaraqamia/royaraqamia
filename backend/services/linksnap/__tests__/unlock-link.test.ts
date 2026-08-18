import { describe, it, expect, vi } from 'vitest';
import { UnlockLinkService } from '@/backend/services/linksnap/unlock-link';
import { hashPassword, verifyPassword } from '@/backend/shared/password-hash';
import { ShortLinkRedirectError } from '@/backend/services/linksnap/redirect-url';
import { AppError } from '@/backend/shared/errors';
import type { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import type { AnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import type { ShortLink } from '@/shared/contracts/linksnap';

const now = new Date('2026-08-02T08:00:00.000Z');

const protectedLink: ShortLink = {
  code: 'abc123',
  originalUrl: 'https://example.com',
  userId: 'u-1',
  createdAt: now,
  updatedAt: now,
  isBlocked: false,
  expiresAt: null,
  passwordHash: hashPassword('s3cret'),
};

function makeDeps() {
  const shortLinkRepository: ShortLinkRepository = {
    findByCode: vi.fn(),
    create: vi.fn(),
    listByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    setExpiryMany: vi.fn(),
    exists: vi.fn(),
  };
  const analyticsRepository: AnalyticsRepository = {
    recordClick: vi.fn(),
    getLinkOwner: vi.fn(),
    getSummaryForLink: vi.fn(),
    getExportEvents: vi.fn(),
  };
  return { shortLinkRepository, analyticsRepository };
}

describe('UnlockLinkService.execute', () => {
  it('returns the original URL and records a click on correct password', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(protectedLink);
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });

    const service = new UnlockLinkService(shortLinkRepository, analyticsRepository);

    const url = await service.execute('abc123', 's3cret', {
      referrer: 'https://ref.com',
      userAgent: 'Mozilla',
      ipCountry: 'SY',
    });

    expect(url).toBe('https://example.com');
    expect(analyticsRepository.recordClick).toHaveBeenCalledWith({
      linkCode: 'abc123',
      referrer: 'https://ref.com',
      userAgent: 'Mozilla',
      ipCountry: 'SY',
    });
  });

  it('throws a 401 when the password is wrong', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(protectedLink);

    const service = new UnlockLinkService(shortLinkRepository, analyticsRepository);

    await expect(
      service.execute('abc123', 'wrong', {
        referrer: null,
        userAgent: null,
        ipCountry: null,
      })
    ).rejects.toThrow('كلمة المرور غير صحيحة.');
    expect(analyticsRepository.recordClick).not.toHaveBeenCalled();
  });

  it('throws a redirect error when the link is missing', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const service = new UnlockLinkService(shortLinkRepository, analyticsRepository);

    await expect(
      service.execute('missing', 's3cret', {
        referrer: null,
        userAgent: null,
        ipCountry: null,
      })
    ).rejects.toThrow(ShortLinkRedirectError);
  });

  it('throws when the link is not protected', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...protectedLink,
      passwordHash: null,
    });

    const service = new UnlockLinkService(shortLinkRepository, analyticsRepository);

    await expect(
      service.execute('abc123', 's3cret', {
        referrer: null,
        userAgent: null,
        ipCountry: null,
      })
    ).rejects.toThrow(AppError);
  });

  it('notifies the link owner on successful unlock', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(protectedLink);
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });
    const notifyLinkClicked = vi.fn(async () => {});

    const service = new UnlockLinkService(
      shortLinkRepository,
      analyticsRepository,
      notifyLinkClicked
    );

    await service.execute('abc123', 's3cret', {
      referrer: null,
      userAgent: null,
      ipCountry: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notifyLinkClicked).toHaveBeenCalledWith({
      userId: 'u-1',
      code: 'abc123',
      originalUrl: 'https://example.com',
    });
  });

  it('does not notify the owner for anonymous links', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...protectedLink,
      userId: null,
    });
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });
    const notifyLinkClicked = vi.fn(async () => {});

    const service = new UnlockLinkService(
      shortLinkRepository,
      analyticsRepository,
      notifyLinkClicked
    );

    await service.execute('abc123', 's3cret', {
      referrer: null,
      userAgent: null,
      ipCountry: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notifyLinkClicked).not.toHaveBeenCalled();
  });
});

describe('password-hash', () => {
  it('round-trips a correct password', () => {
    const stored = hashPassword('hello world');
    expect(verifyPassword('hello world', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('hello world');
    expect(verifyPassword('wrong', stored)).toBe(false);
  });

  it('produces unique hashes for the same password (random salt)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', 'scrypt:abc')).toBe(false);
  });
});
