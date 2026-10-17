/* global URL */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = readFileSync(resolve(ROOT, 'public', 'sw-routing.js'), 'utf8');

function load() {
  const sandbox = { URL };
  sandbox.self = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'sw-routing.js' });
  return sandbox.SWRouting;
}

const routing = load();

function u(path) {
  return new URL(`https://site.example${path}`);
}

function request(overrides = {}) {
  return {
    mode: 'cors',
    method: 'GET',
    headers: { get: () => null },
    ...overrides,
  };
}

describe('sw-routing predicates', () => {
  it('classifies Next static assets, RSC payloads and fonts', () => {
    expect(routing.isNextStaticAsset(u('/_next/static/chunk.js'))).toBe(true);
    expect(routing.isNextStaticAsset(u('/community'))).toBe(false);

    expect(routing.isRSCPayload(u('/community?__rsc=abc'))).toBe(true);
    expect(routing.isRSCPayload(u('/_next/data/build/x.json'))).toBe(true);
    expect(routing.isRSCPayload(u('/rates'))).toBe(false);

    expect(routing.isFont(u('/fonts/ibm.woff2'))).toBe(true);
    expect(routing.isFont(u('/_next/static/font.ttf'))).toBe(true);
    expect(routing.isFont(u('/api/community'))).toBe(false);
  });

  it('classifies icons, images and next/image endpoints', () => {
    expect(routing.isIcon(u('/icons/icon-192x192.png'))).toBe(true);
    expect(routing.isImage(u('/01.webp'))).toBe(true);
    expect(routing.isImage(u('/community/x'))).toBe(false);
    expect(routing.isNextImage(u('/_next/image?url=x'))).toBe(true);
    expect(routing.isApiCall(u('/api/rates'))).toBe(true);
  });

  it('detects navigations by mode or html accept header', () => {
    expect(routing.isNavigationRequest(request({ mode: 'navigate' }))).toBe(true);
    expect(routing.isNavigationRequest(request({ headers: { get: () => 'text/html' } }))).toBe(
      true
    );
    expect(routing.isNavigationRequest(request())).toBeFalsy();
  });

  it('is never-cache for online-only surfaces', () => {
    for (const path of [
      '/api/auth/login',
      '/api/admin/users',
      // The admin certificate list and detail carry student names and codes;
      // a cached response would outlive the admin session (ADR-0031).
      '/api/certificates?page=1',
      '/api/certificates/9f1c2b3a-0000-4000-8000-000000000000',
      '/api/push/subscribe',
      '/api/me/retainers',
      '/api/notifications/unread-count',
      '/api/blogpress/posts',
      '/api/downloader/jobs',
      '/auth/login',
      '/admin/training',
      '/account/submissions',
      '/mcp/connect',
      '/habitflow',
      '/spendtrack',
      '/linksnap',
      '/blogpress',
      '/spendtrack/categories',
      '/blogpress/calendar',
      '/linksnap/unlock/ABC',
      '/habitflow/api/habits',
      '/spendtrack/api/sync',
      '/linksnap/api/links',
      '/linksnap/api/admin/stats',
      '/habitflow/api/auth/user',
      '/api/training/cohorts',
      '/api/project-requests/abc',
      '/api/retainers/abc',
      '/api/consultation/bookings',
    ]) {
      expect(routing.isNeverCache(u(path))).toBe(true);
    }
  });

  it('is never-cache for per-user account-tool shells (route groups are not in the URL)', () => {
    // `app/<tool>/(app)/page.tsx` is served at `/<tool>`, not `/<tool>/app`, and
    // the shell embeds per-user seeds, so the bare tool path must bypass the cache.
    for (const path of ['/habitflow', '/spendtrack', '/linksnap', '/blogpress']) {
      expect(routing.isNeverCache(u(path))).toBe(true);
    }
  });

  it('allows the public read surfaces to be cached', () => {
    for (const path of [
      '/',
      '/community/x',
      '/rates',
      '/verify/ABC',
      '/api/rates',
      '/api/community',
    ]) {
      expect(routing.isNeverCache(u(path))).toBe(false);
    }
  });

  it('refuses to cache no-store / no-cache / private responses', () => {
    const withCacheControl = (value) => ({ headers: { get: () => value } });
    expect(routing.isCacheable(withCacheControl('no-store'))).toBe(false);
    expect(routing.isCacheable(withCacheControl('no-cache'))).toBe(false);
    expect(routing.isCacheable(withCacheControl('private, max-age=0'))).toBe(false);
    expect(routing.isCacheable(withCacheControl('public, max-age=60'))).toBe(true);
    expect(routing.isCacheable(withCacheControl(''))).toBe(true);
  });
});
