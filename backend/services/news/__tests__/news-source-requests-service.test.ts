import { describe, expect, it, vi } from 'vitest';

import type { NewsSourceRequestsRepository } from '@/backend/repositories/news/news-source-requests-repository';
import type { NewsSourcesRepository } from '@/backend/repositories/news/news-sources-repository';
import type { NewsCatalogue } from '@/backend/services/news/news-catalogue';
import {
  createNewsAdminService,
  createNewsSourceRequestsService,
  FeedUnavailableError,
  NewsSourceAlreadyKnownError,
  NewsSourceAlreadyQueuedError,
  NewsSourceRequestDecidedError,
  NewsSourceRequestPendingError,
} from '@/backend/services/news/news-source-requests-service';
import type { NewsSource, NewsSourceRequest } from '@/shared/contracts/news';

const CATALOGUE: NewsSource[] = [
  { id: 'aljazeera-ar', name: 'الجزيرة نت', category: 'politics', region: 'arab', tier: 1 },
];

function request(overrides: Partial<NewsSourceRequest> = {}): NewsSourceRequest {
  return {
    id: 'request-1',
    url: 'https://example.com/rss',
    name: 'مثال',
    status: 'pending',
    category: null,
    region: null,
    tier: null,
    note: null,
    createdAt: '2026-10-23T00:00:00.000Z',
    reviewedAt: null,
    sourceId: null,
    ...overrides,
  };
}

function requests(
  overrides: Partial<NewsSourceRequestsRepository> = {}
): NewsSourceRequestsRepository {
  return {
    countPending: vi.fn(async () => 0),
    findPendingIdByUrl: vi.fn(async () => null),
    insert: vi.fn(async (input) =>
      request({ url: input.url, name: input.name, id: 'request-new' })
    ),
    listForUser: vi.fn(async () => []),
    listForAdmin: vi.fn(async () => []),
    findById: vi.fn(async () => request()),
    markApproved: vi.fn(async () => undefined),
    markRejected: vi.fn(async () => undefined),
    ...overrides,
  } satisfies NewsSourceRequestsRepository;
}

function sources(overrides: Partial<NewsSourcesRepository> = {}): NewsSourcesRepository {
  return {
    listEnabled: vi.fn(async () => []),
    findIdByUrl: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    insert: vi.fn(async () => undefined),
    ...overrides,
  } satisfies NewsSourcesRepository;
}

function catalogue(list: NewsSource[] = CATALOGUE): NewsCatalogue {
  return { list: vi.fn(async () => list) };
}

const probe = vi.fn(async () => ({ itemCount: 3 }));

describe('news source requests service', () => {
  const deps = (
    overrides: Partial<Parameters<typeof createNewsSourceRequestsService>[0]> = {}
  ) => ({
    requests: requests(),
    sources: sources(),
    catalogue: catalogue(),
    probe,
    ...overrides,
  });

  it('files a probed feed, storing the canonical URL', async () => {
    const repo = requests();
    const service = createNewsSourceRequestsService(deps({ requests: repo }));

    await service.submit('user-1', { name: '  مثال  ', url: 'https://example.com/rss/' });

    expect(repo.insert).toHaveBeenCalledWith({
      userId: 'user-1',
      url: 'https://example.com/rss',
      name: 'مثال',
    });
  });

  it('refuses a URL that is not a feed without writing anything', async () => {
    const repo = requests();
    const service = createNewsSourceRequestsService(deps({ requests: repo }));

    await expect(
      service.submit('user-1', { name: 'مثال', url: 'not-a-url' })
    ).rejects.toBeInstanceOf(FeedUnavailableError);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('refuses a source that is already in the catalogue', async () => {
    const service = createNewsSourceRequestsService(
      deps({ sources: sources({ findIdByUrl: vi.fn(async () => 'aljazeera-ar') }) })
    );

    await expect(
      service.submit('user-1', { name: 'مثال', url: 'https://example.com/rss' })
    ).rejects.toBeInstanceOf(NewsSourceAlreadyKnownError);
  });

  it('refuses a feed another reader already proposed', async () => {
    const service = createNewsSourceRequestsService(
      deps({ requests: requests({ findPendingIdByUrl: vi.fn(async () => 'request-9') }) })
    );

    await expect(
      service.submit('user-1', { name: 'مثال', url: 'https://example.com/rss' })
    ).rejects.toBeInstanceOf(NewsSourceAlreadyQueuedError);
  });

  it('holds one open request per account', async () => {
    const service = createNewsSourceRequestsService(
      deps({ requests: requests({ countPending: vi.fn(async () => 1) }) })
    );

    await expect(
      service.submit('user-1', { name: 'مثال', url: 'https://example.com/rss' })
    ).rejects.toBeInstanceOf(NewsSourceRequestPendingError);
  });

  it('turns a probe refusal into the form message', async () => {
    const service = createNewsSourceRequestsService(
      deps({
        probe: vi.fn(async () => {
          throw new Error('boom');
        }),
      })
    );

    await expect(
      service.submit('user-1', { name: 'مثال', url: 'https://example.com/rss' })
    ).rejects.toThrow();
  });
});

describe('news admin service', () => {
  it('approves with a host slug and writes the catalogue row first', async () => {
    const repo = requests();
    const sourcesRepo = sources();
    const service = createNewsAdminService({
      requests: repo,
      sources: sourcesRepo,
      catalogue: catalogue(),
    });

    await service.approve(
      'request-1',
      { category: 'world', region: 'world', tier: 2, note: 'جيد' },
      'admin-1'
    );

    expect(sourcesRepo.insert).toHaveBeenCalledWith({
      id: 'example-com',
      name: 'مثال',
      url: 'https://example.com/rss',
      category: 'world',
      region: 'world',
      tier: 2,
      approvedBy: 'admin-1',
      requestId: 'request-1',
    });
    expect(repo.markApproved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'request-1', sourceId: 'example-com' })
    );
  });

  it('suffixes an id the catalogue already holds', async () => {
    const sourcesRepo = sources();
    const service = createNewsAdminService({
      requests: requests(),
      sources: sourcesRepo,
      catalogue: catalogue([
        { id: 'example-com', name: 'قديم', category: 'world', region: 'world', tier: 2 },
      ]),
    });

    await service.approve('request-1', { category: 'world', region: 'world', tier: 2 }, 'admin-1');

    expect(sourcesRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'example-com-2' })
    );
  });

  it('refuses to decide a request twice', async () => {
    const service = createNewsAdminService({
      requests: requests({ findById: vi.fn(async () => request({ status: 'approved' })) }),
      sources: sources(),
      catalogue: catalogue(),
    });

    await expect(service.reject('request-1', {}, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceRequestDecidedError
    );
  });

  it('records the rejection note and the reviewer', async () => {
    const repo = requests();
    const service = createNewsAdminService({
      requests: repo,
      sources: sources(),
      catalogue: catalogue(),
    });

    await service.reject('request-1', { note: 'ليست خلاصة' }, 'admin-1');

    expect(repo.markRejected).toHaveBeenCalledWith({
      id: 'request-1',
      note: 'ليست خلاصة',
      reviewedBy: 'admin-1',
    });
  });
});
