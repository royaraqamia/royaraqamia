import { checkRateLimit } from '@/backend/config/rate-limiter';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

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
