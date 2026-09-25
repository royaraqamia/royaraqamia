import type { ProjectRequest, ProjectRequestType } from '@/shared/contracts/project-requests';

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

/**
 * Only what the intake flow needs: a submission is written and never read back
 * by a client. The Admin list and the status transitions arrive with the Admin
 * Console, and widen this interface then.
 */
export interface ProjectRequestsRepository {
  create(input: ProjectRequestCreateInput): Promise<ProjectRequest>;
}
