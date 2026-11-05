/**
 * What the news source intake reports when the database refuses a write (#551).
 *
 * The partial unique indexes are the real dedupe, so the caller has to tell
 * which one refused it instead of answering every collision with the same
 * sentence. The error and the two index names therefore cross the repository
 * seam — the repository raises them, the service names the refusal — and a
 * service may not import a value from `backend/repositories`
 * (`layers/no-cross-layer-import`). They live here, and both sides import them.
 */

/** The partial unique index that refuses a second open request for one feed. */
export const OPEN_REQUEST_URL_CONSTRAINT = 'uq_news_source_requests_open_url';

/** The partial unique index that refuses a second open request from one reader. */
export const OPEN_REQUEST_USER_CONSTRAINT = 'uq_news_source_requests_open_user';

/**
 * A failed repository call with the SQLSTATE and constraint Postgres named
 * (#551).
 */
export class NewsSourceRequestDbError extends Error {
  constructor(
    readonly code: string | null,
    readonly constraint: string | null,
    message: string
  ) {
    super(message);
    this.name = 'NewsSourceRequestDbError';
  }
}
