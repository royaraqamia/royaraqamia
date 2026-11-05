import type { NewsPreferencesRepository } from '@/backend/repositories/news/news-preferences-repository';
import { keepKnownSourceIds, type NewsCatalogue } from '@/backend/services/news/news-catalogue';
import type { NewsSourcePreferences } from '@/shared/contracts/news';

/**
 * A reader's saved source selection.
 *
 * There is no "unknown source" refusal: ids the catalogue no longer carries are
 * dropped rather than rejected. Dropping can only widen what the reader sees,
 * and it keeps a selection saved before a source was retired editable — a 400
 * would leave the account with a preference it can never save again.
 *
 * The digest that reads this selection is on for every account (ADR-0131), so
 * there is no opt-in left to carry through a save.
 */
export interface NewsPreferencesService {
  /** The kept ids, in catalogue order. */
  get(userId: string): Promise<NewsSourcePreferences>;
  /** Sanitises, stores and returns what was actually kept. */
  save(userId: string, input: { sourceIds: readonly string[] }): Promise<NewsSourcePreferences>;
}

export function createNewsPreferencesService(
  repository: NewsPreferencesRepository,
  catalogue: NewsCatalogue
): NewsPreferencesService {
  return {
    async get(userId: string): Promise<NewsSourcePreferences> {
      const stored = await repository.getPreferences(userId);
      if (!stored) return { sourceIds: [] };

      return {
        sourceIds: stored.sourceIds
          ? keepKnownSourceIds(stored.sourceIds, await catalogue.list())
          : [],
      };
    },

    async save(
      userId: string,
      input: { sourceIds: readonly string[] }
    ): Promise<NewsSourcePreferences> {
      const sourceIds = keepKnownSourceIds(input.sourceIds, await catalogue.list());
      await repository.savePreferences(userId, { sourceIds });
      return { sourceIds };
    },
  };
}
