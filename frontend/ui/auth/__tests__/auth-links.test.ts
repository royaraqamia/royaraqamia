import { describe, it, expect } from 'vitest';
import { authLink } from '@/frontend/ui/auth/auth-links';

describe('authLink', () => {
  it('returns the bare path when no redirect is provided', () => {
    expect(authLink('/auth/signup', null)).toBe('/auth/signup');
    expect(authLink('/auth/signup', undefined)).toBe('/auth/signup');
  });

  it('omits the redirect param for the homepage fallback', () => {
    expect(authLink('/auth/signup', '/')).toBe('/auth/signup');
  });

  it('appends a single redirect param', () => {
    expect(authLink('/auth/signup', '/blogpress/app')).toBe(
      '/auth/signup?redirect=%2Fblogpress%2Fapp'
    );
  });

  it('preserves extra params alongside redirect', () => {
    expect(authLink('/auth/login', '/admin', { session_expired: '1' })).toBe(
      '/auth/login?redirect=%2Fadmin&session_expired=1'
    );
  });

  it('keeps extra params when redirect is absent', () => {
    expect(authLink('/auth/login', null, { session_expired: '1' })).toBe(
      '/auth/login?session_expired=1'
    );
  });

  it('omits unsafe redirect values', () => {
    expect(authLink('/auth/signup', '//evil.com')).toBe('/auth/signup');
    expect(authLink('/auth/signup', 'https://evil.com')).toBe('/auth/signup');
    expect(authLink('/auth/signup', 'javascript:alert(1)')).toBe('/auth/signup');
  });

  it('rejects the same crafted redirects as the shared safe-redirect helper', async () => {
    const { isSafeRedirect } = await import('@/backend/shared/safe-redirect');
    const crafted = [
      '/spendtrack/app',
      '//evil.com',
      '%2F%2Fevil.com',
      '%252F%252Fevil.com',
      'https://evil.com',
      'javascript:alert(1)',
      'java%0ascript:alert(1)',
      'dashboard',
    ];

    for (const redirect of crafted) {
      const result = authLink('/auth/signup', redirect);
      const expected = isSafeRedirect(redirect)
        ? `/auth/signup?redirect=${encodeURIComponent(redirect)}`
        : '/auth/signup';
      expect(result, `redirect=${redirect}`).toBe(expected);
    }
  });
});
