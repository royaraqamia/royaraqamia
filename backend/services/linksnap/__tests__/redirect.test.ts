import { describe, it, expect, vi } from 'vitest';
import { RedirectUrlService } from '@/backend/services/linksnap/redirect-url';
import { GetUrlAnalyticsService } from '@/backend/services/linksnap/get-url-analytics';
import type { IShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import type { IAnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import type { ShortLink, LinkAnalyticsSummary } from '@/shared/contracts/linksnap';

const now = new Date('2026-08-02T08:00:00.000Z');

const linkFixture: ShortLink = {
  code: 'abc123',
  originalUrl: 'https://example.com',
  userId: 'u-1',
  createdAt: now,
  updatedAt: now,
  isBlocked: false,
};

const summaryFixture: LinkAnalyticsSummary = {
  totalClicks: 5,
  recentClicks: [],
  clicksByDate: [],
  topReferrers: [],
};

function makeDeps() {
  const shortLinkRepository: IShortLinkRepository = {
    findByCode: vi.fn(),
    create: vi.fn(),
    listByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  };
  const analyticsRepository: IAnalyticsRepository = {
    recordClick: vi.fn(),
    getLinkOwner: vi.fn(),
    getSummaryForLink: vi.fn(),
  };
  return { shortLinkRepository, analyticsRepository };
}

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
    ).rejects.toThrow('Short link not found.');
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
    await expect(service.execute('', 'u-1')).rejects.toThrow(
      'Short code is required to retrieve analytics.'
    );
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
