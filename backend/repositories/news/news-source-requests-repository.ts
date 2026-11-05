import type {
  NewsCategory,
  NewsRegion,
  NewsSourceDestination,
  NewsSourceKind,
  NewsSourceRequest,
  NewsSourceRequestStatus,
} from '@/shared/contracts/news';

export interface NewNewsSourceRequest {
  userId: string;
  url: string;
  name: string;
}

/**
 * One approval: the source it creates and the decision it records. Both halves
 * are written by `public.approve_news_source_request` in one transaction (#572),
 * so a refusal leaves the request open and safe to retry.
 *
 * `sourceUrl` and `kind` are the resolved feed, which is not necessarily the URL
 * the reader pasted: a `needs_review` row is answered by the Admin pasting the
 * feed the source actually publishes (ADR-0105).
 */
export interface ApproveNewsSourceRequest {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  kind: NewsSourceKind;
  category: NewsCategory;
  region: NewsRegion;
  tier: 1 | 2;
  note: string | null;
  reviewedBy: string;
  /** The reader's own list, or the shared catalogue (ADR-0106). */
  destination: NewsSourceDestination;
}

export interface RejectNewsSourceRequest {
  id: string;
  note: string | null;
  reviewedBy: string;
}

/**
 * The intake queue a reader's proposal moves through: `resolving` when the
 * reader files it, then whatever the resolution worker and the Admin decide.
 * A reader can only insert a `resolving` row (RLS), so every transition past
 * that in this interface is the system's or an Admin's.
 */
export interface NewsSourceRequestsRepository {
  /** Open requests — `resolving`, `ready` or `needs_review` — this reader holds. */
  countOpen(userId: string): Promise<number>;
  /**
   * The id of the caller's own open request for this URL — RLS scopes the read,
   * so another reader's row is invisible here even when it exists (#551).
   */
  findOpenIdByUrl(userId: string, url: string): Promise<string | null>;
  /**
   * Files a pending proposal. A collision with either partial unique index is a
   * `NewsSourceRequestDbError` naming that index (#551).
   */
  insert(input: NewNewsSourceRequest): Promise<NewsSourceRequest>;
  /**
   * The rows the reader's one list still shows above their feeds: everything
   * that is not an accepted source — on its way, or refused (ADR-0130). A row
   * that became a source is drawn from `news_user_sources` instead, so it is
   * excluded here rather than merged twice.
   */
  listOwnedPending(userId: string, limit: number): Promise<NewsSourceRequest[]>;
  /**
   * Cancels one of the reader's own rows that is not an accepted source; false
   * when no such row was theirs.
   */
  remove(userId: string, id: string): Promise<boolean>;
  /** Pending first, newest first; `status` narrows to one state. */
  listForAdmin(status: NewsSourceRequestStatus | null, limit: number): Promise<NewsSourceRequest[]>;
  findById(id: string): Promise<NewsSourceRequest | null>;
  /**
   * Creates the Approved Source and marks the request in one transaction,
   * returning the decided row. Refusals carry the RPC's SQLSTATE as `code`.
   */
  approve(input: ApproveNewsSourceRequest): Promise<NewsSourceRequest>;
  markRejected(input: RejectNewsSourceRequest): Promise<void>;
}
