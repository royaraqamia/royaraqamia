import type { NewsUserSourcesRepository } from '@/backend/repositories/news/news-user-sources-repository';
import type { NewsPreferencesService } from '@/backend/services/news/news-preferences-service';
import { AppError } from '@/backend/shared/errors';
import type { NewsPrivateSourcesSummary } from '@/shared/contracts/news';

/**
 * A reader's own sources (ADR-0106): what their personal digest reads, and the
 * plan's ceiling on how many they may hold.
 *
 * There is no create path here on purpose. A private source is created by
 * accepting a resolved request (the resolver's RPC, or an Admin's answer), so a
 * reader can never hand the fetch an address it has not read first.
 *
 * The one thing a reader may do is turn the delivery on: a private source is
 * only ever read by their own digest, so a list that nothing generates is a list
 * that does nothing. That switch is their click, never ours — generating a
 * digest spends credits.
 */
export class NewsPrivateSourceNotFoundError extends AppError {
  constructor() {
    super('هذا المصدر غير موجود.', 404, 'source_not_found');
  }
}

export class NewsPrivateSourcesLimitError extends AppError {
  constructor(readonly cap: number | null = null) {
    super(
      cap === null
        ? 'وصلت إلى الحدّ الأقصى من المصادر الخاصّة في خطتك الحالية.'
        : `يمكنك حفظ ${cap} مصادر خاصّة كحدّ أقصى في خطتك الحالية.`,
      402,
      'usage_limit'
    );
  }
}

export interface NewsPrivateSourcesService {
  list(userId: string): Promise<NewsPrivateSourcesSummary>;
  /** Turns the reader's own digest on, keeping the selection they already had. */
  enablePersonalDigest(userId: string): Promise<NewsPrivateSourcesSummary>;
  remove(userId: string, id: string): Promise<void>;
}

interface Deps {
  sources: NewsUserSourcesRepository;
  preferences: NewsPreferencesService;
  /** The plan's ceiling, resolved from `plan_quotas` like every other quota. */
  quota: (userId: string) => Promise<{ cap: number; unlimited: boolean }>;
}

export function createNewsPrivateSourcesService({
  sources,
  preferences,
  quota,
}: Deps): NewsPrivateSourcesService {
  async function summary(userId: string): Promise<NewsPrivateSourcesSummary> {
    const [rows, allowance, stored] = await Promise.all([
      sources.list(userId),
      quota(userId),
      preferences.get(userId),
    ]);

    return {
      sources: rows,
      limited: !allowance.unlimited,
      cap: allowance.cap,
      used: rows.length,
      personalEnabled: stored.personalEnabled,
    };
  }

  return {
    list: summary,

    async enablePersonalDigest(userId: string): Promise<NewsPrivateSourcesSummary> {
      // The selection is carried through untouched: this switch is about
      // delivery, and a reader who narrows their list later still expects the
      // digest they just turned on.
      const current = await preferences.get(userId);
      await preferences.save(userId, {
        sourceIds: current.sourceIds,
        personalEnabled: true,
      });

      return summary(userId);
    },

    async remove(userId: string, id: string): Promise<void> {
      const removed = await sources.remove(userId, id);
      if (!removed) throw new NewsPrivateSourceNotFoundError();
    },
  };
}
