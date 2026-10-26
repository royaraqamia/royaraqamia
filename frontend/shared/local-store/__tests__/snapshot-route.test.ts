import { describe, it, expect } from 'vitest';
import {
  isDetailRoute,
  normaliseSnapshotRoute,
} from '@/frontend/shared/local-store/snapshot-route';

/**
 * The public snapshot key (#555).
 *
 * What it has to get right is small and load-bearing: the same digest reached
 * two ways must be one key, and a router's bookkeeping must never be part of it
 * — a key that changes with the router state is a key an offline reload misses.
 */
describe('normaliseSnapshotRoute', () => {
  it('keeps the path when there is no query', () => {
    expect(normaliseSnapshotRoute('/news')).toBe('/news');
    expect(normaliseSnapshotRoute('/news', '')).toBe('/news');
    expect(normaliseSnapshotRoute('/news', '?')).toBe('/news');
  });

  it('drops the trailing slash, and keeps the root', () => {
    expect(normaliseSnapshotRoute('/news/')).toBe('/news');
    expect(normaliseSnapshotRoute('/')).toBe('/');
    expect(normaliseSnapshotRoute('')).toBe('/');
  });

  it('keeps the filters the reader chose', () => {
    expect(normaliseSnapshotRoute('/news', '?date=2026-10-25&category=tech')).toBe(
      '/news?category=tech&date=2026-10-25'
    );
  });

  it('drops the router’s own parameters', () => {
    expect(normaliseSnapshotRoute('/news', '?_rsc=abc123&category=tech')).toBe(
      '/news?category=tech'
    );
    expect(normaliseSnapshotRoute('/news', '?next-url=%2Frates&_rsc=9')).toBe('/news');
  });

  it('folds two orderings of the same filters into one key', () => {
    const first = normaliseSnapshotRoute('/news', '?category=tech&date=2026-10-25');
    const second = normaliseSnapshotRoute('/news', '?date=2026-10-25&category=tech');

    expect(first).toBe(second);
  });

  it('keeps a repeated parameter repeated, in order', () => {
    expect(normaliseSnapshotRoute('/news', '?tag=b&tag=a')).toBe('/news?tag=a&tag=b');
  });

  it('accepts a query without the leading question mark', () => {
    expect(normaliseSnapshotRoute('/news', 'category=tech')).toBe('/news?category=tech');
  });

  it('adds the leading slash a bare path is missing', () => {
    expect(normaliseSnapshotRoute('news')).toBe('/news');
  });
});

/**
 * Which routes are unbounded. The distinction is what keeps a deep-link crawl
 * from filling the store: these keys come from the address bar, so the store
 * must cap how many it keeps.
 */
describe('isDetailRoute', () => {
  it('is false for a list surface, however deep its query', () => {
    expect(isDetailRoute('/news')).toBe(false);
    expect(isDetailRoute('/news?date=2026-10-25')).toBe(false);
    expect(isDetailRoute('/community')).toBe(false);
    expect(isDetailRoute('/')).toBe(false);
  });

  it('is true for a concrete item under a surface', () => {
    expect(isDetailRoute('/community/a-post-slug')).toBe(true);
    expect(isDetailRoute('/verify/ABC-123')).toBe(true);
    expect(isDetailRoute('/u/someone')).toBe(true);
    expect(isDetailRoute('/community/a-post-slug?_rsc=1')).toBe(true);
  });
});
