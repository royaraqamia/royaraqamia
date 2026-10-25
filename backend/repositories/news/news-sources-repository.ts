import type { NewsSource } from '@/shared/contracts/news';

/** An approved addition, as the fetch and the admin surface need it. */
export interface ApprovedNewsSource extends NewsSource {
  url: string;
}

/**
 * The `news_sources` table: additions an Admin approved on top of
 * `data/news/sources.json` (ADR-0078). Nothing here is written outside an
 * approval, and the fetch reads only enabled rows.
 *
 * There is deliberately no insert: an approval creates its source through
 * `NewsSourceRequestsRepository.approve`, which writes the source and the
 * request's decision in one transaction (#572).
 */
export interface NewsSourcesRepository {
  listEnabled(): Promise<NewsSource[]>;
  /** The id of an approved source with this canonical URL, or null. */
  findIdByUrl(url: string): Promise<string | null>;
  findById(id: string): Promise<NewsSource | null>;
}
