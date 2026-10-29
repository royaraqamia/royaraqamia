import type { NewsRepository } from '@/backend/repositories/news/news-repository';
import {
  NEWS_PERSONAL_MIN_STORIES,
  NEWS_RETENTION_DAYS,
  NEWS_SEARCH_LIMIT,
  NEWS_SEARCH_SUGGESTION_LIMIT,
  sanitizeNewsQuery,
  type NewsBoard,
  type NewsDay,
  type NewsPreferencesEffect,
  type NewsQuery,
  type NewsSearch,
  type NewsSearchHit,
  type NewsStory,
} from '@/shared/contracts/news';

/** The reader's own selection, when they have one; null/empty means the full digest. */
export interface NewsBoardOptions {
  sourceIds?: readonly string[] | null;
}

export interface NewsService {
  /** Everything the page renders for one request. */
  getBoard(query: NewsQuery, options?: NewsBoardOptions): Promise<NewsBoard>;

  /**
   * Story suggestions for the search combobox, over the retained month. The
   * term is sanitised here rather than trusted, so the route cannot hand raw
   * input to the repository's PostgREST filter.
   */
  searchSuggestions(term: string): Promise<NewsSearchHit[]>;
}

/**
 * Narrows a day to the sources the reader kept.
 *
 * A selection is a preference, not a way to empty the page: when it leaves fewer
 * than `NEWS_PERSONAL_MIN_STORIES` stories the full digest is returned with
 * `fellBack`, so a reader who ticked two quiet sources on a slow day still gets a
 * morning briefing — and is told why it is wider than they asked for.
 */
function narrowToSelectedSources(
  stories: NewsStory[],
  sourceIds: readonly string[] | null | undefined
): { stories: NewsStory[]; preferences: NewsPreferencesEffect | null } {
  if (!sourceIds || sourceIds.length === 0) {
    return { stories, preferences: null };
  }

  const wanted = new Set(sourceIds);
  const kept = stories.filter((story) => wanted.has(story.sourceId));

  if (kept.length < NEWS_PERSONAL_MIN_STORIES) {
    return {
      stories,
      preferences: { selectedSources: sourceIds.length, filtered: false, fellBack: true },
    };
  }

  return {
    stories: kept,
    preferences: { selectedSources: sourceIds.length, filtered: true, fellBack: false },
  };
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

  async function day(
    query: NewsQuery,
    sourceIds: readonly string[] | null | undefined
  ): Promise<{ day: NewsDay | null; preferences: NewsPreferencesEffect | null }> {
    const digest = query.date
      ? await repository.getDigestByDate(query.date)
      : await repository.getLatestDigest();
    if (!digest) return { day: null, preferences: null };

    const stories = await repository.listStories(digest.id, query.category ?? null);
    const narrowed = narrowToSelectedSources(stories, sourceIds);
    return { day: { digest, stories: narrowed.stories }, preferences: narrowed.preferences };
  }

  return {
    async getBoard(query: NewsQuery, options: NewsBoardOptions = {}): Promise<NewsBoard> {
      // The archive strip is at most one per retained day, so this bound is the
      // retention window itself rather than a magic page size.
      const dates = await repository.listDigestDates(NEWS_RETENTION_DAYS + 1);
      const term = query.q ? sanitizeNewsQuery(query.q) : '';

      if (term.length > 0) {
        // Search is the retained month, not the reader's selection: a story they
        // hid is still a story they searched for, and narrowing here would make
        // the search box quietly lie about what the site has published.
        return {
          day: null,
          dates,
          search: await search(query, term),
          hasAnyDigest: dates.length > 0,
          preferences: null,
          personal: null,
          cards: null,
        };
      }

      const selected = await day(query, options.sourceIds);
      return {
        day: selected.day,
        dates,
        search: null,
        hasAnyDigest: dates.length > 0,
        preferences: selected.preferences,
        personal: null,
        cards: null,
      };
    },

    async searchSuggestions(term: string): Promise<NewsSearchHit[]> {
      const sanitized = sanitizeNewsQuery(term);
      if (!sanitized) return [];

      return repository.searchStories({
        query: sanitized,
        category: null,
        limit: NEWS_SEARCH_SUGGESTION_LIMIT,
      });
    },
  };
}
