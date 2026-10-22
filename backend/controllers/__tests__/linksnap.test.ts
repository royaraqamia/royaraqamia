import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthenticatedUser = vi.fn();
const mockGetSessionUser = vi.fn();
const mockShorten = { execute: vi.fn() };
const mockListLinks = { execute: vi.fn(), executeIncludingDeleted: vi.fn() };
const mockBulkAction = { execute: vi.fn() };
const mockModerate = { execute: vi.fn() };
const mockRedirect = { execute: vi.fn() };
const mockRedirectFactory = vi.fn((_defer?: unknown) => mockRedirect);

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => ({ user: await mockGetSessionUser(), client: {} }),
    optional: async () => ({ user: await mockGetSessionUser(), client: {} }),
    bearer: (authorization) => mockGetAuthenticatedUser(authorization),
  });
});

vi.mock('@/backend/config/env', () => ({
  env: { appUrl: 'https://royaraqamia.com' },
}));

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: async () => null,
}));

vi.mock('@/backend/config/linksnap', () => ({
  createListLinksService: () => mockListLinks,
  createBulkLinkActionService: () => mockBulkAction,
  createModerateLinkService: () => mockModerate,
  createCheckCodeAvailabilityService: () => ({ execute: vi.fn() }),
  createDeleteLinkService: () => ({ execute: vi.fn() }),
  createGetSystemStatsService: () => ({ execute: vi.fn() }),
  createGetUrlAnalyticsService: () => ({ execute: vi.fn(), exportCsv: vi.fn() }),
  createShortenUrlService: () => mockShorten,
  createUnlockLinkService: () => ({ execute: vi.fn() }),
  createUpdateLinkService: () => ({ execute: vi.fn() }),
  createRedirectUrlService: (defer: unknown) => mockRedirectFactory(defer),
}));

vi.mock('@/backend/config/plans', () => ({
  createPlanGate: () => ({
    meter: async (_subject: unknown, _action: string, run: () => Promise<unknown>) => run(),
    meterMany: async (_u: string, _a: string, _c: number, run: () => Promise<unknown>) => run(),
    reserve: async () => 'event-1',
    release: async () => {},
    cap: async () => {},
    caps: async () => ({ plan: 'free', unlimited: false, caps: {} }),
    report: async () => ({ recorded: 0, alreadyRecorded: 0, refused: 0 }),
  }),
}));

import {
  bulkLinkAction,
  listLinks,
  listLinksForSync,
  moderateLink,
  redirectShortCode,
} from '@/backend/controllers/linksnap';
import { ShortLinkRedirectError } from '@/backend/services/linksnap/redirect-url';

function link(overrides: Record<string, unknown> = {}) {
  return {
    code: 'abc123',
    originalUrl: 'https://example.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    isBlocked: false,
    expiresAt: null,
    passwordHash: null,
    ...overrides,
  };
}

