import { describe, it, expect } from 'vitest';
import {
  BACKOFF_MAX_MS,
  backoffDelay,
  isDue,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    seq: 1,
    id: 'a',
    entity: 'habit',
    type: 'habit.create',
    payload: {},
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
    ...overrides,
  };
}

describe('outbox backoff', () => {
  it('grows with attempts and is capped', () => {
    const ceiling = (attempts: number) => backoffDelay(attempts, () => 0.999999);
    expect(ceiling(2)).toBeGreaterThan(ceiling(1));
    expect(ceiling(5)).toBeGreaterThan(ceiling(2));
    expect(ceiling(50)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
  });

  it('jitters within the ceiling (full jitter)', () => {
    expect(backoffDelay(3, () => 0)).toBe(0);
    expect(backoffDelay(3, () => 1)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    expect(backoffDelay(3, () => 1)).toBeGreaterThan(0);
  });
});

describe('outbox isDue', () => {
  it('is due when pending and past its retry time', () => {
    expect(isDue(entry({ nextAttemptAt: 100 }), 100)).toBe(true);
    expect(isDue(entry({ nextAttemptAt: 101 }), 100)).toBe(false);
  });

  it('is never due when permanently failed', () => {
    expect(isDue(entry({ status: 'failed', nextAttemptAt: 0 }), 1_000)).toBe(false);
  });
});
