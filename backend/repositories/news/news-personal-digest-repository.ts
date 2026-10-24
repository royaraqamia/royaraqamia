import type { NewsDay } from '@/shared/contracts/news';

/**
 * The digest a reader had generated for themselves (ADR-0079).
 *
 * A separate read from the shared digest on purpose: the shared tables are
 * public and read by anon, these are own-row only, and a reader without one must
 * fall through to the shared digest rather than see an empty page.
 */
export interface NewsPersonalDigestRepository {
  getLatest(userId: string): Promise<NewsDay | null>;
  getByDate(userId: string, date: string): Promise<NewsDay | null>;
}
