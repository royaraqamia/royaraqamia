import { describe, it, expect } from 'vitest';
import { safeRedirect } from '@/backend/shared/safe-redirect';

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
});
