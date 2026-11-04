import { describe, expect, it, vi } from 'vitest';

import type { NewsPersonalDigestRepository } from '@/backend/repositories/news/news-personal-digest-repository';
import { createNewsPersonalDigestService } from '@/backend/services/news/news-personal-digest-service';
import type { NewsDay, NewsStory } from '@/shared/contracts/news';

function story(overrides: Partial<NewsStory> = {}): NewsStory {
  return {
    id: 'story-1',
    position: 1,
    category: 'politics',
    region: 'arab',
    headline: 'عنوان',
    summary: 'ملخّص.',
    whyItMatters: null,
    sourceId: 'aljazeera-ar',
    sourceName: 'الجزيرة نت',
    sourceUrl: 'https://www.aljazeera.net/1',
    sourcePublishedAt: null,
    ...overrides,
  };
}

const DAY: NewsDay = {
  digest: {
    id: 'personal-1',
    date: '2026-10-23',
    title: 'ملخّصي',
    lede: 'أهم ما اخترته.',
    storyCount: 2,
    model: 'opencode-go/deepseek-v4.1-flash#high',
    publishedAt: '2026-10-23T04:00:00.000Z',
  },
  stories: [story(), story({ id: 'story-2', position: 2, category: 'tech' })],
};

function repository(overrides: Partial<NewsPersonalDigestRepository> = {}) {
  return {
    getLatest: vi.fn(async () => DAY),
    getByDate: vi.fn(async () => DAY),
    ...overrides,
  } satisfies NewsPersonalDigestRepository;
}

function userSources(ids: string[] = []) {
  return {
    list: vi.fn(async () =>
      ids.map((id, index) => ({
        id,
        name: `مصدر ${index + 1}`,
        url: `https://example.com/${id}`,
        kind: 'telegram' as const,
        category: 'other' as const,
        region: 'world' as const,
        status: 'ready' as const,
        failureCount: 0,
        lastError: null,
        lastCheckedAt: null,
        createdAt: '2026-10-23T00:00:00.000Z',
      }))
    ),
  };
}

describe('personal digest service', () => {
  it('reads the latest digest when no day is asked for', async () => {
    const repo = repository();
    const day = await createNewsPersonalDigestService(repo, userSources()).get('user-1', {});

    expect(day).toEqual(DAY);
    expect(repo.getLatest).toHaveBeenCalledWith('user-1');
    expect(repo.getByDate).not.toHaveBeenCalled();
  });

  it('reads the requested day and filters it by category', async () => {
    const repo = repository();
    const day = await createNewsPersonalDigestService(repo, userSources()).get('user-1', {
      date: '2026-10-20',
      category: 'tech',
    });

    expect(repo.getByDate).toHaveBeenCalledWith('user-1', '2026-10-20');
    expect(day?.stories.map((entry) => entry.id)).toEqual(['story-2']);
  });

  it('reports nothing for a reader with no digest, so the page falls back', async () => {
    const repo = repository({ getLatest: vi.fn(async () => null) });
    expect(await createNewsPersonalDigestService(repo, userSources()).get('user-1', {})).toBeNull();
  });

  it('names the feeds only this reader holds, for the page’s own-source notice', async () => {
    const own = userSources(['feed-1', 'feed-2']);

    expect(await createNewsPersonalDigestService(repository(), own).ownSourceIds('user-1')).toEqual(
      ['feed-1', 'feed-2']
    );
    expect(own.list).toHaveBeenCalledWith('user-1');
  });
});
