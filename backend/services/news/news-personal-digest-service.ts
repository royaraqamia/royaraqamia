import type { NewsPersonalDigestRepository } from '@/backend/repositories/news/news-personal-digest-repository';
import type { NewsDay, NewsQuery } from '@/shared/contracts/news';

/**
 * Reads the digest a reader had generated for themselves.
 *
 * Read-only, like the shared digest: generation happens in the workflow, after
 * the shared digest is published, so a compromised web process cannot write one
 * either. A reader without a personal digest gets null and the page falls back
 * to the shared one.
 */
export interface NewsPersonalDigestService {
  get(userId: string, query: NewsQuery): Promise<NewsDay | null>;
}

export function createNewsPersonalDigestService(
  repository: NewsPersonalDigestRepository
): NewsPersonalDigestService {
  return {
    async get(userId: string, query: NewsQuery): Promise<NewsDay | null> {
      const day = query.date
        ? await repository.getByDate(userId, query.date)
        : await repository.getLatest(userId);
      if (!day || !query.category) return day;

      return {
        digest: day.digest,
        stories: day.stories.filter((story) => story.category === query.category),
      };
    },
  };
}
