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

function response(overrides = {}) {
  const values = {
    'cache-control': overrides.cacheControl ?? null,
    'content-range': overrides.contentRange ?? null,
  };
  return {
    status: overrides.status ?? 200,
    headers: { get: (key) => values[key] ?? null },
  };
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

    // The App Router marks flight requests with `_rsc` (one underscore).
    expect(routing.isRSCPayload(u('/community?_rsc=abc'))).toBe(true);
    expect(routing.isRSCPayload(u('/community?__rsc=abc'))).toBe(false);
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
      // The MCP protocol endpoint is an exact entry: a prefix would also swallow
      // `/mcp/guide`, which is a cacheable public document (#450).
      '/mcp',
      '/mcp/connect',
      '/mcp/connect/consent',
      '/mcp/authorize',
      '/mcp/register',
      '/mcp/revoke',
      '/mcp/token',
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
      // The auth API keeps its own prefix while the document shells became
      // cacheable (#447): `/auth/api/session` is session state and must never
      // reach shared Cache Storage.
      '/auth/api/session',
      '/auth/api/login',
      '/auth/callback',
      '/admin/training',
      // The product dashboard roots are cached shells since #449 (ADR-0073);
      // their APIs and the two server-rendered subroutes keep the prefix.
      '/spendtrack/categories',
      '/spendtrack/categories/new',
      '/blogpress/editor/9f1c2b3a-0000-4000-8000-000000000000',
      '/habitflow/api/habits',
      '/spendtrack/api/sync',
      '/linksnap/api/links',
      '/linksnap/api/admin/stats',
      '/habitflow/api/auth/user',
      '/api/training/cohorts',
      '/api/project-requests/abc',
      '/api/retainers/abc',
      '/api/consultation/bookings',
      // The Quran pull carries bookmarks and a reading position; a shared
      // cache would replay them to the next identity on the device (#392).
      '/quran/api/sync',
    ]) {
      expect(routing.isNeverCache(u(path))).toBe(true);
    }
  });

  it('caches the product dashboard shells and never their APIs (#449)', () => {
    // `app/<tool>/(app)/page.tsx` is served at `/<tool>` and is now a static,
    // data-free shell painted from the Local Store (ADR-0073), so the document
    // rides the SWR cache while every account-bearing read underneath it keeps
    // its own prefix.
    for (const path of [
      '/habitflow',
      '/spendtrack',
      '/linksnap',
      '/blogpress',
      '/blogpress/calendar',
      '/linksnap/unlock/ABC',
    ]) {
      expect(routing.isNeverCache(u(path))).toBe(false);
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
      // The account shells ride the SWR cache since #448: the guard and the
      // server-owned reads live client-side, so the document carries no
      // fragment one user could leave for the next (ADR-0031's amendment).
      '/account',
      '/account/submissions',
      '/account/faq',
    ]) {
      expect(routing.isNeverCache(u(path))).toBe(false);
    }
  });

  it('caches the Phase 3 shells and keeps their actions online-only (#450)', () => {
    // `/downloader` and `/consultation/book` are data-free documents since #450:
    // their reads are on the never-cache `/api/downloader` and
    // `/api/consultation` prefixes, and the submitting action stays a live
    // server call. `/mcp/guide` is instructions alone, so it left the `/mcp`
    // prefix that the protocol endpoint and the consent document still hold.
    for (const path of ['/downloader', '/consultation/book', '/mcp/guide']) {
      expect(routing.isNeverCache(u(path))).toBe(false);
    }
  });

  it('refuses to cache no-store / no-cache / private responses', () => {
    expect(routing.isCacheable(response({ cacheControl: 'no-store' }))).toBe(false);
    expect(routing.isCacheable(response({ cacheControl: 'no-cache' }))).toBe(false);
    expect(routing.isCacheable(response({ cacheControl: 'private, max-age=0' }))).toBe(false);
    expect(routing.isCacheable(response({ cacheControl: 'public, max-age=60' }))).toBe(true);
    expect(routing.isCacheable(response())).toBe(true);
  });

  it('refuses to cache a range/206 response', () => {
    expect(routing.isCacheable(response({ status: 206, contentRange: 'bytes 0-12/1000' }))).toBe(
      false
    );
    // Some servers answer a Range request with a 200; a content-range header is
    // still a slice of the body and must not be stored under the full key.
    expect(routing.isCacheable(response({ contentRange: 'bytes 0-12/1000' }))).toBe(false);
    expect(routing.isCacheable(response())).toBe(true);
  });

  it('caches an API read only when it opts in with public', () => {
    // The absent header is the bug from #392: it was read as permission.
    expect(routing.isPubliclyCacheable(response())).toBe(false);
    expect(routing.isPubliclyCacheable(response({ cacheControl: 'no-store' }))).toBe(false);
    expect(routing.isPubliclyCacheable(response({ cacheControl: 'private, max-age=0' }))).toBe(
      false
    );
    expect(
      routing.isPubliclyCacheable(response({ cacheControl: 'public, max-age=0, must-revalidate' }))
    ).toBe(true);
    expect(routing.isPubliclyCacheable(response({ cacheControl: 'public, s-maxage=60' }))).toBe(
      true
    );
  });
});
