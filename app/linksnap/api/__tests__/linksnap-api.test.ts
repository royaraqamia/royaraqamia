import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';
import { ShortLinkRedirectError } from '@/backend/services/linksnap/redirect-url';
import { AppError } from '@/backend/shared/errors';

function readBody<T>(res: NextResponse): T {
  return (res as unknown as { data: T }).data;
}

const mockGetAuthenticatedUser = vi.fn();
const mockCheckRateLimitApi = vi.fn();
const mockGetClientIp = vi.fn();
const mockGetErrorMessage = vi.fn((err: unknown) =>
  err instanceof Error ? err.message : 'حدث خطأ غير متوقع.'
);

const mockShorten = { execute: vi.fn() };
const mockBulkShorten = { execute: vi.fn() };
const mockListLinks = { execute: vi.fn() };
const mockUpdateLink = { execute: vi.fn() };
const mockDeleteLink = { execute: vi.fn() };
const mockAnalytics = { execute: vi.fn() };
const mockModerate = { execute: vi.fn() };
const mockStats = { execute: vi.fn() };
const mockRedirect = { execute: vi.fn() };

vi.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    body: unknown;
    status: number;
    url?: string;
    type?: string;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(data: unknown, init?: { status?: number }) {
      return { ...new MockNextResponse(data, init), data };
    }
    static redirect(url: string, status?: number) {
      return { url, status: status ?? 307, type: 'redirect' };
    }
  },
  NextRequest: class {},
}));

vi.mock('@/backend/middleware/bearer-auth', () => ({
  getAuthenticatedUser: (req: unknown) => mockGetAuthenticatedUser(req),
}));

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));

vi.mock('@/backend/transport/http', () => ({
  getClientIp: (req: unknown) => mockGetClientIp(req),
}));

vi.mock('@/backend/shared/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/backend/shared/errors')>();
  return { ...actual, getErrorMessage: (err: unknown) => mockGetErrorMessage(err) };
});

vi.mock('@/backend/config/linksnap', () => ({
  createShortenUrlService: () => mockShorten,
  createBulkShortenService: () => mockBulkShorten,
  createListLinksService: () => mockListLinks,
  createUpdateLinkService: () => mockUpdateLink,
  createDeleteLinkService: () => mockDeleteLink,
  createGetUrlAnalyticsService: () => mockAnalytics,
  createModerateLinkService: () => mockModerate,
  createGetSystemStatsService: () => mockStats,
  createRedirectUrlService: () => mockRedirect,
}));

import { POST as shortenPOST } from '@/app/linksnap/api/shorten/route';
import { POST as bulkPOST } from '@/app/linksnap/api/shorten/bulk/route';
import {
  GET as linksGET,
  PATCH as linksPATCH,
  DELETE as linksDELETE,
} from '@/app/linksnap/api/links/route';
import { GET as analyticsGET } from '@/app/linksnap/api/analytics/[code]/route';
import { POST as moderatePOST } from '@/app/linksnap/api/admin/moderate/route';
import { GET as statsGET } from '@/app/linksnap/api/admin/stats/route';
import { GET as redirectGET } from '@/app/[code]/route';

function makeReq(body?: unknown, headers: Record<string, string> = {}) {
  const json = vi.fn().mockResolvedValue(body);
  const headerMap = new Headers(headers);
  return {
    json,
    headers: headerMap,
    url: 'http://localhost/linksnap/api/links?code=abc123',
  } as unknown as NextRequest;
}

const now = new Date('2026-08-02T08:00:00.000Z');
const shortLink = {
  code: 'abc123',
  originalUrl: 'https://example.com',
  userId: 'u-1',
  createdAt: now,
  updatedAt: now,
  isBlocked: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClientIp.mockReturnValue('127.0.0.1');
  mockCheckRateLimitApi.mockResolvedValue(null);
});

