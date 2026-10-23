import type { NewsCategory, NewsDigest, NewsRegion, NewsStory } from '@/shared/contracts/news';

/**
 * The digest as the repository hands it to the service: the contract's shape with
 * nothing PostgREST-shaped left in it. `headline`/`summary`/… are already
 * camelCased here so the UI never sees a snake_case column, which is the same
 * boundary the rates repository keeps (`backend/repositories/rates`).
 */
export interface StoredDigest extends NewsDigest {}

export interface StoredStory extends NewsStory {}

export interface StoryWithDay extends StoredStory {
  digestDate: string;
}

export interface SearchStoriesInput {
  /** Already sanitized by the caller (`sanitizeNewsQuery`). */
  query: string;
  category: NewsCategory | null;
  limit: number;
}

export interface NewsRepository {
  /** The latest digest, or null before the first workflow run. */
  getLatestDigest(): Promise<StoredDigest | null>;

  getDigestByDate(date: string): Promise<StoredDigest | null>;

  listStories(digestId: string, category: NewsCategory | null): Promise<StoredStory[]>;

  /** The days that still have a digest, newest first. */
  listDigestDates(limit: number): Promise<string[]>;

  searchStories(input: SearchStoriesInput): Promise<StoryWithDay[]>;

  /** The most recent source URLs, for the workflow's cross-day duplicate check. */
  listRecentSourceUrls(sinceIso: string): Promise<string[]>;
}

export type { NewsCategory, NewsDigest, NewsRegion, NewsStory };
