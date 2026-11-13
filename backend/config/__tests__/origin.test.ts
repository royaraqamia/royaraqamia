import { describe, expect, it } from 'vitest';
import { DEV_ORIGIN, normalizeOrigin, resolveOrigin } from '@/backend/config/origin';

describe('normalizeOrigin', () => {
  it('accepts a bare https origin and drops a trailing slash', () => {
    expect(normalizeOrigin('https://royaraqamia.com')).toBe('https://royaraqamia.com');
    expect(normalizeOrigin(' https://royaraqamia.com/ ')).toBe('https://royaraqamia.com');
  });

  it('accepts a localhost origin with a port', () => {
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('refuses a value that is not an http(s) origin', () => {
    expect(normalizeOrigin(undefined)).toBeNull();
    expect(normalizeOrigin('   ')).toBeNull();
    expect(normalizeOrigin('royaraqamia.com')).toBeNull();
    expect(normalizeOrigin('ftp://royaraqamia.com')).toBeNull();
  });

  it('refuses a path, query or fragment', () => {
    expect(normalizeOrigin('https://royaraqamia.com/mcp')).toBeNull();
    expect(normalizeOrigin('https://royaraqamia.com/?a=1')).toBeNull();
    expect(normalizeOrigin('https://royaraqamia.com/#top')).toBeNull();
  });
});

describe('resolveOrigin', () => {
  it('reads PUBLIC_ORIGIN first', () => {
    expect(
      resolveOrigin({
        PUBLIC_ORIGIN: 'https://preview.example.com',
        NEXT_PUBLIC_SITE_URL: 'https://preview.example.com',
      })
    ).toBe('https://preview.example.com');
  });

  it('falls back to the build-time value when no runtime origin is set', () => {
    expect(resolveOrigin({ NEXT_PUBLIC_SITE_URL: 'https://royaraqamia.com' })).toBe(
      'https://royaraqamia.com'
    );
    expect(resolveOrigin({ NEXT_PUBLIC_BASE_URL: 'https://royaraqamia.com' })).toBe(
      'https://royaraqamia.com'
    );
  });

  it('prefers a non-empty value over a blank one', () => {
    expect(
      resolveOrigin({
        PUBLIC_ORIGIN: '',
        NEXT_PUBLIC_SITE_URL: 'https://royaraqamia.com',
      })
    ).toBe('https://royaraqamia.com');
  });

  it('uses the development origin outside production', () => {
    expect(resolveOrigin({ NODE_ENV: 'development' })).toBe(DEV_ORIGIN);
    expect(resolveOrigin({ NODE_ENV: 'test' })).toBe(DEV_ORIGIN);
  });

  it('refuses to guess in production', () => {
    expect(() => resolveOrigin({ NODE_ENV: 'production' })).toThrow(/PUBLIC_ORIGIN is unset/);
  });

  it('refuses a malformed value instead of concatenating into it', () => {
    expect(() => resolveOrigin({ PUBLIC_ORIGIN: 'royaraqamia.com' })).toThrow(
      /bare http\(s\) origin/
    );
    expect(() => resolveOrigin({ PUBLIC_ORIGIN: 'https://royaraqamia.com/mcp' })).toThrow(
      /bare http\(s\) origin/
    );
  });

  it('refuses a runtime origin that disagrees with the inlined one', () => {
    expect(() =>
      resolveOrigin({
        PUBLIC_ORIGIN: 'https://staging.example.com',
        NEXT_PUBLIC_SITE_URL: 'https://royaraqamia.com',
      })
    ).toThrow(/disagrees with NEXT_PUBLIC_SITE_URL/);
  });

  it('accepts two spellings of the same origin', () => {
    expect(
      resolveOrigin({
        PUBLIC_ORIGIN: 'https://royaraqamia.com/',
        NEXT_PUBLIC_SITE_URL: 'https://royaraqamia.com',
      })
    ).toBe('https://royaraqamia.com');
  });
});