describe('POST /linksnap/api/shorten', () => {
  it('shortens a URL for an authenticated user (higher limit)', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockShorten.execute.mockResolvedValue(shortLink);

    const res = await shortenPOST(makeReq({ originalUrl: 'https://example.com' }));

    expect(res.status).toBe(200);
    expect(readBody<{ success: boolean; link: Record<string, unknown> }>(res).success).toBe(true);
    expect(
      readBody<{
        success: boolean;
        link: { code: string; originalUrl: string; createdAt: string; userId: string };
      }>(res).link
    ).toEqual({
      code: 'abc123',
      originalUrl: 'https://example.com',
      createdAt: now.toISOString(),
      userId: 'u-1',
    });
    expect(mockCheckRateLimitApi).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'shorten:u-1', limit: 50, windowMs: 600_000 })
    );
  });

  it('shortens a URL for an anonymous user (lower limit)', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    mockShorten.execute.mockResolvedValue({ ...shortLink, userId: null });

    const res = await shortenPOST(makeReq({ originalUrl: 'https://example.com' }));

    expect(res.status).toBe(200);
    expect(mockCheckRateLimitApi).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'shorten:127.0.0.1', limit: 5, windowMs: 600_000 })
    );
  });

  it('returns 429 when rate limited', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    mockCheckRateLimitApi.mockResolvedValue({
      data: { success: false, error: 'limited' },
      status: 429,
    });

    const res = await shortenPOST(makeReq({ originalUrl: 'https://example.com' }));

    expect(res.status).toBe(429);
    expect(mockShorten.execute).not.toHaveBeenCalled();
  });

  it('returns a 400 with the error message for invalid input', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    mockShorten.execute.mockRejectedValue(new AppError('URL cannot be empty.', 400));

    const res = await shortenPOST(makeReq({ originalUrl: '' }));

    expect(res.status).toBe(400);
    expect(readBody(res)).toEqual({ success: false, error: 'URL cannot be empty.' });
  });
});

describe('POST /linksnap/api/shorten/bulk', () => {
  it('returns 401 without authentication', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);

    const res = await bulkPOST(makeReq({ urls: ['https://a.com'] }));

    expect(res.status).toBe(401);
    expect(readBody<{ error: string }>(res).error).toContain('غير مصرح');
  });

  it('returns 400 when urls is not an array', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockBulkShorten.execute.mockRejectedValue(
      new AppError("يجب أن يحتوي الإدخال على مصفوفة من 'urls'.", 400)
    );

    const res = await bulkPOST(makeReq({ urls: 'not-an-array' }));

    expect(res.status).toBe(400);
    expect(readBody<{ error: string }>(res).error).toContain('urls');
  });

  it('returns 400 when urls is missing', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockBulkShorten.execute.mockRejectedValue(
      new AppError("يجب أن يحتوي الإدخال على مصفوفة من 'urls'.", 400)
    );

    const res = await bulkPOST(makeReq({}));

    expect(res.status).toBe(400);
  });

  it('returns the bulk results for a valid request', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockBulkShorten.execute.mockResolvedValue([{ originalUrl: 'https://a.com', shortLink }]);

    const res = await bulkPOST(makeReq({ urls: ['https://a.com'] }));

    expect(res.status).toBe(200);
    expect(readBody<{ success: boolean; results: unknown[] }>(res).success).toBe(true);
    expect(readBody<{ results: unknown[] }>(res).results).toHaveLength(1);
    expect(mockBulkShorten.execute).toHaveBeenCalledWith(['https://a.com'], 'u-1');
  });

  it('returns 429 when rate limited', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockCheckRateLimitApi.mockResolvedValue({ data: { success: false }, status: 429 });

    const res = await bulkPOST(makeReq({ urls: ['https://a.com'] }));

    expect(res.status).toBe(429);
  });
});

describe('GET /linksnap/api/links', () => {
  it('returns 401 without authentication', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    const res = await linksGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('lists links for an authenticated user', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockListLinks.execute.mockResolvedValue([shortLink]);

    const res = await linksGET(makeReq());

    expect(res.status).toBe(200);
    expect(readBody(res)).toEqual({
      success: true,
      links: [
        {
          code: 'abc123',
          originalUrl: 'https://example.com',
          createdAt: now.toISOString(),
          isBlocked: false,
        },
      ],
    });
  });

  it('returns 500 on service errors', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockListLinks.execute.mockRejectedValue(new Error('db down'));

    const res = await linksGET(makeReq());

    expect(res.status).toBe(500);
    expect(readBody(res)).toEqual({ success: false, error: 'db down' });
  });
});

