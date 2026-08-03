import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createRateLimiter, RateLimiterService } from '@/backend/clients/rate-limiter';

function makeLimiter() {
  return createRateLimiter();
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('RateLimiterService (in-memory fallback)', () => {
  it('allows requests under the limit', async () => {
    const limiter = makeLimiter();
    const result = await limiter.checkRateLimit('test-key', 5, 60_000);
    expect(result).toBe(true);
  });

  it('blocks requests that exceed the limit', async () => {
    const limiter = makeLimiter();
    for (let i = 0; i < 3; i++) {
      await limiter.checkRateLimit('exceed-key', 3, 60_000);
    }
    const result = await limiter.checkRateLimit('exceed-key', 3, 60_000);
    expect(result).toBe(false);
  });

  it('resets after the window expires', async () => {
    vi.useFakeTimers();
    const limiter = makeLimiter();

    for (let i = 0; i < 2; i++) {
      await limiter.checkRateLimit('reset-key', 2, 60_000);
    }

    let result = await limiter.checkRateLimit('reset-key', 2, 60_000);
    expect(result).toBe(false);

    vi.advanceTimersByTime(60_001);

    result = await limiter.checkRateLimit('reset-key', 2, 60_000);
    expect(result).toBe(true);

    vi.useRealTimers();
  });

  it('tracks different keys independently', async () => {
    const limiter = makeLimiter();

    for (let i = 0; i < 5; i++) {
      await limiter.checkRateLimit('key-a', 5, 60_000);
    }

    const resultA = await limiter.checkRateLimit('key-a', 5, 60_000);
    expect(resultA).toBe(false);

    const resultB = await limiter.checkRateLimit('key-b', 5, 60_000);
    expect(resultB).toBe(true);
  });

  it('returns true when Redis is configured (fail-open on error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Redis unreachable')));

    const limiter = createRateLimiter({
      redisUrl: 'https://test.upstash.io',
      redisToken: 'test-token',
    });
    const result = await limiter.checkRateLimit('redis-key', 5, 60_000);
    expect(result).toBe(true);
  });

  it('returns remaining count decreasing as requests are made', async () => {
    const limiter = makeLimiter();

    const rem1 = await limiter.getRateLimitRemaining('remaining-key', 5, 60_000);
    expect(rem1).toBe(4);

    const rem2 = await limiter.getRateLimitRemaining('remaining-key', 5, 60_000);
    expect(rem2).toBe(3);

    await limiter.getRateLimitRemaining('remaining-key', 5, 60_000);
    await limiter.getRateLimitRemaining('remaining-key', 5, 60_000);

    const rem5 = await limiter.getRateLimitRemaining('remaining-key', 5, 60_000);
    expect(rem5).toBe(0);
  });

  it('RateLimiterService constructor is directly usable', async () => {
    const limiter = new RateLimiterService({});
    const result = await limiter.checkRateLimit('ctor-key', 5, 60_000);
    expect(result).toBe(true);
  });
});
