import { describe, expect, it, vi } from 'vitest';

import rawSources from '@/data/news/sources.json';
import {
  NewsSourceRequestDbError,
  OPEN_REQUEST_URL_CONSTRAINT,
  OPEN_REQUEST_USER_CONSTRAINT,
  type NewsSourceRequestsRepository,
} from '@/backend/repositories/news/news-source-requests-repository';
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

/**
 * A feed `data/news/sources.json` really carries: the file is the subject of the
 * dedupe, so a fixture would test a list that is not the shipped one.
 */
function shippedFeedUrl(): URL {
  const first = rawSources.sources[0];
  const value = first && typeof first.url === 'string' ? first.url : null;
  if (!value) throw new Error('data/news/sources.json carries no feed URL');
  return new URL(value);
}

/** The SQLSTATE the approval RPC raises for a taken id, as PostgREST reports it. */
function rpcError(code: string, message = 'approval refused') {
  return Object.assign(new Error(message), { code });
}

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
    approve: vi.fn(async (input) =>
      request({
        status: 'approved',
        category: input.category,
        region: input.region,
        tier: input.tier,
        note: input.note,
        reviewedAt: '2026-10-25T00:00:00.000Z',
        sourceId: input.sourceId,
      })
    ),
    markRejected: vi.fn(async () => undefined),
    ...overrides,
  } satisfies NewsSourceRequestsRepository;
}

