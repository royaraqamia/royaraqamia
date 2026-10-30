import type { NewsPrivateSource } from '@/shared/contracts/news';

/**
 * A reader's own sources (ADR-0106): the list their personal digest reads, and
 * the only place a private feed is written. Nothing here is part of the shared
 * catalogue, so every read is scoped by the owner the caller already proved.
 */
export interface NewsUserSourcesRepository {
  /** One reader's sources, newest first. */
  list(userId: string): Promise<NewsPrivateSource[]>;
  /** How many the reader holds; the plan's cap is compared against this. */
  count(userId: string): Promise<number>;
  /** Whether this reader already holds this feed. */
  findIdByUrl(userId: string, url: string): Promise<string | null>;
  /** Removes one of the reader's own; false when no such row was theirs. */
  remove(userId: string, id: string): Promise<boolean>;
}
