import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { TrainingApplication, TrainingReleaseTargetStatus } from '@/shared/contracts/training';
import type { Paginated } from '@/shared/pagination';
import {
  AlreadyEnrolledError,
  CohortClosedError,
  CohortFullError,
  CohortNotFoundError,
  InvalidReleaseStatusError,
  NotEnrolledError,
  type TrainingApplicationCreateInput,
  type TrainingApplicationListQuery,
  type TrainingApplicationsRepository,
} from '@/backend/repositories/training/training-applications-repository';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';
import { isNotFoundError, repositoryFailure } from '@/backend/shared/repository-error';

function extractRpcErrorCode(message: string | undefined): string {
  if (!message) return 'UNKNOWN';
  // Raised exceptions surface as plain messages; keep the first token.
  return message.trim().split(/[\n:]/).at(0) ?? 'UNKNOWN';
}

// `APPLICATION_NOT_FOUND` is treated as a genuine absence, not a typed error: the
// service checks existence before calling in, so reaching it here means the row
// vanished mid-flight — a failure worth surfacing as such rather than a 404.
function mapEnrollError(code: string): Error {
  switch (code) {
    case 'COHORT_FULL':
      return new CohortFullError();
    case 'COHORT_NOT_FOUND':
      return new CohortNotFoundError();
    case 'COHORT_CLOSED':
      return new CohortClosedError();
    case 'ALREADY_ENROLLED':
      return new AlreadyEnrolledError();
    default:
      return new Error(code);
  }
}

function mapReleaseError(code: string): Error {
  switch (code) {
    case 'NOT_ENROLLED':
      return new NotEnrolledError();
    case 'INVALID_TARGET_STATUS':
      return new InvalidReleaseStatusError();
    default:
      return new Error(code);
  }
}

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

      if (error) {
        if (isNotFoundError(error)) return null;
        throw repositoryFailure('training.getById', error);
      }

      return data ? (data as TrainingApplication) : null;
    },

    async getByReferenceCode(referenceCode: string): Promise<TrainingApplication | null> {
      const { data, error } = await supabase
        .from('training_applications')
        .select('*')
        .eq('reference_code', referenceCode)
        .maybeSingle();

      if (error) throw repositoryFailure('training.getByReferenceCode', error);

      return data ? (data as TrainingApplication) : null;
    },

    async list(query: TrainingApplicationListQuery): Promise<Paginated<TrainingApplication>> {
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
          `full_name.ilike.%${search}%,phone_whatsapp.ilike.%${search}%,reference_code.ilike.%${search}%`
        );
      }

      const from = (query.page - 1) * query.pageSize;
      const { data, count, error } = await request.range(from, from + query.pageSize - 1);

      if (error) throw repositoryFailure('training.list', error);

      return { data: (data as TrainingApplication[]) ?? [], total: count ?? 0 };
    },

    async create(input: TrainingApplicationCreateInput): Promise<TrainingApplication> {
      const { data, error } = await supabase
        .from('training_applications')
        .insert({
          course_slug: input.course_slug,
          full_name: input.full_name,
          phone_whatsapp: input.phone_whatsapp,
          goal: input.goal,
          cohort_id: input.cohort_id,
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

    async enroll(id: string, cohortId: string): Promise<TrainingApplication> {
      const { error } = await supabase.rpc('enroll_application', {
        p_application_id: id,
        p_cohort_id: cohortId,
      });

      if (error) throw mapEnrollError(extractRpcErrorCode(error.message));

      // The RPC returns only the id; re-read so the caller gets the enrolled row.
      return this.getById(id).then((application) => {
        if (!application)
          throw repositoryFailure('training.enroll.reload', new Error('missing row'));
        return application;
      });
    },

    async release(
      id: string,
      status: TrainingReleaseTargetStatus,
      notes: string | null
    ): Promise<TrainingApplication> {
      const { error } = await supabase.rpc('release_application', {
        p_application_id: id,
        p_status: status,
      });

      if (error) throw mapReleaseError(extractRpcErrorCode(error.message));

      if (notes !== null) {
        const { error: notesError } = await supabase
          .from('training_applications')
          .update({ notes, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (notesError) throw repositoryFailure('training.release.notes', notesError);
      }

      return this.getById(id).then((application) => {
        if (!application)
          throw repositoryFailure('training.release.reload', new Error('missing row'));
        return application;
      });
    },
  };
}
