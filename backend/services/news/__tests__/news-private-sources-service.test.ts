import { describe, expect, it, vi } from 'vitest';

import type { NewsUserSourcesRepository } from '@/backend/repositories/news/news-user-sources-repository';
import {
  createNewsPrivateSourcesService,
  NewsPrivateSourceNotFoundError,
} from '@/backend/services/news/news-private-sources-service';
import type { NewsPrivateSource } from '@/shared/contracts/news';

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

function repository(overrides: Partial<NewsUserSourcesRepository> = {}): NewsUserSourcesRepository {
  return {
    list: vi.fn(async () => [source()]),
    count: vi.fn(async () => 1),
    findIdByUrl: vi.fn(async () => null),
    remove: vi.fn(async () => true),
    ...overrides,
  } satisfies NewsUserSourcesRepository;
}

describe('private news sources service', () => {
  it('answers the list with the plan ceiling alongside it', async () => {
    const service = createNewsPrivateSourcesService({
      sources: repository(),
      quota: async () => ({ cap: 10, unlimited: false }),
    });

    const summary = await service.list('user-1');

    expect(summary.sources).toHaveLength(1);
    expect(summary).toMatchObject({ used: 1, cap: 10, limited: true });
  });

  it('says an Admin has no ceiling', async () => {
    const service = createNewsPrivateSourcesService({
      sources: repository(),
      quota: async () => ({ cap: 10, unlimited: true }),
    });

    expect(await service.list('admin-1')).toMatchObject({ limited: false, used: 1 });
  });

  it('removes the reader’s own row', async () => {
    const sources = repository();
    const service = createNewsPrivateSourcesService({
      sources,
      quota: async () => ({ cap: 1, unlimited: false }),
    });

    await service.remove('user-1', 'source-1');

    expect(sources.remove).toHaveBeenCalledWith('user-1', 'source-1');
  });

  it('answers a row that is not the reader’s as missing', async () => {
    const service = createNewsPrivateSourcesService({
      sources: repository({ remove: vi.fn(async () => false) }),
      quota: async () => ({ cap: 1, unlimited: false }),
    });

    await expect(service.remove('user-1', 'someone-else')).rejects.toBeInstanceOf(
      NewsPrivateSourceNotFoundError
    );
  });
});
