import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_PRECACHE_ROUTES,
  readNeverCachePrefixes,
  renderPrecacheScript,
  selectPrecacheRoutes,
} from '../generate-sw-precache.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const APP_PATHS = {
  '/page': '/',
  '/privacy/page': '/privacy',
  '/terms/page': '/terms',
  '/rates/page': '/rates',
  '/community/page': '/community',
  '/community/[slug]/page': '/community/[slug]',
  '/quran/page': '/quran',
  '/quran/[surah]/page': '/quran/[surah]',
  '/verify/page': '/verify',
  '/verify/[code]/page': '/verify/[code]',
  '/auth/login/page': '/auth/login',
  '/auth/error/page': '/auth/error',
  '/admin/page': '/admin',
  '/account/page': '/account',
  '/habitflow/(app)/page': '/habitflow',
  '/spendtrack/(app)/page': '/spendtrack',
  '/linksnap/(app)/page': '/linksnap',
  '/blogpress/(app)/page': '/blogpress',
  '/device/page': '/device',
  '/offline/page': '/offline',
  '/mcp/guide/page': '/mcp/guide',
  '/api/rates/route': '/api/rates',
  '/robots.txt/route': '/robots.txt',
};

// Every public page here is prerendered; the never-cache and dynamic filters
// have to do the excluding, not the prerender manifest alone. The fixture
// mirrors the real worker: the auth API and the OAuth callback keep their
// never-cache prefixes while the document shells became cacheable (#447), and
// the account shells joined them once their guard moved client-side (#448).
// never-cache prefixes while the document shells became cacheable (#447).
const PRERENDERED = Object.fromEntries(
  Object.values(APP_PATHS).map((route) => [route, { srcRoute: null }])
);

const NEVER_CACHE = [
  '/auth/api',
  '/auth/callback',
  '/admin',
  '/mcp',
  '/habitflow',
  '/spendtrack',
  '/linksnap',
  '/blogpress',
];

function select(overrides = {}) {
  return selectPrecacheRoutes({
    appPaths: APP_PATHS,
    prerendered: PRERENDERED,
    neverCachePrefixes: NEVER_CACHE,
    ...overrides,
  });
}

describe('public route shell derivation', () => {
  it('keeps only prerendered public static pages, with the auth and account shells in', () => {
    expect(select()).toEqual([
      '/account',
  it('keeps only prerendered public static pages, with the auth shells in', () => {
    expect(select()).toEqual([
      '/auth/error',
      '/auth/login',
      '/community',
      '/privacy',
      '/quran',
      '/rates',
      '/terms',
      '/verify',
    ]);
  });

  it('drops dynamic detail patterns and concrete prerendered details', () => {
    const routes = select();
    expect(routes).not.toContain('/community/[slug]');
    expect(routes).not.toContain('/quran/[surah]');
    expect(routes).not.toContain('/verify/[code]');
    // A concretely prerendered detail is absent unless its pattern is a page.
    expect(routes).not.toContain('/quran/1');
  });

  it('excludes every never-cache prefix from the worker routing script', () => {
    const prefixes = readNeverCachePrefixes(
      readFileSync(resolve(ROOT, 'public/sw-routing.js'), 'utf8')
    );
    const routes = select({ neverCachePrefixes: prefixes });

    for (const prefix of prefixes) {
      expect(routes.some((route) => route === prefix || route.startsWith(`${prefix}/`))).toBe(
        false
      );
    }
    expect(routes).toContain('/privacy');
  });

  it('leaves out the fixed shell, internal routes and non-page handlers', () => {
    const routes = select();
    expect(routes).not.toContain('/');
    expect(routes).not.toContain('/offline');
    expect(routes).not.toContain('/device');
    expect(routes).not.toContain('/_not-found');
    expect(routes).not.toContain('/api/rates');
    expect(routes).not.toContain('/robots.txt');
  });

  it('caps the list and keeps it deterministic', () => {
    const routes = select({ maxRoutes: 2 });
    expect(routes).toEqual(['/account', '/auth/error']);
    expect(routes).toEqual(['/auth/error', '/auth/login']);
    expect(select({ maxRoutes: MAX_PRECACHE_ROUTES })).toEqual(select());
  });

  it('renders a plain script the worker can import', () => {
    const script = renderPrecacheScript(['/privacy', '/terms']);
    expect(script).toContain('Auto-generated');
    expect(script).toContain('self.PRECACHE_ROUTES = ["/privacy","/terms"];');
  });
});
