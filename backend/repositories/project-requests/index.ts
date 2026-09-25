import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { ProjectRequest } from '@/shared/contracts/project-requests';
import type {
  ProjectRequestCreateInput,
  ProjectRequestsRepository,
} from '@/backend/repositories/project-requests/project-requests-repository';

export function createProjectRequestsRepository(
  supabase: SupabaseClient<Database>
): ProjectRequestsRepository {
  return {
    async create(input: ProjectRequestCreateInput): Promise<ProjectRequest> {
      const { data, error } = await supabase
        .from('project_requests')
        .insert({
          full_name: input.full_name,
          phone_whatsapp: input.phone_whatsapp,
          email: input.email,
          project_type: input.project_type,
          description: input.description,
          budget_range: input.budget_range,
          timeline: input.timeline,
          existing_url: input.existing_url,
          reference_code: input.reference_code,
          user_id: input.user_id,
        })
        .select()
        .single();

      if (error) throw error;

      return data as ProjectRequest;
    },
  };
}