describe('PATCH /linksnap/api/links', () => {
  it('returns 400 when code or originalUrl is missing', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockUpdateLink.execute.mockRejectedValue(
      new AppError("كل من 'code' و 'originalUrl' مطلوبان.", 400)
    );

    const res = await linksPATCH(makeReq({ code: 'abc123' }));

    expect(res.status).toBe(400);
    expect(readBody<{ error: string }>(res).error).toContain('originalUrl');
  });

  it('updates a link', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockUpdateLink.execute.mockResolvedValue({ ...shortLink, originalUrl: 'https://new.com' });

    const res = await linksPATCH(makeReq({ code: 'abc123', originalUrl: 'https://new.com' }));

    expect(res.status).toBe(200);
    expect(readBody<{ link: { originalUrl: string } }>(res).link.originalUrl).toBe(
      'https://new.com'
    );
    expect(mockUpdateLink.execute).toHaveBeenCalledWith('abc123', 'u-1', 'https://new.com');
  });

  it('returns 401 without authentication', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    const res = await linksPATCH(makeReq({ code: 'abc123', originalUrl: 'https://new.com' }));
    expect(res.status).toBe(401);
  });
});

describe('DELETE /linksnap/api/links', () => {
  it('returns 400 when the code query param is missing', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockDeleteLink.execute.mockRejectedValue(new AppError('رمز الرابط مطلوب.', 400));
    const res = await linksDELETE({
      url: 'http://localhost/linksnap/api/links',
      headers: new Headers(),
    } as unknown as NextRequest);
    expect(res.status).toBe(400);
    expect(readBody<{ error: string }>(res).error).toBe('رمز الرابط مطلوب.');
  });

  it('returns 401 without authentication', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    const req = { url: 'http://localhost/linksnap/api/links?code=abc123', headers: new Headers() };
    const res = await linksDELETE(req as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  it('deletes a link the user owns', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockDeleteLink.execute.mockResolvedValue(true);

    const req = { url: 'http://localhost/linksnap/api/links?code=abc123', headers: new Headers() };
    const res = await linksDELETE(req as unknown as NextRequest);

    expect(res.status).toBe(200);
    expect(readBody(res)).toEqual({ success: true, message: 'تم حذف الرابط بنجاح.' });
    expect(mockDeleteLink.execute).toHaveBeenCalledWith('abc123', 'u-1');
  });
});

describe('GET /linksnap/api/analytics/[code]', () => {
  it('returns 400 when the code is missing', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockAnalytics.execute.mockRejectedValue(new AppError('رمز الرابط مطلوب.', 400));
    const res = await analyticsGET(makeReq(), { params: Promise.resolve({ code: '' }) });
    expect(res.status).toBe(400);
  });

  it('returns 401 without authentication', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    const res = await analyticsGET(makeReq(), { params: Promise.resolve({ code: 'abc123' }) });
    expect(res.status).toBe(401);
  });

  it('returns the analytics summary', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    mockAnalytics.execute.mockResolvedValue({
      totalClicks: 3,
      recentClicks: [],
      clicksByDate: [],
      topReferrers: [],
    });

    const res = await analyticsGET(makeReq(), { params: Promise.resolve({ code: 'abc123' }) });

    expect(res.status).toBe(200);
    expect(readBody<{ analytics: { totalClicks: number } }>(res).analytics.totalClicks).toBe(3);
    expect(mockAnalytics.execute).toHaveBeenCalledWith('abc123', 'u-1');
  });
});

