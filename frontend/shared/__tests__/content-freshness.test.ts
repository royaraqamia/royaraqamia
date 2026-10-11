import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  contentFreshnessKey,
  formatContentFreshness,
  readContentFreshness,
  recordContentFreshness,
} from '../content-freshness';

function fakeStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void map.set(key, value)),
    map,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('content freshness key', () => {
  it('namespaces by pathname', () => {
    expect(contentFreshnessKey('/rates')).toBe('royaraqamia.contentFreshness:/rates');
  });
});

describe('recordContentFreshness / readContentFreshness', () => {
  it('round-trips a timestamp per route', () => {
    const store = fakeStore();
    recordContentFreshness('/rates', 1_700_000_000_000, store);
    recordContentFreshness('/community', 1_600_000_000_000, store);

    expect(readContentFreshness('/rates', store)).toBe(1_700_000_000_000);
    expect(readContentFreshness('/community', store)).toBe(1_600_000_000_000);
    expect(store.map.get(contentFreshnessKey('/rates'))).toBe('1700000000000');
  });

  it('returns null for a route it has never seen', () => {
    expect(readContentFreshness('/never-visited', fakeStore())).toBeNull();
  });

  it('ignores a corrupt value instead of throwing', () => {
    const store = fakeStore({ [contentFreshnessKey('/rates')]: 'not-a-number' });
    expect(readContentFreshness('/rates', store)).toBeNull();
  });

  it('swallows a throwing store and stays a no-op', () => {
    const store = {
      getItem: vi.fn(() => {
        throw new Error('boom');
      }),
      setItem: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    expect(() => recordContentFreshness('/rates', 1, store)).not.toThrow();
    expect(readContentFreshness('/rates', store)).toBeNull();
  });

  it('is a no-op without a store', () => {
    expect(() => recordContentFreshness('/rates', 1, null)).not.toThrow();
    expect(readContentFreshness('/rates', null)).toBeNull();
  });
});

describe('formatContentFreshness', () => {
  it('returns null when nothing was recorded', () => {
    expect(formatContentFreshness(null)).toBeNull();
  });

  it('renders a relative label for a known timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));
    const at = new Date('2026-08-02T11:30:00Z').getTime();
    expect(formatContentFreshness(at)).toBe('منذ 30 دقيقة');
  });
});
