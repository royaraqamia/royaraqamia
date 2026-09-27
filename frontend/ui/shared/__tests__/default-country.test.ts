import { describe, expect, it } from 'vitest';

import { DEFAULT_COUNTRY, getCountryByIso } from '../country-dial-codes';
import { readCountryCookie } from '../country-cookie';
import { isoFromLanguage, isoFromTimezone, resolveDefaultCountry } from '../default-country';

describe('getCountryByIso', () => {
  it('resolves a code case-insensitively', () => {
    expect(getCountryByIso('de')?.dial).toBe('49');
    expect(getCountryByIso('DE')?.iso).toBe('DE');
  });

  it('returns null for unknown, malformed or empty codes', () => {
    expect(getCountryByIso('ZZ')).toBeNull();
    expect(getCountryByIso('')).toBeNull();
    expect(getCountryByIso(null)).toBeNull();
    expect(getCountryByIso(undefined)).toBeNull();
  });
});

describe('readCountryCookie', () => {
  it('reads the country from a cookie string', () => {
    expect(readCountryCookie('a=b; rr-country=DE; x=y')).toBe('DE');
    expect(readCountryCookie('rr-country=SY')).toBe('SY');
  });

  it('returns null when absent or malformed', () => {
    expect(readCountryCookie('')).toBeNull();
    expect(readCountryCookie('session=abc')).toBeNull();
    expect(readCountryCookie('rr-country=Germany')).toBeNull();
  });
});

describe('isoFromTimezone', () => {
  it('maps unambiguous zones to their country', () => {
    expect(isoFromTimezone('Asia/Damascus')).toBe('SY');
    expect(isoFromTimezone('Europe/Paris')).toBe('FR');
    expect(isoFromTimezone('America/Toronto')).toBe('CA');
  });

  it('returns null for unknown or missing zones', () => {
    expect(isoFromTimezone('Mars/Olympus')).toBeNull();
    expect(isoFromTimezone(undefined)).toBeNull();
  });
});

describe('isoFromLanguage', () => {
  it('reads the region subtag', () => {
    expect(isoFromLanguage('ar-SY')).toBe('SY');
    expect(isoFromLanguage('pt-BR')).toBe('BR');
  });

  it('does not infer a region from a bare language', () => {
    expect(isoFromLanguage('en')).toBeNull();
    expect(isoFromLanguage('')).toBeNull();
  });
});

describe('resolveDefaultCountry', () => {
  it('falls back to Syria with no signals', () => {
    expect(resolveDefaultCountry({})).toBe(DEFAULT_COUNTRY);
  });

  it('prefers explicit override, then cookie, then timezone, then language', () => {
    expect(
      resolveDefaultCountry({
        explicitIso: 'FR',
        cookie: 'DE',
        timeZone: 'America/Toronto',
        language: 'en-US',
      }).iso
    ).toBe('FR');

    expect(resolveDefaultCountry({ cookie: 'DE', timeZone: 'America/Toronto' }).iso).toBe('DE');
    expect(resolveDefaultCountry({ timeZone: 'America/Toronto', language: 'en-US' }).iso).toBe(
      'CA'
    );
    expect(resolveDefaultCountry({ language: 'en-US' }).iso).toBe('US');
  });

  it('skips unknown signals instead of failing', () => {
    expect(
      resolveDefaultCountry({ cookie: 'ZZ', timeZone: 'Mars/Olympus', language: 'ar-SY' }).iso
    ).toBe('SY');
  });
});
