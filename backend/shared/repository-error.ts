import * as Sentry from '@sentry/nextjs';
import { logger } from '@/backend/shared/logger';

/**
 * The one failure a PostgREST repository raises when a query fails. `operation`
 * names the repository call so the controller mapping — and the error tracking
 * that receives the thrown error — can report what failed, and `cause` keeps the
 * underlying PostgREST/driver error for diagnosis.
 *
 * A read returns `null` (no row) or an empty array (no rows); it never returns
 * `null` to mean "the database is broken". A failure always crosses this seam as
 * a `RepositoryError`.
 */
export class RepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly cause: unknown
  ) {
    super(`Repository operation failed: ${operation}`, { cause });
    this.name = 'RepositoryError';
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

/**
 * Logs the underlying database error once, at the repository seam, reports it to
 * error tracking with the query context, and returns the typed failure to throw.
 * Controllers map the returned error; they only log unexpected errors.
 */
export function repositoryFailure(operation: string, cause: unknown): RepositoryError {
  const error = new RepositoryError(operation, cause);
  logger.error(`Repository operation failed: ${operation}`, {
    operation,
    cause: describeCause(cause),
  });
  Sentry.captureException(error, { extra: { operation } });
  return error;
}

/** Whether a thrown value is the shared repository failure. */
export function isRepositoryError(value: unknown): value is RepositoryError {
  return value instanceof RepositoryError;
}

// PostgREST returns this code when `.single()` matched no row: that is a genuine
// absence, not a failure, so callers keep returning `null`.
const POSTGREST_NO_ROWS = 'PGRST116';

export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGREST_NO_ROWS
  );
}
