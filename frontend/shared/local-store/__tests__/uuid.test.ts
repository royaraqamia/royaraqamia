import { describe, it, expect, vi, afterEach } from 'vitest';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits an RFC 9562 version-7 UUID', () => {
    expect(uuidv7()).toMatch(UUID_RE);
  });

  it('emits distinct ids', () => {
    const seen = new Set(Array.from({ length: 100 }, () => uuidv7()));
    expect(seen.size).toBe(100);
  });

  it('is time-ordered across milliseconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T10:00:00.000Z'));
    const first = uuidv7();
    vi.setSystemTime(new Date('2026-08-02T10:00:00.001Z'));
    const second = uuidv7();

    expect(first < second).toBe(true);
  });
});
