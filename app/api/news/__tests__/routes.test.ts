import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const IP = '1.2.3.4';
const RATE_LIMIT_MESSAGE = 'تم تجاوز حدّ الطلب: البحث في الأخبار محدود بـ 60 طلبًا في الدقيقة.';

const mockLoadNewsSearch = vi.fn();
const mockCheckRateLimitApi = vi.fn();
const mockGetClientIp = vi.fn((_request: NextRequest) => IP);
const mockPolicy = vi.fn((ip: string) => ({
  key: `news-search:${ip}`,
  limit: 60,
  windowMs: 60_000,
  message: RATE_LIMIT_MESSAGE,
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      data,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    }),
  },
}));

vi.mock('@/backend/loaders/news', () => ({
  loadNewsSearch: (query: string) => mockLoadNewsSearch(query),
}));

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));

vi.mock('@/backend/config/rate-limiter', () => ({
  newsSearchRateLimitPolicy: (ip: string) => mockPolicy(ip),
}));

vi.mock('@/backend/transport/http', () => ({
  getClientIp: (request: NextRequest) => mockGetClientIp(request),
}));

vi.mock('@/backend/transport/http-result', () => ({
  toNextResponse: (result: { status?: number; body?: unknown }) => ({
    status: result.status ?? 200,
    data: result.body,
  }),
}));

import { GET as searchGET } from '@/app/api/news/search/route';

type RouteResponse = { status: number; data: unknown };

function request(params: Record<string, string> = {}): NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
    headers: new Headers(),
  } as unknown as NextRequest;
}

function body(res: RouteResponse): Record<string, unknown> {
  return res.data as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimitApi.mockResolvedValue(null);
  mockLoadNewsSearch.mockResolvedValue({ hits: [] });
});

describe('GET /api/news/search', () => {
  it('rejects an overlong query with 400 before any database read', async () => {
    const res = (await searchGET(request({ q: 'أ'.repeat(81) }))) as unknown as RouteResponse;

    expect(res.status).toBe(400);
    expect(body(res).error).toContain('طويلة جداً');
    expect(mockLoadNewsSearch).not.toHaveBeenCalled();
    expect(mockCheckRateLimitApi).not.toHaveBeenCalled();
  });

  it('accepts a query of exactly the maximum length', async () => {
    const query = 'أ'.repeat(80);

    await searchGET(request({ q: query }));

    expect(mockLoadNewsSearch).toHaveBeenCalledWith(query);
  });

  it('trims and sanitises the query before it reaches the loader', async () => {
    await searchGET(request({ q: '  %اتفاق,  الآن  ' }));

    expect(mockLoadNewsSearch).toHaveBeenCalledWith('اتفاق الآن');
  });

  it('answers an empty result for a missing, blank or punctuation-only query without any I/O', async () => {
    for (const q of [undefined, '', '   ', '???']) {
      const res = (await searchGET(
        request(q === undefined ? {} : { q })
      )) as unknown as RouteResponse;

      expect(res.status).toBe(200);
      expect(res.data).toEqual({ hits: [] });
    }

    expect(mockLoadNewsSearch).not.toHaveBeenCalled();
    expect(mockCheckRateLimitApi).not.toHaveBeenCalled();
  });

  it('returns 429 with an Arabic message when the per-IP limit is exhausted', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: RATE_LIMIT_MESSAGE },
    });

    const res = (await searchGET(request({ q: 'اتفاق' }))) as unknown as RouteResponse;

    expect(res.status).toBe(429);
    expect(body(res).error).toBe(RATE_LIMIT_MESSAGE);
    expect(mockLoadNewsSearch).not.toHaveBeenCalled();
  });

  it('throttles per client IP and fails open on a limiter outage', async () => {
    await searchGET(request({ q: 'اتفاق' }));

    expect(mockGetClientIp).toHaveBeenCalled();
    expect(mockPolicy).toHaveBeenCalledWith(IP);
    expect(mockCheckRateLimitApi).toHaveBeenCalledWith({
      key: `news-search:${IP}`,
      limit: 60,
      windowMs: 60_000,
      message: RATE_LIMIT_MESSAGE,
      failClosed: false,
    });
  });
});
