import { describe, it, expect, vi, beforeEach } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('checkRateLimit (in-memory fallback)', () => {
  it('allows requests under the limit', async () => {
    const { checkRateLimit } = await import('@/backend/clients/rate-limiter');
    const result = await checkRateLimit('test-key', 5, 60_000);
    expect(result).toBe(true);
  });

  it('blocks requests that exceed the limit', async () => {
    const { checkRateLimit } = await import('@/backend/clients/rate-limiter');
    for (let i = 0; i < 3; i++) {
      await checkRateLimit('exceed-key', 3, 60_000);
    }
    const result = await checkRateLimit('exceed-key', 3, 60_000);
    expect(result).toBe(false);
  });

  it('resets after the window expires', async () => {
    vi.useFakeTimers();
    const { checkRateLimit } = await import('@/backend/clients/rate-limiter');

    for (let i = 0; i < 2; i++) {
      await checkRateLimit('reset-key', 2, 60_000);
    }

    let result = await checkRateLimit('reset-key', 2, 60_000);
    expect(result).toBe(false);

    vi.advanceTimersByTime(60_001);

    result = await checkRateLimit('reset-key', 2, 60_000);
    expect(result).toBe(true);

    vi.useRealTimers();
  });

  it('tracks different keys independently', async () => {
    const { checkRateLimit } = await import('@/backend/clients/rate-limiter');

    for (let i = 0; i < 5; i++) {
      await checkRateLimit('key-a', 5, 60_000);
    }

    const resultA = await checkRateLimit('key-a', 5, 60_000);
    expect(resultA).toBe(false);

    const resultB = await checkRateLimit('key-b', 5, 60_000);
    expect(resultB).toBe(true);
  });

  it('returns true when Redis is configured (fail-open on error)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Redis unreachable')));

    const { checkRateLimit } = await import('@/backend/clients/rate-limiter');
    const result = await checkRateLimit('redis-key', 5, 60_000);
    expect(result).toBe(true);
  });

  it('returns remaining count decreasing as requests are made', async () => {
    const { getRateLimitRemaining } = await import('@/backend/clients/rate-limiter');

    const rem1 = await getRateLimitRemaining('remaining-key', 5, 60_000);
    expect(rem1).toBe(4);

    const rem2 = await getRateLimitRemaining('remaining-key', 5, 60_000);
    expect(rem2).toBe(3);

    await getRateLimitRemaining('remaining-key', 5, 60_000);
    await getRateLimitRemaining('remaining-key', 5, 60_000);

    const rem5 = await getRateLimitRemaining('remaining-key', 5, 60_000);
    expect(rem5).toBe(0);
  });
});
