import { describe, expect, it } from 'vitest';
import {
  PRIVATE_PATHS,
  PUBLIC_PATHS,
  isCacheHit,
  privateVerdict,
  publicVerdict,
} from '../check-edge-cache.mjs';

describe('isCacheHit', () => {
  it('treats HIT and REVALIDATED as served by the edge', () => {
    expect(isCacheHit('HIT')).toBe(true);
    expect(isCacheHit('hit')).toBe(true);
    expect(isCacheHit('REVALIDATED')).toBe(true);
  });

  it('treats DYNAMIC, MISS, BYPASS and a missing header as not cached', () => {
    for (const status of ['DYNAMIC', 'MISS', 'BYPASS', 'EXPIRED', undefined, null]) {
      expect(isCacheHit(status)).toBe(false);
    }
  });
});

describe('publicVerdict', () => {
  it('passes a 200 served from the edge', () => {
    expect(publicVerdict({ status: 200, cache: 'HIT' })).toEqual({ ok: true, reason: 'HIT' });
  });

  it('fails a public document the edge did not cache', () => {
    const verdict = publicVerdict({ status: 200, cache: 'DYNAMIC' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('DYNAMIC');
  });

  it('fails a public path that does not answer 200', () => {
    expect(publicVerdict({ status: 307, cache: 'HIT' }).ok).toBe(false);
  });
});

describe('privateVerdict', () => {
  it('passes a private path the edge did not store', () => {
    expect(privateVerdict({ path: '/api/me', cache: 'DYNAMIC' }).ok).toBe(true);
  });

  it('fails a private path the edge stored', () => {
    expect(privateVerdict({ path: '/notifications', cache: 'HIT' }).ok).toBe(false);
  });

  it('requires the feed to keep its private, no-store header', () => {
    expect(
      privateVerdict({ path: '/community', cache: 'DYNAMIC', cacheControl: 'private, no-store' }).ok
    ).toBe(true);
    expect(
      privateVerdict({ path: '/community', cache: 'DYNAMIC', cacheControl: 'public, s-maxage=300' })
        .ok
    ).toBe(false);
  });

  it('requires a profile to keep its private, no-store header', () => {
    expect(
      privateVerdict({ path: '/u/slah-talb', cache: 'DYNAMIC', cacheControl: 'private, no-store' })
        .ok
    ).toBe(true);
    expect(
      privateVerdict({
        path: '/u/slah-talb',
        cache: 'DYNAMIC',
        cacheControl: 'public, s-maxage=300',
      }).ok
    ).toBe(false);
  });
});

describe('the path lists', () => {
  const PUBLIC_API = new Set([
    '/api/rates/board',
    '/api/community/index',
    '/api/consultation/packages',
    '/api/training/cohorts',
    '/api/athkar',
    '/api/version',
  ]);

  it('never lists an authenticated or personalized surface as public', () => {
    for (const path of PUBLIC_PATHS) {
      if (path.startsWith('/api/')) {
        expect(PUBLIC_API.has(path)).toBe(true);
      }
      expect(path.startsWith('/account')).toBe(false);
      expect(path.startsWith('/admin')).toBe(false);
      expect(path.startsWith('/chats')).toBe(false);
      expect(path.startsWith('/u/')).toBe(false);
      expect(path).not.toBe('/community');
    }
  });

  it('checks the feed and the member surfaces on the private side', () => {
    expect(PRIVATE_PATHS).toContain('/community');
    expect(PRIVATE_PATHS).toContain('/notifications');
    expect(PRIVATE_PATHS).toContain('/api/me');
    expect(PRIVATE_PATHS).toContain('/api/community/following');
  });
});
