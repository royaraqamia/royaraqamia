import { Redis } from '@upstash/redis';

export type SlotReleaser = () => Promise<void>;

/** Reserves one of a fixed number of slots; `null` means the tool is at capacity. */
export interface ConcurrencyGate {
  acquire(): Promise<SlotReleaser | null>;
}

export interface ConcurrencyGateConfig {
  redisUrl?: string;
  redisToken?: string;
  limit: number;
  /** Safety TTL so a holder that crashes cannot leak its slot forever. */
  ttlSeconds: number;
}

/**
 * A cross-instance cap on simultaneous tasks (here: Media Provider jobs). The
 * count lives in Redis so it is global across serverless instances, unlike the
 * in-process limiter in `backend/shared/concurrency-limiter.ts`. With no Redis
 * configured it degrades to an in-process gate, which bounds concurrency within
 * one instance only.
 */
export function createConcurrencyGate(config: ConcurrencyGateConfig): ConcurrencyGate {
  const { redisUrl, redisToken, limit, ttlSeconds } = config;
  const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
  const key = 'downloader:inflight';

  if (!redis) {
    let active = 0;
    return {
      async acquire() {
        if (active >= limit) return null;
        active += 1;
        let released = false;
        return async () => {
          if (released) return;
          released = true;
          active -= 1;
        };
      },
    };
  }

  return {
    async acquire() {
      try {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, ttlSeconds);
        if (count > limit) {
          await redis.decr(key);
          return null;
        }

        let released = false;
        return async () => {
          if (released) return;
          released = true;
          try {
            await redis.decr(key);
          } catch {
            // The TTL reclaims the slot; release must never throw to the caller.
          }
        };
      } catch {
        // Fail open: a Redis outage should not take the tool down; Turnstile still
        // gates abuse and the per-IP limit still applies.
        return async () => {};
      }
    },
  };
}
