import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimiterConfig {
  redisUrl?: string;
  redisToken?: string;
}

export interface RateLimiterOptions {
  /**
   * When the backing store errors (e.g. Redis unreachable), fail closed by
   * denying the request instead of allowing it through. Enable this for
   * security-sensitive paths so a rate-limit outage never disables brute-force
   * protection silently.
   */
  failClosed?: boolean;
}

export interface RateLimiter {
  checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    options?: RateLimiterOptions
  ): Promise<boolean>;
  getRateLimitRemaining(
    key: string,
    limit: number,
    windowMs: number,
    options?: RateLimiterOptions
  ): Promise<number>;
}

export class RateLimiterService implements RateLimiter {
  private redis: Redis | null | undefined;
  private readonly limiters = new Map<string, Ratelimit>();

  constructor(private readonly config: RateLimiterConfig) {}

  private getRedis(): Redis | null {
    if (this.redis === undefined) {
      this.redis =
        this.config.redisUrl && this.config.redisToken
          ? new Redis({
              url: this.config.redisUrl,
              token: this.config.redisToken,
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

  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    options: RateLimiterOptions = {}
  ): Promise<boolean> {
    try {
      const limiter = this.getLimiter(key, limit, windowMs);
      const { success } = await limiter.limit(key);
      return success;
    } catch {
      return options.failClosed ? false : true;
    }
  }

  async getRateLimitRemaining(
    key: string,
    limit: number,
    windowMs: number,
    options: RateLimiterOptions = {}
  ): Promise<number> {
    try {
      const limiter = this.getLimiter(key, limit, windowMs);
      const { remaining } = await limiter.limit(key);
      return remaining;
    } catch {
      return options.failClosed ? 0 : limit;
    }
  }
}

export function createRateLimiter(config: RateLimiterConfig = {}): RateLimiter {
  return new RateLimiterService(config);
}
