import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const IP = '1.2.3.4';
const RATE_LIMIT_MESSAGE = 'تم تجاوز حدّ الطلب: فتح الملخّص محدود بـ 60 طلبًا في الدقيقة.';

const mockLoadNewsBoard = vi.fn();
const mockCheckRateLimitApi = vi.fn();
const mockGetClientIp = vi.fn((_request: NextRequest) => IP);
const mockPolicy = vi.fn((ip: string) => ({
  key: `news-board:${ip}`,
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
  loadNewsBoard: (params: unknown, view: string) => mockLoadNewsBoard(params, view),
  parseNewsQuery: (params: Record<string, string | undefined>) => ({
    q: params.q,
    category: params.category,
    date: params.date,
  }),
  parseNewsView: (params: { view?: string }) => (params.view === 'public' ? 'public' : 'mine'),
}));

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));

vi.mock('@/backend/config/rate-limiter', () => ({
  newsBoardRateLimitPolicy: (ip: string) => mockPolicy(ip),
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

import { GET as boardGET } from '@/app/api/news/board/route';
import type { NewsBoard } from '@/shared/contracts/news';

interface RouteResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

function request(params: Record<string, string> = {}): NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
    headers: new Headers(),
  } as unknown as NextRequest;
}

const SHARED_BOARD: NewsBoard = {
  day: null,
  dates: [],
  search: null,
  hasAnyDigest: true,
  preferences: null,
  personal: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimitApi.mockResolvedValue(null);
  mockLoadNewsBoard.mockResolvedValue(SHARED_BOARD);
});

/**
 * The board read (#555).
 *
 * The route's job is the *posture* of the answer, because that posture is what
 * decides whether the client may keep the rows: the shared digest is `public`
 * and may be recorded, anything the reader's own sources shaped is `no-store`
 * and may not. Without that split, the snapshot store would be a hole in
 * ADR-0031 rather than the read-only window it is meant to be.
 */
describe('GET /api/news/board', () => {
  it('serves the shared digest as a public read', async () => {
    const res = (await boardGET(
      request({ date: '2026-10-25', category: 'tech' })
    )) as unknown as RouteResponse;

    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
    expect(mockLoadNewsBoard).toHaveBeenCalledWith(
      { q: undefined, category: 'tech', date: '2026-10-25', view: 'mine' },
      'mine'
    );
  });

  it('refuses a snapshot for the reader’s own digest', async () => {
    mockLoadNewsBoard.mockResolvedValue({
      ...SHARED_BOARD,
      personal: { enabled: true, available: true, active: true },
    });

    const res = (await boardGET(request())) as unknown as RouteResponse;

    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('refuses a snapshot for a digest narrowed by the reader’s sources', async () => {
    mockLoadNewsBoard.mockResolvedValue({
      ...SHARED_BOARD,
      preferences: { selectedSources: 1, filtered: true, fellBack: false },
      personal: { enabled: false, available: false, active: false },
    });

    const res = (await boardGET(request())) as unknown as RouteResponse;

    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('passes the shared view through to the loader', async () => {
    await boardGET(request({ view: 'public', q: 'اتفاق' }));

    expect(mockLoadNewsBoard).toHaveBeenCalledWith(
      { q: 'اتفاق', category: undefined, date: undefined, view: 'public' },
      'public'
    );
  });

  it('returns 429 with the limiter’s message when the per-IP limit is exhausted', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: RATE_LIMIT_MESSAGE },
    });

    const res = (await boardGET(request())) as unknown as RouteResponse;

    expect(res.status).toBe(429);
    expect((res.data as { error: string }).error).toBe(RATE_LIMIT_MESSAGE);
    expect(mockLoadNewsBoard).not.toHaveBeenCalled();
  });

  it('throttles per client IP and fails open on a limiter outage', async () => {
    await boardGET(request());

    expect(mockPolicy).toHaveBeenCalledWith(IP);
    expect(mockCheckRateLimitApi).toHaveBeenCalledWith({
      key: `news-board:${IP}`,
      limit: 60,
      windowMs: 60_000,
      message: RATE_LIMIT_MESSAGE,
      failClosed: false,
    });
  });
});
