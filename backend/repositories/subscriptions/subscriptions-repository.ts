import type {
  SubscriptionPlan,
  SubscriptionRequest,
  SubscriptionRequestStatus,
} from '@/shared/contracts/subscriptions';
import type { Paginated } from '@/shared/pagination';

export interface SubscriptionRequestCreateInput {
  user_id: string;
  plan: SubscriptionPlan;
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  note: string | null;
  reference_code: string;
  /** Client-minted idempotency key for an Outbox replay (ADR-0029, ticket #169). */
  client_id?: string | null;
}

export interface SubscriptionRequestListQuery {
  page: number;
  pageSize: number;
  status?: SubscriptionRequestStatus;
  search?: string;
}

/**
 * The Admin's edit: the lifecycle state and the Admin's own notes. The reader's
 * answers are never editable here — the row is a record of what was submitted.
 */
export interface SubscriptionRequestUpdate {
  status?: SubscriptionRequestStatus;
  notes?: string | null;
}

export interface SubscriptionRequestsReader {
  getById(id: string): Promise<SubscriptionRequest | null>;
  /** The row a replayed Outbox submit already created, keyed on `client_id`. */
  getByClientId(clientId: string): Promise<SubscriptionRequest | null>;
  list(query: SubscriptionRequestListQuery): Promise<Paginated<SubscriptionRequest>>;
  /** The requests one account made, newest first, for the account area. */
  listByUser(userId: string): Promise<SubscriptionRequest[]>;
}

export interface SubscriptionRequestsWriter {
  create(input: SubscriptionRequestCreateInput): Promise<SubscriptionRequest>;
  update(id: string, input: SubscriptionRequestUpdate): Promise<SubscriptionRequest>;
}

/**
 * The form only ever writes; the Admin console reads the book back and moves a
 * request through its life. Both sit behind the service role, because the table
 * has no anon/authenticated access at all.
 */
export interface SubscriptionRequestsRepository
  extends SubscriptionRequestsReader, SubscriptionRequestsWriter {}
