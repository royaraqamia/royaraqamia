import type {
  NewsCategory,
  NewsRegion,
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
}

export interface RejectNewsSourceRequest {
  id: string;
  note: string | null;
  reviewedBy: string;
}

/** The partial unique index that refuses a second open request for one feed. */
export const OPEN_REQUEST_URL_CONSTRAINT = 'uq_news_source_requests_open_url';

/** The partial unique index that refuses a second open request from one reader. */
export const OPEN_REQUEST_USER_CONSTRAINT = 'uq_news_source_requests_open_user';

/**
 * A failed repository call with the SQLSTATE and constraint Postgres named
 * (#551). The partial unique indexes are the real dedupe, so a caller has to be
 * able to tell which one refused it instead of answering every collision with
 * the same sentence.
 */
export class NewsSourceRequestDbError extends Error {
  constructor(
    readonly code: string | null,
    readonly constraint: string | null,
    message: string
  ) {
    super(message);
    this.name = 'NewsSourceRequestDbError';
  }
}

/**
 * The intake queue a reader's proposal moves through: `resolving` when the
 * reader files it, then whatever the resolution worker and the Admin decide.
 * A reader can only insert a `resolving` row (RLS), so every transition past
 * that in this interface is an Admin action.
 */
export interface NewsSourceRequestsRepository {
  countPending(userId: string): Promise<number>;
  /**
   * The id of the caller's own open request for this URL — RLS scopes the read,
   * so another reader's row is invisible here even when it exists (#551).
   */
  findPendingIdByUrl(url: string): Promise<string | null>;
  /**
   * Files a pending proposal. A collision with either partial unique index is a
   * `NewsSourceRequestDbError` naming that index (#551).
   */
  insert(input: NewNewsSourceRequest): Promise<NewsSourceRequest>;
  listForUser(userId: string, limit: number): Promise<NewsSourceRequest[]>;
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
