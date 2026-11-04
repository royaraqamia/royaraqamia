import type { NewsPersonalDigestRepository } from '@/backend/repositories/news/news-personal-digest-repository';
import type { NewsUserSourcesRepository } from '@/backend/repositories/news/news-user-sources-repository';
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

  /**
   * The ids of the feeds only this reader holds (ADR-0106).
   *
   * The page needs them to tell a source that produced nothing from a source that
   * is broken, and a digest's story carries its `sourceId` — a private source's is
   * a uuid, a catalogue source's is a slug — so the intersection is what names the
   * difference. One owner-scoped read, asked for only when a reader has a session.
   */
  ownSourceIds(userId: string): Promise<string[]>;
}

export function createNewsPersonalDigestService(
  repository: NewsPersonalDigestRepository,
  ownSources: Pick<NewsUserSourcesRepository, 'list'>
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

    async ownSourceIds(userId: string): Promise<string[]> {
      const rows = await ownSources.list(userId);
      return rows.map((row) => row.id);
    },
  };
}
