import type {
  TrainingCohort,
  TrainingCohortCreateInput,
  TrainingCohortStatus,
  TrainingCohortUpdateInput,
} from '@/shared/contracts/training';

export interface TrainingCohortsReader {
  getById(id: string): Promise<TrainingCohort | null>;
  list(query?: { status?: TrainingCohortStatus }): Promise<TrainingCohort[]>;
}

export interface TrainingCohortsWriter {
  create(input: TrainingCohortCreateInput): Promise<TrainingCohort>;
  update(id: string, input: TrainingCohortUpdateInput): Promise<TrainingCohort>;
}

/**
 * Capacity (claiming/releasing seats) is deliberately absent: it is owned by the
 * `enroll_application` / `release_application` RPCs on the applications side, so
 * the capacity check and the status write share one transaction.
 */
export interface TrainingCohortsRepository extends TrainingCohortsReader, TrainingCohortsWriter {}
