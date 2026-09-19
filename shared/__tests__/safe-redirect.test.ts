import { describe, it, expect } from 'vitest';
import { isSafeRedirect, safeRedirect } from '@/shared/safe-redirect';

describe('safeRedirect', () => {
  it('returns the fallback for null, undefined and empty string', () => {
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect('')).toBe('/');
  });

  it('returns a custom fallback when provided', () => {
    expect(safeRedirect(null, '/dashboard')).toBe('/dashboard');
    expect(safeRedirect('', '/dashboard')).toBe('/dashboard');
  });

  it('accepts a valid internal path', () => {
    expect(safeRedirect('/dashboard')).toBe('/dashboard');
    expect(safeRedirect('/auth/login?redirect=/spendtrack')).toBe(
      '/auth/login?redirect=/spendtrack'
    );
    expect(safeRedirect('/blog/some-post')).toBe('/blog/some-post');
  });

  it('returns the decoded path for percent-encoded internal paths', () => {
    expect(safeRedirect('/%D8%A7%D9%84%D8%B1%D8%A6%D9%8A%D8%B3%D9%8A%D8%A9')).toBe('/الرئيسية');
  });

  it('rejects protocol-relative URLs (//host)', () => {
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('%2F%2Fevil.com')).toBe('/');
    expect(safeRedirect('\\\\evil.com')).toBe('/');
    expect(safeRedirect('/%5C%5Cevil.com')).toBe('/\\\\evil.com');
  });

  it('rejects a leading backslash prefix', () => {
    expect(safeRedirect('\\evil.com')).toBe('/');
  });

  it('rejects external URLs', () => {
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect('http://evil.com')).toBe('/');
    expect(safeRedirect('https://evil.com/path')).toBe('/');
  });

  it('rejects javascript/data/vbscript schemes, raw and encoded', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/');
    expect(safeRedirect('data:text/html;base64,PHNjcmlwdD4=')).toBe('/');
    expect(safeRedirect('vbscript:msgbox(1)')).toBe('/');
    expect(safeRedirect('java%0ascript:alert(1)')).toBe('/');
  });

  it('rejects paths that do not start with a slash', () => {
    expect(safeRedirect('dashboard')).toBe('/');
    expect(safeRedirect('dashboard/path')).toBe('/');
  });

  it('returns the fallback on malformed percent-encoding', () => {
    expect(safeRedirect('%zz%zz')).toBe('/');
  });

  it('rejects a double-encoded protocol-relative URL', () => {
    expect(safeRedirect('%252F%252Fevil.com')).toBe('/');
    expect(safeRedirect('%2F%252Fevil.com')).toBe('/');
  });
});

describe('isSafeRedirect', () => {
  it('is the boolean form of the one rule', () => {
    expect(isSafeRedirect('/dashboard')).toBe(true);
    expect(isSafeRedirect('/auth/login?redirect=/spendtrack')).toBe(true);
    expect(isSafeRedirect('//evil.com')).toBe(false);
    expect(isSafeRedirect('%252F%252Fevil.com')).toBe(false);
    expect(isSafeRedirect('https://evil.com')).toBe(false);
    expect(isSafeRedirect('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirect('dashboard')).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect('')).toBe(false);
  });

  it('agrees with safeRedirect on every crafted input', () => {
    const crafted = [
      '/ok',
      '/%D8%A7%D9%84%D8%B1%D8%A6%D9%8A%D8%B3%D9%8A%D8%A9',
      '//evil.com',
      '%2F%2Fevil.com',
      '%252F%252Fevil.com',
      '\\\\evil.com',
      '\\evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      'java%0ascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'dashboard',
      '%zz%zz',
      '',
    ];

    for (const input of crafted) {
      const viaBoolean = isSafeRedirect(input);
      const viaString = safeRedirect(input, '\u0000unsafe') !== '\u0000unsafe';
      expect(viaBoolean, `disagreement on ${input}`).toBe(viaString);
    }
  });
});
