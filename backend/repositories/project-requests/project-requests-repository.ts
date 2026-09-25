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

export interface ProjectRequestsReader {
  getById(id: string): Promise<ProjectRequest | null>;
  list(query: ProjectRequestListQuery): Promise<Paginated<ProjectRequest>>;
}

export interface ProjectRequestsWriter {
  create(input: ProjectRequestCreateInput): Promise<ProjectRequest>;
  updateStatus(
    id: string,
    status: ProjectRequestStatus,
    notes: string | null
  ): Promise<ProjectRequest>;
}

/**
 * The intake flow only ever writes; the Admin Console reads the queue back and
 * moves each request through its life. Both sit behind the service role, since
 * the table has no anon/authenticated access at all.
 */
export interface ProjectRequestsRepository extends ProjectRequestsReader, ProjectRequestsWriter {}