describe('POST /linksnap/api/admin/moderate', () => {
  it('returns 400 when isBlocked is not a boolean', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'admin@example.com' });
    mockModerate.execute.mockRejectedValue(
      new AppError("كل من 'code' والقيمة المنطقية 'isBlocked' مطلوبان.", 400)
    );
    const res = await moderatePOST(makeReq({ code: 'abc123', isBlocked: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('blocks a link as an admin', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'admin@example.com' });
    mockModerate.execute.mockResolvedValue({ ...shortLink, isBlocked: true });

    const res = await moderatePOST(makeReq({ code: 'abc123', isBlocked: true }));

    expect(res.status).toBe(200);
    expect(readBody<{ message: string }>(res).message).toBe('تم حظر الرابط بنجاح.');
    expect(readBody<{ link: { isBlocked: boolean } }>(res).link.isBlocked).toBe(true);
    expect(mockModerate.execute).toHaveBeenCalledWith('admin@example.com', 'abc123', true);
  });

  it('unblocks a link as an admin', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'admin@example.com' });
    mockModerate.execute.mockResolvedValue({ ...shortLink, isBlocked: false });

    const res = await moderatePOST(makeReq({ code: 'abc123', isBlocked: false }));

    expect(res.status).toBe(200);
    expect(readBody<{ message: string }>(res).message).toBe('تم إلغاء حظر الرابط بنجاح.');
  });
});

describe('GET /linksnap/api/admin/stats', () => {
  it('returns 401 without authentication', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    const res = await statsGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns the system stats for an admin', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'admin@example.com' });
    mockStats.execute.mockResolvedValue({
      totalLinks: 5,
      totalClicks: 50,
      blockedLinksCount: 0,
      links: [],
    });

    const res = await statsGET(makeReq());

    expect(res.status).toBe(200);
    expect(readBody<{ stats: { totalLinks: number } }>(res).stats.totalLinks).toBe(5);
    expect(mockStats.execute).toHaveBeenCalledWith('admin@example.com');
  });

  it('returns 500 when the admin check fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'u-1', email: 'user@example.com' });
    mockStats.execute.mockRejectedValue(
      new Error('Access Denied: Administrative privileges required.')
    );

    const res = await statsGET(makeReq());

    expect(res.status).toBe(500);
    expect(readBody<{ error: string }>(res).error).toBe(
      'Access Denied: Administrative privileges required.'
    );
  });
});

describe('GET /[code] redirect route', () => {
  const headers = {
    referer: 'https://ref.com',
    'user-agent': 'Mozilla',
    'x-vercel-ip-country': 'SY',
  };

  it('redirects to the original URL with 302', async () => {
    mockRedirect.execute.mockResolvedValue('https://example.com');
    const res = await redirectGET(makeReq(undefined, headers), {
      params: Promise.resolve({ code: 'abc123' }),
    });

    expect(res.status).toBe(302);
    expect(res.url).toBe('https://example.com');
    expect(mockRedirect.execute).toHaveBeenCalledWith('abc123', {
      referrer: 'https://ref.com',
      userAgent: 'Mozilla',
      ipCountry: 'SY',
    });
  });

  it('redirects to the blocked page when the link is deactivated', async () => {
    process.env.APP_URL = 'http://localhost:3000';
    mockRedirect.execute.mockRejectedValue(
      new ShortLinkRedirectError(
        'This link has been deactivated due to terms of service violations.',
        'blocked'
      )
    );
    const res = await redirectGET(makeReq(undefined, {}), {
      params: Promise.resolve({ code: 'abc123' }),
    });

    expect(res.status).toBe(302);
    expect(res.url).toBe('http://localhost:3000/linksnap?error=blocked&code=abc123');
  });

  it('redirects to the not-found page for unknown codes', async () => {
    process.env.APP_URL = 'http://localhost:3000';
    mockRedirect.execute.mockRejectedValue(
      new ShortLinkRedirectError('Short link not found.', 'not-found')
    );
    const res = await redirectGET(makeReq(undefined, {}), {
      params: Promise.resolve({ code: 'abc123' }),
    });

    expect(res.status).toBe(302);
    expect(res.url).toBe('http://localhost:3000/linksnap?error=not-found&code=abc123');
  });

  it('returns 404 for reserved codes', async () => {
    const reserved = ['_private', 'api', 'favicon.ico', 'page.json'];
    for (const code of reserved) {
      mockRedirect.execute.mockRejectedValue(
        new ShortLinkRedirectError('Short link not found.', 'reserved')
      );
      const res = await redirectGET(makeReq(undefined, {}), {
        params: Promise.resolve({ code }),
      });
      expect(res.status).toBe(404);
      expect(mockRedirect.execute).toHaveBeenCalledWith(code, expect.any(Object));
    }
  });
});
