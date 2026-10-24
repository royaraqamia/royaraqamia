import type { NewsPreferencesRepository } from '@/backend/repositories/news/news-preferences-repository';
import { keepKnownSourceIds, type NewsCatalogue } from '@/backend/services/news/news-catalogue';

/**
 * A reader's saved source selection.
 *
 * There is no "unknown source" refusal: ids the catalogue no longer carries are
 * dropped rather than rejected. Dropping can only widen what the reader sees,
 * and it keeps a selection saved before a source was retired editable — a 400
 * would leave the account with a preference it can never save again.
 */
export interface NewsPreferencesService {
  /** The kept ids, in catalogue order; empty means "every source". */
  get(userId: string): Promise<string[]>;
  /** Sanitises, stores and returns what was actually kept. */
  save(userId: string, sourceIds: readonly string[]): Promise<string[]>;
}

export function createNewsPreferencesService(
  repository: NewsPreferencesRepository,
  catalogue: NewsCatalogue
): NewsPreferencesService {
  return {
    async get(userId: string): Promise<string[]> {
      const stored = await repository.getSourceIds(userId);
      if (!stored) return [];
      return keepKnownSourceIds(stored, await catalogue.list());
    },

    async save(userId: string, sourceIds: readonly string[]): Promise<string[]> {
      const kept = keepKnownSourceIds(sourceIds, await catalogue.list());
      await repository.saveSourceIds(userId, kept);
      return kept;
    },
  };
}
