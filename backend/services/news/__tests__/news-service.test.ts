import { describe, expect, it, vi } from 'vitest';

import { createNewsService } from '@/backend/services/news/news-service';
import type {
  NewsRepository,
  StoredDigest,
  StoredStory,
  StoryWithDay,
} from '@/backend/repositories/news/news-repository';
import { NEWS_SEARCH_LIMIT, type NewsStory } from '@/shared/contracts/news';

const DIGEST: StoredDigest = {
  id: 'digest-1',
  date: '2026-10-23',
  title: 'ملخص أخبار اليوم',
  lede: 'أهم ما حدث اليوم في العالم.',
  storyCount: 1,
  model: 'opencode-go/deepseek-v4.1-flash#high',
  publishedAt: '2026-10-23T03:12:00.000Z',
};

const STORY: StoredStory = {
  id: 'story-1',
  position: 1,
  category: 'politics',
  region: 'arab',
  headline: 'عنوان الخبر',
  summary: 'ملخص الخبر.',
  whyItMatters: null,
  sourceName: 'الجزيرة نت',
  sourceUrl: 'https://www.aljazeera.net/news/1',
  sourcePublishedAt: '2026-10-23T02:00:00.000Z',
};

function repository(overrides: Partial<NewsRepository> = {}): NewsRepository {
  return {
    getLatestDigest: vi.fn(async () => DIGEST),
    getDigestByDate: vi.fn(async () => DIGEST),
    listStories: vi.fn(async () => [STORY]),
    listDigestDates: vi.fn(async () => [DIGEST.date]),
    searchStories: vi.fn(async () => []),
    listRecentSourceUrls: vi.fn(async () => []),
    ...overrides,
  } satisfies NewsRepository;
}

describe('news service', () => {
  it('reads the latest digest when the query names no day', async () => {
    const repo = repository();
    const board = await createNewsService(repo).getBoard({});

    expect(repo.getLatestDigest).toHaveBeenCalledOnce();
    expect(repo.getDigestByDate).not.toHaveBeenCalled();
    expect(board.day?.digest.date).toBe('2026-10-23');
    expect(board.day?.stories).toEqual([STORY]);
    expect(board.dates).toEqual(['2026-10-23']);
    expect(board.hasAnyDigest).toBe(true);
  });

  it('reads the requested day and passes the category filter to the stories read', async () => {
    const repo = repository();
    await createNewsService(repo).getBoard({ date: '2026-10-20', category: 'tech' });

    expect(repo.getDigestByDate).toHaveBeenCalledWith('2026-10-20');
    expect(repo.listStories).toHaveBeenCalledWith('digest-1', 'tech');
  });

  it('searches the retained month when a query is typed, dropping the day', async () => {
    const hits: StoryWithDay[] = [{ ...(STORY as NewsStory), digestDate: '2026-10-20' }];
    const repo = repository({ searchStories: vi.fn(async () => hits) });

    const board = await createNewsService(repo).getBoard({
      q: '  أسعار , الصرف  ',
      date: '2026-10-20',
    });

    expect(board.day).toBeNull();
    expect(board.search?.query).toBe('أسعار الصرف');
    expect(board.search?.hits).toEqual(hits);
    expect(board.search?.truncated).toBe(false);
    // One extra row is requested so "more than a page" needs no count query.
    expect(repo.searchStories).toHaveBeenCalledWith({
      query: 'أسعار الصرف',
      category: null,
      limit: NEWS_SEARCH_LIMIT + 1,
    });
  });

  it('drops the extra row and flags a truncated search', async () => {
    const hits = Array.from({ length: NEWS_SEARCH_LIMIT + 1 }, (_, index) => ({
      ...STORY,
      id: `story-${index}`,
      digestDate: '2026-10-20',
    }));
    const repo = repository({ searchStories: vi.fn(async () => hits) });

    const board = await createNewsService(repo).getBoard({ q: 'غزة' });

    expect(board.search?.hits).toHaveLength(NEWS_SEARCH_LIMIT);
    expect(board.search?.truncated).toBe(true);
  });

  it('reports an empty board before the first digest exists', async () => {
    const repo = repository({
      getLatestDigest: vi.fn(async () => null),
      listDigestDates: vi.fn(async () => []),
    });

    const board = await createNewsService(repo).getBoard({});

    expect(board.day).toBeNull();
    expect(board.hasAnyDigest).toBe(false);
    expect(board.search).toBeNull();
  });

  it('does not search on whitespace alone', async () => {
    const repo = repository();
    const board = await createNewsService(repo).getBoard({ q: '   ' });

    expect(repo.searchStories).not.toHaveBeenCalled();
    expect(board.search).toBeNull();
    expect(board.day?.digest.id).toBe('digest-1');
  });
});