function sources(overrides: Partial<NewsSourcesRepository> = {}): NewsSourcesRepository {
  return {
    listEnabled: vi.fn(async () => []),
    findIdByUrl: vi.fn(async () => null),
    findById: vi.fn(async () => null),
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

  it('refuses a feed the source file already lists, before probing', async () => {
    const repo = requests();
    const probeOnce = vi.fn(async () => ({ itemCount: 2 }));
    const service = createNewsSourceRequestsService(deps({ requests: repo, probe: probeOnce }));

    await expect(
      service.submit('user-1', { name: 'مثال', url: shippedFeedUrl().toString() })
    ).rejects.toBeInstanceOf(NewsSourceAlreadyKnownError);

    expect(probeOnce).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('compares a proposal to the file canonically', async () => {
    const feed = shippedFeedUrl();
    const port = feed.protocol === 'https:' ? 443 : 80;
    const variants = [
      `${feed.origin}${feed.pathname}/`,
      `${feed.protocol}//${feed.hostname.toUpperCase()}${feed.pathname}`,
      `${feed.origin}${feed.pathname}#latest`,
      `${feed.protocol}//${feed.hostname}:${port}${feed.pathname}`,
    ];
    const service = createNewsSourceRequestsService(deps());

    for (const url of variants) {
      await expect(service.submit('user-1', { name: 'مثال', url })).rejects.toBeInstanceOf(
        NewsSourceAlreadyKnownError
      );
    }
  });

  it('answers the open-URL index as a feed another reader has queued', async () => {
    const repo = requests({
      insert: vi.fn(async () => {
        throw new NewsSourceRequestDbError(
          '23505',
          OPEN_REQUEST_URL_CONSTRAINT,
          `duplicate key value violates unique constraint "${OPEN_REQUEST_URL_CONSTRAINT}"`
        );
      }),
    });
    const service = createNewsSourceRequestsService(deps({ requests: repo }));

    const refusal = await service
      .submit('user-2', { name: 'مثال', url: 'https://example.com/rss' })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(NewsSourceAlreadyQueuedError);
    expect(refusal).toMatchObject({ code: 'source_queued', statusCode: 409 });
  });

  it('answers the open-user index as this account already having a request', async () => {
    const repo = requests({
      insert: vi.fn(async () => {
        throw new NewsSourceRequestDbError(
          '23505',
          OPEN_REQUEST_USER_CONSTRAINT,
          `duplicate key value violates unique constraint "${OPEN_REQUEST_USER_CONSTRAINT}"`
        );
      }),
    });
    const service = createNewsSourceRequestsService(deps({ requests: repo }));

    const refusal = await service
      .submit('user-1', { name: 'مثال', url: 'https://example.com/rss' })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(NewsSourceRequestPendingError);
    expect(refusal).toMatchObject({ code: 'request_pending', statusCode: 409 });
  });

  it('keeps an unrelated database failure a failure', async () => {
    const boom = new NewsSourceRequestDbError(
      '23503',
      'news_source_requests_user_id_fkey',
      'insert or update on table "news_source_requests" violates foreign key constraint'
    );
    const repo = requests({
      insert: vi.fn(async () => {
        throw boom;
      }),
    });
    const service = createNewsSourceRequestsService(deps({ requests: repo }));

    await expect(
      service.submit('user-1', { name: 'مثال', url: 'https://example.com/rss' })
    ).rejects.toBe(boom);
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
  const approval = { category: 'world', region: 'world', tier: 2, note: 'جيد' } as const;

  function admin(
    repo: NewsSourceRequestsRepository,
    list: NewsSource[] = CATALOGUE
  ): ReturnType<typeof createNewsAdminService> {
    return createNewsAdminService({ requests: repo, catalogue: catalogue(list) });
  }

  it('approves through one RPC call with a host slug', async () => {
    const repo = requests();

    const approved = await admin(repo).approve('request-1', approval, 'admin-1');

    expect(repo.approve).toHaveBeenCalledWith({
      id: 'request-1',
      sourceId: 'example-com',
      sourceName: 'مثال',
      sourceUrl: 'https://example.com/rss',
      category: 'world',
      region: 'world',
      tier: 2,
      note: 'جيد',
      reviewedBy: 'admin-1',
    });
    expect(approved.status).toBe('approved');
    expect(approved.sourceId).toBe('example-com');
  });

  it('suffixes an id the catalogue already holds', async () => {
    const repo = requests();

    await admin(repo, [
      { id: 'example-com', name: 'قديم', category: 'world', region: 'world', tier: 2 },
    ]).approve('request-1', approval, 'admin-1');

    expect(repo.approve).toHaveBeenCalledTimes(1);
    expect(repo.approve).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'example-com-2' })
    );
  });

  it('takes the next suffix when the id is claimed between the read and the RPC', async () => {
    const repo = requests({
      approve: vi
        .fn()
        .mockRejectedValueOnce(rpcError('NS001'))
        .mockImplementationOnce(async (input) =>
          request({ status: 'approved', sourceId: input.sourceId })
        ),
    });

    const approved = await admin(repo).approve('request-1', approval, 'admin-1');

    expect(repo.approve).toHaveBeenCalledTimes(2);
    expect(repo.approve).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sourceId: 'example-com' })
    );
    expect(repo.approve).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceId: 'example-com-2' })
    );
    expect(approved.sourceId).toBe('example-com-2');
  });

  it('propagates a failed approval without a retry or a second write', async () => {
    const repo = requests({
      approve: vi.fn(async () => {
        throw rpcError('XX000', 'boom');
      }),
    });

    await expect(admin(repo).approve('request-1', approval, 'admin-1')).rejects.toThrow('boom');

    expect(repo.approve).toHaveBeenCalledTimes(1);
    expect(repo.findById).toHaveBeenCalledTimes(1);
  });

  it('maps an already-decided refusal to the 409 the queue shows', async () => {
    const repo = requests({
      approve: vi.fn(async () => {
        throw rpcError('NS002');
      }),
    });

    await expect(admin(repo).approve('request-1', approval, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceRequestDecidedError
    );
    expect(repo.approve).toHaveBeenCalledTimes(1);
  });

  it('maps a feed that already has a source to the known-source 409', async () => {
    const repo = requests({
      approve: vi.fn(async () => {
        throw rpcError('NS003');
      }),
    });

    await expect(admin(repo).approve('request-1', approval, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceAlreadyKnownError
    );
    expect(repo.approve).toHaveBeenCalledTimes(1);
  });

  it('refuses to approve a feed the source file lists by now', async () => {
    const repo = requests({
      findById: vi.fn(async () => request({ url: shippedFeedUrl().toString() })),
    });

    await expect(admin(repo).approve('request-1', approval, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceAlreadyKnownError
    );
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('approves exactly once and refuses the retry', async () => {
    let status: NewsSourceRequest['status'] = 'pending';
    const repo = requests({
      findById: vi.fn(async () => request({ status })),
      approve: vi.fn(async (input) => {
        status = 'approved';
        return request({ status: 'approved', sourceId: input.sourceId });
      }),
    });
    const service = admin(repo);

    const approved = await service.approve('request-1', approval, 'admin-1');
    await expect(service.approve('request-1', approval, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceRequestDecidedError
    );

    expect(approved.sourceId).toBe('example-com');
    expect(repo.approve).toHaveBeenCalledTimes(1);
  });

  it('refuses to decide a request twice', async () => {
    const service = admin(
      requests({ findById: vi.fn(async () => request({ status: 'approved' })) })
    );

    await expect(service.reject('request-1', {}, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceRequestDecidedError
    );
  });

  it('records the rejection note and the reviewer', async () => {
    const repo = requests();

    await admin(repo).reject('request-1', { note: 'ليست خلاصة' }, 'admin-1');

    expect(repo.markRejected).toHaveBeenCalledWith({
      id: 'request-1',
      note: 'ليست خلاصة',
      reviewedBy: 'admin-1',
    });
  });
});
