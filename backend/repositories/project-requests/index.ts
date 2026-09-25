import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { ProjectRequest, ProjectRequestStatus } from '@/shared/contracts/project-requests';
import type { Paginated } from '@/shared/pagination';
import type {
  ProjectRequestCreateInput,
  ProjectRequestListQuery,
  ProjectRequestsRepository,
} from '@/backend/repositories/project-requests/project-requests-repository';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';

export function createProjectRequestsRepository(
  supabase: SupabaseClient<Database>
): ProjectRequestsRepository {
  return {
    async getById(id: string): Promise<ProjectRequest | null> {
      const { data, error } = await supabase
        .from('project_requests')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;
      return data as ProjectRequest;
    },

    async list(query: ProjectRequestListQuery): Promise<Paginated<ProjectRequest>> {
      let request = supabase
        .from('project_requests')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (query.status) {
        request = request.eq('status', query.status);
      }

      const search = query.search ? sanitizeOrFilterTerm(query.search) : '';
      if (search) {
        request = request.or(
          `full_name.ilike.%${search}%,phone_whatsapp.ilike.%${search}%,reference_code.ilike.%${search}%`
        );
      }

      const from = (query.page - 1) * query.pageSize;
      const { data, count } = await request.range(from, from + query.pageSize - 1);

      return { data: (data as ProjectRequest[]) ?? [], total: count ?? 0 };
    },

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

    async updateStatus(
      id: string,
      status: ProjectRequestStatus,
      notes: string | null
    ): Promise<ProjectRequest> {
      const { data, error } = await supabase
        .from('project_requests')
        .update({ status, notes, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ProjectRequest;
    },
  };
}
