import { checkRateLimit } from '@/backend/config/rate-limiter';
import { jsonResult, type HttpJsonResult, type HttpResult } from '@/backend/transport/http-result';
import { getErrorMessage } from '@/backend/shared/errors';
import { AppError } from '@/backend/shared/habitflow/errors';

interface RateLimitConfig {
  key: string;
  limit: number;
  windowMs: number;
  message: string;
}

export async function checkRateLimitApi(config: RateLimitConfig): Promise<HttpResult | null> {
  if (!(await checkRateLimit(config.key, config.limit, config.windowMs))) {
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
