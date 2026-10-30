import { describe, expect, it, vi } from 'vitest';

import rawSources from '@/data/news/sources.json';
import {
  NewsSourceRequestDbError,
  OPEN_REQUEST_URL_CONSTRAINT,
  OPEN_REQUEST_USER_CONSTRAINT,
  type NewsSourceRequestsRepository,
} from '@/backend/repositories/news/news-source-requests-repository';
import type { NewsSourcesRepository } from '@/backend/repositories/news/news-sources-repository';
import { FeedProbeError } from '@/backend/services/news/feed-probe';
import type { NewsCatalogue } from '@/backend/services/news/news-catalogue';
import {
  createNewsAdminService,
  createNewsSourceRequestsService,
  FeedUnavailableError,
  NewsSourceAlreadyKnownError,
  NewsSourceAlreadyQueuedError,
  NewsSourceFeedRequiredError,
  NewsSourceRequestDecidedError,
  NewsSourceRequestPendingError,
  NewsSourceRequestResolvingError,
  NewsSourceUrlInvalidError,
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
    status: 'ready',
    kind: 'feed',
    resolvedUrl: 'https://example.com/rss',
    failure: null,
    failureDetail: null,
    attempts: 1,
    resolvedAt: '2026-10-30T00:00:00.000Z',
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
      request({
        url: input.url,
        name: input.name,
        id: 'request-new',
        status: 'resolving',
        kind: null,
        resolvedUrl: null,
        attempts: 0,
        resolvedAt: null,
      })
    ),
    listForUser: vi.fn(async () => []),
    listForAdmin: vi.fn(async () => []),
    findById: vi.fn(async () => request()),
    approve: vi.fn(async (input) =>
      request({
        status: 'approved',
        kind: input.kind,
        resolvedUrl: input.sourceUrl,
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

const probeImpl = async () => ({ itemCount: 3 });

describe('news source requests service', () => {
  const deps = (
    overrides: Partial<Parameters<typeof createNewsSourceRequestsService>[0]> = {}
  ) => ({
    requests: requests(),
    sources: sources(),
    ...overrides,
  });

  it('files any link as resolving, without reading it', async () => {
    const repo = requests();

    const filed = await createNewsSourceRequestsService(deps({ requests: repo })).submit('user-1', {
      name: '  مثال  ',
      url: 'https://example.com/',
    });

    expect(repo.insert).toHaveBeenCalledWith({
      userId: 'user-1',
      url: 'https://example.com/',
      name: 'مثال',
    });
    expect(filed.status).toBe('resolving');
  });

  it('files a page and a Telegram channel, which are not feeds', async () => {
    const repo = requests();
    const service = createNewsSourceRequestsService(deps({ requests: repo }));

    await service.submit('user-1', { name: 'صفحة', url: 'https://example.com/news' });
    await service.submit('user-1', { name: 'قناة', url: 'https://t.me/example' });

    expect(repo.insert).toHaveBeenCalledTimes(2);
  });

  it('refuses a URL that is not http(s)', async () => {
    const repo = requests();

    await expect(
      createNewsSourceRequestsService(deps({ requests: repo })).submit('user-1', {
        name: 'مثال',
        url: 'not-a-url',
      })
    ).rejects.toBeInstanceOf(NewsSourceUrlInvalidError);

    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('refuses a source that is already in the catalogue', async () => {
    const repo = requests();

    await expect(
      createNewsSourceRequestsService(
        deps({
          requests: repo,
          sources: sources({ findIdByUrl: vi.fn(async () => 'example-com') }),
        })
      ).submit('user-1', { name: 'مثال', url: 'https://example.com/rss' })
    ).rejects.toBeInstanceOf(NewsSourceAlreadyKnownError);

    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('refuses a feed another reader already proposed', async () => {
    const repo = requests({ findPendingIdByUrl: vi.fn(async () => 'other-request') });

    await expect(
      createNewsSourceRequestsService(deps({ requests: repo })).submit('user-1', {
        name: 'مثال',
        url: 'https://example.com/rss',
      })
    ).rejects.toBeInstanceOf(NewsSourceAlreadyQueuedError);
  });

  it('refuses a feed the source file already lists', async () => {
    const repo = requests();

    await expect(
      createNewsSourceRequestsService(deps({ requests: repo })).submit('user-1', {
        name: 'مثال',
        url: shippedFeedUrl().toString(),
      })
    ).rejects.toBeInstanceOf(NewsSourceAlreadyKnownError);
  });

  it('compares a proposal to the file canonically', async () => {
    const repo = requests();
    const url = new URL(shippedFeedUrl().toString());
    url.hash = '#top';

    await expect(
      createNewsSourceRequestsService(deps({ requests: repo })).submit('user-1', {
        name: 'مثال',
        url: url.toString(),
      })
    ).rejects.toBeInstanceOf(NewsSourceAlreadyKnownError);
  });

  it('answers the open-URL index as a link another reader has queued', async () => {
    const repo = requests({
      insert: vi.fn(async () => {
        throw new NewsSourceRequestDbError('23505', OPEN_REQUEST_URL_CONSTRAINT, 'duplicate');
      }),
    });

    await expect(
      createNewsSourceRequestsService(deps({ requests: repo })).submit('user-2', {
        name: 'مثال',
        url: 'https://example.com/rss',
      })
    ).rejects.toBeInstanceOf(NewsSourceAlreadyQueuedError);
  });

  it('answers the open-user index as this account already having a request', async () => {
    const repo = requests({
      insert: vi.fn(async () => {
        throw new NewsSourceRequestDbError('23505', OPEN_REQUEST_USER_CONSTRAINT, 'duplicate');
      }),
    });

    await expect(
      createNewsSourceRequestsService(deps({ requests: repo })).submit('user-1', {
        name: 'مثال',
        url: 'https://example.com/rss',
      })
    ).rejects.toBeInstanceOf(NewsSourceRequestPendingError);
  });

  it('keeps an unrelated database failure a failure', async () => {
    const error = new NewsSourceRequestDbError('42501', null, 'permission denied');
    const repo = requests({
      insert: vi.fn(async () => {
        throw error;
      }),
    });

    await expect(
      createNewsSourceRequestsService(deps({ requests: repo })).submit('user-1', {
        name: 'مثال',
        url: 'https://example.com/rss',
      })
    ).rejects.toBe(error);
  });

  it('holds one open request per account', async () => {
    const repo = requests({ countPending: vi.fn(async () => 1) });

    await expect(
      createNewsSourceRequestsService(deps({ requests: repo })).submit('user-1', {
        name: 'مثال',
        url: 'https://example.com/rss',
      })
    ).rejects.toBeInstanceOf(NewsSourceRequestPendingError);

    expect(repo.insert).not.toHaveBeenCalled();
  });
});

describe('news admin service', () => {
  const approval = { category: 'world', region: 'world', tier: 2, note: 'جيد' } as const;

  function admin(
    repo: NewsSourceRequestsRepository,
    list: NewsSource[] = CATALOGUE,
    probe: (url: string) => Promise<{ itemCount: number }> = vi.fn(probeImpl)
  ): ReturnType<typeof createNewsAdminService> {
    return createNewsAdminService({ requests: repo, catalogue: catalogue(list), probe });
  }

  it('approves the resolved feed through one RPC call with a host slug', async () => {
    const repo = requests();
    const probe = vi.fn(probeImpl);

    const approved = await admin(repo, CATALOGUE, probe).approve('request-1', approval, 'admin-1');

    expect(repo.approve).toHaveBeenCalledWith({
      id: 'request-1',
      sourceId: 'example-com',
      sourceName: 'مثال',
      sourceUrl: 'https://example.com/rss',
      kind: 'feed',
      category: 'world',
      region: 'world',
      tier: 2,
      note: 'جيد',
      reviewedBy: 'admin-1',
    });
    expect(approved.status).toBe('approved');
    expect(approved.sourceId).toBe('example-com');
    expect(probe).not.toHaveBeenCalled();
  });

  it('refuses to decide a row the resolver has not answered', async () => {
    const repo = requests({
      findById: vi.fn(async () =>
        request({ status: 'resolving', kind: null, resolvedUrl: null, resolvedAt: null })
      ),
    });

    await expect(admin(repo).approve('request-1', approval, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceRequestResolvingError
    );
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('keeps a Telegram source a Telegram source', async () => {
    const repo = requests({
      findById: vi.fn(async () =>
        request({
          url: 'https://t.me/example',
          kind: 'telegram',
          resolvedUrl: 'https://t.me/s/example',
        })
      ),
    });

    await admin(repo).approve('request-1', approval, 'admin-1');

    expect(repo.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://t.me/s/example',
        kind: 'telegram',
        sourceId: 't-me',
      })
    );
  });

  it('needs a pasted feed for a row the resolver could not convert', async () => {
    const repo = requests({
      findById: vi.fn(async () =>
        request({
          url: 'https://facebook.com/example',
          status: 'needs_review',
          kind: null,
          resolvedUrl: null,
          failure: 'unsupported',
          failureDetail: 'facebook: no free public feed',
        })
      ),
    });

    await expect(admin(repo).approve('request-1', approval, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceFeedRequiredError
    );
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('approves a needs_review row with the Admin-pasted feed, after probing it', async () => {
    const repo = requests({
      findById: vi.fn(async () =>
        request({
          url: 'https://facebook.com/example',
          status: 'needs_review',
          kind: null,
          resolvedUrl: null,
          failure: 'unsupported',
        })
      ),
    });
    const probe = vi.fn(probeImpl);

    await admin(repo, CATALOGUE, probe).approve(
      'request-1',
      { ...approval, feedUrl: 'https://example.org/rss.xml' },
      'admin-1'
    );

    expect(probe).toHaveBeenCalledWith('https://example.org/rss.xml');
    expect(repo.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://example.org/rss.xml',
        kind: 'feed',
        sourceId: 'example-org',
      })
    );
  });

  it('refuses a pasted URL the probe does not accept', async () => {
    const repo = requests({
      findById: vi.fn(async () =>
        request({ status: 'needs_review', resolvedUrl: null, kind: null })
      ),
    });
    const service = createNewsAdminService({
      requests: repo,
      catalogue: catalogue(),
      probe: vi.fn(async () => {
        throw new FeedProbeError('not-a-feed');
      }),
    });

    await expect(
      service.approve('request-1', { ...approval, feedUrl: 'https://example.org/page' }, 'admin-1')
    ).rejects.toBeInstanceOf(FeedUnavailableError);
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('refuses a pasted URL that is not public', async () => {
    const repo = requests({
      findById: vi.fn(async () =>
        request({ status: 'needs_review', resolvedUrl: null, kind: null })
      ),
    });
    const probe = vi.fn(probeImpl);

    await expect(
      admin(repo, CATALOGUE, probe).approve(
        'request-1',
        { ...approval, feedUrl: 'http://127.0.0.1/rss' },
        'admin-1'
      )
    ).rejects.toBeInstanceOf(NewsSourceUrlInvalidError);
    expect(probe).not.toHaveBeenCalled();
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

  it('maps a missing-feed refusal from the RPC to the form message', async () => {
    const repo = requests({
      approve: vi.fn(async () => {
        throw rpcError('NS004');
      }),
    });

    await expect(admin(repo).approve('request-1', approval, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceFeedRequiredError
    );
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
      findById: vi.fn(async () =>
        request({ url: shippedFeedUrl().toString(), resolvedUrl: shippedFeedUrl().toString() })
      ),
    });

    await expect(admin(repo).approve('request-1', approval, 'admin-1')).rejects.toBeInstanceOf(
      NewsSourceAlreadyKnownError
    );
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('approves exactly once and refuses the retry', async () => {
    let status: NewsSourceRequest['status'] = 'ready';
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
