import type { NewsPreferencesRepository } from '@/backend/repositories/news/news-preferences-repository';
import { keepKnownSourceIds, type NewsCatalogue } from '@/backend/services/news/news-catalogue';
import type { NewsSourcePreferences } from '@/shared/contracts/news';

/**
 * A reader's saved source selection and opt-in.
 *
 * There is no "unknown source" refusal: ids the catalogue no longer carries are
 * dropped rather than rejected. Dropping can only widen what the reader sees,
 * and it keeps a selection saved before a source was retired editable — a 400
 * would leave the account with a preference it can never save again.
 */
export interface NewsPreferencesService {
  /** The kept ids, in catalogue order, plus the opt-in flag. */
  get(userId: string): Promise<NewsSourcePreferences>;
  /** Sanitises, stores and returns what was actually kept. */
  save(
    userId: string,
    input: { sourceIds: readonly string[]; personalEnabled?: boolean }
  ): Promise<NewsSourcePreferences>;
}

export function createNewsPreferencesService(
  repository: NewsPreferencesRepository,
  catalogue: NewsCatalogue
): NewsPreferencesService {
  return {
    async get(userId: string): Promise<NewsSourcePreferences> {
      const stored = await repository.getPreferences(userId);
      if (!stored) return { sourceIds: [], personalEnabled: false };

      return {
        sourceIds: stored.sourceIds
          ? keepKnownSourceIds(stored.sourceIds, await catalogue.list())
          : [],
        personalEnabled: stored.personalEnabled,
      };
    },

    async save(
      userId: string,
      input: { sourceIds: readonly string[]; personalEnabled?: boolean }
    ): Promise<NewsSourcePreferences> {
      const sourceIds = keepKnownSourceIds(input.sourceIds, await catalogue.list());
      // A client that only edits the checklist must not silently switch the
      // reader's own digest off; an omitted flag means "leave it as it was".
      const personalEnabled =
        input.personalEnabled ??
        (await repository.getPreferences(userId))?.personalEnabled ??
        false;

      await repository.savePreferences(userId, { sourceIds, personalEnabled });

      return { sourceIds, personalEnabled };
    },
  };
}
