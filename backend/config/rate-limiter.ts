import { createRateLimiter, type RateLimiter } from '@/backend/clients/rate-limiter';
import { env } from '@/backend/config/env';

let defaultRateLimiter: RateLimiter | null = null;

export function getDefaultRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = createRateLimiter({
      redisUrl: env.upstashRedisUrl,
      redisToken: env.upstashRedisToken,
    });
  }
  return defaultRateLimiter;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  return getDefaultRateLimiter().checkRateLimit(key, limit, windowMs);
}

export function getRateLimitRemaining(
  key: string,
  limit: number,
  windowMs: number
): Promise<number> {
  return getDefaultRateLimiter().getRateLimitRemaining(key, limit, windowMs);
}
