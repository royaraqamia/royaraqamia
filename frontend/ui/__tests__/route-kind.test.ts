import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  LAYOUT_ONLY_PATHS,
  PRIMARY_ROUTES,
  isPrimaryRoute,
  parentRouteOf,
} from '../navbar/route-kind';

const APP_DIR = resolve(process.cwd(), 'app');
const IGNORED_SEGMENTS = new Set(['api', '.well-known']);

/**
 * Re-derives the route tree from `app/` the way Next does: `(group)` folders do
 * not appear in the URL, and a folder is a page only when it holds a
 * `page.tsx` — a `route.ts` answers a protocol, not a navigation.
 */
function readRouteTree(): { pages: Set<string>; withPageBelow: Set<string> } {
  const pages = new Set<string>();
  const withPageBelow = new Set<string>();

  function walk(dir: string, segments: string[]): boolean {
    const entries = readdirSync(dir, { withFileTypes: true });
    const isPage = existsSync(join(dir, 'page.tsx'));
    const path = segments.join('/');

    if (isPage) pages.add(path);
    let hasPageBelow = isPage;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      const childSegments = entry.name.startsWith('(') ? segments : [...segments, entry.name];
      hasPageBelow = walk(join(dir, entry.name), childSegments) || hasPageBelow;
    }

    if (segments.length > 0 && hasPageBelow) withPageBelow.add(path);
    return hasPageBelow;
  }

  walk(APP_DIR, []);
  return { pages, withPageBelow };
}

/** `[slug]` and `[...rest]` are one segment each, spelled `*` in the list. */
function asPattern(path: string): string[] {
  return path.split('/').map((segment) => (segment.startsWith('[') ? '*' : segment));
}

function matchesLayoutOnly(point: string): boolean {
  const segments = point.split('/').filter(Boolean);
  return LAYOUT_ONLY_PATHS.some(
    (pattern) =>
      pattern.length === segments.length &&
      pattern.every((part, index) => part === '*' || part === segments[index])
  );
}

describe('route kinds', () => {
  it('lists exactly the three bottom-tab destinations as primary', () => {
    expect([...PRIMARY_ROUTES].sort()).toEqual(['/', '/account', '/community']);
  });

  it.each(['/', '/community', '/account', '/account/', '/community?page=2'])(
    'treats %s as primary',
    (pathname) => {
      expect(isPrimaryRoute(pathname)).toBe(true);
    }
  );

  it.each([
    '/community/some-post',
    '/account/posts',
    '/admin',
    '/auth/login',
    '/rates',
    '/blogpress',
    '/spendtrack/categories',
  ])('treats %s as secondary', (pathname) => {
    expect(isPrimaryRoute(pathname)).toBe(false);
  });

  it('treats an unresolved pathname as secondary', () => {
    expect(isPrimaryRoute(null)).toBe(false);
    expect(isPrimaryRoute(undefined)).toBe(false);
  });

  it('keeps LAYOUT_ONLY_PATHS in step with the folders under app/', () => {
    const { pages, withPageBelow } = readRouteTree();

    const derived = [...withPageBelow]
      .filter((path) => !pages.has(path))
      .filter((path) => !path.split('/').some((segment) => IGNORED_SEGMENTS.has(segment)))
      .map(asPattern);
    const declared = LAYOUT_ONLY_PATHS.map((pattern) => [...pattern]);

    const byPath = (a: string[], b: string[]) => a.join('/').localeCompare(b.join('/'));
    expect([...declared].sort(byPath)).toEqual([...derived].sort(byPath));
  });
});

describe('parentRouteOf', () => {
  it.each([
    ['/community/some-post', '/community'],
    ['/account/posts', '/account'],
    ['/account/connected-apps', '/account'],
    ['/verify/ABC-123', '/verify'],
    ['/rates', '/'],
    ['/privacy', '/'],
    ['/contact/', '/'],
    ['/', '/'],
    // The parents below are folders, not pages — going up has to step over them.
    ['/auth/login', '/'],
    ['/mcp/guide', '/'],
    ['/mcp/connect/consent', '/mcp/connect'],
    ['/consultation/book', '/'],
    ['/training/apply', '/'],
    ['/u/someone', '/'],
    ['/linksnap/unlock/abc123', '/linksnap'],
    ['/blogpress/editor/post-1', '/blogpress'],
    ['/admin/clients/retainers', '/admin'],
    ['/admin/consultations/bookings', '/admin'],
    ['/admin/training/cohorts', '/admin'],
    ['/admin/certificates/ABC/edit', '/admin/certificates'],
    ['/spendtrack/categories', '/spendtrack'],
  ])('%s goes up to %s', (pathname, expected) => {
    const parent = parentRouteOf(pathname);

    expect(parent).toBe(expected);
    // The invariant the table encodes: never land on a folder that 404s.
    expect(matchesLayoutOnly(parent)).toBe(false);
  });
});
