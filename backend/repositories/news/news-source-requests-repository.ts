import type {
  NewsCategory,
  NewsRegion,
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
 * so a refusal leaves the request `pending` and safe to retry.
 */
export interface ApproveNewsSourceRequest {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
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

/**
 * The intake queue a reader's proposal moves through: `pending` until an Admin
 * approves or rejects it. A reader can only insert a pending row (RLS), so every
 * transition in this interface is an Admin action.
 */
export interface NewsSourceRequestsRepository {
  countPending(userId: string): Promise<number>;
  /** The id of an open request for this canonical URL, whoever filed it. */
  findPendingIdByUrl(url: string): Promise<string | null>;
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