describe('linksnap controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'admin@b.com' });
    mockGetSessionUser.mockResolvedValue(null);
    mockListLinks.execute.mockResolvedValue([link()]);
    mockListLinks.executeIncludingDeleted.mockResolvedValue([link()]);
    mockBulkAction.execute.mockResolvedValue({ affected: 2 });
    mockModerate.execute.mockResolvedValue(link({ isBlocked: true }));
  });

  it('returns the linksnap 401 body when the bearer token is rejected', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);

    const result = await listLinks('Bearer nope');

    expect(result).toEqual(
      expect.objectContaining({
        status: 401,
        body: { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' },
      })
    );
    expect(mockListLinks.execute).not.toHaveBeenCalled();
  });

  it('scopes the listing to the bearer identity and shapes the view', async () => {
    const result = await listLinks('Bearer token');

    expect(mockListLinks.execute).toHaveBeenCalledWith('u-1');
    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: {
          success: true,
          links: [
            expect.objectContaining({
              code: 'abc123',
              createdAt: '2026-01-01T00:00:00.000Z',
              expiresAt: null,
              passwordProtected: false,
              status: 'active',
            }),
          ],
        },
      })
    );
  });

  it('falls back to the session cookie when the request carries no bearer token', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    mockGetSessionUser.mockResolvedValue({ id: 'cookie-user', email: 'c@b.com' });

    const result = await listLinks(null);

    expect(mockGetSessionUser).toHaveBeenCalled();
    expect(mockListLinks.execute).toHaveBeenCalledWith('cookie-user');
    expect(result).toEqual(expect.objectContaining({ status: 200 }));
  });

  it('answers 401 when neither credential resolves an identity', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    mockGetSessionUser.mockResolvedValue(null);

    const result = await listLinks(null);

    expect(result).toEqual(
      expect.objectContaining({
        status: 401,
        body: { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' },
      })
    );
    expect(mockListLinks.execute).not.toHaveBeenCalled();
  });

  it('attributes an anonymous shorten to the cookie user, so a queued create keeps its owner', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    mockGetSessionUser.mockResolvedValue({ id: 'cookie-user', email: 'c@b.com' });
    mockShorten.execute.mockResolvedValue({
      code: 'abc123',
      originalUrl: 'https://example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      userId: 'cookie-user',
      expiresAt: null,
      isBlocked: false,
      clientId: null,
    });

    const { shortenUrl } = await import('@/backend/controllers/linksnap');
    const result = await shortenUrl(null, '1.2.3.4', { originalUrl: 'https://example.com' });

    expect(result).toEqual(expect.objectContaining({ status: 200 }));
    expect(mockShorten.execute).toHaveBeenCalledWith(
      'https://example.com',
      'cookie-user',
      undefined,
      undefined,
      undefined,
      { clientId: undefined, updatedAt: undefined }
    );
  });

  it('maps a thrown AppError to its status code', async () => {
    const { AppError } = await import('@/backend/shared/errors');
    mockBulkAction.execute.mockRejectedValue(new AppError('يجب اختيار رابط واحد على الأقل.', 400));

    const result = await bulkLinkAction('Bearer token', { action: 'delete', codes: [] });

    expect(result).toEqual(
      expect.objectContaining({ status: 400, body: expect.objectContaining({ success: false }) })
    );
  });

  it('rejects an unknown bulk action with 400', async () => {
    const result = await bulkLinkAction('Bearer token', { action: 'explode', codes: ['a'] });

    expect(result).toEqual(
      expect.objectContaining({
        status: 400,
        body: expect.objectContaining({
          error: "القيمة 'action' يجب أن تكون delete أو setExpiry.",
        }),
      })
    );
  });

  it('passes the bearer email to moderation', async () => {
    await moderateLink('Bearer token', { code: 'abc123', isBlocked: true });

    expect(mockModerate.execute).toHaveBeenCalledWith('admin@b.com', 'abc123', true);
  });

  it('listLinksForSync uses the tombstone-inclusive read', async () => {
    const result = await listLinksForSync('Bearer token');

    expect(mockListLinks.executeIncludingDeleted).toHaveBeenCalledWith('u-1');
    expect(mockListLinks.execute).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ status: 200, body: expect.objectContaining({ success: true }) })
    );
  });
});

describe('redirectShortCode', () => {
  const info = { referrer: null, userAgent: null, ipCountry: null, origin: 'https://x.test' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers a code that cannot exist with a cacheable 404 instead of a render', async () => {
    mockRedirect.execute.mockRejectedValue(
      new ShortLinkRedirectError('Short link not found.', 'invalid')
    );

    const result = await redirectShortCode('caf\u00e9', info);

    expect(result).toEqual({
      status: 404,
      body: null,
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    });
  });

  it('caches the reserved-path 404 the same way', async () => {
    mockRedirect.execute.mockRejectedValue(
      new ShortLinkRedirectError('Short link not found.', 'reserved')
    );

    const result = await redirectShortCode('does.not.exist', info);

    expect(result).toEqual({
      status: 404,
      body: null,
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    });
  });

  it('still redirects unknown-but-possible codes to the linksnap error page', async () => {
    mockRedirect.execute.mockRejectedValue(
      new ShortLinkRedirectError('Short link not found.', 'not-found')
    );

    const result = await redirectShortCode('missing', info);

    expect(result).toEqual({
      status: 302,
      redirect: 'https://royaraqamia.com/linksnap?error=not-found&code=missing',
    });
  });

  it('forwards the defer hook to the service so clicks survive the response', async () => {
    mockRedirect.execute.mockResolvedValue('https://example.com');
    const defer = vi.fn();

    const result = await redirectShortCode('abc123', info, defer);

    expect(result).toEqual({ status: 302, redirect: 'https://example.com' });
    expect(mockRedirectFactory).toHaveBeenCalledWith(defer);
  });
});
