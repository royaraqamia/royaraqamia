import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimiter {
  checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean>;
  getRateLimitRemaining(key: string, limit: number, windowMs: number): Promise<number>;
}

export class RateLimiterService implements RateLimiter {
  private redis: Redis | null | undefined;
  private readonly limiters = new Map<string, Ratelimit>();

  private getRedis(): Redis | null {
    if (this.redis === undefined) {
      this.redis =
        process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
          ? new Redis({
              url: process.env.UPSTASH_REDIS_REST_URL,
              token: process.env.UPSTASH_REDIS_REST_TOKEN,
            })
          : null;
    }
    return this.redis;
  }

  private getLimiter(key: string, limit: number, windowMs: number): Ratelimit {
    const existing = this.limiters.get(key);
    if (existing) return existing;

    const redisClient = this.getRedis();
    let limiter: Ratelimit;
    if (redisClient) {
      limiter = new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
        analytics: true,
        prefix: `ratelimit:${key}`,
      });
    } else {
      const memoryStore = new Map<string, { count: number; resetAt: number }>();
      limiter = {
        limit: async (identifier: string) => {
          const now = Date.now();
          const record = memoryStore.get(identifier);
          if (!record || now > record.resetAt) {
            memoryStore.set(identifier, { count: 1, resetAt: now + windowMs });
            return { success: true, limit, remaining: limit - 1, reset: now + windowMs };
          }
          if (record.count >= limit) {
            return { success: false, limit, remaining: 0, reset: record.resetAt };
          }
          record.count++;
          return { success: true, limit, remaining: limit - record.count, reset: record.resetAt };
        },
      } as Ratelimit;
    }

    this.limiters.set(key, limiter);
    return limiter;
  }

  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    try {
      const limiter = this.getLimiter(key, limit, windowMs);
      const { success } = await limiter.limit(key);
      return success;
    } catch {
      return true;
    }
  }

  async getRateLimitRemaining(key: string, limit: number, windowMs: number): Promise<number> {
    try {
      const limiter = this.getLimiter(key, limit, windowMs);
      const { remaining } = await limiter.limit(key);
      return remaining;
    } catch {
      return limit;
    }
  }
}

export function createRateLimiter(): RateLimiter {
  return new RateLimiterService();
}

let defaultRateLimiter: RateLimiter | null = null;

function getDefaultRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = createRateLimiter();
  }
  return defaultRateLimiter;
}

/** Backwards-compatible exports kept for existing actions/services. */
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
