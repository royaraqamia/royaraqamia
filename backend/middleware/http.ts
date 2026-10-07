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
  return { status: status ?? 500, body: { error: message } };
}
