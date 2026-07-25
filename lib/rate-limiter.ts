import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiters = new Map<string, Ratelimit>();

function getLimiter(key: string, limit: number, windowMs: number): Ratelimit {
  const existing = limiters.get(key);
  if (existing) return existing;

  let limiter: Ratelimit;
  if (redis) {
    limiter = new Ratelimit({
      redis,
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

  limiters.set(key, limiter);
  return limiter;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  try {
    const limiter = getLimiter(key, limit, windowMs);
    const { success } = await limiter.limit(key);
    return success;
  } catch {
    return true;
  }
}

export async function getRateLimitRemaining(
  key: string,
  limit: number,
  windowMs: number
): Promise<number> {
  try {
    const limiter = getLimiter(key, limit, windowMs);
    const { remaining } = await limiter.limit(key);
    return remaining;
  } catch {
    return limit;
  }
}
