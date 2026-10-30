import type { NewsUserSourcesRepository } from '@/backend/repositories/news/news-user-sources-repository';
import { AppError } from '@/backend/shared/errors';
import type { NewsPrivateSourcesSummary } from '@/shared/contracts/news';

/**
 * A reader's own sources (ADR-0106): what their personal digest reads, and the
 * plan's ceiling on how many they may hold.
 *
 * There is no create path here on purpose. A private source is created by
 * accepting a resolved request (the resolver's RPC, or an Admin's answer), so a
 * reader can never hand the fetch an address it has not read first.
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
  remove(userId: string, id: string): Promise<void>;
}

interface Deps {
  sources: NewsUserSourcesRepository;
  /** The plan's ceiling, resolved from `plan_quotas` like every other quota. */
  quota: (userId: string) => Promise<{ cap: number; unlimited: boolean }>;
}

export function createNewsPrivateSourcesService({
  sources,
  quota,
}: Deps): NewsPrivateSourcesService {
  return {
    async list(userId: string): Promise<NewsPrivateSourcesSummary> {
      const [rows, allowance] = await Promise.all([sources.list(userId), quota(userId)]);

      return {
        sources: rows,
        limited: !allowance.unlimited,
        cap: allowance.cap,
        used: rows.length,
      };
    },

    async remove(userId: string, id: string): Promise<void> {
      const removed = await sources.remove(userId, id);
      if (!removed) throw new NewsPrivateSourceNotFoundError();
    },
  };
}
