import { describe, it, expect } from 'vitest';
import { createConcurrencyLimiter } from '@/backend/shared/concurrency-limiter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createConcurrencyLimiter', () => {
  it('never runs more than maxConcurrent tasks at once', async () => {
    const limit = createConcurrencyLimiter(2);
    let active = 0;
    let peak = 0;

    const gates = Array.from({ length: 6 }, () => deferred());

    const runs = gates.map((gate) =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
      })
    );

    // Let the first two tasks start, then release them one at a time.
    await Promise.resolve();
    expect(active).toBe(2);

    for (const gate of gates) {
      gate.resolve();
      await Promise.resolve();
    }

    await Promise.all(runs);
    expect(peak).toBe(2);
  });

  it('returns each task result in order', async () => {
    const limit = createConcurrencyLimiter(3);

    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => limit(async () => n * 10)));

    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('frees the slot when a task rejects', async () => {
    const limit = createConcurrencyLimiter(1);

    await expect(
      limit(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await expect(limit(async () => 'ok')).resolves.toBe('ok');
  });

  it('rejects an invalid concurrency', () => {
    expect(() => createConcurrencyLimiter(0)).toThrow(RangeError);
    expect(() => createConcurrencyLimiter(1.5)).toThrow(RangeError);
  });
});
