import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  TrainingCohort,
  TrainingCohortCreateInput,
  TrainingCohortUpdateInput,
} from '@/shared/contracts/training';
import type { TrainingCohortsRepository } from '@/backend/repositories/training/training-cohorts-repository';
import { isNotFoundError, repositoryFailure } from '@/backend/shared/repository-error';

/**
 * Cohorts are written and read exclusively through the service role, mirroring
 * `training_applications`: the public form reads open cohorts server-side, and
 * cohort management sits behind an admin-guarded route.
 *
 * Capacity is never mutated here. Claiming and releasing seats happens inside
 * the `enroll_application` / `release_application` RPCs (see
 * `training-applications` repository), because the capacity check and the
 * status write must share one transaction.
 */
export function createTrainingCohortsRepository(
  supabase: SupabaseClient<Database>
): TrainingCohortsRepository {
  return {
    async getById(id: string): Promise<TrainingCohort | null> {
      const { data, error } = await supabase
        .from('training_cohorts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (isNotFoundError(error)) return null;
        throw repositoryFailure('trainingCohorts.getById', error);
      }

      return data ? (data as TrainingCohort) : null;
    },

    async list(query): Promise<TrainingCohort[]> {
      let request = supabase
        .from('training_cohorts')
        .select('*')
        .order('starts_at', { ascending: true });

      if (query?.status) request = request.eq('status', query.status);

      const { data, error } = await request;

      if (error) throw repositoryFailure('trainingCohorts.list', error);

      return (data as TrainingCohort[]) ?? [];
    },

    async create(input: TrainingCohortCreateInput): Promise<TrainingCohort> {
      const { data, error } = await supabase
        .from('training_cohorts')
        .insert({
          course_slug: input.course_slug,
          label: input.label,
          starts_at: input.starts_at,
          capacity: input.capacity,
          status: input.status ?? 'open',
        })
        .select()
        .single();

      if (error) throw error;

      return data as TrainingCohort;
    },

    async update(id: string, input: TrainingCohortUpdateInput): Promise<TrainingCohort> {
      const { data, error } = await supabase
        .from('training_cohorts')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as TrainingCohort;
    },
  };
}
