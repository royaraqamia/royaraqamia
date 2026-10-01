import type {
  ProjectRequest,
  ProjectRequestStatus,
  ProjectRequestType,
} from '@/shared/contracts/project-requests';
import type { Paginated } from '@/shared/pagination';

export interface ProjectRequestCreateInput {
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  project_type: ProjectRequestType;
  description: string;
  budget_range: string | null;
  timeline: string | null;
  existing_url: string | null;
  reference_code: string;
  user_id: string | null;
}

export interface ProjectRequestListQuery {
  page: number;
  pageSize: number;
  status?: ProjectRequestStatus;
  search?: string;
}

/**
 * The visitor-owned fields a submitter may replace on their own request. Kept
 * separate from the Admin transition so the two write paths can never be
 * confused: this carries no `status`/`notes`, and the Admin path carries no
 * visitor answers.
 */
export interface ProjectRequestEditFields {
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  project_type: ProjectRequestType;
  description: string;
  budget_range: string | null;
  timeline: string | null;
  existing_url: string | null;
}

export interface ProjectRequestsReader {
  getById(id: string): Promise<ProjectRequest | null>;
  list(query: ProjectRequestListQuery): Promise<Paginated<ProjectRequest>>;
  /** The requests attributed to one signed-in visitor, newest first. */
  listByUser(userId: string): Promise<ProjectRequest[]>;
}

export interface ProjectRequestsWriter {
  create(input: ProjectRequestCreateInput): Promise<ProjectRequest>;
  updateStatus(
    id: string,
    status: ProjectRequestStatus,
    notes: string | null
  ): Promise<ProjectRequest>;
  /**
   * Replaces the visitor fields of a request the visitor owns. The `user_id`
   * predicate is part of the write, so a request cannot be edited by anyone
   * else even if its id leaks. Returns `null` when no owned row matched.
   */
  updateOwned(
    id: string,
    userId: string,
    input: ProjectRequestEditFields
  ): Promise<ProjectRequest | null>;
}

/**
 * The intake flow only ever writes; the Admin Console reads the queue back and
 * moves each request through its life. Both sit behind the service role, since
 * the table has no anon/authenticated access at all.
 */
export interface ProjectRequestsRepository extends ProjectRequestsReader, ProjectRequestsWriter {}
