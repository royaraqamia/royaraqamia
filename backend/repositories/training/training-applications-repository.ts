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
   * Throws {@link CohortFullError} / {@link CohortNotFoundError} / {@link AlreadyEnrolledError}.
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

// ------------------------------------------------------------
// Enrollment failures
//
// The `enroll_application` / `release_application` RPCs raise plain error codes;
// these typed errors are how the seam carries them to the service, which maps
// them to HTTP. Kept here (next to the calls that raise them) rather than in the
// service, so a repository test can assert them without the service.
// ------------------------------------------------------------

/** The cohort was already at capacity when the seat claim ran. */
export class CohortFullError extends Error {
  constructor() {
    super('COHORT_FULL');
    this.name = 'CohortFullError';
  }
}

/** The named cohort does not exist. */
export class CohortNotFoundError extends Error {
  constructor() {
    super('COHORT_NOT_FOUND');
    this.name = 'CohortNotFoundError';
  }
}

/** The cohort is closed to new enrollments. */
export class CohortClosedError extends Error {
  constructor() {
    super('COHORT_CLOSED');
    this.name = 'CohortClosedError';
  }
}

/** The application is already enrolled; it holds a seat. */
export class AlreadyEnrolledError extends Error {
  constructor() {
    super('ALREADY_ENROLLED');
    this.name = 'AlreadyEnrolledError';
  }
}

/** The application is not enrolled, so it holds no seat to release. */
export class NotEnrolledError extends Error {
  constructor() {
    super('NOT_ENROLLED');
    this.name = 'NotEnrolledError';
  }
}

/** The release target status is not one an enrolled application may move to. */
export class InvalidReleaseStatusError extends Error {
  constructor() {
    super('INVALID_TARGET_STATUS');
    this.name = 'InvalidReleaseStatusError';
  }
}
