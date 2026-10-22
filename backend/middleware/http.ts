import { checkRateLimit } from '@/backend/config/rate-limiter';
import { jsonResult, type HttpJsonResult, type HttpResult } from '@/backend/transport/http-result';
import { getErrorMessage, AppError } from '@/backend/shared/errors';

interface RateLimitConfig {
  key: string;
  limit: number;
  windowMs: number;
  message: string;
  /** Deny on a limiter outage instead of allowing through. Use for security-sensitive paths. */
  failClosed?: boolean;
}

export async function checkRateLimitApi(config: RateLimitConfig): Promise<HttpResult | null> {
  const allowed = await checkRateLimit(config.key, config.limit, config.windowMs, {
    failClosed: config.failClosed,
  });
  if (!allowed) {
    return jsonResult(429, { success: false, error: config.message });
  }
  return null;
}

export function errorResult(error: unknown, status?: number): HttpJsonResult {
  const message = getErrorMessage(error);
  if (status === undefined && error instanceof AppError) {
    status = error.statusCode;
  }
  // A plan refusal carries a code so the client can pick the right remedy
  // (sign in, upgrade, delete something) instead of matching Arabic copy.
  const body =
    error instanceof AppError && error.code
      ? { error: message, code: error.code }
      : { error: message };
  return { status: status ?? 500, body };
}

/**
 * A plan refusal in the shape the public forms answer with (`success: false`
 * plus a code), or null when the error is something else and the caller's own
 * mapping should decide.
 */
export function planRefusalResult(error: unknown): HttpJsonResult | null {
  if (!(error instanceof AppError)) return null;
  return {
    status: error.statusCode,
    body: {
      success: false,
      error: getErrorMessage(error),
      ...(error.code ? { code: error.code } : {}),
    },
  };
}

/**
 * `messageError` with one exception: an `AppError` keeps its own status and
 * code. A handler that answers validation failures with 400 must still answer
 * 402 for a plan refusal — otherwise the Offline Sync queue reads it as a server
 * fault and retries a spend that can never succeed.
 */
export function errorResultAt(status: number, fallback: string) {
  return (error: unknown): HttpJsonResult => {
    if (error instanceof AppError) {
      return {
        status: error.statusCode,
        body: {
          error: getErrorMessage(error),
          ...(error.code ? { code: error.code } : {}),
        },
      };
    }
    return { status, body: { error: error instanceof Error ? error.message : fallback } };
  };
}
