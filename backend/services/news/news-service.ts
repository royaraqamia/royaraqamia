import type { NewsRepository } from '@/backend/repositories/news/news-repository';
import {
  NEWS_RETENTION_DAYS,
  NEWS_SEARCH_LIMIT,
  sanitizeNewsQuery,
  type NewsBoard,
  type NewsDay,
  type NewsQuery,
  type NewsSearch,
} from '@/shared/contracts/news';

export interface NewsService {
  /** Everything the page renders for one request. */
  getBoard(query: NewsQuery): Promise<NewsBoard>;
}

/**
 * Reads the digest the workflow wrote.
 *
 * There is no write path here on purpose: publishing needs the service role and
 * happens in the workflow (`scripts/news/publish-digest.mjs`), so the web app
 * only ever reads. That keeps the service request-shaped and testable with a
 * stub repository, and it means a compromised web process cannot rewrite a day's
 * news.
 */
export function createNewsService(repository: NewsRepository): NewsService {
  async function search(query: NewsQuery, term: string): Promise<NewsSearch> {
    // One extra row answers "is there more than this page", without a second
    // count query.
    const rows = await repository.searchStories({
      query: term,
      category: query.category ?? null,
      limit: NEWS_SEARCH_LIMIT + 1,
    });

    const truncated = rows.length > NEWS_SEARCH_LIMIT;

    return {
      query: term,
      category: query.category ?? null,
      hits: truncated ? rows.slice(0, NEWS_SEARCH_LIMIT) : rows,
      truncated,
    };
  }

  async function day(query: NewsQuery): Promise<NewsDay | null> {
    const digest = query.date
      ? await repository.getDigestByDate(query.date)
      : await repository.getLatestDigest();
    if (!digest) return null;

    const stories = await repository.listStories(digest.id, query.category ?? null);
    return { digest, stories };
  }

  return {
    async getBoard(query: NewsQuery): Promise<NewsBoard> {
      // The archive strip is at most one per retained day, so this bound is the
      // retention window itself rather than a magic page size.
      const dates = await repository.listDigestDates(NEWS_RETENTION_DAYS + 1);
      const term = query.q ? sanitizeNewsQuery(query.q) : '';

      if (term.length > 0) {
        return {
          day: null,
          dates,
          search: await search(query, term),
          hasAnyDigest: dates.length > 0,
        };
      }

      return {
        day: await day(query),
        dates,
        search: null,
        hasAnyDigest: dates.length > 0,
      };
    },
  };
}
