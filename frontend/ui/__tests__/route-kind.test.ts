import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { HOME_SERVICE_ROUTES } from '@/shared/contracts/home-services-catalog';
import {
  APP_ROUTES,
  LAYOUT_ONLY_PATHS,
  PRIMARY_ROUTES,
  chromeFor,
  isAppRoot,
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
  it('keeps the three bottom-tab destinations separate from the app roots', () => {
    expect([...PRIMARY_ROUTES].sort()).toEqual(['/', '/account', '/community']);
    expect([...APP_ROUTES]).toEqual([...HOME_SERVICE_ROUTES]);
  });

  it.each([
    '/',
    '/community',
    '/account',
    '/community?page=2',
    '/quran',
    '/athkar',
    '/athkar/evening',
    '/rates',
    '/rates?from=USD&to=EUR',
  ])('treats %s as app chrome', (pathname) => {
    expect(isPrimaryRoute(pathname)).toBe(true);
    expect(chromeFor(pathname)).toBe('app');
  });

  it.each([
    '/community/some-post',
    '/account/posts',
    '/admin',
    '/auth/login',
    '/blogpress',
    '/quran/2',
    '/spendtrack/categories',
    '/mcp/guide#install',
  ])('treats %s as a drill-down', (pathname) => {
    expect(isPrimaryRoute(pathname)).toBe(false);
    expect(chromeFor(pathname)).toBe('back');
  });

  it.each(['/verify/ABC-123', '/linksnap/unlock/abc123'])(
    'gives the public entry %s the top nav without a tab bar',
    (pathname) => {
      expect(chromeFor(pathname)).toBe('top');
      expect(isPrimaryRoute(pathname)).toBe(false);
    }
  );

  it('treats an unresolved pathname as a drill-down', () => {
    expect(isPrimaryRoute(null)).toBe(false);
    expect(isPrimaryRoute(undefined)).toBe(false);
    expect(chromeFor(null)).toBe('back');
  });

  it('keeps the Home tab lit on the homepage and the app roots only', () => {
    for (const pathname of ['/', '/quran', '/athkar/evening']) {
      expect(isAppRoot(pathname)).toBe(true);
    }

    for (const pathname of ['/community', '/account', '/quran/2', '/privacy']) {
      expect(isAppRoot(pathname)).toBe(false);
    }
  });

  it('keeps the certificate check that left the picker on the app chrome', () => {
    const pathname = '/verify';
    expect(isPrimaryRoute(pathname)).toBe(true);
    expect(chromeFor(pathname)).toBe('app');
    expect(isAppRoot(pathname)).toBe(false);
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
    ['/linksnap/unlock/abc123', '/'],
    ['/admin/clients/retainers', '/admin'],
    ['/admin/consultations/bookings', '/admin'],
    ['/admin/mcp/marketplace', '/admin'],
    ['/admin/training/cohorts', '/admin'],
    ['/admin/certificates/ABC/edit', '/admin/certificates'],
    ['/spendtrack/categories', '/spendtrack'],
    ['/athkar/evening', '/athkar'],
  ])('%s goes up to %s', (pathname, expected) => {
    const parent = parentRouteOf(pathname);

    expect(parent).toBe(expected);
    // The invariant the table encodes: never land on a folder that 404s.
    expect(matchesLayoutOnly(parent)).toBe(false);
  });
});
