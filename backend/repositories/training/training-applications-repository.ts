import type {
  TrainingApplication,
  TrainingApplicationStatus,
  TrainingReleaseTargetStatus,
} from '@/shared/contracts/training';
import type { Paginated } from '@/shared/pagination';

export interface TrainingApplicationCreateInput {
  course_slug: string;
  full_name: string;
  phone_whatsapp: string;
  goal: string | null;
  /**
   * The Cohort the applicant asked for, if any. Stored as a preference only —
   * it claims no seat; enrollment does that.
   */
  cohort_id: string | null;
  reference_code: string;
  user_id: string | null;
  /** Client-minted idempotency key for an Outbox replay (ADR-0029, ticket #169). */
  client_id?: string | null;
}

export interface TrainingApplicationListQuery {
  page: number;
  pageSize: number;
  status?: TrainingApplicationStatus;
  search?: string;
}

/**
 * The visitor-owned fields an applicant may replace on their own application.
 * `cohort_id` is present, but the service only passes it through while the
 * application holds no seat.
 */
export interface TrainingApplicationEditFields {
  full_name: string;
  phone_whatsapp: string;
  goal: string | null;
}

export interface TrainingApplicationsReader {
  getById(id: string): Promise<TrainingApplication | null>;
  getByReferenceCode(referenceCode: string): Promise<TrainingApplication | null>;
  /** The row a replayed Outbox submit already created, keyed on `client_id`. */
  getByClientId(clientId: string): Promise<TrainingApplication | null>;
  list(query: TrainingApplicationListQuery): Promise<Paginated<TrainingApplication>>;
  /** The applications attributed to one signed-in visitor, newest first. */
  listByUser(userId: string): Promise<TrainingApplication[]>;
}

export interface TrainingApplicationsWriter {
  create(input: TrainingApplicationCreateInput): Promise<TrainingApplication>;
  updateStatus(
    id: string,
    status: TrainingApplicationStatus,
    notes: string | null
  ): Promise<TrainingApplication>;
  /**
   * Replaces the visitor fields of an application the visitor owns. The service
   * decides whether a requested `cohort_id` is safe to apply (only while no seat
   * is held); this writes the profile fields and the cohort preference together.
   * Returns `null` when no owned row matched.
   */
  updateOwned(
    id: string,
    userId: string,
    input: TrainingApplicationEditFields,
    cohortId: string | null
  ): Promise<TrainingApplication | null>;
  /**
   * Claims a seat: moves the application into `enrolled` against a cohort, in the
   * `enroll_application` RPC so the capacity check and the write are atomic.
   * Throws {@link CohortFullError} / {@link CohortNotFoundError} /
   * {@link CohortClosedError} / {@link CohortCourseMismatchError} /
   * {@link AlreadyEnrolledError}.
   */
  enroll(id: string, cohortId: string): Promise<TrainingApplication>;
  /**
   * Releases the seat: moves the application out of `enrolled`, in the
   * `release_application` RPC so the seat is given back atomically.
   * Throws {@link NotEnrolledError}.
   */
  release(
    id: string,
    status: TrainingReleaseTargetStatus,
    notes: string | null
  ): Promise<TrainingApplication>;
}

export interface TrainingApplicationsRepository
  extends TrainingApplicationsReader, TrainingApplicationsWriter {}
