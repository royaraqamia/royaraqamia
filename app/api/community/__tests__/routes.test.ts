import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const IP = '1.2.3.4';
const RATE_LIMIT_MESSAGE = 'تم تجاوز حدّ الطلب: البحث في المجتمع محدود بـ 60 طلبًا في الدقيقة.';

const mockLoadCommunitySearch = vi.fn();
const mockLoadCommunityIndex = vi.fn();
const mockCheckRateLimitApi = vi.fn();
const mockGetClientIp = vi.fn((_request: NextRequest) => IP);
const mockPolicy = vi.fn((ip: string) => ({
  key: `community-search:${ip}`,
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

vi.mock('@/backend/loaders/community', () => ({
  loadCommunitySearch: (query: string) => mockLoadCommunitySearch(query),
  loadCommunityIndex: (...args: unknown[]) => mockLoadCommunityIndex(...args),
}));

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));

vi.mock('@/backend/config/rate-limiter', () => ({
  communitySearchRateLimitPolicy: (ip: string) => mockPolicy(ip),
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

import { GET as searchGET } from '@/app/api/community/search/route';
import { GET as indexGET } from '@/app/api/community/index/route';

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
  mockLoadCommunitySearch.mockResolvedValue({ people: [], posts: [] });
  mockLoadCommunityIndex.mockResolvedValue({ posts: [], nextCursor: null });
});

describe('GET /api/community/search', () => {
  it('rejects an overlong query with 400 before any database read', async () => {
    const res = (await searchGET(request({ q: 'أ'.repeat(81) }))) as unknown as RouteResponse;

    expect(res.status).toBe(400);
    expect(body(res).error).toContain('طويلة جداً');
    expect(mockLoadCommunitySearch).not.toHaveBeenCalled();
    expect(mockCheckRateLimitApi).not.toHaveBeenCalled();
  });

  it('accepts a query of exactly the maximum length', async () => {
    const query = 'أ'.repeat(80);

    await searchGET(request({ q: query }));

    expect(mockLoadCommunitySearch).toHaveBeenCalledWith(query);
  });

  it('trims the query before it reaches the loader', async () => {
    await searchGET(request({ q: '  ahmad  ' }));

    expect(mockLoadCommunitySearch).toHaveBeenCalledWith('ahmad');
  });

  it('answers an empty result for a missing or blank query without any I/O', async () => {
    for (const q of [undefined, '', '   ']) {
      const res = (await searchGET(
        request(q === undefined ? {} : { q })
      )) as unknown as RouteResponse;

      expect(res.status).toBe(200);
      expect(res.data).toEqual({ people: [], posts: [] });
    }

    expect(mockLoadCommunitySearch).not.toHaveBeenCalled();
    expect(mockCheckRateLimitApi).not.toHaveBeenCalled();
  });

  it('returns 429 with an Arabic message when the per-IP limit is exhausted', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: RATE_LIMIT_MESSAGE },
    });

    const res = (await searchGET(request({ q: 'ahmad' }))) as unknown as RouteResponse;

    expect(res.status).toBe(429);
    expect(body(res).error).toBe(RATE_LIMIT_MESSAGE);
    expect(mockLoadCommunitySearch).not.toHaveBeenCalled();
  });

  it('throttles per client IP and fails open on a limiter outage', async () => {
    await searchGET(request({ q: 'ahmad' }));

    expect(mockGetClientIp).toHaveBeenCalled();
    expect(mockPolicy).toHaveBeenCalledWith(IP);
    expect(mockCheckRateLimitApi).toHaveBeenCalledWith({
      key: `community-search:${IP}`,
      limit: 60,
      windowMs: 60_000,
      message: RATE_LIMIT_MESSAGE,
      failClosed: false,
    });
  });
});

describe('GET /api/community/index', () => {
  it('rejects an overlong query with 400 before any database read', async () => {
    const res = (await indexGET(request({ q: 'أ'.repeat(81) }))) as unknown as RouteResponse;

    expect(res.status).toBe(400);
    expect(body(res).error).toContain('طويلة جداً');
    expect(mockLoadCommunityIndex).not.toHaveBeenCalled();
  });

  it('rejects an overlong cursor with 400 before any database read', async () => {
    const res = (await indexGET(request({ cursor: 'a'.repeat(201) }))) as unknown as RouteResponse;

    expect(res.status).toBe(400);
    expect(body(res).error).toContain('مرجع التصفّح');
    expect(mockLoadCommunityIndex).not.toHaveBeenCalled();
  });

  it('passes the bounded and trimmed query and cursor to the loader', async () => {
    await indexGET(request({ q: '  ahmad  ', cursor: ' c1 ' }));

    expect(mockLoadCommunityIndex).toHaveBeenCalledWith('c1', 'ahmad', 9);
  });

  it('passes null and an empty query for the unfiltered first page', async () => {
    await indexGET(request());

    expect(mockLoadCommunityIndex).toHaveBeenCalledWith(null, '', 9);
  });

  it('normalises a blank cursor to the first page', async () => {
    await indexGET(request({ cursor: '   ' }));

    expect(mockLoadCommunityIndex).toHaveBeenCalledWith(null, '', 9);
  });

  it('returns 429 with an Arabic message when the per-IP limit is exhausted', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: RATE_LIMIT_MESSAGE },
    });

    const res = (await indexGET(request({ q: 'ahmad' }))) as unknown as RouteResponse;

    expect(res.status).toBe(429);
    expect(body(res).error).toBe(RATE_LIMIT_MESSAGE);
    expect(mockLoadCommunityIndex).not.toHaveBeenCalled();
  });
});
