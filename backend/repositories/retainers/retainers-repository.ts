import type { Retainer, RetainerStatus } from '@/shared/contracts/retainers';
import type { Paginated } from '@/shared/pagination';

export interface RetainerCreateInput {
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  company: string | null;
  current_projects: string;
  needs: string;
  preferred_start: string | null;
  reference_code: string;
  user_id: string | null;
}

export interface RetainerListQuery {
  page: number;
  pageSize: number;
  status?: RetainerStatus;
  search?: string;
}

/**
 * The Admin's edit of a retainer: the lifecycle state, the agreed terms and the
 * offline-collection bookkeeping. The visitor's own answers are never editable —
 * a retainer is a record of what was submitted.
 */
export interface RetainerUpdate {
  status: RetainerStatus;
  notes: string | null;
  monthly_fee_usd: number;
  paid_through: string | null;
}

export interface RetainersReader {
  getById(id: string): Promise<Retainer | null>;
  list(query: RetainerListQuery): Promise<Paginated<Retainer>>;
}

export interface RetainersWriter {
  create(input: RetainerCreateInput): Promise<Retainer>;
  update(id: string, input: RetainerUpdate): Promise<Retainer>;
}

/**
 * The intake flow only ever writes; the Admin Console reads the book back, moves
 * each retainer through its life and records the agreed terms. Both sit behind
 * the service role, since the table has no anon/authenticated access at all.
 *
 * `create` stays deliberately narrow: `monthly_fee_usd` is absent because the
 * table defaults it to the advertised figure, and only the Admin records the
 * terms actually agreed.
 */
export interface RetainersRepository extends RetainersReader, RetainersWriter {}
