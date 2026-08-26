import { describe, expect, it } from 'vitest';

import { COUNTRY_DIAL_CODES, DEFAULT_COUNTRY } from '../country-dial-codes';
import {
  composePhoneNumber,
  sanitizeTypedNational,
  splitStoredPhone,
  toNationalFromPaste,
} from '../phone-utils';

describe('sanitizeTypedNational', () => {
  it('converts Arabic-Indic digits and drops letters/symbols', () => {
    expect(sanitizeTypedNational('٩١٢abc3+4')).toBe('91234');
  });

  it('keeps spaces and dashes', () => {
    expect(sanitizeTypedNational('912-345 678')).toBe('912-345 678');
  });

  it('caps the length', () => {
    expect(sanitizeTypedNational('12345678901234567890123')).toHaveLength(18);
  });
});

describe('composePhoneNumber', () => {
  it('joins dial and national with a space', () => {
    expect(composePhoneNumber('963', '912 345 678')).toBe('+963 912 345 678');
  });

  it('strips one trunk-prefix zero', () => {
    expect(composePhoneNumber('963', '0912345678')).toBe('+963 912345678');
  });

  it('returns the bare dial code when national is empty or zero-only', () => {
    expect(composePhoneNumber('963', '')).toBe('+963');
    expect(composePhoneNumber('963', '٠')).toBe('+963');
  });
});

describe('toNationalFromPaste', () => {
  it('strips a pasted international prefix for the matched country', () => {
    expect(toNationalFromPaste('+963912345678')).toBe('912345678');
  });

  it('keeps digits untouched when the international prefix is not listed', () => {
    // Unlisted country: nothing is stripped; the user picks the country manually.
    expect(toNationalFromPaste('+995599123456')).toBe('995599123456');
  });

  it('sanitizes domestic pastes without a plus sign', () => {
    expect(toNationalFromPaste('0912-345 678')).toBe('912-345 678');
    expect(toNationalFromPaste('٩١٢٣٤٥٦٧٨٩')).toBe('9123456789');
  });

  it('respects longest-match dial codes', () => {
    // +1 (US) must not be confused by longer dials sharing no real overlap;
    // +380 (UA) vs +38? — only listed codes compete.
    expect(toNationalFromPaste('+380991234567')).toBe('991234567');
  });
});

describe('splitStoredPhone', () => {
  it('parses compact stored values', () => {
    const parts = splitStoredPhone('+963912345678');
    expect(parts.country?.iso).toBe('SY');
    expect(parts.national).toBe('912345678');
  });

  it('parses spaced stored values', () => {
    const parts = splitStoredPhone('+963 912 345 678');
    expect(parts.country?.dial).toBe('963');
    expect(parts.national).toBe('912 345 678');
  });

  it('normalizes legacy trunk-zero after the dial code', () => {
    const parts = splitStoredPhone('+963 0912345678');
    expect(parts.country?.iso).toBe('SY');
    expect(parts.national).toBe('912345678');
  });

  it('resolves NANP numbers to the shared +1 entry', () => {
    const parts = splitStoredPhone('+15551234567');
    expect(parts.country?.dial).toBe('1');
    expect(parts.national).toBe('5551234567');
  });

  it('returns null country for unknown prefixes and keeps the value', () => {
    const parts = splitStoredPhone('0999123456');
    expect(parts.country).toBeNull();
    expect(parts.national).toBe('0999123456');
  });

  it('handles empty input', () => {
    expect(splitStoredPhone('')).toEqual({ country: null, national: '' });
  });

  it('falls back to Syria in data with unique dial codes among entries', () => {
    expect(DEFAULT_COUNTRY.dial).toBe('963');
    const dials = COUNTRY_DIAL_CODES.map((c) => c.dial);
    expect(new Set(dials).size).toBe(dials.length);
  });

  it('round-trips through compose', () => {
    const stored = composePhoneNumber('971', '501234567');
    const parts = splitStoredPhone(stored);
    expect(parts.country?.iso).toBe('AE');
    expect(parts.national).toBe('501234567');
  });
});
