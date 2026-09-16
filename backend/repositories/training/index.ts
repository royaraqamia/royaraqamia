import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { TrainingApplication } from '@/shared/contracts/training';
import type {
  TrainingApplicationCreateInput,
  TrainingApplicationListQuery,
  TrainingApplicationsRepository,
} from '@/backend/repositories/training/training-applications-repository';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';

export function createTrainingApplicationsRepository(
  supabase: SupabaseClient<Database>
): TrainingApplicationsRepository {
  return {
    async getById(id: string): Promise<TrainingApplication | null> {
      const { data, error } = await supabase
        .from('training_applications')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;
      return data as TrainingApplication;
    },

    async list(
      query: TrainingApplicationListQuery
    ): Promise<{ data: TrainingApplication[]; total: number }> {
      let request = supabase
        .from('training_applications')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (query.status) {
        request = request.eq('status', query.status);
      }

      const search = query.search ? sanitizeOrFilterTerm(query.search) : '';
      if (search) {
        request = request.or(
          `full_name.ilike.%${search}%,phone_whatsapp.ilike.%${search}%,reference_code.ilike.%${search}%,email.ilike.%${search}%`
        );
      }

      const from = (query.page - 1) * query.pageSize;
      const { data, count } = await request.range(from, from + query.pageSize - 1);

      return { data: (data as TrainingApplication[]) ?? [], total: count ?? 0 };
    },

    async create(input: TrainingApplicationCreateInput): Promise<TrainingApplication> {
      const { data, error } = await supabase
        .from('training_applications')
        .insert({
          course_slug: input.course_slug,
          full_name: input.full_name,
          phone_whatsapp: input.phone_whatsapp,
          email: input.email,
          experience_level: input.experience_level,
          goal: input.goal,
          reference_code: input.reference_code,
          user_id: input.user_id,
        })
        .select()
        .single();

      if (error) throw error;

      return data as TrainingApplication;
    },

    async updateStatus(
      id: string,
      status: TrainingApplication['status'],
      notes: string | null
    ): Promise<TrainingApplication> {
      const { data, error } = await supabase
        .from('training_applications')
        .update({ status, notes, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as TrainingApplication;
    },
  };
}
