import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthenticatedUser = vi.fn();
const mockListLinks = { execute: vi.fn() };
const mockBulkAction = { execute: vi.fn() };
const mockModerate = { execute: vi.fn() };

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/backend/middleware/bearer-auth', () => ({
  getAuthenticatedUser: (authorization: string | null) => mockGetAuthenticatedUser(authorization),
}));

vi.mock('@/backend/config/env', () => ({
  env: { appUrl: 'https://royaraqamia.com' },
}));

vi.mock('@/backend/config/linksnap', () => ({
  createListLinksService: () => mockListLinks,
  createBulkLinkActionService: () => mockBulkAction,
  createModerateLinkService: () => mockModerate,
  createCheckCodeAvailabilityService: () => ({ execute: vi.fn() }),
  createDeleteLinkService: () => ({ execute: vi.fn() }),
  createGetSystemStatsService: () => ({ execute: vi.fn() }),
  createGetUrlAnalyticsService: () => ({ execute: vi.fn(), exportCsv: vi.fn() }),
  createShortenUrlService: () => ({ execute: vi.fn() }),
  createUnlockLinkService: () => ({ execute: vi.fn() }),
  createUpdateLinkService: () => ({ execute: vi.fn() }),
  createRedirectUrlService: () => ({ execute: vi.fn() }),
}));

import { bulkLinkAction, listLinks, moderateLink } from '@/backend/controllers/linksnap';

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
    mockListLinks.execute.mockResolvedValue([link()]);
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
});
