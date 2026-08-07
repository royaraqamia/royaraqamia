import { describe, it, expect, vi } from 'vitest';
import {
  RedirectUrlService,
  isReservedShortCode,
  ShortLinkRedirectError,
} from '@/backend/services/linksnap/redirect-url';
import { GetUrlAnalyticsService } from '@/backend/services/linksnap/get-url-analytics';
import type { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import type { AnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import type { ShortLink, LinkAnalyticsSummary } from '@/shared/contracts/linksnap';

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

const summaryFixture: LinkAnalyticsSummary = {
  totalClicks: 5,
  recentClicks: [],
  clicksByDate: [],
  topReferrers: [],
  device: { devices: [], os: [], browsers: [] },
};

function makeDeps() {
  const shortLinkRepository: ShortLinkRepository = {
    findByCode: vi.fn(),
    create: vi.fn(),
    listByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  };
  const analyticsRepository: AnalyticsRepository = {
    recordClick: vi.fn(),
    getLinkOwner: vi.fn(),
    getSummaryForLink: vi.fn(),
  };
  return { shortLinkRepository, analyticsRepository };
}

describe('isReservedShortCode', () => {
  it('rejects reserved codes', () => {
    expect(isReservedShortCode('_private')).toBe(true);
    expect(isReservedShortCode('has.dot')).toBe(true);
    expect(isReservedShortCode('api')).toBe(true);
    expect(isReservedShortCode('favicon.ico')).toBe(true);
  });

  it('allows normal short codes', () => {
    expect(isReservedShortCode('abc123')).toBe(false);
    expect(isReservedShortCode('xyZ')).toBe(false);
  });
});

describe('RedirectUrlService.execute', () => {
  it('returns the original URL and records analytics for a valid link', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });

    const service = new RedirectUrlService(shortLinkRepository, analyticsRepository);

    const url = await service.execute('abc123', {
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

  it('records analytics with null metadata when not provided', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });

    const service = new RedirectUrlService(shortLinkRepository, analyticsRepository);
    await service.execute('abc123', { referrer: null, userAgent: null, ipCountry: null });

    expect(analyticsRepository.recordClick).toHaveBeenCalledWith({
      linkCode: 'abc123',
      referrer: null,
      userAgent: null,
      ipCountry: null,
    });
  });

  it('throws when the link is not found', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const service = new RedirectUrlService(shortLinkRepository, analyticsRepository);

    await expect(
      service.execute('missing', { referrer: null, userAgent: null, ipCountry: null })
    ).rejects.toThrow(ShortLinkRedirectError);
    await expect(
      service.execute('missing', { referrer: null, userAgent: null, ipCountry: null })
    ).rejects.toThrow('Short link not found.');
    expect(analyticsRepository.recordClick).not.toHaveBeenCalled();
  });

  it('rejects reserved codes without querying the repository', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();

    const service = new RedirectUrlService(shortLinkRepository, analyticsRepository);

    await expect(
      service.execute('_private', { referrer: null, userAgent: null, ipCountry: null })
    ).rejects.toThrow(ShortLinkRedirectError);
    await expect(
      service.execute('page.json', { referrer: null, userAgent: null, ipCountry: null })
    ).rejects.toThrow('Short link not found.');
    expect(shortLinkRepository.findByCode).not.toHaveBeenCalled();
    expect(analyticsRepository.recordClick).not.toHaveBeenCalled();
  });

  it('throws when the link is blocked', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...linkFixture,
      isBlocked: true,
    });

    const service = new RedirectUrlService(shortLinkRepository, analyticsRepository);

    await expect(
      service.execute('abc123', { referrer: null, userAgent: null, ipCountry: null })
    ).rejects.toThrow(ShortLinkRedirectError);
    await expect(
      service.execute('abc123', { referrer: null, userAgent: null, ipCountry: null })
    ).rejects.toThrow('This link has been deactivated due to terms of service violations.');
    expect(analyticsRepository.recordClick).not.toHaveBeenCalled();
  });

  it('swallows analytics failures (fire-and-forget) and still redirects', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('analytics down')
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const service = new RedirectUrlService(shortLinkRepository, analyticsRepository);

    const url = await service.execute('abc123', {
      referrer: null,
      userAgent: null,
      ipCountry: null,
    });

    expect(url).toBe('https://example.com');
    // allow the fire-and-forget promise to settle
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('notifies the link owner when the link has an owner', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });
    const notifyLinkClicked = vi.fn(async () => {});

    const service = new RedirectUrlService(
      shortLinkRepository,
      analyticsRepository,
      notifyLinkClicked
    );

    const url = await service.execute('abc123', {
      referrer: null,
      userAgent: null,
      ipCountry: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(url).toBe('https://example.com');
    expect(notifyLinkClicked).toHaveBeenCalledWith({
      userId: 'u-1',
      code: 'abc123',
      originalUrl: 'https://example.com',
    });
  });

  it('does not notify the owner for anonymous links', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...linkFixture,
      userId: null,
    });
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });
    const notifyLinkClicked = vi.fn(async () => {});

    const service = new RedirectUrlService(
      shortLinkRepository,
      analyticsRepository,
      notifyLinkClicked
    );

    await service.execute('abc123', { referrer: null, userAgent: null, ipCountry: null });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notifyLinkClicked).not.toHaveBeenCalled();
  });

  it('swallows notifier failures and still redirects', async () => {
    const { shortLinkRepository, analyticsRepository } = makeDeps();
    (shortLinkRepository.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(linkFixture);
    (analyticsRepository.recordClick as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });
    const notifyLinkClicked = vi.fn(async () => {
      throw new Error('notify down');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const service = new RedirectUrlService(
      shortLinkRepository,
      analyticsRepository,
      notifyLinkClicked
    );

    const url = await service.execute('abc123', {
      referrer: null,
      userAgent: null,
      ipCountry: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(url).toBe('https://example.com');
    expect(notifyLinkClicked).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('GetUrlAnalyticsService.execute', () => {
  it('returns the analytics summary', async () => {
    const { analyticsRepository } = makeDeps();
    (analyticsRepository.getLinkOwner as ReturnType<typeof vi.fn>).mockResolvedValue('u-1');
    (analyticsRepository.getSummaryForLink as ReturnType<typeof vi.fn>).mockResolvedValue(
      summaryFixture
    );

    const service = new GetUrlAnalyticsService(analyticsRepository);

    await expect(service.execute('abc123', 'u-1')).resolves.toEqual(summaryFixture);
    expect(analyticsRepository.getLinkOwner).toHaveBeenCalledWith('abc123');
    expect(analyticsRepository.getSummaryForLink).toHaveBeenCalledWith('abc123');
  });

  it('throws when the code is missing', async () => {
    const { analyticsRepository } = makeDeps();
    const service = new GetUrlAnalyticsService(analyticsRepository);
    await expect(service.execute('', 'u-1')).rejects.toThrow('رمز الرابط مطلوب.');
  });

  it('throws when the user id is missing', async () => {
    const { analyticsRepository } = makeDeps();
    const service = new GetUrlAnalyticsService(analyticsRepository);
    await expect(service.execute('abc123', '')).rejects.toThrow(
      'User authorization is required to view link analytics.'
    );
  });

  it('throws when the caller does not own the link', async () => {
    const { analyticsRepository } = makeDeps();
    (analyticsRepository.getLinkOwner as ReturnType<typeof vi.fn>).mockResolvedValue('u-1');

    const service = new GetUrlAnalyticsService(analyticsRepository);
    await expect(service.execute('abc123', 'u-2')).rejects.toThrow(
      'Unauthorized: You do not own this link.'
    );
    expect(analyticsRepository.getSummaryForLink).not.toHaveBeenCalled();
  });

  it('propagates repository errors', async () => {
    const { analyticsRepository } = makeDeps();
    (analyticsRepository.getLinkOwner as ReturnType<typeof vi.fn>).mockResolvedValue('u-1');
    (analyticsRepository.getSummaryForLink as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('analytics down')
    );
    const service = new GetUrlAnalyticsService(analyticsRepository);
    await expect(service.execute('abc123', 'u-1')).rejects.toThrow('analytics down');
  });
});
