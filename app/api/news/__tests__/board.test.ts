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

vi.mock('@/backend/loaders/news', () => {
  class NewsBoardReadError extends Error {
    constructor(readonly scope: 'shared' | 'personal') {
      super('تعذّر تحميل ملخّص الأخبار. جرّب المحاولة مرة أخرى.');
      this.name = 'NewsBoardReadError';
    }
  }

  return {
    NewsBoardReadError,
    loadNewsBoard: (params: unknown, view: string, viewer?: unknown) =>
      mockLoadNewsBoard(params, view, viewer),
    parseNewsQuery: (params: Record<string, string | undefined>) => ({
      q: params.q,
      category: params.category,
      date: params.date,
    }),
    parseNewsView: (params: { view?: string }) => (params.view === 'public' ? 'public' : 'mine'),
  };
});

vi.mock('@/backend/config/identity', () => ({
  identity: { resolveOptional: async () => ({ user: null, client: null }) },
}));

const mockResolveNewsCardCap = vi.fn(async (_userId: string | null): Promise<number> => 5);

vi.mock('@/backend/services/news/card-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/backend/services/news/card-limit')>()),
  resolveNewsCardCap: (userId: string | null) => mockResolveNewsCardCap(userId),
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
import { NewsBoardReadError } from '@/backend/loaders/news';
import type { NewsBoard, NewsStory } from '@/shared/contracts/news';

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
  cards: null,
};

function story(id: string): NewsStory {
  return {
    id,
    position: 1,
    category: 'tech',
    region: 'world',
    headline: `خبر ${id}`,
    summary: 'ملخّص',
    whyItMatters: null,
    sourceId: 'example',
    sourceName: 'Example',
    sourceUrl: 'https://example.com/story',
    sourcePublishedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimitApi.mockResolvedValue(null);
  mockLoadNewsBoard.mockResolvedValue(SHARED_BOARD);
  mockResolveNewsCardCap.mockResolvedValue(5);
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
      'mine',
      null
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

  it('refuses a snapshot for an available digest the shared view is not showing', async () => {
    mockLoadNewsBoard.mockResolvedValue({
      ...SHARED_BOARD,
      personal: { enabled: true, available: true, active: false },
      preferences: null,
    });

    const res = (await boardGET(request({ view: 'public' }))) as unknown as RouteResponse;

    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('serves an anonymous board publicly', async () => {
    mockLoadNewsBoard.mockResolvedValue({
      ...SHARED_BOARD,
      personal: null,
      preferences: null,
    });

    const res = (await boardGET(request())) as unknown as RouteResponse;

    expect(res.headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
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
      'public',
      null
    );
  });

  it('cuts the day to the plan’s cards and says how many were hidden', async () => {
    mockLoadNewsBoard.mockResolvedValue({
      ...SHARED_BOARD,
      day: {
        digest: {
          id: 'digest-1',
          date: '2026-10-25',
          title: 'عنوان',
          lede: 'مقدّمة',
          storyCount: 3,
          model: 'model',
          publishedAt: '2026-10-25T06:00:00.000Z',
        },
        stories: [story('s-1'), story('s-2'), story('s-3')],
      },
    });
    mockResolveNewsCardCap.mockResolvedValue(1);

    const res = (await boardGET(request())) as unknown as RouteResponse;
    const board = (res.data as { board: NewsBoard }).board;

    expect(board.day?.stories).toHaveLength(1);
    expect(board.cards).toEqual({ cap: 1, total: 3, shown: 1, visitor: true });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('serves the whole digest, publicly, when it fits under the cap', async () => {
    mockLoadNewsBoard.mockResolvedValue({
      ...SHARED_BOARD,
      day: {
        digest: {
          id: 'digest-1',
          date: '2026-10-25',
          title: 'عنوان',
          lede: 'مقدّمة',
          storyCount: 2,
          model: 'model',
          publishedAt: '2026-10-25T06:00:00.000Z',
        },
        stories: [story('s-1'), story('s-2')],
      },
    });

    const res = (await boardGET(request())) as unknown as RouteResponse;
    const board = (res.data as { board: NewsBoard }).board;

    expect(board.day?.stories).toHaveLength(2);
    expect(board.cards).toBeNull();
    expect(res.headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
  });

  it('caps the search hits too, not just the day', async () => {
    mockLoadNewsBoard.mockResolvedValue({
      ...SHARED_BOARD,
      search: {
        query: 'اتفاق',
        category: null,
        hits: [
          { ...story('s-1'), digestDate: '2026-10-25' },
          { ...story('s-2'), digestDate: '2026-10-24' },
        ],
        truncated: false,
      },
    });
    mockResolveNewsCardCap.mockResolvedValue(1);

    const res = (await boardGET(request({ q: 'اتفاق' }))) as unknown as RouteResponse;
    const board = (res.data as { board: NewsBoard }).board;

    expect(board.search?.hits).toHaveLength(1);
    expect(board.cards).toEqual({ cap: 1, total: 2, shown: 1, visitor: true });
  });

  it('answers a failed read with 503, no-store and no board payload', async () => {
    mockLoadNewsBoard.mockRejectedValue(new NewsBoardReadError('shared'));

    const res = (await boardGET(request())) as unknown as RouteResponse;

    expect(res.status).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.data).toEqual({
      success: false,
      error: 'تعذّر تحميل ملخّص الأخبار. جرّب المحاولة مرة أخرى.',
    });
    expect(res.data).not.toHaveProperty('board');
  });

  it('does not cap or cache a failed read', async () => {
    mockLoadNewsBoard.mockRejectedValue(new NewsBoardReadError('personal'));

    await boardGET(request());

    expect(mockResolveNewsCardCap).not.toHaveBeenCalled();
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
