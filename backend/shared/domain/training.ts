/**
 * The enrollment outcomes the Training RPCs raise.
 *
 * `enroll_application` / `release_application` answer plain error codes; these
 * typed errors are how the seam carries them to the service, which maps them to
 * HTTP. A repository test asserts them without the service, and the controller
 * matches on them too — so the declarations live here rather than in either
 * side: a service may not import a value from `backend/repositories`
 * (`layers/no-cross-layer-import`), and a controller should not have to reach
 * into the data layer for a type the seam already speaks.
 */

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

/**
 * The cohort belongs to a different Course than the application. Raised before
 * the seat is claimed, so nothing was consumed or changed.
 */
export class CohortCourseMismatchError extends Error {
  constructor() {
    super('COHORT_COURSE_MISMATCH');
    this.name = 'CohortCourseMismatchError';
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
