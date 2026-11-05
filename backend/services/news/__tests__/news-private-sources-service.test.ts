import { describe, expect, it, vi } from 'vitest';

import type { NewsSourceRequestsRepository } from '@/backend/repositories/news/news-source-requests-repository';
import type { NewsUserSourcesRepository } from '@/backend/repositories/news/news-user-sources-repository';
import {
  createNewsPrivateSourcesService,
  NewsPrivateSourceNotFoundError,
} from '@/backend/services/news/news-private-sources-service';
import type { NewsPrivateSource, NewsSourceRequest } from '@/shared/contracts/news';

function source(overrides: Partial<NewsPrivateSource> = {}): NewsPrivateSource {
  return {
    id: 'source-1',
    name: 'مدونة',
    url: 'https://example.com/rss',
    kind: 'feed',
    category: 'tech',
    region: 'world',
    status: 'ready',
    failureCount: 0,
    lastError: null,
    lastCheckedAt: null,
    createdAt: '2026-10-30T00:00:00.000Z',
    ...overrides,
  };
}

function request(overrides: Partial<NewsSourceRequest> = {}): NewsSourceRequest {
  return {
    id: 'request-1',
    url: 'https://t.me/example',
    name: 't.me',
    status: 'resolving',
    kind: null,
    resolvedUrl: null,
    failure: null,
    failureDetail: null,
    attempts: 0,
    resolvedAt: null,
    category: null,
    region: null,
    tier: null,
    note: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    reviewedAt: null,
    sourceId: null,
    userSourceId: null,
    ...overrides,
  };
}

function repository(overrides: Partial<NewsUserSourcesRepository> = {}): NewsUserSourcesRepository {
  return {
    list: vi.fn(async () => [source()]),
    count: vi.fn(async () => 1),
    findIdByUrl: vi.fn(async () => null),
    remove: vi.fn(async () => true),
    ...overrides,
  } satisfies NewsUserSourcesRepository;
}

function pendingRequests(rows: NewsSourceRequest[] = []) {
  return {
    listOwnedPending: vi.fn(async () => rows),
  } satisfies Pick<NewsSourceRequestsRepository, 'listOwnedPending'>;
}

function serviceWith(
  next: {
    sources?: NewsUserSourcesRepository;
    pending?: NewsSourceRequest[];
  } = {}
) {
  return createNewsPrivateSourcesService({
    sources: next.sources ?? repository(),
    requests: pendingRequests(next.pending),
    quota: async () => ({ cap: 10, unlimited: false }),
  });
}

describe('private news sources service', () => {
  it('answers one list of feeds and the links still on their way', async () => {
    const summary = await serviceWith({
      sources: repository({
        list: vi.fn(async () => [
          source(),
          source({ id: 'source-2', status: 'broken', createdAt: '2026-10-29T00:00:00.000Z' }),
        ]),
      }),
      pending: [
        request(),
        request({
          id: 'request-2',
          status: 'rejected',
          createdAt: '2026-11-02T00:00:00.000Z',
        }),
      ],
    }).list('user-1');

    expect(summary.rows.map((row) => row.state)).toEqual([
      'rejected',
      'resolving',
      'live',
      'broken',
    ]);
    expect(summary.rows[0]).toMatchObject({ kind: 'request', url: 'https://t.me/example' });
    expect(summary.rows[2]).toMatchObject({ kind: 'source', lastError: null });
    expect(summary).toMatchObject({ cap: 10, limited: true, used: 3 });
  });

  it('counts a pending request against the plan, and a refused one not at all', async () => {
    const summary = await serviceWith({
      pending: [
        request({ id: 'open-1' }),
        request({ id: 'open-2', status: 'needs_review' }),
        request({ id: 'refused-1', status: 'rejected' }),
      ],
    }).list('user-1');

    // One held source + the two open rows; the rejected row holds no slot.
    expect(summary.used).toBe(3);
  });

  it('keeps the failure the system answered a link with', async () => {
    const summary = await serviceWith({
      pending: [
        request({ status: 'needs_review', failure: 'no-feed', note: 'لا خلاصة' }),
        request({ id: 'request-2', status: 'rejected', note: 'ليست مصدرًا' }),
      ],
    }).list('user-1');

    expect(summary.rows[0]).toMatchObject({ failure: 'no-feed', note: 'لا خلاصة' });
    expect(summary.rows[1]).toMatchObject({ failure: null, note: 'ليست مصدرًا' });
  });

  it('says an Admin has no ceiling', async () => {
    const service = createNewsPrivateSourcesService({
      sources: repository(),
      requests: pendingRequests(),
      quota: async () => ({ cap: 10, unlimited: true }),
    });

    expect(await service.list('admin-1')).toMatchObject({ limited: false, used: 1 });
  });

  it('removes the reader’s own row', async () => {
    const sources = repository();
    const service = serviceWith({ sources });

    await service.remove('user-1', 'source-1');

    expect(sources.remove).toHaveBeenCalledWith('user-1', 'source-1');
  });

  it('answers a row that is not the reader’s as missing', async () => {
    const service = serviceWith({ sources: repository({ remove: vi.fn(async () => false) }) });

    await expect(service.remove('user-1', 'someone-else')).rejects.toBeInstanceOf(
      NewsPrivateSourceNotFoundError
    );
  });
});
