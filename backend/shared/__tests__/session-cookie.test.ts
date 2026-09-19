import { describe, it, expect } from 'vitest';
import { hasSessionCookie, isSessionCookieName } from '@/backend/shared/session-cookie';

describe('isSessionCookieName', () => {
  it('accepts the named session cookie and its chunked parts', () => {
    expect(isSessionCookieName('sb-test-ref-auth-token')).toBe(true);
    expect(isSessionCookieName('sb-test-ref-auth-token.0')).toBe(true);
    expect(isSessionCookieName('sb-test-ref-auth-token.12')).toBe(true);
  });

  it('rejects lookalikes that the substring rule would have accepted', () => {
    expect(isSessionCookieName('sb-test-ref-auth-token-extra')).toBe(false);
    expect(isSessionCookieName('prefix-sb-x-auth-token')).toBe(false);
    expect(isSessionCookieName('theme')).toBe(false);
  });
});

describe('hasSessionCookie', () => {
  it('finds a session among other cookies', () => {
    expect(hasSessionCookie([{ name: 'theme' }, { name: 'sb-ref-auth-token' }])).toBe(true);
  });

  it('is false when no cookie is a session cookie', () => {
    expect(hasSessionCookie([{ name: 'theme' }, { name: 'locale' }])).toBe(false);
    expect(hasSessionCookie([])).toBe(false);
  });
});
